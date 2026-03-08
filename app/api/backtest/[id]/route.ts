import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

    const { data: run, error } = await supabase
      .from("backtest_runs")
      .select("*")
      .eq("id", backtestId)
      .eq("user_id", user.id)
      .single();

    if (error || !run) {
      return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const includeTrades = url.searchParams.get("trades") === "true";
    const includeEquity = url.searchParams.get("equity") === "true";
    const includeDecisions = url.searchParams.get("decisions") === "true";

    const result: any = { backtest: run };

    if (includeTrades) {
      const { data: trades } = await supabase
        .from("backtest_trades")
        .select("*")
        .eq("backtest_id", backtestId)
        .order("tick_index", { ascending: true });
      result.trades = trades || [];
    }

    if (includeEquity) {
      const { data: equityPoints } = await supabase
        .from("backtest_equity_points")
        .select("*")
        .eq("backtest_id", backtestId)
        .order("tick_index", { ascending: true });
      result.equity_points = equityPoints || [];
    }

    if (includeDecisions) {
      const { data: decisions } = await supabase
        .from("backtest_decisions")
        .select("*")
        .eq("backtest_id", backtestId)
        .order("tick_index", { ascending: true })
        .limit(500);
      result.decisions = decisions || [];
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
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

    const { data: run } = await supabase
      .from("backtest_runs")
      .select("id, user_id, status")
      .eq("id", backtestId)
      .eq("user_id", user.id)
      .single();

    if (!run) {
      return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
    }

    if (run.status === "running" || run.status === "pending") {
      await supabase
        .from("backtest_runs")
        .update({ status: "cancelled" })
        .eq("id", backtestId);
      return NextResponse.json({ message: "Backtest cancelled" });
    }

    await supabase.from("backtest_decisions").delete().eq("backtest_id", backtestId);
    await supabase.from("backtest_equity_points").delete().eq("backtest_id", backtestId);
    await supabase.from("backtest_trades").delete().eq("backtest_id", backtestId);
    await supabase.from("backtest_runs").delete().eq("id", backtestId);

    return NextResponse.json({ message: "Backtest deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
