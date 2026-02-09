import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/subscriptions/cancel
 * Cancel the user's subscription at period end
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createFreshServiceClient();

    // Get user's subscription
    const { data: subscription, error: fetchError } = await serviceClient
      .from("user_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !subscription) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 }
      );
    }

    if (subscription.status !== "active") {
      return NextResponse.json(
        { error: "Subscription is not active" },
        { status: 400 }
      );
    }

    if (!subscription.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No Stripe subscription ID found" },
        { status: 400 }
      );
    }

    // Cancel subscription at period end (user keeps access until end of billing period)
    const stripeSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    // Update our database
    const { error: updateError } = await serviceClient
      .from("user_subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[POST /api/subscriptions/cancel] Error updating database:", updateError);
    }

    return NextResponse.json({
      success: true,
      message: "Subscription will be canceled at the end of the billing period",
      cancel_at: stripeSubscription.cancel_at
        ? new Date(stripeSubscription.cancel_at * 1000).toISOString()
        : null,
    });
  } catch (error: any) {
    console.error("[POST /api/subscriptions/cancel] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
