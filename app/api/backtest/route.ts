import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { estimateBacktestCost } from "@/lib/backtest/costEstimator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const { data: runs, error } = await supabase
      .from("backtest_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      strategy_id,
      start_date,
      end_date,
      resolution = "1h",
      model_provider,
      model_name,
    } = body;

    if (!strategy_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: "Missing required fields: strategy_id, start_date, end_date" },
        { status: 400 }
      );
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    if (endDate <= startDate) {
      return NextResponse.json(
        { error: "End date must be after start date" },
        { status: 400 }
      );
    }

    const maxDurationDays = 90;
    const durationMs = endDate.getTime() - startDate.getTime();
    if (durationMs > maxDurationDays * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: `Maximum backtest duration is ${maxDurationDays} days` },
        { status: 400 }
      );
    }

    if (!["15m", "1h", "4h"].includes(resolution)) {
      return NextResponse.json(
        { error: "Resolution must be 15m, 1h, or 4h" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const { data: strategy, error: stratError } = await supabase
      .from("strategies")
      .select("*")
      .eq("id", strategy_id)
      .eq("user_id", user.id)
      .single();

    if (stratError || !strategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Count pending + running (Railway worker picks up pending, so both count toward the limit)
    const { count: activeCount } = await supabase
      .from("backtest_runs")
      .select("id", { count: "exact" })
      .eq("user_id", user.id)
      .in("status", ["pending", "running"]);

    if ((activeCount || 0) >= 3) {
      return NextResponse.json(
        { error: "Maximum 3 concurrent backtests. Wait for existing ones to finish." },
        { status: 429 }
      );
    }

    const effectiveProvider = model_provider || strategy.model_provider;
    const effectiveModel = model_name || strategy.model_name;
    const markets = strategy.filters?.markets || ["BTC-PERP"];
    const venue = strategy.filters?.venue || "hyperliquid";

    const { data: userSub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .single();

    const tier =
      userSub?.status === "active" && userSub?.plan_id
        ? userSub.plan_id
        : "on_demand";

    const estimate = estimateBacktestCost({
      startDate,
      endDate,
      resolution,
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
    if (available < estimate.totalEstimatedCents) {
      return NextResponse.json(
        {
          error: `Insufficient balance. Estimated cost: $${estimate.totalEstimatedUsd.toFixed(2)}, available: $${(available / 100).toFixed(2)}`,
          estimated_cost_cents: estimate.totalEstimatedCents,
          available_cents: available,
        },
        { status: 402 }
      );
    }

    // Insert as "pending" — the Railway backtest worker polls for pending rows and runs them
    const { data: run, error: insertError } = await supabase
      .from("backtest_runs")
      .insert({
        user_id: user.id,
        strategy_id: strategy.id,
        status: "pending",
        markets,
        venue,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        resolution,
        model_provider: effectiveProvider,
        model_name: effectiveModel,
        starting_equity: 100000,
        total_ticks: estimate.totalTicks,
        estimated_cost_cents: estimate.totalEstimatedCents,
        actual_cost_cents: 0,
      })
      .select()
      .single();

    if (insertError || !run) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create backtest" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      backtest: run,
      estimate: {
        total_ticks: estimate.totalTicks,
        estimated_cost_usd: estimate.totalEstimatedUsd,
        estimated_cost_cents: estimate.totalEstimatedCents,
        tier,
        resolution,
        duration_days: estimate.durationDays,
      },
    });
  } catch (err: any) {
    console.error("[Backtest API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
