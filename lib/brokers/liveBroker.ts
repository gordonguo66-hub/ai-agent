/**
 * Live Broker - Tracks live trading activity from Hyperliquid
 * Mirrors virtualBroker.ts but syncs from real exchange instead of simulating
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { decryptCredential } from "@/lib/crypto/credentials";

/**
 * Get or create a live account for a user
 * Fetches user's exchange connection, decrypts credentials, and syncs with Hyperliquid
 */
export async function getOrCreateLiveAccount(
  userId: string,
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<any> {
  console.log(`[liveBroker] Getting or creating live account for user ${userId}`);

  // 1. Fetch user's exchange connection
  const { data: connection, error: connError } = await supabase
    .from("exchange_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("venue", "hyperliquid")
    .maybeSingle();

  if (connError) {
    console.error("[liveBroker] Error fetching exchange connection:", connError);
    throw new Error(`Failed to fetch exchange connection: ${connError.message}`);
  }

  if (!connection) {
    throw new Error("No Hyperliquid exchange connection found. Please connect your exchange in Settings > Exchange.");
  }

  console.log(`[liveBroker] Found exchange connection: ${connection.id}`);

  // 2. Decrypt credentials
  let walletAddress: string;
  let privateKey: string;
  try {
    // wallet_address is already stored as plaintext
    walletAddress = connection.wallet_address;
    // key_material_encrypted contains the encrypted private key
    privateKey = decryptCredential(connection.key_material_encrypted);
    console.log(`[liveBroker] Decrypted credentials for wallet ${walletAddress.substring(0, 8)}...`);
  } catch (err: any) {
    console.error("[liveBroker] Failed to decrypt credentials:", err.message);
    throw new Error("Failed to decrypt exchange credentials. Please reconnect your exchange.");
  }

  // 3. Try to find existing live account
  const { data: existing, error: fetchError } = await supabase
    .from("live_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("exchange_connection_id", connection.id)
    .maybeSingle();

  if (fetchError) {
    console.error("[liveBroker] Error fetching live account:", fetchError);
    throw new Error(`Failed to fetch live account: ${fetchError.message}`);
  }

  if (existing) {
    console.log(`[liveBroker] Found existing live account: ${existing.id}, equity: $${existing.equity.toFixed(2)}`);
    return existing;
  }

  // 4. Create new account - fetch initial equity from Hyperliquid
  console.log(`[liveBroker] Creating new live account for user ${userId}, wallet ${walletAddress.substring(0, 8)}...`);
  
  let initialEquity = 0;
  try {
    const accountState = await hyperliquidClient.getAccountState(walletAddress);
    // Account value includes cash + unrealized PnL
    initialEquity = Number(accountState.marginSummary.accountValue || 0);
    console.log(`[liveBroker] Fetched initial equity from Hyperliquid: $${initialEquity.toFixed(2)}`);
  } catch (err: any) {
    console.error("[liveBroker] Failed to fetch initial equity from Hyperliquid:", err.message);
    throw new Error(`Failed to fetch account data from Hyperliquid: ${err.message}. Please check your exchange connection.`);
  }

  const { data: newAccount, error: insertError } = await supabase
    .from("live_accounts")
    .insert({
      user_id: userId,
      exchange_connection_id: connection.id,
      starting_equity: initialEquity,
      cash_balance: initialEquity, // Will be updated on first sync
      equity: initialEquity,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[liveBroker] Error creating live account:", insertError);
    throw new Error(`Failed to create live account: ${insertError.message}`);
  }

  console.log(`[liveBroker] ✅ Created live account ${newAccount.id} with starting equity $${initialEquity.toFixed(2)}`);
  return newAccount;
}

/**
 * Sync positions from Hyperliquid to database
 * Returns the synced positions
 */
export async function syncPositionsFromHyperliquid(
  accountId: string,
  walletAddress: string
): Promise<any[]> {
  const supabase = createServiceRoleClient();

  console.log(`[liveBroker] Syncing positions from Hyperliquid for wallet ${walletAddress}`);

  try {
    const accountState = await hyperliquidClient.getAccountState(walletAddress);
    const assetPositions = accountState.assetPositions || [];

    console.log(`[liveBroker] Fetched ${assetPositions.length} positions from Hyperliquid`);

    // Clear existing positions (we'll re-insert current ones)
    await supabase
      .from("live_positions")
      .delete()
      .eq("account_id", accountId);

    // Insert current positions
    const positionsToInsert = assetPositions
      .filter((p: any) => {
        const size = Number(p.position?.szi || 0);
        return size !== 0; // Only track non-zero positions
      })
      .map((p: any) => {
        const coin = p.position?.coin || "UNKNOWN";
        const market = coin.includes("-") ? coin : `${coin}-PERP`; // Normalize market name
        const size = Number(p.position?.szi || 0);
        const entryPx = Number(p.position?.entryPx || 0);
        const unrealizedPnl = Number(p.position?.unrealizedPnl || 0);

        return {
          account_id: accountId,
          market,
          size,
          avg_entry: entryPx,
          unrealized_pnl: unrealizedPnl,
          updated_at: new Date().toISOString(),
        };
      });

    if (positionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("live_positions")
        .insert(positionsToInsert);

      if (insertError) {
        console.error("[liveBroker] Error inserting positions:", insertError);
        throw new Error(`Failed to sync positions: ${insertError.message}`);
      }
    }

    console.log(`[liveBroker] ✅ Synced ${positionsToInsert.length} positions`);

    // Fetch and return the synced positions
    const { data: syncedPositions, error: fetchError } = await supabase
      .from("live_positions")
      .select("*")
      .eq("account_id", accountId);

    if (fetchError) {
      console.error("[liveBroker] Error fetching synced positions:", fetchError);
      return [];
    }

    return syncedPositions || [];
  } catch (err: any) {
    console.error("[liveBroker] Error syncing positions from Hyperliquid:", err.message);
    throw err;
  }
}

/**
 * Update account equity from Hyperliquid
 */
export async function updateAccountEquity(
  accountId: string,
  walletAddress: string
): Promise<{ equity: number; cashBalance: number }> {
  const supabase = createServiceRoleClient();

  console.log(`[liveBroker] Updating account equity from Hyperliquid for wallet ${walletAddress}`);

  try {
    const accountState = await hyperliquidClient.getAccountState(walletAddress);
    const equity = Number(accountState.marginSummary.accountValue || 0);
    const cashBalance = Number(accountState.crossMarginSummary?.totalRawUsd || equity);

    console.log(`[liveBroker] Fetched equity: $${equity.toFixed(2)}, cash: $${cashBalance.toFixed(2)}`);

    const { error: updateError } = await supabase
      .from("live_accounts")
      .update({
        equity,
        cash_balance: cashBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("[liveBroker] Error updating account:", updateError);
      throw new Error(`Failed to update account equity: ${updateError.message}`);
    }

    console.log(`[liveBroker] ✅ Updated account equity to $${equity.toFixed(2)}`);

    return { equity, cashBalance };
  } catch (err: any) {
    console.error("[liveBroker] Error updating account equity:", err.message);
    throw err;
  }
}

/**
 * Record a live trade in the database
 * (Called after placing an order on Hyperliquid)
 */
export async function recordLiveTrade(
  accountId: string,
  sessionId: string,
  trade: {
    market: string;
    action: "open" | "close" | "increase" | "reduce" | "flip";
    side: "buy" | "sell";
    size: number;
    price: number;
    fee: number;
    realized_pnl: number;
    venue_order_id?: string;
  }
): Promise<void> {
  const supabase = createServiceRoleClient();

  console.log(`[liveBroker] Recording live trade: ${trade.action} ${trade.size} ${trade.market} @ $${trade.price}`);

  const { error } = await supabase
    .from("live_trades")
    .insert({
      account_id: accountId,
      session_id: sessionId,
      market: trade.market,
      action: trade.action,
      side: trade.side,
      size: trade.size,
      price: trade.price,
      fee: trade.fee,
      realized_pnl: trade.realized_pnl,
      venue_order_id: trade.venue_order_id,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error("[liveBroker] Error recording live trade:", error);
    throw new Error(`Failed to record trade: ${error.message}`);
  }

  console.log(`[liveBroker] ✅ Recorded live trade in database`);
}

/**
 * Get all live positions for an account
 */
export async function getLivePositions(accountId: string): Promise<any[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("live_positions")
    .select("*")
    .eq("account_id", accountId);

  if (error) {
    console.error("[liveBroker] Error fetching live positions:", error);
    return [];
  }

  return data || [];
}

/**
 * Get all live trades for an account/session
 */
export async function getLiveTrades(
  accountId: string,
  sessionId?: string
): Promise<any[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("live_trades")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[liveBroker] Error fetching live trades:", error);
    return [];
  }

  return data || [];
}
