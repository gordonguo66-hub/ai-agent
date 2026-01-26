import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPositions, markToMarket } from "@/lib/brokers/virtualBroker";
import { getMidPrices } from "@/lib/hyperliquid/prices";

interface ArenaSnapshotData {
  equity?: number;
  total_pnl?: number;
  return_pct?: number;
  trades_count: number;
  win_rate: number | null;
  max_drawdown_pct: number | null;
}

/**
 * Updates or creates an arena snapshot for a given session.
 * This should be called after each tick (virtual) or trade execution (live).
 */
export async function updateArenaSnapshot(sessionId: string): Promise<void> {
  const serviceClient = createServiceRoleClient();

  try {
    // Load arena entry for this session
    const { data: arenaEntry, error: entryError } = await serviceClient
      .from("arena_entries")
      .select("*")
      .eq("session_id", sessionId)
      .eq("active", true)
      .maybeSingle();

    if (entryError || !arenaEntry) {
      // Session is not in arena, skip
      return;
    }

    // Load session with account and strategy
    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .select(`
        *,
        virtual_accounts(*)
      `)
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error(`[Arena] Failed to load session ${sessionId}:`, sessionError);
      return;
    }

    const account = session.virtual_accounts;
    if (!account) {
      console.error(`[Arena] No account found for session ${sessionId}`);
      return;
    }

    // Load trades for metrics
    const { data: trades, error: tradesError } = await serviceClient
      .from("virtual_trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (tradesError) {
      console.error(`[Arena] Failed to load trades for session ${sessionId}:`, tradesError);
      return;
    }

    const tradesData = trades || [];

    // Calculate metrics based on mode
    const snapshotData: ArenaSnapshotData = {
      trades_count: tradesData.length,
      win_rate: null,
      max_drawdown_pct: null,
    };

    if (arenaEntry.mode === "virtual") {
      // Virtual arena: use equity calculated correctly (cashBalance + sum(positionValue))
      if (account) {
        // First, ensure account equity is up-to-date by marking positions to market
        const positions = await getPositions(account.id);
        if (positions.length > 0) {
          const markets = positions.map((p) => p.market);
          try {
            const prices = await getMidPrices(markets);
            const pricesByMarket: Record<string, number> = {};
            for (const [market, price] of Object.entries(prices)) {
              pricesByMarket[market] = price;
            }
            // Update positions and equity in account
            await markToMarket(account.id, pricesByMarket);
            // Reload account to get updated equity
            const { data: updatedAccount } = await serviceClient
              .from("virtual_accounts")
              .select("*")
              .eq("id", account.id)
              .single();
            if (updatedAccount) {
              snapshotData.equity = Number(updatedAccount.equity);
            } else {
              snapshotData.equity = Number(account.equity || 100000);
            }
          } catch (error) {
            console.error(`[Arena] Failed to update equity for snapshot:`, error);
            // Fallback to stored equity
            snapshotData.equity = Number(account.equity || 100000);
          }
        } else {
          // No positions - equity = cash balance
          snapshotData.equity = Number(account.cash_balance || account.starting_equity || 100000);
        }
      } else {
        // No account yet - use starting equity (default $100k for virtual)
        snapshotData.equity = 100000;
      }
    } else {
      // Live arena: use PnL (realized + unrealized)
      if (account) {
        const positions = await getPositions(account.id);
        const totalUnrealizedPnl = positions.reduce(
          (sum, p) => sum + Number(p.unrealized_pnl || 0),
          0
        );
        const totalRealizedPnl = tradesData
          .filter((t) => t.action === "close" || t.action === "reduce" || t.action === "flip")
          .reduce((sum, t) => sum + Number(t.realized_pnl || 0), 0);
        
        snapshotData.total_pnl = totalRealizedPnl + totalUnrealizedPnl;
        
        // Calculate return % if we have starting equity
        if (account.starting_equity && Number(account.starting_equity) > 0 && snapshotData.total_pnl !== undefined) {
          snapshotData.return_pct = (snapshotData.total_pnl / Number(account.starting_equity)) * 100;
        }
      } else {
        // No account yet - start with 0 PnL
        snapshotData.total_pnl = 0;
        snapshotData.return_pct = 0;
      }
    }

    // Calculate win rate from closed trades
    const closedTrades = tradesData.filter(
      (t) => t.action === "close" || t.action === "reduce" || t.action === "flip"
    );
    if (closedTrades.length > 0) {
      const winningTrades = closedTrades.filter((t) => Number(t.realized_pnl || 0) > 0);
      snapshotData.win_rate = (winningTrades.length / closedTrades.length) * 100;
    }

    // Calculate max drawdown from equity points
    const { data: equityPoints, error: equityError } = await serviceClient
      .from("equity_points")
      .select("equity")
      .eq("session_id", sessionId)
      .order("t", { ascending: true });

    if (!equityError && equityPoints && equityPoints.length > 0) {
      const equityValues = equityPoints.map((ep) => Number(ep.equity));
      const startingEquity = Number(account.starting_equity);
      let maxDrawdown = 0;
      let peak = startingEquity;

      for (const equity of equityValues) {
        if (equity > peak) {
          peak = equity;
        }
        const drawdown = ((peak - equity) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }

      snapshotData.max_drawdown_pct = maxDrawdown;
    }

    // Insert new snapshot
    const { error: insertError } = await serviceClient
      .from("arena_snapshots")
      .insert({
        arena_entry_id: arenaEntry.id,
        ...snapshotData,
      });

    if (insertError) {
      console.error(`[Arena] Failed to insert snapshot for session ${sessionId}:`, insertError);
    } else {
      console.log(`[Arena] ✅ Snapshot updated for session ${sessionId} (${arenaEntry.mode} arena)`);
    }
  } catch (error: any) {
    console.error(`[Arena] Error updating snapshot for session ${sessionId}:`, error);
  }
}
