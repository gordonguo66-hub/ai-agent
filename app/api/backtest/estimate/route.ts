import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { estimateBacktestCost } from "@/lib/backtest/costEstimator";

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
    const RESOLUTION_MS: Record<string, number> = {
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };
    const FALLBACK_CHAIN: Record<string, string[]> = {
      "15m": ["1h", "4h", "1d"],
      "1h": ["4h", "1d"],
      "4h": ["1d"],
      "1d": [],
    };

    let effectiveResolution = resolution;
    let dataWarning: string | null = null;

    if (venue !== "coinbase") {
      const probeMarket = markets[0];
      const baseSymbol = probeMarket.replace("-PERP", "").replace("-SPOT", "");
      const probeStart = startDate.getTime();
      const probeEnd = Math.min(probeStart + 7 * 24 * 60 * 60 * 1000, endDate.getTime());

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

      if (probeCount === 0) {
        const fallbacks = FALLBACK_CHAIN[resolution] || [];
        for (const fb of fallbacks) {
          try {
            const fbRes = await fetch("https://api.hyperliquid.xyz/info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "candleSnapshot",
                req: { coin: baseSymbol, interval: fb, startTime: probeStart, endTime: probeEnd },
              }),
            });
            if (fbRes.ok) {
              const fbData = await fbRes.json();
              if (Array.isArray(fbData) && fbData.length > 0) {
                effectiveResolution = fb;
                dataWarning = `No ${resolution} candle data available for this date range. Will automatically use ${fb} resolution instead.`;
                break;
              }
            }
          } catch {}
        }

        if (effectiveResolution === resolution && probeCount === 0) {
          return NextResponse.json({
            estimate: null,
            data_available: false,
            error: `No historical candle data available for ${probeMarket} in the selected date range. The data provider may not have data this far back. Try a more recent date range (last ~6 months for hourly data).`,
          });
        }
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
