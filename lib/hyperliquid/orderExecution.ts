/**
 * Hyperliquid Order Execution
 * Uses @nktkas/hyperliquid SDK for real order placement with proper signing
 */

import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";
import { PrivateKeySigner } from "@nktkas/hyperliquid/signing";

// Cache coin->assetIndex mapping
const assetIndexCache = new Map<string, number>();

async function getAssetIndex(coin: string): Promise<number> {
  const cached = assetIndexCache.get(coin);
  if (typeof cached === "number") return cached;

  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta" }),
  });
  if (!res.ok) throw new Error(`Failed to load Hyperliquid meta: ${res.statusText}`);
  const data = await res.json();

  const universe: Array<{ name: string }> = data?.universe || data?.[0]?.universe || [];
  const idx = universe.findIndex((u) => u?.name === coin);
  if (idx < 0) throw new Error(`Coin ${coin} not found in Hyperliquid universe`);

  assetIndexCache.set(coin, idx);
  return idx;
}

/**
 * Place a market order on Hyperliquid
 * This places REAL orders with REAL money
 *
 * @param privateKey - User's private key (0x prefixed hex string)
 * @param market - Market symbol (e.g., "BTC")
 * @param side - "buy" or "sell"
 * @param sizeUsd - Order size in USD
 * @param slippage - Max slippage tolerance (default 0.05 = 5%)
 * @param reduceOnly - Whether this is an exit order (reduce only)
 * @param leverage - Leverage to use for entry orders (default 1x, ignored for exits)
 * @returns Order result with status and details
 */
