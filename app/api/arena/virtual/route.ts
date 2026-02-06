import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showEnded = searchParams.get("showEnded") === "true";
    
    const serviceClient = createServiceRoleClient();

    // Build query for arena entries
    // Note: We fetch profiles separately since there may not be a direct FK relationship
    let query = serviceClient
      .from("arena_entries")
      .select(`
        id,
        user_id,
        display_name,
        opted_in_at,
        session_id,
        arena_status,
        active,
        strategy_sessions!inner(
          started_at,
          status
        )
      `)
      .eq("mode", "arena");

    // By default show active + stopped; when showEnded is true also include "left"
    if (!showEnded) {
      query = query.in("arena_status", ["active", "ended"]);
    }

    const { data: arenaEntries, error: entriesError } = await query.limit(1000);

    if (entriesError) {
      console.error("Failed to fetch arena entries:", entriesError);
      return NextResponse.json({ error: "Failed to fetch arena entries", details: entriesError.message }, { status: 500 });
    }

    if (!arenaEntries || arenaEntries.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    // Fetch profiles separately for avatar URLs
    const userIds = [...new Set(arenaEntries.map((e: any) => e.user_id).filter(Boolean))];
    const userToProfile = new Map<string, { avatar_url: string | null; username: string | null }>();
    
    if (userIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id, avatar_url, username")
        .in("id", userIds);
      
      if (profiles) {
        for (const p of profiles) {
          userToProfile.set(p.id, { avatar_url: p.avatar_url, username: p.username });
        }
      }
    }

    // Get entry IDs for snapshot lookup
    const entryIds = arenaEntries.map((e: any) => e.id);
    
    // Get latest snapshot for each entry
    const { data: snapshots, error: snapshotsError } = await serviceClient
      .from("arena_snapshots")
      .select(`
        id,
        equity,
        trades_count,
        win_rate,
        max_drawdown_pct,
        captured_at,
        arena_entry_id
      `)
      .in("arena_entry_id", entryIds)
      .order("captured_at", { ascending: false });

    if (snapshotsError) {
      console.error("Failed to fetch arena snapshots:", snapshotsError);
    }

    // Group snapshots by entry_id (take latest)
    const entryToSnapshot = new Map<string, any>();
    if (snapshots) {
      for (const snap of snapshots) {
        if (!entryToSnapshot.has(snap.arena_entry_id)) {
          entryToSnapshot.set(snap.arena_entry_id, snap);
        }
      }
    }

    // Fetch current account equity for each session
    const sessionIds = arenaEntries.map((e: any) => e.session_id).filter(Boolean);
    const sessionToEquity = new Map<string, number>();
    
    if (sessionIds.length > 0) {
      // Get equity from equity_points (most accurate)
      const { data: equityPoints } = await serviceClient
        .from("equity_points")
        .select("session_id, equity, t")
        .in("session_id", sessionIds)
        .order("t", { ascending: false });

      if (equityPoints) {
        const seen = new Set<string>();
        for (const ep of equityPoints) {
          if (!seen.has(ep.session_id)) {
            seen.add(ep.session_id);
            sessionToEquity.set(ep.session_id, Number(ep.equity));
          }
        }
      }

      // Fallback to virtual_accounts for sessions without equity_points
      const { data: sessionsWithAccounts } = await serviceClient
        .from("strategy_sessions")
        .select("id, virtual_accounts(equity)")
        .in("id", sessionIds);

      if (sessionsWithAccounts) {
        for (const session of sessionsWithAccounts as any[]) {
          if (!sessionToEquity.has(session.id)) {
            const accounts = session.virtual_accounts;
            const account = Array.isArray(accounts) ? accounts[0] : accounts;
            if (account?.equity != null) {
              sessionToEquity.set(session.id, Number(account.equity));
            }
          }
        }
      }
    }

    // Build leaderboard
    const leaderboard = arenaEntries
      .map((entry: any) => {
        const snapshot = entryToSnapshot.get(entry.id);
        const session = entry.strategy_sessions;
        const profile = userToProfile.get(entry.user_id);
        const startedAt = session?.started_at || entry.opted_in_at;
        
        // Calculate days since started
        let daysSinceStarted = 0;
        if (startedAt) {
          const startDate = new Date(startedAt);
          const now = new Date();
          const startMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          daysSinceStarted = Math.max(0, Math.floor((nowMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24)));
        }
        
        // Get current equity
        let currentEquity = 100000;
        if (entry.session_id && sessionToEquity.has(entry.session_id)) {
          currentEquity = sessionToEquity.get(entry.session_id)!;
        } else if (snapshot?.equity) {
          currentEquity = Number(snapshot.equity);
        }
        
        const pnl = currentEquity - 100000;
        
        return {
          entryId: entry.id,
          userId: entry.user_id,
          displayName: entry.display_name || profile?.username || 'Anonymous',
          avatarUrl: profile?.avatar_url || null,
          equity: currentEquity,
          startingEquity: 100000,
          pnl,
          pnlPct: (pnl / 100000) * 100,
          tradesCount: snapshot?.trades_count || 0,
          winRate: snapshot?.win_rate ? Number(snapshot.win_rate) : null,
          maxDrawdownPct: snapshot?.max_drawdown_pct ? Number(snapshot.max_drawdown_pct) : null,
          optedInAt: entry.opted_in_at,
          daysSinceStarted,
          arenaStatus: (entry.arena_status === 'active' && session?.status === 'stopped') ? 'ended' : (entry.arena_status || 'active'),
          sessionStatus: session?.status,
          active: entry.active,
        };
      })
      .sort((a, b) => b.equity - a.equity)
      .slice(0, 100)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));

    return NextResponse.json({ leaderboard });
  } catch (error: any) {
    console.error("Virtual arena leaderboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
