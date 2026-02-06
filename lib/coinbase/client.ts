/**
 * Coinbase Advanced Trade API Client
 * Server-side only - never expose to browser
 *
 * Uses the coinbase-api package for authenticated requests.
 * Supports both ECDSA and ED25519 API keys.
 *
 * Coinbase API Documentation:
 * - https://docs.cdp.coinbase.com/advanced-trade/docs/welcome
 */

import { CBAdvancedTradeClient } from "coinbase-api";

export interface MarketPrice {
  price: number;
  timestamp: number;
}

export interface OrderbookTop {
  bid: number;
  ask: number;
  mid: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookL2 extends OrderbookTop {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  time?: number;
}

export interface CoinbaseAccount {
  uuid: string;
  name: string;
  currency: string;
  available_balance: {
    value: string;
    currency: string;
  };
  hold: {
    value: string;
    currency: string;
  };
  type: string;
}

export interface SpotBalance {
  asset: string;
  total: number;
  hold: number;
  available: number;
  usdValue: number;
}

export interface CoinbaseProduct {
  product_id: string;
  base_currency_id: string;
  quote_currency_id: string;
  base_display_symbol: string;
  quote_display_symbol: string;
  status: string;
  price: string;
  product_type: string;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  status?: string;
  filledSize?: number;
  filledPrice?: number;
  error?: string;
}

/**
 * CoinbaseClient - wrapper around CBAdvancedTradeClient
 * Provides a consistent interface matching the Hyperliquid client pattern
 */
export class CoinbaseClient {
  private client: CBAdvancedTradeClient | null = null;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;

