import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/adminAuth";

/**
 * ONE-TIME REPAIR: Fix corrupted cash_balance values
 *
 * The correct formula (Option A model):
 * cash_balance = starting_equity + sum(realized_pnl) - sum(fees)
 *
 * This endpoint recalculates cash_balance for all accounts based on their trade history
 *
 * REQUIRES ADMIN AUTHENTICATION
 */
export async function POST(request: NextRequest) {
  // Verify admin authentication
  const { authorized, user, response } = await requireAdmin(request);
  if (!authorized) return response;

  console.log(`[Cash Balance Repair] Admin ${user?.id} initiated repair process`);

  const serviceClient = createServiceRoleClient();
  
  console.log("[Cash Balance Repair] Starting repair process...");
  
  // Get all virtual accounts
  const { data: accounts, error: accountsError } = await serviceClient
    .from("virtual_accounts")
    .select("id, name, starting_equity, cash_balance");
  
  if (accountsError || !accounts) {
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
  
  const results = [];
  
  for (const account of accounts) {
    try {
      // Get all trades for this account
      const { data: trades } = await serviceClient
        .from("virtual_trades")
        .select("action, realized_pnl, fee")
        .eq("account_id", account.id);
      
      if (!trades) continue;
      
      // Calculate correct cash_balance
      const realizedPnl = trades
        .filter(t => t.action === "close" || t.action === "reduce" || t.action === "flip")
        .reduce((sum, t) => sum + Number(t.realized_pnl || 0), 0);
      
      const feesPaid = trades.reduce((sum, t) => sum + Number(t.fee || 0), 0);
      
      const correctCashBalance = account.starting_equity + realizedPnl - feesPaid;
      const oldCashBalance = account.cash_balance;
      const difference = correctCashBalance - oldCashBalance;
      
      console.log(`[Repair] Account ${account.id} (${account.name}):`);
      console.log(`  Starting equity: ${account.starting_equity}`);
      console.log(`  Realized PnL: ${realizedPnl.toFixed(2)}`);
      console.log(`  Fees paid: ${feesPaid.toFixed(2)}`);
      console.log(`  OLD cash_balance: ${oldCashBalance}`);
      console.log(`  CORRECT cash_balance: ${correctCashBalance.toFixed(2)}`);
      console.log(`  Difference: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}`);
      
      if (Math.abs(difference) > 0.01) {
        // Update cash_balance
        const { error: updateError } = await serviceClient
          .from("virtual_accounts")
          .update({ cash_balance: correctCashBalance })
          .eq("id", account.id);
        
        if (updateError) {
          console.error(`[Repair] Failed to update account ${account.id}:`, updateError);
          results.push({
            account_id: account.id,
            name: account.name,
            status: "error",
            error: updateError.message,
          });
        } else {
          console.log(`[Repair] ✅ Updated account ${account.id}`);
          results.push({
            account_id: account.id,
            name: account.name,
            status: "fixed",
            old_cash: oldCashBalance,
            new_cash: correctCashBalance,
            difference: difference,
          });
        }
      } else {
        console.log(`[Repair] ✓ Account ${account.id} cash_balance is correct`);
        results.push({
          account_id: account.id,
          name: account.name,
          status: "correct",
        });
      }
    } catch (error: any) {
      console.error(`[Repair] Error processing account ${account.id}:`, error);
      results.push({
        account_id: account.id,
        status: "error",
        error: error.message,
      });
    }
  }
  
  console.log("[Cash Balance Repair] Completed!");
  
  return NextResponse.json({
    success: true,
    message: "Cash balance repair completed",
    results,
  });
}
