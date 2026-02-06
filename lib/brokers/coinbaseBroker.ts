/**
 * Coinbase Broker Implementation
 * Implements the Broker interface for Coinbase Advanced Trade
 *
 * IMPORTANT RESTRICTIONS (enforced by this broker):
 * - No short selling: Can only sell assets you own
 * - No leverage: All trades are 1x (spot)
 * - Spot markets only: No perpetuals/derivatives
 */

import {
  Broker,
  BrokerContext,
  EngineAccountState,
  OrderExecutionResult,
  OrderRequest,
  SpotBalance,
} from "@/lib/engine/types";
import { CoinbaseClient } from "@/lib/coinbase/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto/credentials";
import { getMidPrice, getOrderbookTop } from "@/lib/coinbase/prices";

export class CoinbaseBroker implements Broker {
  /**
   * Get account state from Coinbase
   * Returns equity and exposure based on spot holdings
   */
  async getAccountState(ctx: BrokerContext): Promise<EngineAccountState> {
    const { apiKey, apiSecret } = await this.getLatestConnectionOrThrow(
      ctx.userId
    );

    const client = new CoinbaseClient();
    client.initialize(apiKey, apiSecret);

    const balances = await client.getSpotBalances();

    // Calculate total equity (sum of all USD values)
    let equityUsd = 0;
    let grossExposureUsd = 0;
    let cashUsd = 0;

    const spotBalances: SpotBalance[] = [];

    for (const balance of balances) {
      equityUsd += balance.usdValue;

      // USD/USDC/USDT are cash, not exposure
      if (
        balance.asset === "USD" ||
        balance.asset === "USDC" ||
        balance.asset === "USDT"
      ) {
        cashUsd += balance.usdValue;
      } else {
        // Non-USD assets count as exposure
        grossExposureUsd += balance.usdValue;
      }

      spotBalances.push(balance);
    }

    // For spot, net exposure = gross exposure (always long)
    const netExposureUsd = grossExposureUsd;

    return {
      equityUsd,
      cashUsd,
      grossExposureUsd,
      netExposureUsd,
      spotBalances,
    };
  }

  /**
   * Place an order on Coinbase
   *
   * IMPORTANT: This enforces spot trading restrictions:
   * - For sells: Verifies sufficient balance before placing order
   * - All orders are market orders (immediate or cancel)
   */
  async placeOrder(
    ctx: BrokerContext,
    req: OrderRequest
  ): Promise<OrderExecutionResult> {
    // Safety: live broker should only be called for live mode
    if (ctx.mode !== "live") {
      return { status: "skipped", venueResponse: { reason: "not live mode" } };
    }

    if (!req.size || req.size <= 0) {
      return { status: "skipped", venueResponse: { reason: "size=0" } };
    }

    const { apiKey, apiSecret } = await this.getLatestConnectionOrThrow(
      ctx.userId
    );

    // Normalize market format (BTC-PERP -> BTC-USD if needed)
    const productId = normalizeProductId(req.market);

    // Get current price for order sizing
    const orderbook = await getOrderbookTop(productId);
    const currentPrice = orderbook.mid;

    // Calculate order value in USD
    const orderValueUsd = req.size * currentPrice;

    // Minimum order check (Coinbase minimum varies by product, but $1 is safe)
    if (orderValueUsd < 1) {
      return {
        status: "skipped",
        venueResponse: {
          reason: `Order value $${orderValueUsd.toFixed(2)} below minimum`,
        },
      };
    }

    const client = new CoinbaseClient();
    client.initialize(apiKey, apiSecret);

    try {
      let result;

      if (req.side === "buy") {
        // For buys: use quote_size (USD amount)
        result = await client.placeMarketOrder(
          productId,
          "buy",
          orderValueUsd.toFixed(2), // quoteSize
          undefined // baseSize
        );
      } else {
        // For sells: verify balance first
        const baseCurrency = productId.split("-")[0];
        const balances = await client.getSpotBalances();
        const balance = balances.find((b) => b.asset === baseCurrency);
        const availableBalance = balance?.available || 0;

        if (availableBalance < req.size) {
          return {
            status: "failed",
            venueResponse: {
              broker: "coinbase",
              error: `Insufficient balance. You have ${availableBalance.toFixed(8)} ${baseCurrency} but trying to sell ${req.size.toFixed(8)}. Short selling is not available on Coinbase spot markets.`,
            },
          };
        }

        // For sells: use base_size (asset amount)
        result = await client.placeMarketOrder(
          productId,
          "sell",
          undefined, // quoteSize
          req.size.toString() // baseSize
        );
      }

      if (result.success) {
        return {
          status: "filled",
          filledPrice: result.filledPrice,
          venueResponse: {
            broker: "coinbase",
            orderId: result.orderId,
            request: {
              productId,
              side: req.side,
              size: req.size,
              valueUsd: orderValueUsd,
              clientOrderId: req.clientOrderId,
            },
            response: result,
          },
        };
      } else {
        return {
          status: "failed",
          venueResponse: {
            broker: "coinbase",
            error: result.error,
            request: {
              productId,
              side: req.side,
              size: req.size,
            },
          },
        };
      }
    } catch (e: any) {
      return {
        status: "failed",
        venueResponse: {
          broker: "coinbase",
          error: e?.message || String(e),
        },
      };
    }
  }

  /**
   * Get Coinbase API credentials for a user
   * Fetches from exchange_connections table where venue='coinbase'
   */
  private async getLatestConnectionOrThrow(
    userId: string
  ): Promise<{ apiKey: string; apiSecret: string }> {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("exchange_connections")
      .select("api_key, api_secret_encrypted")
      .eq("user_id", userId)
      .eq("venue", "coinbase")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.api_key || !data.api_secret_encrypted) {
      throw new Error(
        "No Coinbase connection found. Please connect your Coinbase account in Settings."
      );
    }

    return {
      apiKey: data.api_key,
      apiSecret: decryptCredential(data.api_secret_encrypted),
    };
  }
}

/**
 * Normalize market symbol to Coinbase format
 * Spot: BTC-PERP -> BTC-USD, BTC -> BTC-USD, BTC-USD -> BTC-USD
 * INTX: BTC-PERP-INTX -> BTC-PERP-INTX (keep as-is)
 */
function normalizeProductId(market: string): string {
  // INTX perpetual format - keep as-is
  if (market.endsWith("-INTX")) {
    return market;
  }

  // If already in spot format
  if (market.endsWith("-USD")) {
    return market;
  }

  // Convert from Hyperliquid format (for backwards compatibility)
  if (market.endsWith("-PERP")) {
    return market.replace("-PERP", "-USD");
  }

  // Just base asset
  return `${market}-USD`;
}
