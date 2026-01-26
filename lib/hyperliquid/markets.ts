/**
 * Fetch and normalize Hyperliquid tradable markets
 */

export interface MarketInfo {
  symbol: string;
  display: string;
  type: "PERP" | "SPOT";
}

const MAJOR_MARKETS = ["BTC", "ETH", "SOL"];

/**
 * Fetch all tradable markets from Hyperliquid
 * Returns normalized market list with PERP markets preferred
 */
export async function getHyperliquidMarkets(): Promise<MarketInfo[]> {
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "meta",
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API error: ${response.status}`);
    }

    const data = await response.json();
    const universe = data.universe || [];

    // Normalize markets: prefer PERP, filter out delisted
    const markets: MarketInfo[] = [];
    const seen = new Set<string>();

    for (const asset of universe) {
      // Skip delisted markets
      if (asset.isDelisted) {
        continue;
      }

      const baseName = asset.name;
      // Hyperliquid uses base names like "BTC", "ETH" - we append "-PERP" for consistency
      const symbol = `${baseName}-PERP`;
      const display = `${baseName}-PERP`;

      if (!seen.has(symbol)) {
        markets.push({
          symbol,
          display,
          type: "PERP",
        });
        seen.add(symbol);
      }
    }

    // Sort: majors first, then alphabetical
    markets.sort((a, b) => {
      const aBase = a.symbol.split("-")[0];
      const bBase = b.symbol.split("-")[0];
      const aIsMajor = MAJOR_MARKETS.includes(aBase);
      const bIsMajor = MAJOR_MARKETS.includes(bBase);

      if (aIsMajor && !bIsMajor) return -1;
      if (!aIsMajor && bIsMajor) return 1;
      if (aIsMajor && bIsMajor) {
        // Sort majors by their order in MAJOR_MARKETS
        return MAJOR_MARKETS.indexOf(aBase) - MAJOR_MARKETS.indexOf(bBase);
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return markets;
  } catch (error: any) {
    console.error("Failed to fetch Hyperliquid markets:", error);
    throw error;
  }
}
