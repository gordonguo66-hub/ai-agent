import { NextRequest, NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import { getUserFromRequest } from "@/lib/api/serverAuth";

// Disable Next.js caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/credits
 * Get current user's balance and subscription info
 * Note: This endpoint maintains backwards compatibility with "credits" naming
 * but internally uses USD-based billing (balance_cents)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use fresh client to avoid Supabase caching issues
    const serviceClient = createFreshServiceClient();

    // Get user balance — try with subscription budget columns, fall back without them
    let balance: any = null;
    let balanceError: any = null;

    const fullResult = await serviceClient
      .from("user_balance")
      .select("balance_cents, subscription_budget_cents, subscription_budget_granted_cents, lifetime_spent_cents, updated_at")
      .eq("user_id", user.id)
      .single();

    if (fullResult.error && fullResult.error.code === "42703") {
      // Column doesn't exist yet — query only the base columns
      const fallback = await serviceClient
        .from("user_balance")
        .select("balance_cents, lifetime_spent_cents, updated_at")
        .eq("user_id", user.id)
        .single();
      balance = fallback.data ? { ...fallback.data, subscription_budget_cents: 0, subscription_budget_granted_cents: 0 } : null;
      balanceError = fallback.error;
    } else {
      balance = fullResult.data;
      balanceError = fullResult.error;
    }

    if (balanceError && balanceError.code !== "PGRST116") {
      console.error("[GET /api/credits] Error fetching balance:", balanceError);
      return NextResponse.json(
        { error: "Failed to fetch balance" },
        { status: 500 }
      );
    }

    // Get user subscription
    const { data: subscription, error: subError } = await serviceClient
      .from("user_subscriptions")
      .select(`
        plan_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        subscription_plans (
          name,
          price_cents,
          features
        )
      `)
      .eq("user_id", user.id)
      .single();

    if (subError && subError.code !== "PGRST116") {
      console.error("[GET /api/credits] Error fetching subscription:", subError);
      return NextResponse.json(
        { error: "Failed to fetch subscription" },
        { status: 500 }
      );
    }

    // Initialize balance if user is new
    let actualBalance = balance;
    if (!balance) {
      const { error: initBalanceError } = await serviceClient
        .from("user_balance")
        .upsert({
          user_id: user.id,
          balance_cents: 0,
          lifetime_spent_cents: 0,
        }, { onConflict: "user_id" });

      if (initBalanceError) {
        console.error("[GET /api/credits] Error initializing balance:", initBalanceError);
      }
      actualBalance = { balance_cents: 0, subscription_budget_cents: 0, subscription_budget_granted_cents: 0, lifetime_spent_cents: 0, updated_at: null };
    }

    const planData = subscription?.subscription_plans as any;
    const planId = subscription?.plan_id;

    return NextResponse.json({
      credits: {
        // Legacy field for backwards compatibility (1 credit = 1 cent)
        balance: actualBalance?.balance_cents || 0,
        // USD-based fields
        balance_cents: actualBalance?.balance_cents || 0,
        balance_usd: ((actualBalance?.balance_cents || 0) / 100).toFixed(2),
        // Subscription budget fields
        subscription_budget_cents: actualBalance?.subscription_budget_cents || 0,
        subscription_budget_usd: ((actualBalance?.subscription_budget_cents || 0) / 100).toFixed(2),
        subscription_budget_granted_cents: actualBalance?.subscription_budget_granted_cents || 0,
        // Legacy field
        lifetime_used: actualBalance?.lifetime_spent_cents || 0,
        // New field
        lifetime_spent_cents: actualBalance?.lifetime_spent_cents || 0,
        updated_at: actualBalance?.updated_at,
      },
      subscription: {
        plan_id: planId || null,
        plan_name: planData?.name || "No Plan",
        status: subscription?.status || "inactive",
        current_period_start: subscription?.current_period_start,
        current_period_end: subscription?.current_period_end,
        cancel_at_period_end: subscription?.cancel_at_period_end,
        price_cents: planData?.price_cents || 0,
        features: planData?.features || [],
      },
    });
  } catch (error: any) {
    console.error("[GET /api/credits] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
