import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export const dynamic = 'force-dynamic';

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

  const serviceClient = createServiceRoleClient();

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
    amount_cents: amountCents,
    balance_after_cents: newBalance,
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
    // Fallback to legacy table with legacy column names
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
  // This would handle subscription credit grants on renewal
  // For now, just log it
  console.log(`[Stripe Webhook] Invoice paid: ${invoice.id}`);
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const status = subscription.status;
  const priceId = subscription.items.data[0]?.price?.id;

  console.log(`[Stripe Webhook] Subscription update: ${subscription.id}, status: ${status}`);

  // This would update the user's subscription status in the database
  // For now, just log it
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  console.log(`[Stripe Webhook] Subscription canceled: ${subscription.id}`);
  // This would mark the subscription as canceled in the database
}
