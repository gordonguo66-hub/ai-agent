/**
 * Fetch real market prices from Coinbase Advanced Trade API
 * Uses public endpoints for price data (no authentication required for basic price info)
 *
 * Supports:
 * - Spot products (BTC-USD, ETH-USD) via api.exchange.coinbase.com
 * - INTX perpetuals (BTC-PERP-INTX, ETH-PERP-INTX) via api.international.coinbase.com
 */

interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

// In-memory cache with TTL
const priceCache = new Map<string, PriceCacheEntry>();
const CACHE_TTL_MS = 1000; // 1 second - matches Hyperliquid

/**
 * Check if product is an INTX perpetual
 */
function isIntxProduct(productId: string): boolean {
  return productId.endsWith("-INTX");
}

/**
 * Get INTX price from Coinbase International API
 * INTX uses different product ID format and API endpoint
 */
async function getIntxPrice(productId: string): Promise<number> {
  // INTX product IDs are like "BTC-PERP-INTX"
  // Extract base asset: BTC-PERP-INTX -> BTC
  const basePart = productId.replace("-PERP-INTX", "").replace("-INTX", "");

  // INTX API uses format like "BTC-PERP" for perpetuals
  const intxProductId = `${basePart}-PERP`;

  console.log(`[Coinbase Prices] 🌐 Fetching INTX price for ${productId} (API product: ${intxProductId})`);

  try {
    // Try Coinbase International Exchange API
    // Public endpoint for INTX market data
    const response = await fetch(
      `https://api.international.coinbase.com/api/v1/instruments/${intxProductId}/quote`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      // INTX quote endpoint returns best_bid and best_ask
      const bid = parseFloat(data.best_bid || data.bid || "0");
      const ask = parseFloat(data.best_ask || data.ask || "0");

      if (bid > 0 && ask > 0) {
        const midPrice = (bid + ask) / 2;
        console.log(`[Coinbase Prices] ✅ INTX ${productId}: bid=$${bid.toFixed(2)}, ask=$${ask.toFixed(2)}, mid=$${midPrice.toFixed(2)}`);
        return midPrice;
      }

      // Try last price if bid/ask not available
      const lastPrice = parseFloat(data.last_price || data.price || "0");
      if (lastPrice > 0) {
        console.log(`[Coinbase Prices] ✅ INTX ${productId}: last=$${lastPrice.toFixed(2)}`);
        return lastPrice;
      }
    }

    // Fallback: Try to get price from spot equivalent (BTC-USD for BTC-PERP-INTX)
    // Perpetual prices closely track spot prices
    console.log(`[Coinbase Prices] ⚠️ INTX API failed for ${productId}, falling back to spot price`);
    const spotProductId = `${basePart}-USD`;
    return await getSpotPrice(spotProductId);

  } catch (error: any) {
    console.error(`[Coinbase Prices] INTX price fetch failed for ${productId}:`, error.message);

    // Fallback to spot price as approximation
    const spotProductId = `${basePart}-USD`;
    console.log(`[Coinbase Prices] ⚠️ Falling back to spot price for ${spotProductId}`);
    return await getSpotPrice(spotProductId);
  }
}

/**
 * Get spot price from Coinbase Exchange API
 */
