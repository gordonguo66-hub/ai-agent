/**
 * Fetch and normalize Coinbase tradable markets
 * Returns USD spot markets available on Coinbase Advanced Trade
 */

export interface MarketInfo {
  symbol: string; // e.g., "BTC-USD"
  display: string; // e.g., "BTC/USD"
  type: "SPOT";
  baseAsset: string; // e.g., "BTC"
  quoteAsset: string; // e.g., "USD"
}

const MAJOR_MARKETS = ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "LINK"];

// Cache for markets list
let marketsCache: MarketInfo[] | null = null;
let marketsCacheTimestamp = 0;
const MARKETS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all USD spot markets from Coinbase
 * Returns normalized market list with major markets first
 */
export async function getCoinbaseMarkets(): Promise<MarketInfo[]> {
  const now = Date.now();

  // Return cached markets if still valid
  if (marketsCache && now - marketsCacheTimestamp < MARKETS_CACHE_TTL_MS) {
    return marketsCache;
  }

  try {
    // Use Coinbase public products endpoint
    const response = await fetch(
      "https://api.exchange.coinbase.com/products",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status}`);
    }

    const products = await response.json();

    // Filter to USD spot markets only
    const markets: MarketInfo[] = [];
    const seen = new Set<string>();

    for (const product of products) {
      // Only include USD quote currency
      if (product.quote_currency !== "USD") {
        continue;
      }

      // Only include spot markets (not futures/derivatives)
      // Skip if status is not "online"
      if (product.status !== "online") {
        continue;
      }

      // Skip auction-only or post-only markets
      if (product.auction_mode || product.post_only) {
        continue;
      }

      const symbol = product.id; // e.g., "BTC-USD"
      const baseAsset = product.base_currency; // e.g., "BTC"
      const quoteAsset = product.quote_currency; // e.g., "USD"

      if (!seen.has(symbol)) {
        markets.push({
          symbol,
          display: `${baseAsset}/${quoteAsset}`,
          type: "SPOT",
          baseAsset,
          quoteAsset,
        });
        seen.add(symbol);
      }
    }

    // Sort: majors first, then alphabetical
    markets.sort((a, b) => {
      const aIsMajor = MAJOR_MARKETS.includes(a.baseAsset);
      const bIsMajor = MAJOR_MARKETS.includes(b.baseAsset);

      if (aIsMajor && !bIsMajor) return -1;
      if (!aIsMajor && bIsMajor) return 1;
      if (aIsMajor && bIsMajor) {
        // Sort majors by their order in MAJOR_MARKETS
        return (
          MAJOR_MARKETS.indexOf(a.baseAsset) -
          MAJOR_MARKETS.indexOf(b.baseAsset)
        );
      }
      return a.symbol.localeCompare(b.symbol);
    });

    // Update cache
    marketsCache = markets;
    marketsCacheTimestamp = now;

    console.log(`[Coinbase] Loaded ${markets.length} USD spot markets`);
    return markets;
  } catch (error: any) {
    console.error("Failed to fetch Coinbase markets:", error);

    // Return cached markets if available
    if (marketsCache) {
      console.warn("Using stale cached markets");
      return marketsCache;
    }

    throw error;
  }
}

/**
 * Get market info for a specific product
 */
export async function getCoinbaseMarketInfo(
  productId: string
): Promise<MarketInfo | null> {
  const markets = await getCoinbaseMarkets();
  return markets.find((m) => m.symbol === productId) || null;
}

/**
 * Check if a product is a valid Coinbase market
 */
export async function isValidCoinbaseMarket(productId: string): Promise<boolean> {
  const market = await getCoinbaseMarketInfo(productId);
  return market !== null;
}

/**
 * Convert between Hyperliquid and Coinbase market formats
 * Hyperliquid: "BTC-PERP" -> Coinbase: "BTC-USD"
 */
export function hyperliquidToCoinbaseSymbol(hlSymbol: string): string {
  // BTC-PERP -> BTC-USD
  return hlSymbol.replace(/-PERP$/, "-USD");
}

/**
 * Convert from Coinbase to Hyperliquid format
 * Coinbase: "BTC-USD" -> Hyperliquid: "BTC-PERP"
 */
export function coinbaseToHyperliquidSymbol(cbSymbol: string): string {
  // BTC-USD -> BTC-PERP
  return cbSymbol.replace(/-USD$/, "-PERP");
}

/**
 * Extract base asset from market symbol
 * Works for both "BTC-USD" and "BTC-PERP" formats
 */
export function getBaseAsset(symbol: string): string {
  return symbol.split("-")[0];
}
