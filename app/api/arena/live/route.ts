import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get("sortBy") || "pnl"; // "pnl" or "return"

    const serviceClient = createServiceRoleClient();

    // First, get all active live arena entries with session started_at (limit for performance)
    const { data: arenaEntries, error: entriesError } = await serviceClient
      .from("arena_entries")
      .select(`
        id,
        display_name,
        opted_in_at,
        session_id,
        strategy_sessions!inner(
          started_at
        )
      `)
      .eq("mode", "live")
      .eq("active", true)
      .limit(1000); // Limit to top 1000 entries for performance

    if (entriesError) {
      console.error("Failed to fetch arena entries:", entriesError);
      return NextResponse.json({ error: "Failed to fetch arena entries" }, { status: 500 });
    }

    if (!arenaEntries || arenaEntries.length === 0) {
      return NextResponse.json({ leaderboard: [], sortBy });
    }

    // Get latest snapshot for each entry
    const entryIds = arenaEntries.map(e => e.id);
    const { data: leaderboard, error } = await serviceClient
      .from("arena_snapshots")
      .select(`
        id,
        total_pnl,
        return_pct,
        trades_count,
        win_rate,
        max_drawdown_pct,
        captured_at,
        arena_entry_id,
        arena_entries!inner(
          id,
          display_name,
          mode,
          opted_in_at
        )
      `)
      .in("arena_entry_id", entryIds)
      .eq("arena_entries.mode", "live")
      .eq("arena_entries.active", true)
      .order("captured_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch live arena leaderboard:", error);
      return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }

    // Group by arena_entry_id and get latest snapshot for each
    const entryMap = new Map();
    for (const row of leaderboard || []) {
      const entryId = row.arena_entry_id;
      if (!entryMap.has(entryId) || new Date(row.captured_at) > new Date(entryMap.get(entryId).captured_at)) {
        entryMap.set(entryId, row);
      }
    }

    // Build entry lookup map
    const entryLookup = new Map();
    for (const entry of arenaEntries) {
      entryLookup.set(entry.id, entry);
    }

    // Convert to array and sort
    const sorted = Array.from(entryMap.values())
      .map((row) => {
        const entry = entryLookup.get(row.arena_entry_id);
        const session = entry?.strategy_sessions;
        const startedAt = session?.started_at || entry?.opted_in_at;
        
        // Calculate days since trade started
        let daysSinceStarted = 0;
        if (startedAt) {
          const startDate = new Date(startedAt);
          const now = new Date();
          const diffTime = now.getTime() - startDate.getTime();
          daysSinceStarted = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }
        
        return {
          ...row,
          daysSinceStarted,
        };
      })
      .sort((a, b) => {
        if (sortBy === "return") {
          const returnA = Number(a.return_pct || 0);
          const returnB = Number(b.return_pct || 0);
          return returnB - returnA;
        } else {
          // Sort by total_pnl
          const pnlA = Number(a.total_pnl || 0);
          const pnlB = Number(b.total_pnl || 0);
          return pnlB - pnlA;
        }
      })
      .slice(0, 100) // Top 100
      .map((row, index) => ({
        rank: index + 1,
        displayName: row.arena_entries.display_name,
        totalPnl: Number(row.total_pnl || 0),
        returnPct: row.return_pct ? Number(row.return_pct) : null,
        tradesCount: row.trades_count || 0,
        winRate: row.win_rate ? Number(row.win_rate) : null,
        maxDrawdownPct: row.max_drawdown_pct ? Number(row.max_drawdown_pct) : null,
        optedInAt: row.arena_entries.opted_in_at,
        daysSinceStarted: row.daysSinceStarted,
      }));

    return NextResponse.json({ leaderboard: sorted, sortBy });
  } catch (error: any) {
    console.error("Live arena leaderboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
