import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import Stripe from "stripe";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Stripe webhook signature verification requires raw body
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("[Stripe Webhook] No signature found");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Handle completed checkout session (balance top-ups)
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { user_id, package_id, amount_cents, type } = session.metadata || {};

  // Handle both new (topup) and legacy (credit_purchase) types
  if (type !== "topup" && type !== "credit_purchase") {
    console.log("[Stripe Webhook] Not a balance top-up, skipping");
    return;
  }

  if (!user_id || !amount_cents) {
    console.error("[Stripe Webhook] Missing user_id or amount_cents in metadata");
    return;
  }

  const amountCents = parseInt(amount_cents, 10);
  if (isNaN(amountCents) || amountCents <= 0) {
    console.error("[Stripe Webhook] Invalid amount_cents:", amount_cents);
    return;
  }

  console.log(`[Stripe Webhook] Processing balance top-up: $${(amountCents / 100).toFixed(2)} for user ${user_id}`);

  const serviceClient = createFreshServiceClient();

  // Get current balance (try new table first, fallback to legacy)
  let currentBalance = 0;
  const { data: currentBalanceData, error: fetchError } = await serviceClient
    .from("user_balance")
    .select("balance_cents")
    .eq("user_id", user_id)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // Table might not exist yet, try legacy table
    const { data: legacyData, error: legacyError } = await serviceClient
      .from("user_credits")
      .select("credits_balance")
      .eq("user_id", user_id)
      .single();

    if (legacyError && legacyError.code !== "PGRST116") {
      console.error("[Stripe Webhook] Error fetching current balance:", legacyError);
      throw legacyError;
    }
    currentBalance = legacyData?.credits_balance || 0;
  } else {
    currentBalance = currentBalanceData?.balance_cents || 0;
  }

  const newBalance = currentBalance + amountCents;

  // Update balance (try new table first, fallback to legacy)
  const { error: updateError } = await serviceClient
    .from("user_balance")
    .upsert({
      user_id,
      balance_cents: newBalance,
    }, { onConflict: "user_id" });

  if (updateError) {
    // Fallback to legacy table
    const { error: legacyUpdateError } = await serviceClient
      .from("user_credits")
      .upsert({
        user_id,
        credits_balance: newBalance,
      }, { onConflict: "user_id" });

    if (legacyUpdateError) {
      console.error("[Stripe Webhook] Error updating balance:", legacyUpdateError);
      throw legacyUpdateError;
    }
  }

  // Log transaction (try new table first, fallback to legacy)
  const transactionData = {
    user_id,
    amount: amountCents,           // Column name is 'amount', not 'amount_cents'
    balance_after: newBalance,     // Column name is 'balance_after', not 'balance_after_cents'
    transaction_type: "topup",
    description: `Added $${(amountCents / 100).toFixed(2)} to balance`,
    metadata: {
      stripe_session_id: session.id,
      package_id,
      amount_paid_cents: session.amount_total,
    },
  };

  const { error: txError } = await serviceClient.from("balance_transactions").insert(transactionData);

  if (txError) {
    // Fallback to legacy table
    console.error("[Stripe Webhook] Error logging to balance_transactions:", txError);
    await serviceClient.from("credit_transactions").insert({
      user_id,
      amount: amountCents,
      balance_after: newBalance,
      transaction_type: "topup",
      description: `Added $${(amountCents / 100).toFixed(2)} to balance`,
      metadata: transactionData.metadata,
    });
  }

  console.log(`[Stripe Webhook] Successfully added $${(amountCents / 100).toFixed(2)} to user ${user_id}. New balance: $${(newBalance / 100).toFixed(2)}`);
}

/**
 * Handle paid invoice (subscription renewals)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log(`[Stripe Webhook] Invoice paid: ${invoice.id}`);

  // Only process subscription invoices
  if (!(invoice as any).subscription) {
    console.log("[Stripe Webhook] Not a subscription invoice, skipping");
    return;
  }

  // Log renewal for tracking
  if (invoice.billing_reason === "subscription_cycle") {
    const customerId = invoice.customer as string;
    const userId = await getUserIdFromCustomer(customerId);
    console.log(`[Stripe Webhook] Subscription renewal processed for user ${userId}`);
  }
}

/**
 * Map Stripe price ID to internal plan ID
 */
