import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Map internal plan IDs to Stripe price IDs (same as checkout/route.ts)
const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS,
  ultra: process.env.STRIPE_PRICE_ULTRA,
};

const PLAN_ORDER: Record<string, number> = {
  pro: 1,
  pro_plus: 2,
  ultra: 3,
};

/**
 * POST /api/subscriptions/change
 * Change an existing subscription to a different plan.
 * Handles upgrades (immediate proration), downgrades (credit), and reactivation.
 *
 * Stripe webhooks handle the rest:
 * - subscription.updated → updates plan_id in user_subscriptions
 * - invoice.paid (upgrades) → grants new plan's budget via grant_subscription_budget RPC
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { plan_id } = body;

    if (!plan_id || !["pro", "pro_plus", "ultra"].includes(plan_id)) {
      return NextResponse.json(
        { error: "Invalid plan_id. Must be one of: pro, pro_plus, ultra" },
        { status: 400 }
      );
    }

    const newPriceId = PLAN_PRICE_MAP[plan_id];
    if (!newPriceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for plan: ${plan_id}. Please contact support.` },
        { status: 500 }
      );
    }

    const serviceClient = createFreshServiceClient();

    // Get user's current subscription
    const { data: existingSub, error: fetchError } = await serviceClient
      .from("user_subscriptions")
      .select("stripe_subscription_id, status, plan_id")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingSub) {
      return NextResponse.json(
        { error: "No subscription found. Please subscribe first." },
        { status: 404 }
      );
    }

    if (existingSub.status !== "active") {
      return NextResponse.json(
        { error: "Subscription is not active. Please subscribe first." },
        { status: 400 }
      );
    }

    if (!existingSub.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No Stripe subscription ID found. Please contact support." },
        { status: 400 }
      );
    }

    // Retrieve current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      existingSub.stripe_subscription_id
    );

    // Allow same-plan only if reactivating (cancel_at_period_end was set)
    if (existingSub.plan_id === plan_id && !stripeSubscription.cancel_at_period_end) {
      return NextResponse.json(
        { error: "You are already on this plan." },
        { status: 400 }
      );
    }

    const currentItem = stripeSubscription.items.data[0];
    if (!currentItem) {
      return NextResponse.json(
        { error: "Could not find subscription item. Please contact support." },
        { status: 500 }
      );
    }

    const currentOrder = PLAN_ORDER[existingSub.plan_id || ""] || 0;
    const newOrder = PLAN_ORDER[plan_id] || 0;
    const isUpgrade = newOrder > currentOrder;
    const isSamePlan = existingSub.plan_id === plan_id;

    console.log(`[Subscription Change] User ${user.id}: ${existingSub.plan_id} → ${plan_id} (${isSamePlan ? 'reactivate' : isUpgrade ? 'upgrade' : 'downgrade'})`);

    // Update the subscription in Stripe
    await stripe.subscriptions.update(
      existingSub.stripe_subscription_id,
      {
        items: [{
          id: currentItem.id,
          price: newPriceId,
        }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
        metadata: {
          ...stripeSubscription.metadata,
          plan_id: plan_id,
        },
      }
    );

    console.log(`[Subscription Change] Stripe subscription updated for user ${user.id}`);

    return NextResponse.json({
      success: true,
      plan_id: plan_id,
      is_upgrade: isUpgrade,
      message: isSamePlan
        ? "Subscription reactivated."
        : isUpgrade
          ? `Upgraded to ${plan_id}. Your new budget will be available shortly.`
          : `Switched to ${plan_id}. Your current budget remains until next renewal.`,
    });
  } catch (error: any) {
    console.error("[POST /api/subscriptions/change] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to change subscription" },
      { status: 500 }
    );
  }
}
