import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { estimateBacktestCost } from "@/lib/backtest/costEstimator";
import { toCoinbaseProductId } from "@/lib/coinbase/candles";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { strategy_id, start_date, end_date, resolution = "1h", model_name } = body;

    if (!strategy_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: strategy } = await supabase
      .from("strategies")
      .select("model_name, filters")
      .eq("id", strategy_id)
      .eq("user_id", user.id)
      .single();

    if (!strategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    const { data: userSub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .single();

    const tier =
      userSub?.status === "active" && userSub?.plan_id
        ? userSub.plan_id
        : "on_demand";

    const effectiveModel = model_name || strategy.model_name;
    const markets = strategy.filters?.markets || ["BTC-PERP"];
    const venue = strategy.filters?.venue || "hyperliquid";

    // --- Data availability probe ---
    // Quick check if candle data exists at the requested resolution
    // Coinbase granularity mapping for probe
    const COINBASE_GRANULARITY: Record<string, number> = {
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 3600, // Coinbase has no 4h, probe with 1h
      "1d": 86400,
    };

    let effectiveResolution = resolution;
    let dataWarning: string | null = null;

    if (venue !== "coinbase") {
      const probeMarket = markets[0];
      const baseSymbol = probeMarket.replace("-PERP", "").replace("-SPOT", "");
      const probeStart = startDate.getTime();
      // Probe window must fit within Coinbase's 300-candle limit
      // 5m: 300*5min = 25h, 15m: 300*15min = 75h, 1h+: 7 days is fine
      const probeWindowMs = (COINBASE_GRANULARITY[resolution] || 3600) * 250 * 1000; // ~250 candles worth
      const probeEnd = Math.min(probeStart + probeWindowMs, endDate.getTime());

      // 1. Try Hyperliquid first
      let probeCount = 0;
      try {
        const probeRes = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "candleSnapshot",
            req: { coin: baseSymbol, interval: resolution, startTime: probeStart, endTime: probeEnd },
          }),
        });
        if (probeRes.ok) {
          const probeData = await probeRes.json();
          probeCount = Array.isArray(probeData) ? probeData.length : 0;
        }
      } catch {}

      // 2. If Hyperliquid has no data, try Coinbase at the SAME resolution before downgrading
      if (probeCount === 0) {
        const cbProductId = toCoinbaseProductId(probeMarket);
        const cbGranularity = COINBASE_GRANULARITY[resolution];

        if (cbGranularity) {
          try {
            const cbProbeStart = new Date(probeStart).toISOString();
            const cbProbeEnd = new Date(probeEnd).toISOString();
            const cbRes = await fetch(
              `https://api.exchange.coinbase.com/products/${cbProductId}/candles?start=${cbProbeStart}&end=${cbProbeEnd}&granularity=${cbGranularity}`,
              { headers: { "Content-Type": "application/json" } }
            );
            if (cbRes.ok) {
              const cbData = await cbRes.json();
              if (Array.isArray(cbData) && cbData.length > 0) {
                probeCount = cbData.length;
                dataWarning = `Using Coinbase spot data for historical ${resolution} candles (Hyperliquid data not available this far back).`;
              }
            }
          } catch {}
        }
      }

      // 3. If neither source has data at this resolution, it's truly unavailable
      if (probeCount === 0) {
        return NextResponse.json({
          estimate: null,
          data_available: false,
          error: `No historical ${resolution} candle data available for ${probeMarket} in the selected date range from any data source.`,
        });
      }
    }

    const estimate = estimateBacktestCost({
      startDate,
      endDate,
      resolution: effectiveResolution,
      model: effectiveModel,
      tier,
      marketsCount: markets.length,
    });

    const { data: balance } = await supabase
      .from("user_balance")
      .select("balance_cents, subscription_budget_cents")
      .eq("user_id", user.id)
      .single();

    const available =
      (balance?.balance_cents || 0) + (balance?.subscription_budget_cents || 0);

    return NextResponse.json({
      estimate: {
        total_ticks: estimate.totalTicks,
        estimated_cost_usd: estimate.totalEstimatedUsd,
        estimated_cost_cents: estimate.totalEstimatedCents,
        cost_per_tick_cents: estimate.chargedCentsPerTick,
        tier,
        resolution: effectiveResolution,
        requested_resolution: resolution !== effectiveResolution ? resolution : undefined,
        duration_days: estimate.durationDays,
        markets_count: markets.length,
        model: effectiveModel,
      },
      data_available: true,
      data_warning: dataWarning,
      balance: {
        available_cents: available,
        sufficient: available >= estimate.totalEstimatedCents,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
