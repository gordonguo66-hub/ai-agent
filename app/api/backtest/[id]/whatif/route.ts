import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchHistoricalCandles, RESOLUTION_MS, FEE_BPS, SLIPPAGE_BPS } from "@/lib/backtest/engine";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backtestId = params.id;
    const supabase = createServiceRoleClient();

    // Load backtest run and verify ownership + completion
    const { data: run, error } = await supabase
      .from("backtest_runs")
      .select("*")
      .eq("id", backtestId)
      .eq("user_id", user.id)
      .single();

    if (error || !run) {
      return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Backtest must be completed to run what-if analysis" },
        { status: 400 }
      );
    }

    // Fetch entry trades (action = 'open')
    const { data: entryTrades } = await supabase
      .from("backtest_trades")
      .select("market, action, side, size, price, fee, tick_index, tick_timestamp")
      .eq("backtest_id", backtestId)
      .eq("action", "open")
      .order("tick_index", { ascending: true });

    // Fetch original close trades for comparison
    const { data: closeTrades } = await supabase
      .from("backtest_trades")
      .select("market, action, side, size, price, fee, realized_pnl, tick_index, tick_timestamp, reasoning")
      .eq("backtest_id", backtestId)
      .in("action", ["close", "flip"])
      .order("tick_index", { ascending: true });

    // Fetch candle data for each market
    const markets: string[] = run.markets || [];
    const venue = run.venue || "hyperliquid";
    const resolution = run.resolution || "1h";
    const startTime = new Date(run.start_date).getTime();
    const endTime = new Date(run.end_date).getTime();

    const candleData: Record<string, { t: number; c: number }[]> = {};

    await Promise.all(
      markets.map(async (market) => {
        try {
          const candles = await fetchHistoricalCandles(
            market,
            venue,
            startTime,
            endTime,
            resolution
          );
          // Only send timestamp + close price to minimize payload
          candleData[market] = candles.map((c) => ({ t: c.t, c: c.c }));
        } catch (err) {
          console.error(`[WhatIf] Failed to fetch candles for ${market}:`, err);
          candleData[market] = [];
        }
      })
    );

    // Coerce NUMERIC fields from strings to numbers (Supabase returns NUMERIC as strings)
    const coercedEntries = (entryTrades || []).map((t: any) => ({
      ...t,
      size: Number(t.size),
      price: Number(t.price),
      fee: Number(t.fee),
      tick_index: Number(t.tick_index),
    }));

    const coercedCloses = (closeTrades || []).map((t: any) => ({
      ...t,
      size: Number(t.size),
      price: Number(t.price),
      fee: Number(t.fee),
      realized_pnl: Number(t.realized_pnl),
      tick_index: Number(t.tick_index),
    }));

    return NextResponse.json({
      backtest: {
        id: run.id,
        starting_equity: Number(run.starting_equity),
        resolution: run.resolution,
        markets: run.markets,
        venue: run.venue,
        start_date: run.start_date,
        end_date: run.end_date,
        result_summary: run.result_summary,
      },
      entry_trades: coercedEntries,
      original_close_trades: coercedCloses,
      candles: candleData,
      constants: {
        feeBps: FEE_BPS,
        slippageBps: SLIPPAGE_BPS,
        resolutionMs: RESOLUTION_MS[resolution] || 60 * 60 * 1000,
        startDateMs: startTime,
        endDateMs: endTime,
      },
    });
  } catch (err: any) {
    console.error("[WhatIf] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