export async function placeMarketOrder(
  privateKey: string,
  market: string,
  side: "buy" | "sell",
  sizeUsd: number,
  slippage: number = 0.05,
  reduceOnly: boolean = false,
  leverage: number = 1
): Promise<{
  success: boolean;
  orderId?: string;
  fillPrice?: number;
  fillSize?: number;
  error?: string;
}> {
  try {
    console.log(`[Hyperliquid Order] ⚠️ REAL ORDER EXECUTION: Placing ${side} order for ${market}: $${sizeUsd.toFixed(2)} (slippage: ${(slippage * 100).toFixed(1)}%, leverage: ${leverage}x)`);
    console.log(`[Hyperliquid Order] Stack trace:`, new Error().stack);

    // Validate inputs
    if (!privateKey || !market || !side || sizeUsd <= 0) {
      throw new Error("Invalid order parameters");
    }

    // Ensure private key has 0x prefix
    const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

    // Initialize Hyperliquid SDK with new API structure
    const transport = new HttpTransport();
    const signer = new PrivateKeySigner(formattedPrivateKey);
    const infoClient = new InfoClient({ transport });
    const exchangeClient = new ExchangeClient({ transport, wallet: signer });

    // Get current market price to calculate size
    const metaData = await infoClient.meta();
    
    // Find the market in the metadata and get asset index
    const assetIndex = metaData.universe.findIndex((m: any) => m.name === market);
    if (assetIndex < 0) {
      throw new Error(`Market ${market} not found in Hyperliquid universe`);
    }
    
    const marketInfo = metaData.universe[assetIndex];
    if (!marketInfo) {
      throw new Error(`Market ${market} not found`);
    }

    console.log(`[Hyperliquid Order] Found market ${market} at index ${assetIndex}`);

    // Set leverage for entry orders (not exits)
    // This ensures the position uses the strategy's configured leverage
    if (!reduceOnly && leverage >= 1) {
      const leverageToSet = Math.max(1, Math.floor(leverage)); // Must be integer >= 1
      if (leverageToSet !== leverage) {
        console.warn(`[Hyperliquid Order] ⚠️ Leverage floored from ${leverage}x to ${leverageToSet}x (Hyperliquid requires integer leverage)`);
      }
      console.log(`[Hyperliquid Order] Setting leverage to ${leverageToSet}x for ${market} (cross margin)`);
      try {
        await exchangeClient.updateLeverage({
          asset: assetIndex,
          isCross: true, // Use cross margin by default
          leverage: leverageToSet,
        });
        console.log(`[Hyperliquid Order] ✅ Leverage set to ${leverageToSet}x successfully`);
      } catch (leverageError: any) {
        // Log but don't fail the order - leverage may already be set correctly
        console.warn(`[Hyperliquid Order] ⚠️ Failed to set leverage: ${leverageError.message}`);
      }
    }

    // Get current mid price
    const midsData = await infoClient.allMids();
    const currentPrice = parseFloat(midsData[market]);
    
    if (!currentPrice || currentPrice <= 0) {
      throw new Error(`Could not fetch price for ${market}`);
    }

    console.log(`[Hyperliquid Order] Current ${market} price: $${currentPrice.toFixed(2)}`);

    // Calculate size in base currency (e.g., BTC amount for BTC-PERP)
    const baseSize = sizeUsd / currentPrice;
    
    // Round to appropriate decimals based on market's size decimals
    const sizeDecimals = marketInfo.szDecimals || 4;
    const roundedSize = parseFloat(baseSize.toFixed(sizeDecimals));

    // Verify order value meets minimum requirement and adjust if needed
    const MIN_ORDER_VALUE = 10;
    let adjustedSize = roundedSize;
    let orderValueUsd = roundedSize * currentPrice;
    
    if (orderValueUsd < MIN_ORDER_VALUE) {
      // Adjust size to meet minimum order value + 1% safety margin to avoid rounding issues
      adjustedSize = (MIN_ORDER_VALUE * 1.01) / currentPrice;
      // Round to appropriate decimals
      adjustedSize = parseFloat(adjustedSize.toFixed(sizeDecimals));
      orderValueUsd = adjustedSize * currentPrice;
      
      // Final safety check
      if (orderValueUsd < MIN_ORDER_VALUE) {
        console.error(`[Hyperliquid Order] ❌ After adjustment, order value still below minimum: $${orderValueUsd.toFixed(2)}`);
        throw new Error(`Order value $${orderValueUsd.toFixed(2)} is below Hyperliquid minimum of $${MIN_ORDER_VALUE}`);
      }
      
      console.log(`[Hyperliquid Order] ⚠️ Order too small, adjusted size: ${roundedSize} → ${adjustedSize} = $${orderValueUsd.toFixed(2)}`);
    }

    console.log(`[Hyperliquid Order] Final size: ${adjustedSize} ${market} = $${orderValueUsd.toFixed(2)}`);

    // Calculate limit price with slippage
    // For buy: limit = current * (1 + slippage)
    // For sell: limit = current * (1 - slippage)
    const slippageMultiplier = side === "buy" ? (1 + slippage) : (1 - slippage);
    const limitPrice = currentPrice * slippageMultiplier;
    
    // Always use 2 decimal places - this works for all assets and matches the working broker
    const roundedLimitPrice = limitPrice.toFixed(2);

    console.log(`[Hyperliquid Order] Limit price: $${currentPrice.toFixed(2)} + ${(slippage * 100).toFixed(1)}% = $${roundedLimitPrice}`);

    // Place order using SDK with short field names (new API format)
    // a = asset index, b = is_buy, p = price, s = size, r = reduce_only, t = order_type
    // CRITICAL FIX: reduce_only=true for exit orders prevents accidentally opening a new
    // position in the opposite direction if the position was already closed externally.
    console.log(`[Hyperliquid Order] reduce_only=${reduceOnly} (${reduceOnly ? 'EXIT order' : 'ENTRY order'})`);
    const orderResult = await exchangeClient.order({
      orders: [{
        a: assetIndex,
        b: side === "buy",
        p: roundedLimitPrice,
        s: adjustedSize.toString(),
        r: reduceOnly,
        t: { limit: { tif: "Ioc" } },
      }],
      grouping: "na",
    } as any);

    console.log(`[Hyperliquid Order] Order result:`, JSON.stringify(orderResult, null, 2));

    // Check if order was successful (new API structure)
    if (orderResult.status === "ok" && orderResult.response?.data?.statuses) {
      const statuses = orderResult.response.data.statuses;
      
      // Extract fill information
      let fillPrice = 0;
      let fillSize = 0;
      let orderId = "";

      if (statuses && statuses.length > 0) {
        const status = statuses[0];
        // Status can be a string or object with resting/filled properties
        if (typeof status === "object" && status !== null) {
          if ("resting" in status && status.resting) {
            orderId = String(status.resting.oid || "");
          }
          // Check if filled
          if ("filled" in status && status.filled) {
            fillPrice = parseFloat(status.filled.avgPx || "0");
            fillSize = parseFloat(status.filled.totalSz || "0");
          }
        }
      }

      // CRITICAL FIX: IOC orders that get zero fills should be treated as failures.
      // Without this check, phantom trades with size=0 and price=0 get recorded,
      // breaking trade frequency limits, cooldown checks, and PnL tracking.
      if (fillSize <= 0) {
        console.error(`[Hyperliquid Order] ❌ IOC order got ZERO fills - treating as failure. Order ID: ${orderId}`);
        return {
          success: false,
          error: "IOC order received zero fills - price may have moved beyond slippage tolerance",
        };
      }

      console.log(`[Hyperliquid Order] ✅ Order filled successfully - ID: ${orderId}, Fill: ${fillSize} @ $${fillPrice.toFixed(2)}`);

      return {
        success: true,
        orderId,
        fillPrice,
        fillSize,
      };
    } else {
      // Order failed
      const errorMsg = orderResult.response?.data || orderResult.response || "Unknown error";
      console.error(`[Hyperliquid Order] ❌ Order failed:`, errorMsg);

      return {
        success: false,
        error: JSON.stringify(errorMsg),
      };
    }
  } catch (error: any) {
    console.error(`[Hyperliquid Order] ❌ Exception placing order:`, error);
    return {
      success: false,
      error: error.message || "Failed to place order",
    };
  }
}

/**
 * Get account state from Hyperliquid
 */
export async function getAccountState(privateKey: string): Promise<{
  equity: number;
  positions: Array<{
    market: string;
    size: number;
    entryPrice: number;
    unrealizedPnl: number;
  }>;
}> {
  try {
    const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const transport = new HttpTransport();
    const signer = new PrivateKeySigner(formattedPrivateKey);
    const infoClient = new InfoClient({ transport });

    const userState = await infoClient.clearinghouseState({ user: signer.address });

    const equity = parseFloat(userState.marginSummary.accountValue || "0");
    
    const positions = (userState.assetPositions || [])
      .filter((p: any) => Math.abs(parseFloat(p.position.szi || "0")) > 0)
      .map((p: any) => ({
        market: p.position.coin,
        size: parseFloat(p.position.szi),
        entryPrice: parseFloat(p.position.entryPx || "0"),
        unrealizedPnl: parseFloat(p.position.unrealizedPnl || "0"),
      }));

    return { equity, positions };
  } catch (error: any) {
    console.error("[Hyperliquid] Error fetching account state:", error);
    throw error;
  }
}
