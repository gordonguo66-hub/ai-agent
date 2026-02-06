/**
 * Live Broker - Tracks live trading activity from exchanges
 * Supports both Hyperliquid and Coinbase
 * Mirrors virtualBroker.ts but syncs from real exchange instead of simulating
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { CoinbaseClient } from "@/lib/coinbase/client";
import { decryptCredential } from "@/lib/crypto/credentials";
import { Venue } from "@/lib/engine/types";

/**
 * Get or create a live account for a user
 * Fetches user's exchange connection, decrypts credentials, and syncs with exchange
 * @param venue - The exchange venue ("hyperliquid" or "coinbase")
 */
export async function getOrCreateLiveAccount(
  userId: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  venue: Venue = "hyperliquid"
): Promise<any> {
  console.log(`[liveBroker] Getting or creating live account for user ${userId}, venue: ${venue}`);

  // 1. Fetch user's exchange connection for the specified venue
  const { data: connection, error: connError } = await supabase
    .from("exchange_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("venue", venue)
    .maybeSingle();

  if (connError) {
    console.error("[liveBroker] Error fetching exchange connection:", connError);
    throw new Error(`Failed to fetch exchange connection: ${connError.message}`);
  }

  if (!connection) {
    const venueName = venue === "hyperliquid" ? "Hyperliquid" : "Coinbase";
    throw new Error(`No ${venueName} exchange connection found. Please connect your ${venueName} account in Settings > Exchange.`);
  }

  console.log(`[liveBroker] Found ${venue} exchange connection: ${connection.id}`);

  // 2. Try to find existing live account
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

  // 3. Create new account - fetch initial equity from the exchange
  let initialEquity = 0;

  if (venue === "hyperliquid") {
    // Hyperliquid: Decrypt credentials and fetch equity
    try {
      const walletAddress = connection.wallet_address;
      decryptCredential(connection.key_material_encrypted); // Validate decryption works
      console.log(`[liveBroker] Decrypted Hyperliquid credentials for wallet ${walletAddress.substring(0, 8)}...`);

      const totalEquity = await hyperliquidClient.getTotalEquity(walletAddress);
      initialEquity = totalEquity.totalEquity;
      console.log(`[liveBroker] Fetched initial equity from Hyperliquid: $${initialEquity.toFixed(2)}`);
    } catch (err: any) {
      console.error("[liveBroker] Failed to fetch from Hyperliquid:", err.message);
      throw new Error(`Failed to fetch account data from Hyperliquid: ${err.message}`);
    }
  } else if (venue === "coinbase") {
    // Coinbase: Use API key/secret to fetch equity
    try {
      const apiKey = connection.api_key;
      const apiSecret = decryptCredential(connection.api_secret_encrypted);
      console.log(`[liveBroker] Decrypted Coinbase credentials for API key ${apiKey.substring(0, 20)}...`);

      const client = new CoinbaseClient();
      client.initialize(apiKey, apiSecret);
      initialEquity = await client.getTotalEquity();
      console.log(`[liveBroker] Fetched initial equity from Coinbase: $${initialEquity.toFixed(2)}`);
    } catch (err: any) {
      console.error("[liveBroker] Failed to fetch from Coinbase:", err.message);
      throw new Error(`Failed to fetch account data from Coinbase: ${err.message}`);
    }
  }

  const { data: newAccount, error: insertError } = await supabase
    .from("live_accounts")
    .insert({
      user_id: userId,
      exchange_connection_id: connection.id,
      starting_equity: initialEquity,
      cash_balance: initialEquity,
      equity: initialEquity,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[liveBroker] Error creating live account:", insertError);
    throw new Error(`Failed to create live account: ${insertError.message}`);
  }

  console.log(`[liveBroker] ✅ Created ${venue} live account ${newAccount.id} with starting equity $${initialEquity.toFixed(2)}`);
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

  console.log(`[liveBroker] 🔄 Syncing positions from Hyperliquid for wallet ${walletAddress}`);

  try {
    const accountState = await hyperliquidClient.getAccountState(walletAddress);
    const assetPositions = accountState.positions || [];  // Use .positions, not .assetPositions!

    console.log(`[liveBroker] 📊 Fetched ${assetPositions.length} positions from Hyperliquid`);
    if (assetPositions.length > 0) {
      console.log(`[liveBroker] Raw positions data:`, JSON.stringify(assetPositions, null, 2));
    }

    // CRITICAL FIX: Use upsert + selective delete instead of delete-all + re-insert.
    // The old approach (delete all, then insert) created a race condition window where
    // another process reading positions would see zero positions, potentially causing
    // duplicate position opens.

    // Parse current positions from Hyperliquid
    const currentPositions = assetPositions
      .filter((p: any) => {
        const size = Number(p.position?.szi || 0);
        return size !== 0; // Only track non-zero positions
      })
      .map((p: any) => {
        const coin = p.position?.coin || "UNKNOWN";
        const market = coin.includes("-") ? coin : `${coin}-PERP`; // Normalize market name
        const szi = Number(p.position?.szi || 0);
        const side = szi > 0 ? "long" : "short"; // Positive size = long, negative = short
        const size = Math.abs(szi); // Store absolute value
        const entryPx = Number(p.position?.entryPx || 0);
        const unrealizedPnl = Number(p.position?.unrealizedPnl || 0);
        // Calculate actual leverage from position value / margin used
        // Note: leverage.value from Hyperliquid is the MAX leverage setting, not actual leverage
        const notionalUsd = Math.abs(Number(p.position?.positionValue || 0));
        const marginUsed = Number(p.position?.marginUsed || 0);
        const leverage = marginUsed > 0 ? Math.round(notionalUsd / marginUsed * 10) / 10 : 1;

        console.log(`[liveBroker] 📍 Position: ${market} ${side} ${size.toFixed(4)} @ $${entryPx.toFixed(2)}, PnL: $${unrealizedPnl.toFixed(2)}, Leverage: ${leverage}x (notional: $${notionalUsd.toFixed(2)}, margin: $${marginUsed.toFixed(2)})`);

        return {
          account_id: accountId,
          market,
          side,
          size,
          avg_entry: entryPx,
          unrealized_pnl: unrealizedPnl,
          leverage,
          updated_at: new Date().toISOString(),
        };
      });

    // Upsert current positions (update existing, insert new)
    if (currentPositions.length > 0) {
      const { error: upsertError } = await supabase
        .from("live_positions")
        .upsert(currentPositions, { onConflict: "account_id,market" });

      if (upsertError) {
        console.error("[liveBroker] Error upserting positions:", upsertError);
        throw new Error(`Failed to sync positions: ${upsertError.message}`);
      }
    }

    // Delete positions that no longer exist on Hyperliquid (closed positions)
    const activeMarkets = currentPositions.map(p => p.market);
    if (activeMarkets.length > 0) {
      // Delete positions for markets NOT in the active set
      const { error: deleteError } = await supabase
        .from("live_positions")
        .delete()
        .eq("account_id", accountId)
        .not("market", "in", `(${activeMarkets.map(m => `"${m}"`).join(",")})`);

      if (deleteError) {
        console.error("[liveBroker] Error cleaning up closed positions:", deleteError);
      }
    } else {
      // No open positions on Hyperliquid - delete all local positions
      await supabase
        .from("live_positions")
        .delete()
        .eq("account_id", accountId);
    }

    console.log(`[liveBroker] ✅ Synced ${currentPositions.length} positions`);

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

  console.log(`[liveBroker] 🔄 Updating account equity from Hyperliquid for wallet ${walletAddress}`);

  try {
    // Use getTotalEquity to include both perp margin AND spot USDC balance
    // This prevents showing $0 when user has funds in spot but not perps
    const totalEquityData = await hyperliquidClient.getTotalEquity(walletAddress);

    let equity = totalEquityData.totalEquity;
    let cashBalance = totalEquityData.perpEquity; // Cash available for trading (perp margin only)

    console.log(`[liveBroker] 💰 Total equity from Hyperliquid - Perp: $${totalEquityData.perpEquity.toFixed(2)}, Spot USDC: $${totalEquityData.spotUsdcBalance.toFixed(2)}, Combined: $${equity.toFixed(2)}`);

    // Get current DB value before update for comparison
    const { data: currentAccount } = await supabase
      .from("live_accounts")
      .select("equity, cash_balance, starting_equity")
      .eq("id", accountId)
      .single();

    if (currentAccount) {
      console.log(`[liveBroker] 📝 Current DB values - Equity: $${currentAccount.equity}, Cash: $${currentAccount.cash_balance}, Starting: $${currentAccount.starting_equity}`);
      console.log(`[liveBroker] 🔄 Change: Equity ${currentAccount.equity} → ${equity}, Cash ${currentAccount.cash_balance} → ${cashBalance}`);

      // SAFEGUARD: Prevent updating to $0 if starting equity was significantly higher
      // This catches cases where Hyperliquid API returns invalid/empty data
      const prevEquity = Number(currentAccount.equity || 0);
      const startingEquity = Number(currentAccount.starting_equity || 0);

      if (equity === 0 && startingEquity > 10) {
        console.error(`[liveBroker] ⚠️ WARNING: Hyperliquid returned $0 total equity but starting equity was $${startingEquity.toFixed(2)}`);
        console.error(`[liveBroker] ⚠️ Perp: $${totalEquityData.perpEquity.toFixed(2)}, Spot USDC: $${totalEquityData.spotUsdcBalance.toFixed(2)}`);
        console.error(`[liveBroker] ⚠️ Wallet address used: ${walletAddress}`);

        // Try to get the most recent non-zero equity from equity_points as fallback
        const { data: recentPoint } = await supabase
          .from("equity_points")
          .select("equity")
          .eq("account_id", accountId)
          .gt("equity", 0)
          .order("t", { ascending: false })
          .limit(1)
          .single();

        const fallbackEquity = recentPoint?.equity || startingEquity;
        console.error(`[liveBroker] ⚠️ Using fallback equity: $${fallbackEquity} (from ${recentPoint ? 'recent equity point' : 'starting equity'})`);

        // If prevEquity was also 0 (corrupted), fix it with the fallback
        if (prevEquity === 0 && fallbackEquity > 0) {
          console.log(`[liveBroker] 🔧 FIXING corrupted equity: updating DB from $0 to $${fallbackEquity}`);
          await supabase
            .from("live_accounts")
            .update({ equity: fallbackEquity, updated_at: new Date().toISOString() })
            .eq("id", accountId);
        }

        return { equity: fallbackEquity, cashBalance: Number(currentAccount.cash_balance || fallbackEquity) };
      }
    }

    const { error: updateError } = await supabase
      .from("live_accounts")
      .update({
        equity,
        cash_balance: cashBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("[liveBroker] ❌ Error updating account:", updateError);
      throw new Error(`Failed to update account equity: ${updateError.message}`);
    }

    console.log(`[liveBroker] ✅ Updated account ${accountId} equity to $${equity.toFixed(2)}`);

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
    leverage?: number; // Leverage used for this trade (1-50x)
  }
): Promise<void> {
  const supabase = createServiceRoleClient();

  console.log(`[liveBroker] Recording live trade: ${trade.action} ${trade.size} ${trade.market} @ $${trade.price} (leverage: ${trade.leverage || 1}x)`);

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
      leverage: trade.leverage || 1,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error("[liveBroker] Error recording live trade:", error);
    throw new Error(`Failed to record trade: ${error.message}`);
  }

  console.log(`[liveBroker] ✅ Recorded live trade in database (leverage: ${trade.leverage || 1}x)`);
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

/**
 * Sync positions from Coinbase to database
 * Converts spot balances to position format for consistent display
 */
export async function syncPositionsFromCoinbase(
  accountId: string,
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  const supabase = createServiceRoleClient();

  console.log(`[liveBroker] 🔄 Syncing positions from Coinbase`);

  try {
    const client = new CoinbaseClient();
    client.initialize(apiKey, apiSecret);

    const balances = await client.getSpotBalances();

    console.log(`[liveBroker] 📊 Fetched ${balances.length} balances from Coinbase`);

    // Convert non-USD balances to position format
    const currentPositions = balances
      .filter((b) => {
        // Skip USD-based currencies (these are cash, not positions)
        if (b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT") {
          return false;
        }
        // Skip dust (less than $1 value)
        return b.usdValue >= 1;
      })
      .map((b) => {
        const market = `${b.asset}-USD`;
        const currentPrice = b.total > 0 ? b.usdValue / b.total : 0;

        console.log(
          `[liveBroker] 📍 Position: ${market} long ${b.total.toFixed(8)} @ $${currentPrice.toFixed(2)} = $${b.usdValue.toFixed(2)}`
        );

        return {
          account_id: accountId,
          market,
          side: "long", // Spot is always long
          size: b.total,
          avg_entry: currentPrice, // Use current price as proxy (Coinbase doesn't track cost basis)
          unrealized_pnl: 0, // Can't calculate without cost basis
          venue: "coinbase",
          position_type: "spot",
          updated_at: new Date().toISOString(),
        };
      });

    // Upsert current positions
    if (currentPositions.length > 0) {
      const { error: upsertError } = await supabase
        .from("live_positions")
        .upsert(currentPositions, { onConflict: "account_id,market" });

      if (upsertError) {
        console.error("[liveBroker] Error upserting Coinbase positions:", upsertError);
        throw new Error(`Failed to sync Coinbase positions: ${upsertError.message}`);
      }
    }

    // Delete positions that no longer exist (sold all)
    const activeMarkets = currentPositions.map((p) => p.market);
    if (activeMarkets.length > 0) {
      const { error: deleteError } = await supabase
        .from("live_positions")
        .delete()
        .eq("account_id", accountId)
        .not("market", "in", `(${activeMarkets.map((m) => `"${m}"`).join(",")})`);

      if (deleteError) {
        console.error("[liveBroker] Error cleaning up Coinbase positions:", deleteError);
      }
    } else {
      // No positions - delete all
      await supabase.from("live_positions").delete().eq("account_id", accountId);
    }

    console.log(`[liveBroker] ✅ Synced ${currentPositions.length} Coinbase positions`);

    // Fetch and return synced positions
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
    console.error("[liveBroker] Error syncing Coinbase positions:", err.message);
    throw err;
  }
}

/**
 * Update account equity from Coinbase
 */
export async function updateCoinbaseAccountEquity(
  accountId: string,
  apiKey: string,
  apiSecret: string
): Promise<{ equity: number; cashBalance: number }> {
  const supabase = createServiceRoleClient();

  console.log(`[liveBroker] 🔄 Updating account equity from Coinbase`);

  try {
    const client = new CoinbaseClient();
    client.initialize(apiKey, apiSecret);

    const balances = await client.getSpotBalances();

    let totalEquity = 0;
    let cashBalance = 0;

    for (const b of balances) {
      totalEquity += b.usdValue;
      if (b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT") {
        cashBalance += b.usdValue;
      }
    }

    console.log(
      `[liveBroker] 💰 Coinbase equity: $${totalEquity.toFixed(2)}, Cash: $${cashBalance.toFixed(2)}`
    );

    const { error: updateError } = await supabase
      .from("live_accounts")
      .update({
        equity: totalEquity,
        cash_balance: cashBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("[liveBroker] Error updating Coinbase account:", updateError);
      throw new Error(`Failed to update account equity: ${updateError.message}`);
    }

    console.log(`[liveBroker] ✅ Updated Coinbase account ${accountId} equity to $${totalEquity.toFixed(2)}`);

    return { equity: totalEquity, cashBalance };
  } catch (err: any) {
    console.error("[liveBroker] Error updating Coinbase equity:", err.message);
    throw err;
  }
}

/**
 * Get exchange connection with credentials for a live account
 */
export async function getExchangeConnectionForAccount(
  accountId: string
): Promise<{
  venue: Venue;
  walletAddress?: string;
  privateKey?: string;
  apiKey?: string;
  apiSecret?: string;
}> {
  const supabase = createServiceRoleClient();

  // Get live account
  const { data: account, error: accountError } = await supabase
    .from("live_accounts")
    .select("exchange_connection_id")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    throw new Error(`Live account not found: ${accountId}`);
  }

  // Get exchange connection
  const { data: connection, error: connError } = await supabase
    .from("exchange_connections")
    .select("*")
    .eq("id", account.exchange_connection_id)
    .single();

  if (connError || !connection) {
    throw new Error("Exchange connection not found");
  }

  const venue = connection.venue as Venue;

  if (venue === "hyperliquid") {
    return {
      venue,
      walletAddress: connection.wallet_address,
      privateKey: decryptCredential(connection.key_material_encrypted),
    };
  } else if (venue === "coinbase") {
    return {
      venue,
      apiKey: connection.api_key,
      apiSecret: decryptCredential(connection.api_secret_encrypted),
    };
  }

  throw new Error(`Unknown venue: ${venue}`);
}
