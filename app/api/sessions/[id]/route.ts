import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { syncLiveAccountData } from "@/lib/brokers/liveBroker";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const hasAuthHeader = !!authHeader;
    const requestId = Math.random().toString(36).substring(7);
    
    console.log(`[Sessions API] [${requestId}] GET /api/sessions/${params.id} - Auth header: ${hasAuthHeader ? `${authHeader?.substring(0, 20)}...` : 'MISSING'}`);
    console.log(`[Sessions API] [${requestId}] Request URL: ${request.url}`);
    console.log(`[Sessions API] [${requestId}] Referer: ${request.headers.get('referer') || 'N/A'}`);
    
    const user = await getUserFromRequest(request);
    if (!user) {
      console.error(`[Sessions API] [${requestId}] ❌ No user found - returning 401 (Auth header: ${hasAuthHeader ? 'PRESENT' : 'MISSING'})`);
      return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
    }
    
    console.log(`[Sessions API] [${requestId}] ✅ User authenticated: ${user.id.substring(0, 8)}...`);

    const sessionId = params.id;
    const serviceClient = createServiceRoleClient();

    // Load session with strategy and account
    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .select(`
        *,
        strategies(id, name, model_provider, model_name, filters),
        virtual_accounts(id, equity, starting_equity, cash_balance),
        live_accounts(id, equity, starting_equity, cash_balance)
      `)
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      console.error(`[Sessions API] [${requestId}] ❌ Session not found or error:`, sessionError);
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // For live sessions, sync positions and equity from exchange
    // This ensures fresh data on page load (no lag waiting for next tick)
    if (session.mode === "live" && session.live_account_id && session.live_accounts) {
      const venue = session.venue || "hyperliquid";
      console.log(`[Sessions API] [${requestId}] 🔄 Syncing live account data from ${venue}...`);

      if (venue === "hyperliquid") {
        const freshData = await syncLiveAccountData(session.live_account_id);
        if (freshData) {
          session.live_accounts.equity = freshData.equity;
          session.live_accounts.cash_balance = freshData.cashBalance;
          console.log(`[Sessions API] [${requestId}] ✅ Fresh data: equity=$${freshData.equity.toFixed(2)}, positions=${freshData.positions.length}`);
        } else {
          console.log(`[Sessions API] [${requestId}] ⚠️ Could not sync fresh data, using DB values`);
        }
      } else if (venue === "coinbase") {
        // For Coinbase, positions are reconstructed from trades during tick
        // Equity sync also happens during tick (requires credentials)
        console.log(`[Sessions API] [${requestId}] ℹ️ Coinbase session - data loaded from DB`);
      }
    }

    // Determine which account to use based on mode
    const accountData = session.mode === "live"
      ? session.live_accounts
      : session.virtual_accounts;

    return NextResponse.json({
      session: {
        ...session,
        strategies: session.strategies || {},
        sim_accounts: accountData || null, // For backward compatibility
        virtual_accounts: session.virtual_accounts || null,
        live_accounts: session.live_accounts || null,
        market: Array.isArray(session.markets) && session.markets.length > 0 ? session.markets[0] : "N/A",
      },
    });
  } catch (error: any) {
    console.error("Session detail error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = params.id;
    const serviceClient = createServiceRoleClient();

    // Verify session belongs to user
    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Delete session (cascade will handle related records like decisions, trades, etc.)
    const { error: deleteError } = await serviceClient
      .from("strategy_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting session:", deleteError);
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete session error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
