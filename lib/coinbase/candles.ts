/**
 * Fetch historical candle/OHLCV data from Coinbase Exchange API
 * Uses public endpoint - no authentication required
 *
 * Supports:
 * - Spot products (BTC-USD, ETH-USD) directly
 * - INTX perpetuals (BTC-PERP-INTX) via spot equivalent (perpetual prices track spot)
 */

export interface Candle {
  t: number; // timestamp (ms)
  T: number; // close time (ms)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  n: number; // number of trades (not provided by Coinbase, set to 0)
}

/**
 * Check if product is an INTX perpetual
 */
function isIntxProduct(productId: string): boolean {
  return productId.endsWith("-INTX");
}

/**
 * Convert INTX product ID to spot equivalent for candle data
 * INTX perpetuals track spot prices very closely
 */
function toSpotProductId(productId: string): string {
  if (!isIntxProduct(productId)) {
    return productId;
  }
  // BTC-PERP-INTX -> BTC-USD
  const basePart = productId.replace("-PERP-INTX", "").replace("-INTX", "");
  return `${basePart}-USD`;
}

// Coinbase granularity values in seconds
const GRANULARITY_MAP: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
};

// Cache for candles
interface CandleCache {
  data: Candle[];
  timestamp: number;
  key: string;
}

let candleCache: CandleCache | null = null;
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Get candles for a Coinbase product
 * @param productId - Product ID (e.g., "BTC-USD")
 * @param interval - Candle interval (1m, 5m, 15m, 1h, 6h, 1d)
 * @param count - Number of candles to fetch (max 300)
 */
export async function getCandles(
  productId: string,
  interval: string = "5m",
  count: number = 200
): Promise<Candle[]> {
  // For INTX products, use spot equivalent for candle data
  // Perpetual prices track spot very closely
  const actualProductId = toSpotProductId(productId);
  if (actualProductId !== productId) {
    console.log(`[Coinbase Candles] INTX: using spot ${actualProductId} candles for ${productId}`);
  }

  // Normalize interval to Coinbase format
  const normalizedInterval = normalizeInterval(interval);
  const granularity = GRANULARITY_MAP[normalizedInterval];

  if (!granularity) {
    console.warn(
      `[Coinbase Candles] Unsupported interval ${interval}, falling back to 5m`
    );
  }

  const effectiveGranularity = granularity || 300; // Default to 5m

  // Check cache (use original productId for cache key to avoid redundant fetches)
  const cacheKey = `${productId}-${effectiveGranularity}-${count}`;
  const now = Date.now();
  if (candleCache && candleCache.key === cacheKey && now - candleCache.timestamp < CACHE_TTL_MS) {
    return candleCache.data;
  }

  try {
    // Calculate time range
    // Coinbase returns max 300 candles per request
    const maxCandles = Math.min(count, 300);
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - maxCandles * effectiveGranularity * 1000
    );

    const url = new URL(
      `https://api.exchange.coinbase.com/products/${actualProductId}/candles`
    );
    url.searchParams.set("start", startTime.toISOString());
    url.searchParams.set("end", endTime.toISOString());
    url.searchParams.set("granularity", effectiveGranularity.toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status}`);
    }

    const data = await response.json();

    // Coinbase returns: [[timestamp, low, high, open, close, volume], ...]
    // Note: Coinbase returns newest first, we need to reverse for chronological order
    const candles: Candle[] = data
      .reverse()
      .slice(-maxCandles)
      .map((c: number[]) => ({
        t: c[0] * 1000, // Convert to ms
        T: c[0] * 1000 + effectiveGranularity * 1000, // Close time
        o: c[3], // open
        h: c[2], // high
        l: c[1], // low
        c: c[4], // close
        v: c[5], // volume
        n: 0, // Coinbase doesn't provide trade count
      }));

    // Update cache
    candleCache = {
      data: candles,
      timestamp: now,
      key: cacheKey,
    };

    console.log(
      `[Coinbase Candles] Fetched ${candles.length} candles for ${productId}${actualProductId !== productId ? ` (via ${actualProductId})` : ''} (${normalizedInterval})`
    );

    return candles;
  } catch (error: any) {
    console.error(`[Coinbase Candles] Error fetching candles:`, error);

    // Return cached data if available
    if (candleCache && candleCache.key === cacheKey) {
      console.warn(`[Coinbase Candles] Using stale cached data`);
      return candleCache.data;
    }

    throw error;
  }
}

/**
 * Normalize interval string to Coinbase supported format
 * Coinbase supports: 1m, 5m, 15m, 1h, 6h, 1d
 */
function normalizeInterval(interval: string): string {
  const normalized = interval.toLowerCase();

  // Direct matches
  if (GRANULARITY_MAP[normalized]) {
    return normalized;
  }

  // Handle variations
  switch (normalized) {
    case "1min":
    case "1minute":
      return "1m";
    case "5min":
    case "5minute":
      return "5m";
    case "15min":
    case "15minute":
      return "15m";
    case "1hour":
    case "60m":
      return "1h";
    case "6hour":
    case "360m":
      return "6h";
    case "1day":
    case "24h":
    case "1440m":
      return "1d";
    // Approximate unsupported intervals to closest supported
    case "3m":
      return "5m";
    case "30m":
      return "15m"; // No 30m, use 15m
    case "2h":
    case "4h":
      return "6h"; // No 2h/4h, use 6h
    case "8h":
    case "12h":
      return "6h"; // No 8h/12h, use 6h
    default:
      return "5m"; // Default fallback
  }
}
