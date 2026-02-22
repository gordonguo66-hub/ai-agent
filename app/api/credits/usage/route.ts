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

    // Use atomic RPC function to check balance and deduct in a single transaction
    // This prevents race conditions where concurrent ticks could both pass the balance check
    const { data: result, error: rpcError } = await serviceClient.rpc('decrement_user_balance', {
      p_user_id: user.id,
      p_amount_cents: deductAmount,
      p_description: description || "AI model usage",
      p_metadata: metadata || {},
    });

    if (rpcError) {
      // Atomic RPC function is required for production - do NOT fall back to unsafe legacy code
      if (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist')) {
        console.error("[POST /api/credits/usage] CRITICAL: decrement_user_balance RPC function does not exist. Run the required migration before deploying to production.");
      }
      console.error("[POST /api/credits/usage] Error calling decrement_user_balance:", rpcError);
      return NextResponse.json(
        { error: "Failed to process balance deduction" },
        { status: 500 }
      );
    }

    // Handle result from atomic operation
    if (result && typeof result === 'object') {
      if (result.error === 'insufficient_balance') {
        return NextResponse.json(
          {
            error: "Insufficient balance",
            message: "Please add funds to continue.",
            current_balance_cents: result.current_balance_cents,
            current_balance_usd: ((result.current_balance_cents || 0) / 100).toFixed(2),
            required_cents: deductAmount,
            required_usd: (deductAmount / 100).toFixed(2),
            current_balance: result.current_balance_cents,
            required: deductAmount,
          },
          { status: 402 }
        );
      }

      if (result.error === 'no_balance') {
        return NextResponse.json(
          { error: "No balance record found. Please add funds first." },
          { status: 402 }
        );
      }

      if (result.success) {
        const newBalanceCents = result.new_balance_cents;
        return NextResponse.json({
          success: true,
          amount_deducted_cents: deductAmount,
          amount_deducted_usd: (deductAmount / 100).toFixed(4),
          new_balance_cents: newBalanceCents,
          new_balance_usd: (newBalanceCents / 100).toFixed(2),
          credits_used: deductAmount,
          new_balance: newBalanceCents,
        });
      }
    }

    console.error("[POST /api/credits/usage] Unexpected result from decrement_user_balance:", result);
    return NextResponse.json(
      { error: "Unexpected error processing balance deduction" },
      { status: 500 }
    );
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
 * Get balance transaction history with server-side aggregates
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 5000);
    const offset = parseInt(searchParams.get("offset") || "0");
    // Optional: filter to exclude certain transaction types (e.g. "exclude=usage,subscription_usage")
    const excludeTypes = searchParams.get("exclude")?.split(",").filter(Boolean) || [];

    const serviceClient = createFreshServiceClient();

    // Build the paginated transaction query
    let txQuery = serviceClient
      .from("balance_transactions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Apply type exclusion filter if provided
    if (excludeTypes.length > 0) {
      for (const t of excludeTypes) {
        txQuery = txQuery.neq("transaction_type", t);
      }
    }

    txQuery = txQuery.range(offset, offset + limit - 1);

    // Run paginated transaction query and aggregate query in parallel
    const [txResult, balanceResult, tokenResult] = await Promise.all([
      // 1. Paginated transactions for the table
      txQuery,

      // 2. lifetime_spent_cents from user_balance (accurate source of truth)
      serviceClient
        .from("user_balance")
        .select("lifetime_spent_cents")
        .eq("user_id", user.id)
        .single(),

      // 3. All usage records — only metadata column for token aggregation
      // Use .range() to override Supabase's default 1000-row limit
      serviceClient
        .from("balance_transactions")
        .select("metadata")
        .eq("user_id", user.id)
        .in("transaction_type", ["usage", "subscription_usage"])
        .range(0, 49999),
    ]);

    if (txResult.error) {
      console.error("[GET /api/credits/usage] Error fetching transactions:", txResult.error);
      return NextResponse.json(
        { error: "Failed to fetch transaction history" },
        { status: 500 }
      );
    }

    // Compute total tokens server-side from all usage records
    let totalTokens = 0;
    if (tokenResult.data) {
      for (const row of tokenResult.data) {
        const meta = row.metadata as any;
        if (meta) {
          totalTokens += meta.total_tokens ||
            ((meta.input_tokens || 0) + (meta.output_tokens || 0));
        }
      }
    }

    // lifetime_spent_cents is the accurate total across ALL transactions
    const lifetimeSpentCents = balanceResult.data?.lifetime_spent_cents || 0;

    // Transform transactions to include USD values
    const transactions = (txResult.data || []).map(tx => ({
      ...tx,
      amount_usd: (tx.amount / 100).toFixed(4),
      balance_after_usd: (tx.balance_after / 100).toFixed(2),
    }));

    return NextResponse.json({
      transactions,
      total: txResult.count || 0,
      limit,
      offset,
      aggregates: {
        total_consumption_cents: lifetimeSpentCents,
        total_tokens: totalTokens,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/credits/usage] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