  /**
   * Initialize the client with API credentials
   * Must be called before any authenticated requests
   */
  initialize(apiKey: string, apiSecret: string): void {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.client = new CBAdvancedTradeClient({
      apiKey,
      apiSecret,
    });
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Ensure client is initialized before making requests
   */
  private ensureInitialized(): CBAdvancedTradeClient {
    if (!this.client) {
      throw new Error(
        "Coinbase client not initialized. Call initialize() first."
      );
    }
    return this.client;
  }

  /**
   * Get current price for a product (e.g., "BTC-USD")
   */
  async getPrice(productId: string): Promise<MarketPrice> {
    try {
      const client = this.ensureInitialized();
      const response = await client.getProduct({ product_id: productId });

      const price = parseFloat(response.price || "0");
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price for ${productId}`);
      }

      return {
        price,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      throw new Error(`Failed to get price for ${productId}: ${error.message}`);
    }
  }

  /**
   * Get orderbook for a product
   */
  async getOrderbook(productId: string, limit: number = 20): Promise<OrderbookL2> {
    try {
      const client = this.ensureInitialized();
      const response = await client.getProductBook({
        product_id: productId,
        limit,
      });

      const bids = (response.pricebook?.bids || []).map((level: any) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }));

      const asks = (response.pricebook?.asks || []).map((level: any) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }));

      if (bids.length === 0 || asks.length === 0) {
        throw new Error(`Insufficient orderbook data for ${productId}`);
      }

      const bestBid = bids[0].price;
      const bestAsk = asks[0].price;

      return {
        bid: bestBid,
        ask: bestAsk,
        mid: (bestBid + bestAsk) / 2,
        bids,
        asks,
        time: Date.now(),
      };
    } catch (error: any) {
      throw new Error(
        `Failed to get orderbook for ${productId}: ${error.message}`
      );
    }
  }

  /**
   * Get top of orderbook (bid/ask/mid)
   */
  async getOrderbookTop(productId: string): Promise<OrderbookTop> {
    const orderbook = await this.getOrderbook(productId, 1);
    return { bid: orderbook.bid, ask: orderbook.ask, mid: orderbook.mid };
  }

  /**
   * Get mid price (convenience method)
   */
  async getMidPrice(productId: string): Promise<number> {
    const orderbook = await this.getOrderbookTop(productId);
    return orderbook.mid;
  }

  /**
   * Get all accounts (balances)
   */
  async getAccounts(): Promise<CoinbaseAccount[]> {
    try {
      const client = this.ensureInitialized();
      const response = await client.getAccounts({ limit: 250 });
      return response.accounts || [];
    } catch (error: any) {
      throw new Error(`Failed to get accounts: ${error.message}`);
    }
  }

  /**
   * Get spot balances in normalized format
   * Returns all non-zero balances with USD values
   */
  async getSpotBalances(): Promise<SpotBalance[]> {
    try {
      const accounts = await this.getAccounts();
      const balances: SpotBalance[] = [];

      // Get current prices for non-USD assets
      const pricePromises: Promise<{ asset: string; price: number }>[] = [];

      for (const account of accounts) {
        const available = parseFloat(account.available_balance?.value || "0");
        const hold = parseFloat(account.hold?.value || "0");
        const total = available + hold;

        // Skip zero balances
        if (total === 0) continue;

        const currency = account.currency;

        // USD-based currencies have 1:1 value
        if (currency === "USD" || currency === "USDC" || currency === "USDT") {
          balances.push({
            asset: currency,
            total,
            hold,
            available,
            usdValue: total,
          });
        } else {
          // Need to fetch price for non-USD assets
          pricePromises.push(
            this.getPrice(`${currency}-USD`)
              .then((p) => ({ asset: currency, price: p.price }))
              .catch(() => ({ asset: currency, price: 0 }))
          );

          balances.push({
            asset: currency,
            total,
            hold,
            available,
            usdValue: 0, // Will be updated after price fetch
          });
        }
      }

      // Fetch all prices in parallel
      const prices = await Promise.all(pricePromises);
      const priceMap = new Map(prices.map((p) => [p.asset, p.price]));

      // Update USD values
      for (const balance of balances) {
        if (balance.usdValue === 0) {
          const price = priceMap.get(balance.asset) || 0;
          balance.usdValue = balance.total * price;
        }
      }

      return balances;
    } catch (error: any) {
      console.error(`[Coinbase API] Failed to get spot balances: ${error.message}`);
      throw new Error(`Failed to get spot balances from Coinbase: ${error.message}`);
    }
  }

  /**
   * Get total equity (sum of all USD values)
   */
  async getTotalEquity(): Promise<number> {
    const balances = await this.getSpotBalances();
    return balances.reduce((sum, b) => sum + b.usdValue, 0);
  }

  /**
   * Get all available products (markets)
   */
  async getProducts(): Promise<CoinbaseProduct[]> {
    try {
      const client = this.ensureInitialized();
      const response = await client.getProducts({
        product_type: "SPOT",
      });
      return response.products || [];
    } catch (error: any) {
      throw new Error(`Failed to get products: ${error.message}`);
    }
  }

  /**
   * Get USD spot products only (e.g., BTC-USD, ETH-USD)
   */
  async getUsdProducts(): Promise<CoinbaseProduct[]> {
    const products = await this.getProducts();
    return products.filter(
      (p) =>
        p.quote_currency_id === "USD" &&
        p.status === "online" &&
        p.product_type === "SPOT"
    );
  }

  /**
   * Place a market order
   *
   * @param productId - Product ID (e.g., "BTC-USD")
   * @param side - "buy" or "sell"
   * @param quoteSize - For buys: USD amount to spend
   * @param baseSize - For sells: Asset amount to sell
   */
  async placeMarketOrder(
    productId: string,
    side: "buy" | "sell",
    quoteSize?: string,
    baseSize?: string
  ): Promise<PlaceOrderResult> {
    try {
      const client = this.ensureInitialized();

      const clientOrderId = `cc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const orderConfig: any = {
        client_order_id: clientOrderId,
        product_id: productId,
        side: side.toUpperCase(),
        order_configuration: {
          market_market_ioc: {},
        },
      };

      // For buys, specify quote_size (USD amount)
      // For sells, specify base_size (asset amount)
      if (side === "buy" && quoteSize) {
        orderConfig.order_configuration.market_market_ioc.quote_size = quoteSize;
      } else if (side === "sell" && baseSize) {
        orderConfig.order_configuration.market_market_ioc.base_size = baseSize;
      } else {
        throw new Error(
          "Must provide quoteSize for buys or baseSize for sells"
        );
      }

      console.log(`[Coinbase] Placing ${side} order for ${productId}:`, orderConfig);

      const response = await client.submitOrder(orderConfig) as any;

      if (response.success) {
        return {
          success: true,
          orderId: response.order_id || response.success_response?.order_id,
          status: "filled",
        };
      } else {
        return {
          success: false,
          error:
            response.error_response?.message ||
            response.failure_reason ||
            "Order failed",
        };
      }
    } catch (error: any) {
      console.error(`[Coinbase] Order placement failed:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string): Promise<any> {
    try {
      const client = this.ensureInitialized();
      return await client.getOrder({ order_id: orderId });
    } catch (error: any) {
      throw new Error(`Failed to get order ${orderId}: ${error.message}`);
    }
  }

  /**
   * Test connection by fetching accounts
   * Returns true if successful, throws error if not
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log("[Coinbase] Testing connection with getAccounts...");
      const accounts = await this.getAccounts();
      console.log("[Coinbase] Connection successful, found", accounts.length, "accounts");
      return true;
    } catch (error: any) {
      console.error("[Coinbase] Connection test failed:", error);
      // Extract more detailed error info if available
      const errorDetails = error.response?.data
        || error.body
        || error.message
        || String(error);
      throw new Error(`Connection test failed: ${JSON.stringify(errorDetails)}`);
    }
  }
}

// Note: Unlike Hyperliquid, we don't export a singleton because
// each user needs their own authenticated client instance.
// Use CoinbaseClient class directly with user's credentials.
