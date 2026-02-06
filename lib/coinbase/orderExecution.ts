/**
 * Coinbase Order Execution
 * Uses coinbase-api SDK for real order placement
 *
 * Supports two platforms via CBAdvancedTradeClient:
 * 1. Coinbase Advanced Trade (spot) - US users
 *    - No short selling (can only sell assets you own)
 *    - No leverage (1x only)
 *    - Product format: BTC-USD, ETH-USD
 *
 * 2. Coinbase Perpetuals (INTX) - Non-US users with INTX access
 *    - Short selling allowed
 *    - Up to 10x leverage
 *    - USDC-settled perpetuals
 *    - Product format: BTC-PERP-INTX, ETH-PERP-INTX
 *    - Uses same API credentials as spot (no passphrase needed)
 */

import { CBAdvancedTradeClient } from "coinbase-api";
import { getMidPrice, getOrderbookTop } from "./prices";

export interface OrderResult {
  success: boolean;
  orderId?: string;
  fillPrice?: number;
  fillSize?: number;
  fillValue?: number;
  error?: string;
}

export interface AccountState {
  equity: number;
  positions: Array<{
    asset: string;
    size: number;
    costBasis: number;
    currentPrice: number;
    unrealizedPnl: number;
    usdValue: number;
  }>;
}

/**
 * Get base increment (step size) for INTX perpetual products
 * Coinbase INTX requires order sizes to be multiples of these increments
 * These values come from Coinbase's product specifications
 */
function getBaseIncrement(productId: string): number {
  // Extract base asset from product ID (e.g., "ETH" from "ETH-PERP-INTX")
  const baseAsset = productId.split("-")[0].toUpperCase();

  // Base increments from Coinbase INTX product specs
  // Source: Coinbase International Exchange product details
  const increments: Record<string, number> = {
    BTC: 0.0001,   // BTC-PERP-INTX: 0.0001 BTC minimum step
    ETH: 0.001,    // ETH-PERP-INTX: 0.001 ETH minimum step
    SOL: 0.01,     // SOL-PERP-INTX: 0.01 SOL minimum step
    DOGE: 1,       // DOGE-PERP-INTX: 1 DOGE minimum step
    XRP: 1,        // XRP-PERP-INTX: 1 XRP minimum step
    AVAX: 0.01,    // AVAX-PERP-INTX: 0.01 AVAX minimum step
    LINK: 0.01,    // LINK-PERP-INTX: 0.01 LINK minimum step
    LTC: 0.001,    // LTC-PERP-INTX: 0.001 LTC minimum step
    MATIC: 1,      // MATIC-PERP-INTX: 1 MATIC minimum step (now POL)
    POL: 1,        // POL-PERP-INTX: 1 POL minimum step
    DOT: 0.1,      // DOT-PERP-INTX: 0.1 DOT minimum step
    SHIB: 1000,    // SHIB-PERP-INTX: 1000 SHIB minimum step
    NEAR: 0.1,     // NEAR-PERP-INTX: 0.1 NEAR minimum step
    UNI: 0.1,      // UNI-PERP-INTX: 0.1 UNI minimum step
    ATOM: 0.1,     // ATOM-PERP-INTX: 0.1 ATOM minimum step
    APT: 0.1,      // APT-PERP-INTX: 0.1 APT minimum step
    ARB: 0.1,      // ARB-PERP-INTX: 0.1 ARB minimum step
    OP: 0.1,       // OP-PERP-INTX: 0.1 OP minimum step
    SUI: 0.1,      // SUI-PERP-INTX: 0.1 SUI minimum step
  };

  // Return known increment or default to 0.001 for unknown assets
  return increments[baseAsset] || 0.001;
}

