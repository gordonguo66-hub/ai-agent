import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { requireValidOrigin } from "@/lib/api/csrfProtection";
import { FREE_TIER_LIMITS, isFreeTier } from "@/lib/tier/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const strategyId = params.id;
    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    return NextResponse.json({ strategy: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const csrfCheck = requireValidOrigin(request);
    if (csrfCheck) return csrfCheck;

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const strategyId = params.id;
    const body = await request.json();
    const { name, model_provider, model_name, prompt, filters } = body;

    const serviceClient = createServiceRoleClient();

    // Verify strategy exists and belongs to user
    const { data: existingStrategy, error: fetchError } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingStrategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Check free tier restrictions
    const { data: userSub } = await serviceClient
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .single();

    const tier = (userSub?.status === "active" && userSub?.plan_id) ? userSub.plan_id : "on_demand";

    if (isFreeTier(tier)) {
      const effectiveProvider = model_provider ?? existingStrategy.model_provider;
      const effectiveFilters = filters ?? existingStrategy.filters ?? {};
      const effectiveMarkets = effectiveFilters.markets || [];
      const effectiveCadence = effectiveFilters.cadenceSeconds;

      if (!FREE_TIER_LIMITS.allowedProviders.includes(effectiveProvider)) {
        return NextResponse.json({
          error: "Free tier only supports DeepSeek models",
          message: "Add funds or subscribe to unlock all AI providers.",
        }, { status: 403 });
      }
      if (effectiveMarkets.length > FREE_TIER_LIMITS.maxMarketsPerStrategy) {
        return NextResponse.json({
          error: "Free tier allows 1 market per strategy",
          message: "Add funds or subscribe to unlock multi-market strategies.",
        }, { status: 403 });
      }
      if (effectiveCadence && effectiveCadence < FREE_TIER_LIMITS.minCadenceSeconds) {
        return NextResponse.json({
          error: "Free tier minimum cadence is 10 minutes",
          message: "Add funds or subscribe to unlock faster cadences.",
        }, { status: 403 });
      }
    }

    // Build update object
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = String(name);
    }

    if (model_provider !== undefined) {
      updateData.model_provider = String(model_provider);
    }

    if (model_name !== undefined) {
      updateData.model_name = String(model_name);
    }

    if (prompt !== undefined) {
      updateData.prompt = String(prompt);
    }

    if (filters !== undefined) {
      // Validate cadence (minimum 60 seconds due to cron frequency)
      if (filters?.cadenceSeconds && filters.cadenceSeconds < 60) {
        return NextResponse.json(
          { error: "Minimum AI cadence is 60 seconds (1 minute). The system checks for decisions every minute." },
          { status: 400 }
        );
      }
      updateData.filters = filters;
    }

    // Always use platform keys (no user API keys)
    updateData.use_platform_key = true;

    // Update strategy
    console.log(`[Strategy PATCH] 🔄 Updating strategy ${strategyId} with:`, updateData);

    const { data, error } = await serviceClient
      .from("strategies")
      .update(updateData)
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !data) {
      console.error(`[Strategy PATCH] ❌ Failed to update strategy ${strategyId}:`, error);
      return NextResponse.json(
        { error: error?.message || "Failed to update strategy" },
        { status: 500 }
      );
    }

    console.log(`[Strategy PATCH] ✅ Strategy ${strategyId} updated in database!`);
    console.log(`[Strategy PATCH] 💡 Running sessions will pick up these changes on their next tick!`);

    return NextResponse.json({ strategy: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const csrfCheck = requireValidOrigin(request);
    if (csrfCheck) return csrfCheck;

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const strategyId = params.id;
    const serviceClient = createServiceRoleClient();

    // Verify strategy exists and belongs to user
    const { data: existingStrategy, error: fetchError } = await serviceClient
      .from("strategies")
      .select("id")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingStrategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Delete strategy (cascade will delete associated sessions)
    const { error: deleteError } = await serviceClient
      .from("strategies")
      .delete()
      .eq("id", strategyId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error(`[Strategy DELETE] Failed to delete strategy ${strategyId}:`, deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete strategy" },
        { status: 500 }
      );
    }

    console.log(`[Strategy DELETE] ✅ Strategy ${strategyId} deleted`);
    return NextResponse.json({ success: true, message: "Strategy deleted successfully" });
  } catch (error: any) {
    console.error("[Strategy DELETE] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
