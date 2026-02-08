import { NextRequest, NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";
import { getUserFromRequest } from "@/lib/api/serverAuth";

// Disable Next.js caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/credits/usage
 * Deduct from balance for AI usage (called internally from tick engine)
 *
 * Accepts either:
 * - credits_amount (legacy, in cents where 1 credit = 1 cent)
 * - amount_cents (new, explicit cents)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    // Support both legacy "credits_amount" and new "amount_cents"
    const amountCents = body.amount_cents ?? body.credits_amount;
    const { description, metadata } = body;

    if (!amountCents || amountCents <= 0) {
      return NextResponse.json(
        { error: "amount_cents must be a positive number" },
        { status: 400 }
      );
    }

    // Round to ensure we're working with integers
    const deductAmount = Math.round(amountCents);

    const serviceClient = createFreshServiceClient();

    // Get current balance
    const { data: currentBalance, error: fetchError } = await serviceClient
      .from("user_balance")
      .select("balance_cents, lifetime_spent_cents")
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      console.error("[POST /api/credits/usage] Error fetching balance:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch current balance" },
        { status: 500 }
      );
    }

    const currentBalanceCents = currentBalance?.balance_cents || 0;
    const currentLifetimeSpent = currentBalance?.lifetime_spent_cents || 0;

    // Check if user has sufficient balance
    if (currentBalanceCents < deductAmount) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          message: "Please add funds to continue.",
          current_balance_cents: currentBalanceCents,
          current_balance_usd: (currentBalanceCents / 100).toFixed(2),
          required_cents: deductAmount,
          required_usd: (deductAmount / 100).toFixed(2),
          // Legacy field
          current_balance: currentBalanceCents,
          required: deductAmount,
        },
        { status: 402 } // Payment Required
      );
    }

    const newBalanceCents = currentBalanceCents - deductAmount;
    const newLifetimeSpent = currentLifetimeSpent + deductAmount;

    // Update balance
    const { error: updateError } = await serviceClient
      .from("user_balance")
      .update({
        balance_cents: newBalanceCents,
        lifetime_spent_cents: newLifetimeSpent,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[POST /api/credits/usage] Error updating balance:", updateError);
      return NextResponse.json(
        { error: "Failed to update balance" },
        { status: 500 }
      );
    }

    // Log the transaction
    const { error: logError } = await serviceClient
      .from("balance_transactions")
      .insert({
        user_id: user.id,
        amount: -deductAmount,
        balance_after: newBalanceCents,
        transaction_type: "usage",
        description: description || "AI model usage",
        metadata: metadata || {},
      });

    if (logError) {
      console.error("[POST /api/credits/usage] Error logging transaction:", logError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      // New fields
      amount_deducted_cents: deductAmount,
      amount_deducted_usd: (deductAmount / 100).toFixed(4),
      new_balance_cents: newBalanceCents,
      new_balance_usd: (newBalanceCents / 100).toFixed(2),
      // Legacy fields for backwards compatibility
      credits_used: deductAmount,
      new_balance: newBalanceCents,
    });
  } catch (error: any) {
    console.error("[POST /api/credits/usage] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/credits/usage
 * Get balance transaction history
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const serviceClient = createFreshServiceClient();

    const { data, error, count } = await serviceClient
      .from("balance_transactions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[GET /api/credits/usage] Error fetching transactions:", error);
      return NextResponse.json(
        { error: "Failed to fetch transaction history" },
        { status: 500 }
      );
    }

    // Transform transactions to include USD values
    const transactions = (data || []).map(tx => ({
      ...tx,
      amount_usd: (tx.amount / 100).toFixed(4),
      balance_after_usd: (tx.balance_after / 100).toFixed(2),
    }));

    return NextResponse.json({
      transactions,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[GET /api/credits/usage] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