/**
 * Place a market order on Coinbase Perpetuals (INTX)
 * Uses CBAdvancedTradeClient via /api/v3/brokerage endpoints
 * No passphrase needed - same credentials as spot
 *
 * @param apiKey - Coinbase CDP API key
 * @param apiSecret - Coinbase CDP API secret (PEM format)
 * @param productId - Product ID (e.g., "ETH-PERP-INTX")
 * @param side - "buy" or "sell"
 * @param sizeUsd - Order size in USD
 * @returns Order result with status and details
 */
async function placeIntxMarketOrder(
  apiKey: string,
  apiSecret: string,
  productId: string,
  side: "buy" | "sell",
  sizeUsd: number
): Promise<OrderResult> {
  try {
    console.log(
      `[Coinbase INTX] 🌐 REAL INTX ORDER: ${side} ${productId} for $${sizeUsd.toFixed(2)}`
    );

    // Initialize client (same as spot - no passphrase needed)
    const client = new CBAdvancedTradeClient({
      apiKey,
      apiSecret,
    });

    // Get current price to calculate size
    const currentPrice = await getMidPrice(productId);
    console.log(`[Coinbase INTX] Current ${productId} price: $${currentPrice.toFixed(2)}`);

    // Calculate contract size - perpetuals use base asset size
    const contractSize = sizeUsd / currentPrice;

    // INTX products have base_increment requirements (step size)
    // ETH: 0.001, BTC: 0.0001, SOL: 0.01, etc.
    // Round UP to valid increment to ensure we meet minimum notional
    const baseIncrement = getBaseIncrement(productId);
    const roundedSize = Math.ceil(contractSize / baseIncrement) * baseIncrement;

    console.log(`[Coinbase INTX] Base size: raw=${contractSize.toFixed(8)}, increment=${baseIncrement}, rounded=${roundedSize}`);

    // Generate client order ID
    const clientOrderId = `cc_intx_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(
      `[Coinbase INTX] Submitting order: ${side} ${roundedSize} ${productId} @ market`
    );

    // Submit order via Advanced Trade API
    // Perpetuals use base_size for order quantity
    const orderConfig: any = {
      client_order_id: clientOrderId,
      product_id: productId,
      side: side.toUpperCase(),
      order_configuration: {
        market_market_ioc: {
          base_size: roundedSize.toString(),
        },
      },
    };

    console.log(`[Coinbase INTX] Order config:`, JSON.stringify(orderConfig, null, 2));

    const result = await client.submitOrder(orderConfig) as any;

    console.log(`[Coinbase INTX] Order result:`, JSON.stringify(result, null, 2));

    // Check for success
    if (result.success) {
      const orderId = result.order_id || result.success_response?.order_id || clientOrderId;
      console.log(`[Coinbase INTX] ✅ Order placed: ${orderId}`);

      // Try to get actual fill price from response
      // Coinbase returns fill info in success_response for market orders
      let fillPrice = currentPrice; // Default fallback
      let fillSize = roundedSize;
      let fillValue = sizeUsd;

      const successResp = result.success_response || result;
      if (successResp.average_filled_price) {
        fillPrice = parseFloat(successResp.average_filled_price);
        console.log(`[Coinbase INTX] 📊 Actual fill price: $${fillPrice.toFixed(2)}`);
      }
      if (successResp.filled_size) {
        fillSize = parseFloat(successResp.filled_size);
      }
      if (successResp.filled_value) {
        fillValue = parseFloat(successResp.filled_value);
      }

      // If no immediate fill info, try to fetch order details
      if (fillPrice === currentPrice && orderId) {
        try {
          // Small delay to allow order to settle
          await new Promise(resolve => setTimeout(resolve, 500));

          const orderDetails = await client.getOrder({ order_id: orderId }) as any;
          console.log(`[Coinbase INTX] Order details:`, JSON.stringify(orderDetails, null, 2));

          if (orderDetails.order?.average_filled_price) {
            fillPrice = parseFloat(orderDetails.order.average_filled_price);
            console.log(`[Coinbase INTX] 📊 Fill price from order details: $${fillPrice.toFixed(2)}`);
          }
          if (orderDetails.order?.filled_size) {
            fillSize = parseFloat(orderDetails.order.filled_size);
          }
          if (orderDetails.order?.filled_value) {
            fillValue = parseFloat(orderDetails.order.filled_value);
          }
        } catch (fetchError: any) {
          console.warn(`[Coinbase INTX] ⚠️ Could not fetch order details: ${fetchError.message}`);
        }
      }

      return {
        success: true,
        orderId,
        fillPrice,
        fillSize,
        fillValue,
      };
    }

    // Check for error - extract the most useful error message
    const previewReason = result.error_response?.preview_failure_reason;
    let errorMsg = result.error_response?.message || result.failure_reason || "INTX order failed";

    // Map common error codes to user-friendly messages
    if (previewReason === "PREVIEW_INVALID_BASE_SIZE_TOO_SMALL") {
      errorMsg = `Base size too small for ${productId}. Order: $${sizeUsd.toFixed(2)} = ${roundedSize} units (increment: ${baseIncrement}). Try increasing order size.`;
    } else if (previewReason) {
      errorMsg = `${previewReason}: ${errorMsg}`;
    }

    console.error(`[Coinbase INTX] ❌ Order failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };

  } catch (error: any) {
    console.error(`[Coinbase INTX] ❌ Exception:`, error);
    return {
      success: false,
      error: error.message || "Failed to place INTX order",
    };
  }
}

