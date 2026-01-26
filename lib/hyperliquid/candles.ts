/**
 * Fetch historical candles (OHLCV) from Hyperliquid
 */

export interface Candle {
  t: number; // Open time (ms)
  T: number; // Close time (ms)
  o: number; // Open price
  h: number; // High price
  l: number; // Low price
  c: number; // Close price
  v: number; // Volume
  n: number; // Number of trades
}

/**
 * Fetch historical candles from Hyperliquid
 * @param market - Market symbol (e.g., "BTC-PERP")
 * @param interval - Candle interval ("1m", "5m", "15m", "1h", etc.)
 * @param count - Number of candles to fetch (max ~5000)
 * @returns Array of candles (oldest first)
 */
export async function getCandles(
  market: string,
  interval: string,
  count: number = 200
): Promise<Candle[]> {
  try {
    // Extract base symbol (e.g., "BTC-PERP" -> "BTC")
    const baseSymbol = market.replace("-PERP", "").replace("-SPOT", "");

    // Calculate time range: we need count candles, so we need to go back enough time
    // For intervals like "5m", count=200 means 200 * 5 minutes = 1000 minutes of data
    const endTime = Date.now();
    
    // Parse interval to milliseconds
    const intervalMs = parseIntervalToMs(interval);
    const startTime = endTime - (count * intervalMs);

    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: {
          coin: baseSymbol,
          interval: interval,
          startTime: startTime,
          endTime: endTime,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Hyperliquid returns an array of candles
    const rawCandles = Array.isArray(data) ? data : [];
    
    // Normalize candles: convert string prices to numbers
    const candles: Candle[] = rawCandles.map((c: any) => ({
      t: Number(c.t || 0),
      T: Number(c.T || 0),
      o: Number(c.o || 0),
      h: Number(c.h || 0),
      l: Number(c.l || 0),
      c: Number(c.c || 0),
      v: Number(c.v || 0),
      n: Number(c.n || 0),
    }));

    // Sort by time (oldest first)
    candles.sort((a, b) => a.t - b.t);

    // Limit to requested count (take last N)
    return candles.slice(-count);
  } catch (error: any) {
    console.error(`Error fetching candles for ${market}:`, error);
    throw error;
  }
}

/**
 * Parse interval string to milliseconds
 */
function parseIntervalToMs(interval: string): number {
  const match = interval.match(/^(\d+)([mhdwM])$/);
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}`);
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case "m": // minutes
      return value * 60 * 1000;
    case "h": // hours
      return value * 60 * 60 * 1000;
    case "d": // days
      return value * 24 * 60 * 60 * 1000;
    case "w": // weeks
      return value * 7 * 24 * 60 * 60 * 1000;
    case "M": // months (approximate as 30 days)
      return value * 30 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown interval unit: ${unit}`);
  }
}
