import { NextRequest, NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import { getMidPrices as getHLPrices } from "@/lib/hyperliquid/prices";
import { getMidPrices as getCBPrices } from "@/lib/coinbase/prices";
import { decryptCredential } from "@/lib/crypto/credentials";
import { placeMarketOrder } from "@/lib/trading/placeMarketOrder";
import type { Venue } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Price Guard — Fast TP/SL check between AI ticks
 *
 * Runs every minute via Vercel cron. Checks all open positions against their
 * strategy's exit rules (TP/SL, trailing stop, time, signal guardrails) and
 * executes exits immediately if triggered.
 *
 * Zero AI cost — only fetches prices (free public APIs) and does math.
 * This fixes the SL overshoot problem caused by 15-minute tick cadences
 * where volatile tokens blow past the stop loss between checks.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_KEY;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

  if (!cronSecret) {
    console.error(`[PriceGuard] No INTERNAL_API_KEY or CRON_SECRET configured`);
    return NextResponse.json({ error: "Cron endpoint not configured" }, { status: 503 });
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log(`[PriceGuard] Starting at ${new Date().toISOString()}`);

  try {
    const supabase = createFreshServiceClient();

    // Load all running sessions with their strategy filters
    const { data: sessions, error: sessionsError } = await supabase
      .from("strategy_sessions")
      .select(`
        id,
        user_id,
        mode,
        status,
        venue,
        strategy_id,
        strategies!inner(
          id,
          filters
        )
      `)
      .eq("status", "running");

    if (sessionsError) {
      console.error(`[PriceGuard] Error fetching sessions:`, sessionsError.message);
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ message: "No running sessions", checked: 0, triggered: 0 });
    }

    // For each session, load positions and collect markets
    type SessionWithPositions = {
      session: typeof sessions[0];
      filters: any;
      exitRules: any;
      tradeControl: any;
      positions: any[];
      accountId: string;
      positionsTable: string;
      tradesTable: string;
    };

    const sessionsToCheck: SessionWithPositions[] = [];

    for (const session of sessions) {
      const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
      const filters = (strategy as any)?.filters || {};
      const exitRules = filters.entryExit?.exit || {};
      const tradeControl = filters.entryExit?.tradeControl || {};

      // Skip sessions with pure signal mode (no automated exits to check)
      if (exitRules.mode === "signal" && !exitRules.maxLossProtectionPct && !exitRules.maxProfitCapPct) {
        continue;
      }

      // Determine account ID and table names based on mode
      const isLive = session.mode === "live";
      const positionsTable = isLive ? "live_positions" : "virtual_positions";
      const tradesTable = isLive ? "live_trades" : "virtual_trades";

      // Get account ID
      let accountId: string | null = null;
      if (isLive) {
        const { data: account } = await supabase
          .from("live_accounts")
          .select("id")
          .eq("user_id", session.user_id)
          .eq("venue", session.venue || "hyperliquid")
          .limit(1)
          .maybeSingle();
        accountId = account?.id || null;
      } else {
        const { data: account } = await supabase
          .from("virtual_accounts")
          .select("id")
          .eq("session_id", session.id)
          .limit(1)
          .maybeSingle();
        accountId = account?.id || null;
      }

      if (!accountId) continue;

      // Load positions
      const { data: positions } = await supabase
        .from(positionsTable)
        .select("*")
        .eq("account_id", accountId);

      if (!positions || positions.length === 0) continue;

      sessionsToCheck.push({
        session,
        filters,
        exitRules,
        tradeControl,
        positions,
        accountId,
        positionsTable,
        tradesTable,
      });
    }

    if (sessionsToCheck.length === 0) {
      console.log(`[PriceGuard] No sessions with open positions to check`);
      return NextResponse.json({ message: "No positions to check", checked: 0, triggered: 0 });
    }

    // Collect all unique markets and batch-fetch prices
    const allMarkets = new Set<string>();
    for (const s of sessionsToCheck) {
      for (const p of s.positions) {
        allMarkets.add(p.market);
      }
    }

    const hlMarkets = [...allMarkets].filter(m => !m.includes("-INTX"));
    const cbMarkets = [...allMarkets].filter(m => m.includes("-INTX"));

    let allPrices: Record<string, number> = {};

    if (hlMarkets.length > 0) {
      try {
        const hlPrices = await getHLPrices(hlMarkets);
        allPrices = { ...allPrices, ...hlPrices };
      } catch (err: any) {
        console.error(`[PriceGuard] Failed to fetch HL prices:`, err.message);
      }
    }

    if (cbMarkets.length > 0) {
      try {
        const cbPrices = await getCBPrices(cbMarkets);
        allPrices = { ...allPrices, ...cbPrices };
      } catch (err: any) {
        console.error(`[PriceGuard] Failed to fetch CB prices:`, err.message);
      }
    }

    console.log(`[PriceGuard] ${sessionsToCheck.length} sessions, ${allMarkets.size} markets, ${Object.keys(allPrices).length} prices fetched`);

    // Process each session
    let totalChecked = 0;
    let totalTriggered = 0;
    const errors: string[] = [];

    for (const ctx of sessionsToCheck) {
      const { session, exitRules, tradeControl, positions, accountId, positionsTable, tradesTable } = ctx;
      const sessionMode = (session.mode || "virtual") as "virtual" | "live" | "arena";
      const venue = (session.venue || "hyperliquid") as Venue;
      const minHoldMinutes = tradeControl.minHoldMinutes ?? 5;

      // Acquire guard lock to prevent overlapping checks
      const { data: lockAcquired, error: lockError } = await supabase.rpc("acquire_guard_lock", {
        p_session_id: session.id,
        p_min_interval_ms: 50000, // 50s minimum between checks
      });

      if (lockError) {
        console.error(`[PriceGuard] Lock RPC error for session ${session.id}:`, lockError.message);
        errors.push(`${session.id}: lock error`);
        continue;
      }

      if (!lockAcquired) {
        continue; // Another guard invocation is already checking this session
      }

      // Credentials (loaded lazily, only if an exit is needed)
      let credentialsLoaded = false;
      let livePrivateKey: string | undefined;
      let liveApiKey: string | undefined;
      let liveApiSecret: string | undefined;

      const now = new Date();

      for (const position of positions) {
        const currentPrice = allPrices[position.market];
        if (!currentPrice) continue;

        totalChecked++;

        const entryPrice = Number(position.avg_entry);
        const size = Number(position.size);
        if (entryPrice <= 0 || size <= 0) continue;

        // Calculate unrealized PnL %
        let unrealizedPnl = 0;
        if (position.side === "long") {
          unrealizedPnl = (currentPrice - entryPrice) * size;
        } else {
          unrealizedPnl = (entryPrice - currentPrice) * size;
        }
        const unrealizedPnlPct = (unrealizedPnl / (entryPrice * size)) * 100;

        // Get position age for min hold time check
        const { data: openTrade } = await supabase
          .from(tradesTable)
          .select("created_at")
          .eq("account_id", accountId)
          .eq("market", position.market)
          .eq("action", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const positionAgeMinutes = openTrade
          ? (now.getTime() - new Date(openTrade.created_at).getTime()) / (60 * 1000)
          : Infinity;

        let shouldExit = false;
        let exitReason = "";
        let isEmergencyExit = false;
        let isTimeBasedExit = false;

        // --- EXIT RULE EVALUATION (mirrors tick route logic) ---

        if (exitRules.mode === "signal") {
          // Signal mode: only check guardrails
          if (exitRules.maxLossProtectionPct && unrealizedPnlPct <= -Math.abs(exitRules.maxLossProtectionPct)) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Max loss protection: ${unrealizedPnlPct.toFixed(2)}% <= -${exitRules.maxLossProtectionPct}%`;
          } else if (exitRules.maxProfitCapPct && unrealizedPnlPct >= exitRules.maxProfitCapPct) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Max profit cap: ${unrealizedPnlPct.toFixed(2)}% >= ${exitRules.maxProfitCapPct}%`;
          }
        } else if (exitRules.mode === "tp_sl") {
          if (exitRules.takeProfitPct && unrealizedPnlPct >= exitRules.takeProfitPct) {
            shouldExit = true;
            exitReason = `Take profit: ${unrealizedPnlPct.toFixed(2)}% >= ${exitRules.takeProfitPct}%`;
          } else if (exitRules.stopLossPct && unrealizedPnlPct <= -Math.abs(exitRules.stopLossPct)) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitRules.stopLossPct}%`;
          }
        } else if (exitRules.mode === "trailing" && exitRules.trailingStopPct) {
          let peakPrice = position.peak_price ? Number(position.peak_price) : entryPrice;

          // Update peak inline
          let peakUpdated = false;
          if (position.side === "long" && currentPrice > peakPrice) {
            peakPrice = currentPrice;
            peakUpdated = true;
          } else if (position.side === "short" && currentPrice < peakPrice) {
            peakPrice = currentPrice;
            peakUpdated = true;
          }

          if (peakUpdated) {
            await supabase
              .from(positionsTable)
              .update({ peak_price: peakPrice })
              .eq("id", position.id);
          }

          const dropFromPeakPct = position.side === "long"
            ? ((peakPrice - currentPrice) / peakPrice) * 100
            : ((currentPrice - peakPrice) / peakPrice) * 100;

          if (dropFromPeakPct >= exitRules.trailingStopPct) {
            shouldExit = true;
            isEmergencyExit = true;
            const extremeLabel = position.side === "long" ? "peak" : "trough";
            exitReason = `Trailing stop: ${dropFromPeakPct.toFixed(2)}% from ${extremeLabel} $${peakPrice.toFixed(2)} >= ${exitRules.trailingStopPct}%`;
          }

          if (!shouldExit && exitRules.initialStopLossPct && unrealizedPnlPct <= -Math.abs(exitRules.initialStopLossPct)) {
            shouldExit = true;
            isEmergencyExit = true;
            exitReason = `Initial stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitRules.initialStopLossPct}%`;
          }
        } else if (exitRules.mode === "time" && exitRules.maxHoldMinutes && positionAgeMinutes >= exitRules.maxHoldMinutes) {
          shouldExit = true;
          isTimeBasedExit = true;
          exitReason = `Max hold time: ${positionAgeMinutes.toFixed(1)} min >= ${exitRules.maxHoldMinutes} min`;
        }

        // Min hold time check (TP respects it, SL/emergency bypasses it)
        if (shouldExit && !isEmergencyExit && !isTimeBasedExit) {
          const minHoldMs = minHoldMinutes * 60 * 1000;
          const positionAgeMs = positionAgeMinutes * 60 * 1000;
          if (positionAgeMs < minHoldMs) {
            console.log(`[PriceGuard] Min hold blocks exit: ${position.market} ${position.side}, age: ${positionAgeMinutes.toFixed(1)} min < ${minHoldMinutes} min`);
            shouldExit = false;
          }
        }

        if (!shouldExit) continue;

        // --- EXIT TRIGGERED — load credentials and execute ---
        console.log(`[PriceGuard] EXIT TRIGGERED: ${position.market} ${position.side} @ $${currentPrice} | ${exitReason}`);
        totalTriggered++;

        // Lazy-load credentials for live sessions
        if (sessionMode === "live" && !credentialsLoaded) {
          try {
            const { data: conn } = await supabase
              .from("exchange_connections")
              .select("wallet_address, key_material_encrypted, api_key, api_secret_encrypted")
              .eq("user_id", session.user_id)
              .eq("venue", venue)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!conn) {
              console.error(`[PriceGuard] No exchange_connection found for session ${session.id} (user: ${session.user_id}, venue: ${venue})`);
              errors.push(`${session.id}: no exchange connection`);
              break; // Skip all positions for this session
            }

            if (venue === "coinbase") {
              liveApiKey = conn.api_key || undefined;
              liveApiSecret = conn.api_secret_encrypted ? decryptCredential(conn.api_secret_encrypted) : undefined;
            } else {
              livePrivateKey = conn.key_material_encrypted ? decryptCredential(conn.key_material_encrypted) : undefined;
            }
            credentialsLoaded = true;
          } catch (err: any) {
            console.error(`[PriceGuard] Failed to load credentials for session ${session.id}:`, err.message);
            errors.push(`${session.id}: credential error`);
            break; // Skip all positions for this session
          }
        }

        // Re-verify position still exists (defense against tick having already closed it)
        const { data: freshPos } = await supabase
          .from(positionsTable)
          .select("id, size")
          .eq("id", position.id)
          .maybeSingle();

        if (!freshPos || Number(freshPos.size) <= 0) {
          console.log(`[PriceGuard] Position already closed: ${position.market} — skipping`);
          continue;
        }

        const exitSide = position.side === "long" ? "sell" : "buy";
        const exitNotional = currentPrice * size;

        try {
          const exitResult = await placeMarketOrder({
            sessionMode,
            venue,
            livePrivateKey,
            liveApiKey,
            liveApiSecret,
            account_id: accountId,
            strategy_id: session.strategy_id,
            session_id: session.id,
            market: position.market,
            side: exitSide as "buy" | "sell",
            notionalUsd: exitNotional,
            slippageBps: 50,
            feeBps: 5,
            isExit: true,
            exitPosition: { side: position.side as "long" | "short", avgEntry: entryPrice },
            exitPositionSize: size,
            leverage: position.leverage || 1,
          });

          if (exitResult.success) {
            console.log(`[PriceGuard] EXIT EXECUTED: ${position.market} | fill @ $${exitResult.trade?.fill_price || "?"} | reason: ${exitReason}`);
          } else {
            console.error(`[PriceGuard] EXIT FAILED: ${position.market} | ${exitResult.error}`);
            errors.push(`${position.market}: ${exitResult.error}`);
          }
        } catch (err: any) {
          console.error(`[PriceGuard] EXIT ERROR: ${position.market}:`, err.message);
          errors.push(`${position.market}: ${err.message}`);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[PriceGuard] Complete: ${totalTriggered}/${totalChecked} exits triggered, ${errors.length} errors, ${duration}ms`);

    return NextResponse.json({
      checked: totalChecked,
      triggered: totalTriggered,
      errors: errors.length,
      errorDetails: errors.length > 0 ? errors : undefined,
      durationMs: duration,
    });
  } catch (error: any) {
    console.error(`[PriceGuard] Fatal error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
