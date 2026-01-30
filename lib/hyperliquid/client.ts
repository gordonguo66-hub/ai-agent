/**
 * Hyperliquid API Client
 * Server-side only - never expose to browser
 * 
 * Hyperliquid API Documentation:
 * - Info endpoint: POST https://api.hyperliquid.xyz/info
 * - Exchange endpoint: POST https://api.hyperliquid.xyz/exchange
 */

const HYPERLIQUID_API_BASE = "https://api.hyperliquid.xyz";

function toCoin(market: string) {
  return market.replace(/-PERP$/i, "");
}

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
  count: number;
}

export interface OrderbookL2 extends OrderbookTop {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  time?: number;
}

export interface AccountState {
  positions: Array<{
    coin: string;
    entryPx: string;
    leverage: { value: string };
    liquidationPx: string;
    marginUsed: string;
    notionalUsd: string;
    positionValue: string;
    returnOnEquity: string;
    unrealizedPnl: string;
    szi: string; // signed size
  }>;
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
}

export interface PlaceOrderResponse {
  status: string;
  response?: {
    type: string;
    data?: string;
  };
}

export class HyperliquidClient {
  private apiBase: string;

  constructor(apiBase: string = HYPERLIQUID_API_BASE) {
    this.apiBase = apiBase;
  }

