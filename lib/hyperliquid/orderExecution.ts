/**
 * Hyperliquid Order Execution
 * Uses @nktkas/hyperliquid SDK for real order placement with proper signing
 */

// Note: Hyperliquid type temporarily bypassed for deployment
// import { Hyperliquid } from "@nktkas/hyperliquid";
const Hyperliquid = (require("@nktkas/hyperliquid") as any).Hyperliquid || (require("@nktkas/hyperliquid") as any).default || (require("@nktkas/hyperliquid") as any);

/**
 * Place a market order on Hyperliquid
 * This places REAL orders with REAL money
 * 
 * @param privateKey - User's private key (0x prefixed hex string)
 * @param market - Market symbol (e.g., "BTC")  
 * @param side - "buy" or "sell"
 * @param sizeUsd - Order size in USD
 * @param slippage - Max slippage tolerance (default 0.05 = 5%)
 * @returns Order result with status and details
 */
export async function placeMarketOrder(
  privateKey: string,
  market: string,
  side: "buy" | "sell",
  sizeUsd: number,
  slippage: number = 0.05
): Promise<{
  success: boolean;
  orderId?: string;
  fillPrice?: number;
  fillSize?: number;
  error?: string;
}> {
  try {
    console.log(`[Hyperliquid Order] Placing ${side} order for ${market}: $${sizeUsd.toFixed(2)} (slippage: ${(slippage * 100).toFixed(1)}%)`);

    // Validate inputs
    if (!privateKey || !market || !side || sizeUsd <= 0) {
      throw new Error("Invalid order parameters");
    }

    // Ensure private key has 0x prefix
    const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

    // Initialize Hyperliquid SDK with user's private key
    const sdk = new Hyperliquid({ privateKey: formattedPrivateKey });

    // Get current market price to calculate size
    const allMids = await sdk.info.spot.getMeta();
    
    // Find the market in the metadata
    const marketInfo = allMids.universe.find((m: any) => m.name === market);
    if (!marketInfo) {
      throw new Error(`Market ${market} not found`);
    }

    // Get current mid price
    const midsData = await sdk.info.spot.getAllMids();
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

    console.log(`[Hyperliquid Order] Calculated size: ${roundedSize} ${market} ($${sizeUsd.toFixed(2)} / $${currentPrice.toFixed(2)})`);

    // Calculate limit price with slippage
    // For buy: limit = current * (1 + slippage)
    // For sell: limit = current * (1 - slippage)
    const slippageMultiplier = side === "buy" ? (1 + slippage) : (1 - slippage);
    const limitPrice = currentPrice * slippageMultiplier;
    const priceDecimals = marketInfo.szDecimals || 2;
    const roundedLimitPrice = parseFloat(limitPrice.toFixed(priceDecimals));

    console.log(`[Hyperliquid Order] Limit price with ${(slippage * 100).toFixed(1)}% slippage: $${roundedLimitPrice.toFixed(2)}`);

    // Place order using SDK
    // The SDK handles:
    // 1. Nonce generation
    // 2. EIP-712 signing
    // 3. API request to Hyperliquid
    const orderResult = await sdk.exchange.placeOrder({
      coin: market,
      is_buy: side === "buy",
      sz: roundedSize,
      limit_px: roundedLimitPrice,
      order_type: { limit: { tif: "Ioc" } }, // Immediate-or-Cancel for market-like execution
      reduce_only: false,
    });

    console.log(`[Hyperliquid Order] Order result:`, JSON.stringify(orderResult, null, 2));

    // Check if order was successful
    if (orderResult.status === "ok" && orderResult.response?.type === "order") {
      const orderData = orderResult.response.data;
      
      // Extract fill information
      let fillPrice = 0;
      let fillSize = 0;
      let orderId = "";

      if (orderData?.statuses && orderData.statuses.length > 0) {
        const status = orderData.statuses[0];
        orderId = status.oid || "";
        
        // Check if filled
        if (status.filled) {
          fillPrice = parseFloat(status.filled.avgPx || "0");
          fillSize = parseFloat(status.filled.totalSz || "0");
        }
      }

      console.log(`[Hyperliquid Order] ✅ Order placed successfully - ID: ${orderId}, Fill: ${fillSize} @ $${fillPrice.toFixed(2)}`);

      return {
        success: true,
        orderId,
        fillPrice,
        fillSize,
      };
    } else {
      // Order failed
      const errorMsg = orderResult.response?.data || "Unknown error";
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
    const sdk = new Hyperliquid({ privateKey: formattedPrivateKey });

    const userState = await sdk.info.perpetuals.getUserState(sdk.wallet.address);

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