/**
 * Place a market order on Coinbase
 * Routes to Advanced Trade (spot) or Perpetuals (INTX) based on product type
 * Both use CBAdvancedTradeClient - no passphrase needed
 *
 * @param apiKey - Coinbase CDP API key
 * @param apiSecret - Coinbase CDP API secret (PEM format)
 * @param productId - Product ID (e.g., "BTC-USD" for spot, "ETH-PERP-INTX" for INTX)
 * @param side - "buy" or "sell"
 * @param sizeUsd - Order size in USD (for buys) or asset value in USD (for sells)
 * @param sellAll - If true, sell entire available balance (for closing positions completely)
 * @returns Order result with status and details
 */
export async function placeMarketOrder(
  apiKey: string,
  apiSecret: string,
  productId: string,
  side: "buy" | "sell",
  sizeUsd: number,
  sellAll: boolean = false
): Promise<OrderResult> {
  // Check if this is a perpetual - route to INTX handler
  if (productId.endsWith("-INTX") || productId.includes("-PERP")) {
    return placeIntxMarketOrder(apiKey, apiSecret, productId, side, sizeUsd);
  }

  // Otherwise use Advanced Trade for spot
  try {
    console.log(
      `[Coinbase Order] ⚠️ REAL ORDER EXECUTION: Placing ${side} order for ${productId}: $${sizeUsd.toFixed(2)}`
    );

    // Validate inputs
    if (!apiKey || !apiSecret || !productId || !side || sizeUsd <= 0) {
      throw new Error("Invalid order parameters");
    }

    // Initialize client
    const client = new CBAdvancedTradeClient({
      apiKey,
      apiSecret,
    });

    // Generate unique client order ID
    const clientOrderId = `cc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // For Spot buys: Auto-detect quote currency (USD, USDC, or USDT)
    let actualProductId = productId;

    if (side === "buy") {
      const baseCurrency = productId.split("-")[0]; // e.g., "BTC" from "BTC-USD"

      // Check what stablecoin balance the user has
      const accounts = await client.getAccounts({ limit: 250 });
      const accountList = (accounts as any).accounts || [];

      let usdBalance = 0;
      let usdcBalance = 0;
      let usdtBalance = 0;

      for (const acc of accountList) {
        const available = parseFloat(acc.available_balance?.value || "0");
        if (acc.currency === "USD") usdBalance = available;
        if (acc.currency === "USDC") usdcBalance = available;
        if (acc.currency === "USDT") usdtBalance = available;
      }

      console.log(`[Coinbase Order] 💰 Available balances - USD: $${usdBalance.toFixed(2)}, USDC: $${usdcBalance.toFixed(2)}, USDT: $${usdtBalance.toFixed(2)}`);

      // Helper to check if a trading pair exists by trying to get its price
      const pairExists = async (pair: string): Promise<boolean> => {
        try {
          await getMidPrice(pair);
          return true;
        } catch {
          return false;
        }
      };

      // Use the quote currency with sufficient balance AND verify pair exists
      if (usdBalance >= sizeUsd) {
        actualProductId = `${baseCurrency}-USD`;
        console.log(`[Coinbase Order] Using USD pair: ${actualProductId}`);
      } else if (usdcBalance >= sizeUsd) {
        const usdcPair = `${baseCurrency}-USDC`;
        if (await pairExists(usdcPair)) {
          actualProductId = usdcPair;
          console.log(`[Coinbase Order] Using USDC pair: ${actualProductId} (no USD balance)`);
        } else {
          // USDC pair doesn't exist, try USD pair anyway (will fail but with clear error)
          console.log(`[Coinbase Order] ⚠️ ${usdcPair} pair not available on Coinbase`);
          return {
            success: false,
            error: `${usdcPair} trading pair not available on Coinbase. You have USDC but need USD. Please convert USDC to USD in Coinbase.`,
          };
        }
      } else if (usdtBalance >= sizeUsd) {
        const usdtPair = `${baseCurrency}-USDT`;
        if (await pairExists(usdtPair)) {
          actualProductId = usdtPair;
          console.log(`[Coinbase Order] Using USDT pair: ${actualProductId} (no USD/USDC balance)`);
        } else {
          console.log(`[Coinbase Order] ⚠️ ${usdtPair} pair not available on Coinbase`);
          return {
            success: false,
            error: `${usdtPair} trading pair not available. Please convert to USD.`,
          };
        }
      } else {
        // No sufficient balance in any stablecoin
        return {
          success: false,
          error: `Insufficient stablecoin balance. Need $${sizeUsd.toFixed(2)}, have USD: $${usdBalance.toFixed(2)}, USDC: $${usdcBalance.toFixed(2)}, USDT: $${usdtBalance.toFixed(2)}`,
        };
      }
    }

    // Get current price to calculate sizes
    const currentPrice = await getMidPrice(actualProductId);
    console.log(
      `[Coinbase Order] Current ${actualProductId} price: $${currentPrice.toFixed(2)}`
    );

    let orderConfig: any;

    if (side === "buy") {
      // For buys: specify quote_size (USD/USDC/USDT amount to spend)
      // Coinbase will calculate how much asset to buy
      orderConfig = {
        client_order_id: clientOrderId,
        product_id: actualProductId,
        side: "BUY",
        order_configuration: {
          market_market_ioc: {
            quote_size: sizeUsd.toFixed(2),
          },
        },
      };
      const quoteCurrency = actualProductId.split("-")[1];
      console.log(
        `[Coinbase Order] Buy order: spending $${sizeUsd.toFixed(2)} ${quoteCurrency}`
      );
    } else {
      // For sells: specify base_size (amount of asset to sell)
      const baseCurrency = productId.split("-")[0]; // e.g., "BTC" from "BTC-USD"
      let assetSize: number;

      if (sellAll) {
        // SELL ALL: Fetch actual available balance and sell entire amount
        // This ensures complete position closes without leftover dust
        console.log(`[Coinbase Order] 🔄 sellAll=true: Fetching actual ${baseCurrency} balance...`);

        const accounts = await client.getAccounts({ limit: 250 });
        const accountList = (accounts as any).accounts || [];
        const account = accountList.find((a: any) => a.currency === baseCurrency);
        const availableBalance = parseFloat(account?.available_balance?.value || "0");

        if (availableBalance <= 0) {
          console.error(`[Coinbase Order] ❌ No ${baseCurrency} balance to sell`);
          return {
            success: false,
            error: `No ${baseCurrency} balance available to sell`,
          };
        }

        assetSize = availableBalance;
        console.log(`[Coinbase Order] 💰 Found ${baseCurrency} balance: ${assetSize} (~$${(assetSize * currentPrice).toFixed(2)})`);
      } else {
        // Normal sell: Calculate from USD value
        assetSize = sizeUsd / currentPrice;
      }

      // Round to reasonable precision (8 decimals for crypto)
      const roundedSize = parseFloat(assetSize.toFixed(8));

      console.log(
        `[Coinbase Order] Sell order: selling ${roundedSize} ${baseCurrency} (~$${(roundedSize * currentPrice).toFixed(2)})${sellAll ? ' [SELL ALL]' : ''}`
      );

      orderConfig = {
        client_order_id: clientOrderId,
        product_id: productId,
        side: "SELL",
        order_configuration: {
          market_market_ioc: {
            base_size: roundedSize.toString(),
          },
        },
      };
    }

    console.log(
      `[Coinbase Order] Submitting order:`,
      JSON.stringify(orderConfig, null, 2)
    );

    // Place the order
    const result = await client.submitOrder(orderConfig) as any;

    console.log(
      `[Coinbase Order] Order result:`,
      JSON.stringify(result, null, 2)
    );

    if (result.success) {
      const orderId =
        result.order_id || result.success_response?.order_id || clientOrderId;

      // Try to get fill details from response
      let fillPrice = currentPrice; // Default fallback
      let fillSize = side === "buy" ? sizeUsd / currentPrice : sizeUsd / currentPrice;
      let fillValue = sizeUsd;

      // If order details available, use actual fill info
      const successResp = result.success_response || result;
      if (successResp.average_filled_price) {
        fillPrice = parseFloat(successResp.average_filled_price);
        console.log(`[Coinbase Order] 📊 Actual fill price: $${fillPrice.toFixed(2)}`);
      }
      if (successResp.filled_size) {
        fillSize = parseFloat(successResp.filled_size);
      }
      if (successResp.filled_value) {
        fillValue = parseFloat(successResp.filled_value);
      }

      // If no immediate fill info, try to fetch order details
      if (fillPrice === currentPrice && orderId) {
        try {
          // Small delay to allow order to settle
          await new Promise(resolve => setTimeout(resolve, 500));

          const orderDetails = await client.getOrder({ order_id: orderId }) as any;
          console.log(`[Coinbase Order] Order details:`, JSON.stringify(orderDetails, null, 2));

          if (orderDetails.order?.average_filled_price) {
            fillPrice = parseFloat(orderDetails.order.average_filled_price);
            console.log(`[Coinbase Order] 📊 Fill price from order details: $${fillPrice.toFixed(2)}`);
          }
          if (orderDetails.order?.filled_size) {
            fillSize = parseFloat(orderDetails.order.filled_size);
          }
          if (orderDetails.order?.filled_value) {
            fillValue = parseFloat(orderDetails.order.filled_value);
          }
        } catch (fetchError: any) {
          console.warn(`[Coinbase Order] ⚠️ Could not fetch order details: ${fetchError.message}`);
        }
      }

      console.log(
        `[Coinbase Order] ✅ Order success - ID: ${orderId}, Fill: ${fillSize.toFixed(8)} @ $${fillPrice.toFixed(2)}`
      );

      return {
        success: true,
        orderId,
        fillPrice,
        fillSize,
        fillValue,
      };
    } else {
      // Order failed
      const errorMsg =
        result.error_response?.message ||
        result.failure_reason ||
        "Order failed";

      console.error(`[Coinbase Order] ❌ Order failed: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
      };
    }
  } catch (error: any) {
    console.error(`[Coinbase Order] ❌ Exception placing order:`, error);
    return {
      success: false,
      error: error.message || "Failed to place order",
    };
  }
}

