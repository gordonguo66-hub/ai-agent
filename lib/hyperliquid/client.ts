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

export interface SpotBalance {
  coin: string;
  total: number;
  hold: number;
  available: number;
}

export interface TotalEquity {
  perpEquity: number;      // Unrealized PnL from perp positions (NOT margin, to avoid double-counting)
  spotUsdcBalance: number; // USDC in spot wallet (base equity)
  totalEquity: number;     // spotUsdcBalance + unrealizedPnL (avoids double-counting cross-margin)
  marginUsed: number;      // Total margin pledged for perp positions
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
   * @deprecated DO NOT USE - This method has incomplete order signing.
   * Use placeMarketOrder from lib/hyperliquid/orderExecution.ts instead,
   * which uses the @nktkas/hyperliquid SDK with proper signing.
   *
   * This method is intentionally disabled to prevent accidental use.
   * It will throw an error if called.
   */
  async placeMarketOrder(
    _walletAddress: string,
    _privateKey: string,
    _market: string,
    _side: "buy" | "sell",
    _size: number
  ): Promise<PlaceOrderResponse> {
    throw new Error(
      "DEPRECATED: This method has incomplete order signing and cannot be used. " +
      "Use placeMarketOrder from lib/hyperliquid/orderExecution.ts instead, " +
      "which uses the @nktkas/hyperliquid SDK with proper signing."
    );
  }

  /**
   * Get mid price (convenience method)
   */
  async getMidPrice(market: string): Promise<number> {
    const orderbook = await this.getOrderbookTop(market);
    return orderbook.mid;
  }

  /**
   * Get spot wallet balances for a wallet address
   * Returns balances for all tokens in the spot wallet
   */
  async getSpotBalances(walletAddress: string): Promise<SpotBalance[]> {
    try {
      const response = await fetch(`${this.apiBase}/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "spotClearinghouseState",
          user: walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperliquid API error: ${response.statusText}`);
      }

      const data = await response.json();
      const balances = data.balances || [];

      return balances.map((b: any) => ({
        coin: b.coin || "UNKNOWN",
        total: Number(b.total || 0),
        hold: Number(b.hold || 0),
        available: Number(b.total || 0) - Number(b.hold || 0),
      }));
    } catch (error: any) {
      console.error(`[Hyperliquid API] Failed to get spot balances: ${error.message}`);
      return [];
    }
  }

  /**
   * Get total equity for Hyperliquid unified margin accounts
   *
   * In unified margin mode (default for all Hyperliquid accounts):
   * - spotUsdcBalance IS your total equity (margin is pledged from it, not moved)
   * - perpAccountValue = margin pledged + unrealized PnL (a SUBSET of spot balance)
   * - DO NOT add them together - that would double-count!
   *
   * The unrealized PnL from positions affects the total, but the base capital
   * is already in spotUsdcBalance.
   */
  async getTotalEquity(walletAddress: string): Promise<TotalEquity> {
    // Fetch both in parallel
    const [accountState, spotBalances] = await Promise.all([
      this.getAccountState(walletAddress),
      this.getSpotBalances(walletAddress),
    ]);

    const perpAccountValue = Number(accountState.marginSummary.accountValue || 0);
    const marginUsed = Number(accountState.marginSummary.totalMarginUsed || 0);

    // Find USDC balance in spot (this is the main stablecoin for trading)
    const usdcBalance = spotBalances.find(b => b.coin === "USDC");
    const spotUsdcBalance = usdcBalance?.total || 0;

    // In unified margin mode, spotUsdcBalance IS the total equity
    // The unrealized PnL is already reflected in the spot balance value
    // perpAccountValue represents the margin + unrealized PnL which OVERLAPS with spot
    //
    // Correct calculation:
    // - If no positions: total = spotUsdcBalance ✓
    // - If positions exist: total = spotUsdcBalance (unrealized PnL is already included) ✓
    //
    // We calculate unrealizedPnl for display purposes only (perpAccountValue - marginUsed)
    // but we use spotUsdcBalance as the total equity to avoid double-counting
    const unrealizedPnl = marginUsed > 0 ? perpAccountValue - marginUsed : 0;

    // Total equity = spot USDC balance (this IS the total in unified margin mode)
    const totalEquity = spotUsdcBalance;

    // For backwards compatibility, perpEquity represents just unrealized PnL
    const perpEquity = unrealizedPnl;

    console.log(`[Hyperliquid API] Total equity (unified margin) - Spot USDC: $${spotUsdcBalance.toFixed(2)}, Perp accountValue: $${perpAccountValue.toFixed(2)}, Margin used: $${marginUsed.toFixed(2)}, Unrealized PnL: $${unrealizedPnl.toFixed(2)}, Total: $${totalEquity.toFixed(2)}`);

    return {
      perpEquity,
      spotUsdcBalance,
      totalEquity,
      marginUsed,
    };
  }
}

// Export singleton instance
export const hyperliquidClient = new HyperliquidClient();
