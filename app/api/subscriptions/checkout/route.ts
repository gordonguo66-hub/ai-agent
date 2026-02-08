import { NextRequest, NextResponse } from "next/server";
import { stripe, getBaseUrl } from "@/lib/stripe/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Map internal plan IDs to Stripe price IDs
// Configure these in environment variables after creating Stripe products
const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS,
  ultra: process.env.STRIPE_PRICE_ULTRA,
};

/**
 * POST /api/subscriptions/checkout
 * Create a Stripe checkout session for subscription
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

    const stripePriceId = PLAN_PRICE_MAP[plan_id];
    if (!stripePriceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for plan: ${plan_id}. Please contact support.` },
        { status: 500 }
      );
    }

    const serviceClient = createFreshServiceClient();

    // Check if user already has an active subscription
    const { data: existingSub } = await serviceClient
      .from("user_subscriptions")
      .select("status, plan_id, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (existingSub?.status === "active") {
      return NextResponse.json(
        { error: "You already have an active subscription. Please manage it from the billing portal." },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = existingSub?.stripe_customer_id;

    if (!stripeCustomerId) {
      // Search for existing customer by email
      const existingCustomers = await stripe.customers.list({
        email: user.email!,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: user.email!,
          metadata: {
            user_id: user.id,
          },
        });
        stripeCustomerId = customer.id;
      }

      // Save customer ID to database
      await serviceClient
        .from("user_subscriptions")
        .upsert({
          user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          status: existingSub?.status || "inactive",
        }, { onConflict: "user_id" });
    }

    const baseUrl = getBaseUrl();

    // Create Stripe checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        plan_id: plan_id,
        type: "subscription",
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: plan_id,
        },
      },
      success_url: `${baseUrl}/settings/billing?success=subscription&plan=${plan_id}`,
      cancel_url: `${baseUrl}/settings/billing?canceled=true`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error: any) {
    console.error("[POST /api/subscriptions/checkout] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
