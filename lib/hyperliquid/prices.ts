/**
 * Fetch real market prices from Hyperliquid public API
 * No authentication required - uses public endpoints only
 */

interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

// In-memory cache with TTL
const priceCache = new Map<string, PriceCacheEntry>();
const CACHE_TTL_MS = 1000; // 1 second - reduced for more accurate pricing
const STALE_CACHE_MAX_AGE_MS = 30_000; // 30 seconds - max age for stale cache fallback on API failure

/**
 * Get mid price for a market (e.g., "BTC-PERP")
 * Uses Hyperliquid's public info endpoint
 */
export async function getMidPrice(market: string): Promise<number> {
  // Check cache first
  const cached = priceCache.get(market);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    // Extract base symbol (e.g., "BTC-PERP" -> "BTC")
    const baseSymbol = market.replace("-PERP", "").replace("-SPOT", "");

    // Fetch all mid prices from Hyperliquid
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "allMids",
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Find the market in the response
    // The response format is: { "BTC": "116845.5", "ETH": "3915.35", "@142": "...", ... }
    // We ignore keys starting with "@" and look for the base symbol
    const midPrice = data[baseSymbol];
    
    if (midPrice === undefined || midPrice === null) {
      throw new Error(`Market ${market} (base: ${baseSymbol}) not found in Hyperliquid response`);
    }

    const price = parseFloat(String(midPrice));
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price for ${market}: ${midPrice}`);
    }

    // Update cache
    priceCache.set(market, {
      price,
      timestamp: now,
    });

    return price;
  } catch (error: any) {
    console.error(`Error fetching price for ${market}:`, error);
    
    // Return cached price if available, but only if not too old
    // Stale prices used for stop-loss checks can trigger incorrect exits
    if (cached) {
      const cacheAge = Date.now() - cached.timestamp;
      if (cacheAge <= STALE_CACHE_MAX_AGE_MS) {
        console.warn(`Using stale cached price for ${market} (age: ${(cacheAge / 1000).toFixed(1)}s)`);
        return cached.price;
      }
      console.error(`Stale cache for ${market} too old (${(cacheAge / 1000).toFixed(0)}s > ${STALE_CACHE_MAX_AGE_MS / 1000}s limit), discarding`);
    }
    
    throw error;
  }
}

/**
 * Fetch prices for multiple markets in parallel
 */
export async function getMidPrices(markets: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  // Fetch all prices in parallel (with rate limiting consideration)
  const pricePromises = markets.slice(0, 5).map(async (market) => {
    try {
      const price = await getMidPrice(market);
      return { market, price };
    } catch (error: any) {
      console.error(`Failed to fetch price for ${market}:`, error);
      return { market, price: null };
    }
  });

  const results = await Promise.all(pricePromises);
  
  for (const { market, price } of results) {
    if (price !== null) {
      prices[market] = price;
    }
  }

  return prices;
}
