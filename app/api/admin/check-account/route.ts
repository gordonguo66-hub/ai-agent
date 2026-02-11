import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/adminAuth";

/**
 * Check account state and verify cash balance calculations
 *
 * REQUIRES ADMIN AUTHENTICATION
 */
export async function GET(request: NextRequest) {
  // Verify admin authentication
  const { authorized, user, response } = await requireAdmin(request);
  if (!authorized) return response;

  const accountId = request.nextUrl.searchParams.get("account_id");
  console.log(`[Admin Check] Admin ${user?.id} checking account ${accountId}`);
  
  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 });
  }
  
  const serviceClient = createServiceRoleClient();
  
  const { data: account } = await serviceClient
    .from("virtual_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  
  const { data: trades } = await serviceClient
    .from("virtual_trades")
    .select("action, realized_pnl, fee")
    .eq("account_id", accountId);
  
  const { data: positions } = await serviceClient
    .from("virtual_positions")
    .select("*")
    .eq("account_id", accountId);
  
  const realizedPnl = (trades || [])
    .filter(t => t.action === "close" || t.action === "reduce" || t.action === "flip")
    .reduce((sum, t) => sum + Number(t.realized_pnl || 0), 0);
  
  const feesPaid = (trades || []).reduce((sum, t) => sum + Number(t.fee || 0), 0);
  
  const expectedCash = account.starting_equity + realizedPnl - feesPaid;
  
  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      starting_equity: account.starting_equity,
      cash_balance: account.cash_balance,
      equity: account.equity,
    },
    calculated: {
      realized_pnl: realizedPnl,
      fees_paid: feesPaid,
      expected_cash: expectedCash,
      cash_matches: Math.abs(expectedCash - account.cash_balance) < 0.01,
    },
    trades_count: trades?.length || 0,
    positions_count: positions?.length || 0,
  });
}