async function getSpotPrice(productId: string): Promise<number> {
  // Try Coinbase Exchange API first (for USD pairs)
  let response = await fetch(
    `https://api.exchange.coinbase.com/products/${productId}/ticker`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  // If Exchange API fails (e.g., USDC pairs are delisted), try the basic Coinbase API
  if (!response.ok) {
    console.log(`[Coinbase Prices] Exchange API failed for ${productId}, trying basic API...`);

    // Use basic Coinbase API for USDC/USDT pairs
    response = await fetch(
      `https://api.coinbase.com/v2/prices/${productId}/spot`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.data?.amount || "0");
      if (price > 0) {
        console.log(`[Coinbase Prices] Got ${productId} price from basic API: $${price.toFixed(2)}`);
        return price;
      }
    }

    throw new Error(`Coinbase API error: ${response.status}`);
  }

  const data = await response.json();

  // Calculate mid price from bid/ask
  const bid = parseFloat(data.bid);
  const ask = parseFloat(data.ask);

  if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) {
    // Fall back to last trade price
    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price data for ${productId}`);
    }
    return price;
  }

  return (bid + ask) / 2;
}

/**
 * Get mid price for a product (e.g., "BTC-USD" or "BTC-PERP-INTX")
 * Automatically routes to correct API based on product type
 */
export async function getMidPrice(productId: string): Promise<number> {
  // Check cache first
  const cached = priceCache.get(productId);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    let price: number;

    if (isIntxProduct(productId)) {
      // INTX perpetual - use INTX API
      price = await getIntxPrice(productId);
    } else {
      // Spot product - use Exchange API
      price = await getSpotPrice(productId);
    }

    // Update cache
    priceCache.set(productId, {
      price,
      timestamp: now,
    });

    return price;
  } catch (error: any) {
    console.error(`Error fetching price for ${productId}:`, error);

    // Return cached price if available (even if stale)
    if (cached) {
      console.warn(`Using stale cached price for ${productId}`);
      return cached.price;
    }

    throw error;
  }
}

/**
 * Fetch prices for multiple products in parallel
 * Batches requests to avoid rate limiting while supporting all markets
 */
export async function getMidPrices(
  productIds: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // Process in batches of 10 to avoid rate limiting while allowing more markets
  const BATCH_SIZE = 10;

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);

    const pricePromises = batch.map(async (productId) => {
      try {
        const price = await getMidPrice(productId);
        return { productId, price };
      } catch (error: any) {
        console.error(`Failed to fetch price for ${productId}:`, error);
        return { productId, price: null };
      }
    });

    const results = await Promise.all(pricePromises);

    for (const { productId, price } of results) {
      if (price !== null) {
        prices[productId] = price;
      }
    }

    // Small delay between batches to avoid rate limiting (only if more batches remain)
    if (i + BATCH_SIZE < productIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return prices;
}

/**
 * Get orderbook top for a product (bid/ask/mid)
 * Uses public orderbook endpoint
 * For INTX products, falls back to spot equivalent orderbook
 */
export async function getOrderbookTop(
  productId: string
): Promise<{ bid: number; ask: number; mid: number }> {
  try {
    // For INTX, use spot equivalent orderbook (perpetual prices track spot)
    let actualProductId = productId;
    if (isIntxProduct(productId)) {
      const basePart = productId.replace("-PERP-INTX", "").replace("-INTX", "");
      actualProductId = `${basePart}-USD`;
      console.log(`[Coinbase Prices] INTX orderbook: using spot ${actualProductId} as proxy for ${productId}`);
    }

    const response = await fetch(
      `https://api.exchange.coinbase.com/products/${actualProductId}/book?level=1`,
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

    const data = await response.json();

    const bids = data.bids || [];
    const asks = data.asks || [];

    if (bids.length === 0 || asks.length === 0) {
      throw new Error(`No orderbook data for ${productId}`);
    }

    // Coinbase orderbook format: [[price, size, num_orders], ...]
    const bid = parseFloat(bids[0][0]);
    const ask = parseFloat(asks[0][0]);

    return {
      bid,
      ask,
      mid: (bid + ask) / 2,
    };
  } catch (error: any) {
    console.error(`Error fetching orderbook for ${productId}:`, error);
    throw error;
  }
}

/**
 * Get full L2 orderbook for a product
 * Uses public orderbook endpoint with level=2
 * Returns same format as Hyperliquid for consistency
 * For INTX products, falls back to spot equivalent orderbook
 */
export async function getOrderbook(
  productId: string,
  depth: number = 20
): Promise<{
  bid: number;
  ask: number;
  mid: number;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}> {
  try {
    // For INTX, use spot equivalent orderbook (perpetual prices track spot)
    let actualProductId = productId;
    if (isIntxProduct(productId)) {
      const basePart = productId.replace("-PERP-INTX", "").replace("-INTX", "");
      actualProductId = `${basePart}-USD`;
      console.log(`[Coinbase Prices] INTX L2 orderbook: using spot ${actualProductId} as proxy for ${productId}`);
    }

    // Coinbase level=2 returns up to 50 levels
    const response = await fetch(
      `https://api.exchange.coinbase.com/products/${actualProductId}/book?level=2`,
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

    const data = await response.json();

    const rawBids = data.bids || [];
    const rawAsks = data.asks || [];

    if (rawBids.length === 0 || rawAsks.length === 0) {
      throw new Error(`No orderbook data for ${productId}`);
    }

    // Coinbase orderbook format: [[price, size, num_orders], ...]
    // Convert to our standard format and limit to requested depth
    const bids = rawBids.slice(0, depth).map((level: string[]) => ({
      price: parseFloat(level[0]),
      size: parseFloat(level[1]),
    }));

    const asks = rawAsks.slice(0, depth).map((level: string[]) => ({
      price: parseFloat(level[0]),
      size: parseFloat(level[1]),
    }));

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;

    return {
      bid: bestBid,
      ask: bestAsk,
      mid: (bestBid + bestAsk) / 2,
      bids,
      asks,
    };
  } catch (error: any) {
    console.error(`Error fetching orderbook for ${productId}:`, error);
    throw error;
  }
}
