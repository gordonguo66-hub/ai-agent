import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getMidPrices as getHLPrices } from "@/lib/hyperliquid/prices";
import { getMidPrices as getCBPrices } from "@/lib/coinbase/prices";

/**
 * Lightweight cron job to update peak_price for all positions
 * Runs independently of strategy ticks to capture intraday price extremes
 *
 * - For longs: tracks highest price reached (peak)
 * - For shorts: tracks lowest price reached (trough)
 *
 * This ensures trailing stops trigger at the correct price level,
 * even if price spikes and drops between tick intervals.
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called with proper auth
  const cronSecret = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

  if (!cronSecret) {
    console.error(`[Peak Update] ❌ REJECTED: No INTERNAL_API_KEY or CRON_SECRET configured`);
    return NextResponse.json({ error: "Cron endpoint not configured" }, { status: 503 });
  }

  const expectedAuth = `Bearer ${cronSecret}`;
  if (!authHeader || authHeader !== expectedAuth) {
    console.error(`[Peak Update] ❌ Unauthorized`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Peak Update] ✅ Starting peak update at ${new Date().toISOString()}`);

  try {
    const supabase = createServiceRoleClient();

    // Collect all positions from both virtual and live tables
    // (sim_positions is legacy and rarely used)
    const positionTables = ["virtual_positions", "live_positions"] as const;
    const allPositions: Array<{
      id: string;
      market: string;
      side: string;
      peak_price: number | null;
      table: string;
    }> = [];

    for (const table of positionTables) {
      const { data, error } = await supabase
        .from(table)
        .select("id, market, side, peak_price");

      if (error) {
        console.error(`[Peak Update] Error fetching ${table}:`, error.message);
        continue;
      }

      if (data && data.length > 0) {
        allPositions.push(...data.map(p => ({ ...p, table })));
      }
    }

    if (allPositions.length === 0) {
      console.log(`[Peak Update] No active positions found`);
      return NextResponse.json({ updated: 0, checked: 0 });
    }

    console.log(`[Peak Update] Found ${allPositions.length} positions to check`);

    // Group markets by venue to batch price fetches
    const hlMarkets = [...new Set(
      allPositions
        .filter(p => !p.market.includes("-INTX"))
        .map(p => p.market)
    )];
    const cbMarkets = [...new Set(
      allPositions
        .filter(p => p.market.includes("-INTX"))
        .map(p => p.market)
    )];

    // Fetch prices in batch (much more efficient than per-position)
    let allPrices: Record<string, number> = {};

    if (hlMarkets.length > 0) {
      try {
        const hlPrices = await getHLPrices(hlMarkets);
        allPrices = { ...allPrices, ...hlPrices };
        console.log(`[Peak Update] Fetched ${Object.keys(hlPrices).length} Hyperliquid prices`);
      } catch (error: any) {
        console.error(`[Peak Update] Failed to fetch HL prices:`, error.message);
      }
    }

    if (cbMarkets.length > 0) {
      try {
        const cbPrices = await getCBPrices(cbMarkets);
        allPrices = { ...allPrices, ...cbPrices };
        console.log(`[Peak Update] Fetched ${Object.keys(cbPrices).length} Coinbase prices`);
      } catch (error: any) {
        console.error(`[Peak Update] Failed to fetch CB prices:`, error.message);
      }
    }

    // Update peaks where current price exceeds stored peak
    let updated = 0;
    for (const pos of allPositions) {
      const currentPrice = allPrices[pos.market];
      if (!currentPrice) {
        continue; // Skip if we couldn't fetch price
      }

      const storedPeak = Number(pos.peak_price || 0);
      let newPeak = storedPeak;

      // For longs: peak is highest price (want to track upward movement)
      // For shorts: peak is lowest price (want to track downward movement)
      if (pos.side === "long" && currentPrice > storedPeak) {
        newPeak = currentPrice;
      } else if (pos.side === "short" && (storedPeak === 0 || currentPrice < storedPeak)) {
        newPeak = currentPrice;
      }

      if (newPeak !== storedPeak && newPeak > 0) {
        const { error } = await supabase
          .from(pos.table)
          .update({ peak_price: newPeak })
          .eq("id", pos.id);

        if (error) {
          console.error(`[Peak Update] Failed to update ${pos.market}:`, error.message);
        } else {
          console.log(`[Peak Update] ${pos.market} (${pos.side}): $${storedPeak.toFixed(2)} → $${newPeak.toFixed(2)}`);
          updated++;
        }
      }
    }

    console.log(`[Peak Update] ✅ Complete: ${updated} updated, ${allPositions.length} checked`);

    return NextResponse.json({
      updated,
      checked: allPositions.length,
      prices: Object.keys(allPrices).length
    });

  } catch (error: any) {
    console.error(`[Peak Update] ❌ Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