/**
 * Get account state from Coinbase
 * Returns equity and positions (spot balances as positions)
 */
export async function getAccountState(
  apiKey: string,
  apiSecret: string
): Promise<AccountState> {
  try {
    const client = new CBAdvancedTradeClient({
      apiKey,
      apiSecret,
    });

    // Get all accounts (balances)
    const response = await client.getAccounts({ limit: 250 });
    const accounts = response.accounts || [];

    let totalEquity = 0;
    const positions: AccountState["positions"] = [];

    // Get prices for all non-USD assets in parallel
    const pricePromises: Promise<{ asset: string; price: number }>[] = [];
    const assetsNeedingPrices: string[] = [];

    for (const account of accounts) {
      const currency = account.currency;
      const total =
        parseFloat(account.available_balance?.value || "0") +
        parseFloat(account.hold?.value || "0");

      if (total <= 0) continue;

      // USD-based currencies
      if (currency === "USD" || currency === "USDC" || currency === "USDT") {
        totalEquity += total;
        // Don't add as position - this is cash
        continue;
      }

      // Need to fetch price for this asset
      assetsNeedingPrices.push(currency);
      pricePromises.push(
        getMidPrice(`${currency}-USD`)
          .then((price) => ({ asset: currency, price }))
          .catch(() => ({ asset: currency, price: 0 }))
      );
    }

    // Fetch all prices
    const prices = await Promise.all(pricePromises);
    const priceMap = new Map(prices.map((p) => [p.asset, p.price]));

    // Build positions from non-USD balances
    for (const account of accounts) {
      const currency = account.currency;
      if (currency === "USD" || currency === "USDC" || currency === "USDT")
        continue;

      const total =
        parseFloat(account.available_balance?.value || "0") +
        parseFloat(account.hold?.value || "0");

      if (total <= 0) continue;

      const currentPrice = priceMap.get(currency) || 0;
      const usdValue = total * currentPrice;

      if (usdValue < 1) continue; // Skip dust

      totalEquity += usdValue;

      positions.push({
        asset: currency,
        size: total,
        costBasis: 0, // Coinbase doesn't provide cost basis via API
        currentPrice,
        unrealizedPnl: 0, // Can't calculate without cost basis
        usdValue,
      });
    }

    return {
      equity: totalEquity,
      positions,
    };
  } catch (error: any) {
    console.error("[Coinbase] Error fetching account state:", error);
    throw error;
  }
}