function getPlanIdFromSubscription(subscription: Stripe.Subscription): string | null {
  // First, check subscription metadata (set during checkout)
  const metadataPlanId = subscription.metadata?.plan_id;
  if (metadataPlanId && ["pro", "pro_plus", "ultra"].includes(metadataPlanId)) {
    return metadataPlanId;
  }

  // Fallback: check price ID against environment variables
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;

  const priceMap: Record<string, string> = {};
  if (process.env.STRIPE_PRICE_PRO) priceMap[process.env.STRIPE_PRICE_PRO] = "pro";
  if (process.env.STRIPE_PRICE_PRO_PLUS) priceMap[process.env.STRIPE_PRICE_PRO_PLUS] = "pro_plus";
  if (process.env.STRIPE_PRICE_ULTRA) priceMap[process.env.STRIPE_PRICE_ULTRA] = "ultra";

  return priceMap[priceId] || null;
}

/**
 * Get user_id from Stripe customer
 */
async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const serviceClient = createFreshServiceClient();

  // First, try to find user by stripe_customer_id
  const { data: subData } = await serviceClient
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (subData?.user_id) {
    return subData.user_id;
  }

  // Fallback: check Stripe customer metadata
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer && !customer.deleted && customer.metadata?.user_id) {
      return customer.metadata.user_id;
    }
  } catch (err) {
    console.error("[Stripe Webhook] Error retrieving customer:", err);
  }

  return null;
}

/**
 * Map Stripe subscription status to internal status
 */
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "inactive";
  }
}

/**
 * Handle subscription updates (created, updated)
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  console.log(`[Stripe Webhook] Subscription update: ${subscriptionId}, status: ${status}`);

  // Get user_id from metadata or customer lookup
  let userId: string | null | undefined = subscription.metadata?.user_id;
  if (!userId) {
    userId = await getUserIdFromCustomer(customerId);
  }

  if (!userId) {
    console.error(`[Stripe Webhook] Cannot find user for customer: ${customerId}`);
    return;
  }

  // Get plan_id from subscription
  const planId = getPlanIdFromSubscription(subscription);
  if (!planId) {
    console.warn(`[Stripe Webhook] Unknown plan for subscription: ${subscriptionId}`);
  }

  const serviceClient = createFreshServiceClient();

  // Map Stripe status to our status
  const mappedStatus = mapStripeStatus(status);

  // Get period dates (use type assertion for Stripe API properties)
  const sub = subscription as any;
  const currentPeriodStart = sub.current_period_start
    ? new Date(sub.current_period_start * 1000).toISOString()
    : null;
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  // Upsert user subscription
  const { error } = await serviceClient
    .from("user_subscriptions")
    .upsert({
      user_id: userId,
      plan_id: planId,
      status: mappedStatus,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: sub.cancel_at_period_end || false,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
    }, { onConflict: "user_id" });

  if (error) {
    console.error("[Stripe Webhook] Error updating subscription:", error);
    throw error;
  }

  console.log(`[Stripe Webhook] Updated subscription for user ${userId}: plan=${planId}, status=${mappedStatus}`);
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;
  const customerId = subscription.customer as string;

  console.log(`[Stripe Webhook] Subscription canceled: ${subscriptionId}`);

  // Get user_id
  let userId: string | null | undefined = subscription.metadata?.user_id;
  if (!userId) {
    userId = await getUserIdFromCustomer(customerId);
  }

  if (!userId) {
    console.error(`[Stripe Webhook] Cannot find user for canceled subscription: ${subscriptionId}`);
    return;
  }

  const serviceClient = createFreshServiceClient();

  // Mark subscription as canceled
  const { error } = await serviceClient
    .from("user_subscriptions")
    .update({
      status: "canceled",
      plan_id: null,
      cancel_at_period_end: false,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[Stripe Webhook] Error canceling subscription:", error);
    throw error;
  }

  console.log(`[Stripe Webhook] Marked subscription as canceled for user ${userId}`);
}
