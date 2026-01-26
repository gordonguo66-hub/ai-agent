import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Debug endpoint to check what cadence is stored in a strategy
 * GET /api/debug-cadence?strategyId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("strategyId");

    if (!strategyId) {
      return NextResponse.json({ error: "strategyId query parameter required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();
    const { data: strategy, error } = await serviceClient
      .from("strategies")
      .select("id, name, filters")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .single();

    if (error || !strategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    const filters = strategy.filters || {};
    const cadenceSeconds = filters.cadenceSeconds;

    // Calculate what it should be based on hours/minutes/seconds if stored
    const hours = filters.cadenceHours || 0;
    const minutes = filters.cadenceMinutes || 0;
    const seconds = filters.cadenceSeconds || 0;
    const calculated = (hours * 3600) + (minutes * 60) + seconds;

    return NextResponse.json({
      strategyId: strategy.id,
      strategyName: strategy.name,
      cadence: {
        stored: cadenceSeconds,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
        calculated: calculated,
        filters: filters,
      },
      message: `Strategy "${strategy.name}" has cadence: ${cadenceSeconds}s stored in filters.cadenceSeconds`,
    });
  } catch (error: any) {
    console.error("Debug cadence error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