/**
 * Check if user has sufficient balance to sell
 * IMPORTANT: Coinbase spot can only sell what you own
 */
export async function checkSellBalance(
  apiKey: string,
  apiSecret: string,
  productId: string,
  sizeUsd: number
): Promise<{ canSell: boolean; availableBalance: number; requiredSize: number; error?: string }> {
  try {
    const client = new CBAdvancedTradeClient({
      apiKey,
      apiSecret,
    });

    // Get base currency from product ID (e.g., "BTC" from "BTC-USD")
    const baseCurrency = productId.split("-")[0];

    // Get current price
    const currentPrice = await getMidPrice(productId);
    const requiredSize = sizeUsd / currentPrice;

    // Get account balance for this currency
    const response = await client.getAccounts({ limit: 250 });
    const accounts = response.accounts || [];

    const account = accounts.find((a: any) => a.currency === baseCurrency);
    const availableBalance = parseFloat(
      account?.available_balance?.value || "0"
    );

    if (availableBalance >= requiredSize) {
      return {
        canSell: true,
        availableBalance,
        requiredSize,
      };
    } else {
      return {
        canSell: false,
        availableBalance,
        requiredSize,
        error: `Insufficient balance. You have ${availableBalance.toFixed(8)} ${baseCurrency} but need ${requiredSize.toFixed(8)} to sell $${sizeUsd.toFixed(2)}`,
      };
    }
  } catch (error: any) {
    return {
      canSell: false,
      availableBalance: 0,
      requiredSize: 0,
      error: error.message,
    };
  }
}