  /**
   * Get mark price for a market
   */
  async getMarkPrice(market: string): Promise<MarketPrice> {
    try {
      const response = await fetch(`${this.apiBase}/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "allMids",
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.statusText}`);
      }

      const data = await response.json();
      // allMids returns an object map: { [coin: string]: "midPrice" }
      // Some deployments may include internal keys like "@142".
      const pxStr = data?.[toCoin(market)];
      if (!pxStr) throw new Error(`Market ${market} not found in allMids`);

      return {
        price: parseFloat(pxStr),
        timestamp: Date.now(),
      };
    } catch (error: any) {
      throw new Error(`Failed to get mark price for ${market}: ${error.message}`);
    }
  }

  /**
   * Get L2 orderbook for a market (up to depth levels)
   * NOTE: Hyperliquid returns full book; we slice to requested depth.
   */
  async getOrderbook(market: string, depth: number = 20): Promise<OrderbookL2> {
    try {
      const response = await fetch(`${this.apiBase}/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "l2Book",
          coin: toCoin(market),
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.statusText}`);
      }

      const data = await response.json();

      // l2Book returns: { coin, time, levels: [ bids[], asks[] ] }
      // Each level is { px: "113377.0", sz: "7.66", n: 17 }
      const levels = data?.levels;
      const bidLevels: Array<{ px: string; sz: string; n: number }> = Array.isArray(levels?.[0]) ? levels[0] : [];
      const askLevels: Array<{ px: string; sz: string; n: number }> = Array.isArray(levels?.[1]) ? levels[1] : [];

      if (bidLevels.length === 0 || askLevels.length === 0) {
        throw new Error(`Insufficient orderbook data for ${market}`);
      }

      const safeDepth = Math.max(1, Math.floor(depth));
      const bidSlice = bidLevels.slice(0, safeDepth);
      const askSlice = askLevels.slice(0, safeDepth);

      // Best bid is first (desc), best ask is first (asc) per docs
      const bestBid = parseFloat(bidSlice[0].px);
      const bestAsk = parseFloat(askSlice[0].px);

      const toLevel = (level: { px: string; sz: string; n: number }): OrderbookLevel => ({
        price: parseFloat(level.px),
        size: parseFloat(level.sz),
        count: level.n ?? 0,
      });

      return {
        bid: bestBid,
        ask: bestAsk,
        mid: (bestBid + bestAsk) / 2,
        bids: bidSlice.map(toLevel),
        asks: askSlice.map(toLevel),
        time: data?.time,
      };
    } catch (error: any) {
      throw new Error(`Failed to get orderbook for ${market}: ${error.message}`);
    }
  }

  /**
   * Get top of orderbook (bid/ask/mid) for a market
   */
  async getOrderbookTop(market: string): Promise<OrderbookTop> {
    const orderbook = await this.getOrderbook(market, 1);
    return { bid: orderbook.bid, ask: orderbook.ask, mid: orderbook.mid };
  }

  /**
   * Get account state (positions + margin) for a wallet address
   */
  async getAccountState(walletAddress: string): Promise<AccountState> {
    try {
      const response = await fetch(`${this.apiBase}/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Log the full response for debugging
      console.log(`[Hyperliquid API] Full response for wallet ${walletAddress}:`, JSON.stringify(data, null, 2));
      console.log(`[Hyperliquid API] marginSummary:`, data.marginSummary);
      console.log(`[Hyperliquid API] accountValue:`, data.marginSummary?.accountValue);
      console.log(`[Hyperliquid API] assetPositions:`, data.assetPositions);
      
      // Hyperliquid returns clearinghouse state with positions and margin
      return {
        positions: data.assetPositions || [],
        marginSummary: {
          accountValue: data.marginSummary?.accountValue || "0",
          totalMarginUsed: data.marginSummary?.totalMarginUsed || "0",
          totalNtlPos: data.marginSummary?.totalNtlPos || "0",
          totalRawUsd: data.marginSummary?.totalRawUsd || "0",
        },
      };
    } catch (error: any) {
      throw new Error(`Failed to get account state for ${walletAddress}: ${error.message}`);
    }
  }

  /**
   * Place a market order
   * WARNING: This places REAL orders. Only call in live mode.
   * 
   * @param walletAddress - User's wallet address
   * @param privateKey - User's private key (for signing)
   * @param market - Market symbol (e.g., "BTC-PERP")
   * @param side - "buy" or "sell"
   * @param size - Order size (in base currency units)
   */
  async placeMarketOrder(
    walletAddress: string,
    privateKey: string,
    market: string,
    side: "buy" | "sell",
    size: number
  ): Promise<PlaceOrderResponse> {
    // SAFETY: Validate inputs
    if (!walletAddress || !privateKey || !market || !side || !size || size <= 0) {
      throw new Error("Invalid order parameters");
    }

    // TODO: Implement proper Hyperliquid order signing
    // For MVP, this is a placeholder that shows the structure
    // In production, you need to:
    // 1. Create order action with nonce
    // 2. Sign with private key using Hyperliquid's signing scheme
    // 3. Send to /exchange endpoint
    
    try {
      const nonce = Date.now();
      const isBuy = side === "buy";
      
      // Hyperliquid order structure
      const orderAction = {
        type: "order",
        orders: [
          {
            a: size, // amount
            b: isBuy, // isBuy
            p: "0", // price (0 for market orders)
            r: false, // reduceOnly
            s: market, // symbol
            t: { limit: { tif: "Ioc" } }, // order type: immediate or cancel
          },
        ],
        grouping: "na",
      };

      // TODO: Sign the order with private key
      // For MVP, we'll throw an error to prevent accidental real orders
      // until proper signing is implemented
      throw new Error(
        "Order signing not yet implemented. This is a safety check to prevent accidental real orders."
      );

      // Once signing is implemented, uncomment:
      /*
      const signature = await this.signOrder(orderAction, nonce, privateKey);
      
      const response = await fetch(`${this.apiBase}/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: orderAction,
          nonce,
          signature,
          vaultAddress: null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Order placement failed: ${JSON.stringify(errorData)}`);
      }

      return await response.json();
      */
    } catch (error: any) {
      throw new Error(`Failed to place order: ${error.message}`);
    }
  }

  /**
   * Get mid price (convenience method)
   */
  async getMidPrice(market: string): Promise<number> {
    const orderbook = await this.getOrderbookTop(market);
    return orderbook.mid;
  }
}

// Export singleton instance
export const hyperliquidClient = new HyperliquidClient();
