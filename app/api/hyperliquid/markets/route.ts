import { NextRequest, NextResponse } from "next/server";
import { getHyperliquidMarkets } from "@/lib/hyperliquid/markets";

// In-memory cache with TTL
interface CacheEntry {
  data: any[];
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    // Check cache
    const now = Date.now();
    if (cache && now - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { markets: cache.data },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    // Fetch fresh data
    const markets = await getHyperliquidMarkets();

    // Update cache
    cache = {
      data: markets,
      timestamp: now,
    };

    return NextResponse.json(
      { markets },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching Hyperliquid markets:", error);
    
    // Return cached data if available, even if stale
    if (cache) {
      return NextResponse.json(
        { markets: cache.data, cached: true, error: "Using cached data due to API error" },
        { status: 200 }
      );
    }

    // No cache available - return error
    return NextResponse.json(
      { error: "Failed to fetch markets from Hyperliquid", message: error.message },
      { status: 500 }
    );
  }
}
