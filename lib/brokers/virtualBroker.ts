/**
 * Virtual Broker - Simulates trading execution without real money
 * Handles position management, PnL calculation, and trade recording
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { roundTo } from "@/lib/utils/safeNumbers";

export interface PlaceOrderParams {
  account_id: string;
  strategy_id: string;
  session_id: string;
  market: string;
  side: "buy" | "sell";
  notionalUsd: number;
  slippageBps?: number; // Basis points (e.g., 5 = 0.05%)
  feeBps?: number; // Basis points (e.g., 5 = 0.05%)
  currentPrice?: number; // Pre-fetched price (avoids hardcoded Hyperliquid fetch for non-HL venues)
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  starting_equity: number;
  cash_balance: number;
  equity: number;
}

export interface Position {
  id: string;
  account_id: string;
  market: string;
  side: "long" | "short";
  size: number;
  avg_entry: number;
  unrealized_pnl: number;
}

const DEFAULT_SLIPPAGE_BPS = 5; // 0.05%
const DEFAULT_FEE_BPS = 5; // 0.05%

/**
 * Get account details
 */
export async function getAccount(account_id: string): Promise<Account | null> {
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("virtual_accounts")
    .select("*")
    .eq("id", account_id)
    .single();

  if (error || !data) {
    console.error("Error fetching account:", error);
    return null;
  }

  return data as Account;
}

/**
 * Get all positions for an account
 */
export async function getPositions(account_id: string): Promise<Position[]> {
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient
    .from("virtual_positions")
    .select("*")
    .eq("account_id", account_id);

  if (error) {
    console.error("Error fetching positions:", error);
    return [];
  }

  return (data || []) as Position[];
}

/**
 * Mark positions to market (update unrealized PnL and equity)
 * CASH-SETTLED PERP / MARGIN MODEL (Option A):
 * - cash_balance represents collateral
 * - Opening a position does NOT move notional in/out of cash_balance (only fees)
 * - Unrealized PnL is mark-to-market (pure price movement, no fees)
 * - Realized PnL is added to cash_balance on close/partial close
 * - Fees are subtracted from cash_balance at execution
 * - Equity = cash_balance + sum(unrealizedPnl) across all positions
 * - Total PnL = equity - starting_equity
 * This guarantees: totalPnL = realized + unrealized - fees
 */
export async function markToMarket(
  account_id: string,
  pricesByMarket: Record<string, number>
): Promise<void> {
  console.log(`[markToMarket] 🔄 Starting mark-to-market for account ${account_id}`);
  console.log(`[markToMarket] Received prices for markets:`, Object.keys(pricesByMarket));
  
  const serviceClient = createServiceRoleClient();
  const positions = await getPositions(account_id);
  const account = await getAccount(account_id);
  
  if (!account) {
    console.error(`[markToMarket] ❌ Account ${account_id} not found!`);
    return;
  }

  console.log(`[markToMarket] Account state: cash_balance=${account.cash_balance.toFixed(2)}, current_equity=${account.equity.toFixed(2)}`);
  console.log(`[markToMarket] Found ${positions.length} positions`);

  let totalUnrealizedPnl = 0;

  for (const position of positions) {
    const currentPrice = pricesByMarket[position.market];
    const oldUnrealizedPnl = Number(position.unrealized_pnl || 0);
    
    if (!currentPrice) {
      // IMPORTANT: If we don't have a fresh price for this market, we must NOT drop its PnL from equity.
      // We keep the last known unrealized_pnl so equity remains stable when marking only a subset of markets.
      console.log(`[markToMarket] 📊 Position ${position.market} (${position.side}): NO FRESH PRICE, keeping old unrealized_pnl=${oldUnrealizedPnl.toFixed(2)}`);
      totalUnrealizedPnl += oldUnrealizedPnl;
      continue;
    }

    const size = Number(position.size);
    const entryPrice = Number(position.avg_entry);
    
    // Calculate unrealized PnL: pure price movement (no fees)
    // Fees are accounted for in cash balance, not in unrealized PnL
    let unrealizedPnl = 0;
    if (position.side === "long") {
      unrealizedPnl = (currentPrice - entryPrice) * size;
    } else {
      unrealizedPnl = (entryPrice - currentPrice) * size;
    }

    console.log(`[markToMarket] 📊 Position ${position.market} (${position.side}): entry=${entryPrice.toFixed(2)}, current=${currentPrice.toFixed(2)}, size=${size.toFixed(4)}, unrealized_pnl=${unrealizedPnl.toFixed(2)}`);

    totalUnrealizedPnl += unrealizedPnl;

    // Update position with unrealized PnL
    const { error: updateError } = await serviceClient
      .from("virtual_positions")
      .update({
        unrealized_pnl: unrealizedPnl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", position.id);
    
    if (updateError) {
      console.error(`[markToMarket] ❌ Failed to update position ${position.id}:`, updateError);
    }
  }

  // Equity = cashBalance + sum(unrealizedPnl) across all positions
  const newEquity = account.cash_balance + totalUnrealizedPnl;
  const equityChange = newEquity - account.equity;

  console.log(`[markToMarket] ✅ Equity calculation: cash=${account.cash_balance.toFixed(2)} + totalUnrealizedPnl=${totalUnrealizedPnl.toFixed(2)} = equity=${newEquity.toFixed(2)}`);
  console.log(`[markToMarket] Equity change: ${equityChange >= 0 ? '+' : ''}${equityChange.toFixed(2)} (${account.equity.toFixed(2)} → ${newEquity.toFixed(2)})`);

  const { error: accountUpdateError } = await serviceClient
    .from("virtual_accounts")
    .update({ equity: newEquity })
    .eq("id", account_id);
  
  if (accountUpdateError) {
    console.error(`[markToMarket] ❌ CRITICAL: Failed to update account equity in database:`, accountUpdateError);
  } else {
    console.log(`[markToMarket] ✅ Successfully updated account ${account_id} equity to ${newEquity.toFixed(2)}`);
  }
}

/**
 * Place a market order in the virtual broker
 */
export async function placeMarketOrder(params: PlaceOrderParams): Promise<{
  success: boolean;
  trade_id?: string;
  error?: string;
  realized_pnl?: number;
}> {
  const {
    account_id,
    strategy_id,
    session_id,
    market,
    side,
    notionalUsd,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeBps = DEFAULT_FEE_BPS,
    currentPrice: presetPrice,
  } = params;

  const serviceClient = createServiceRoleClient();

  try {
    // Get account
    const account = await getAccount(account_id);
    if (!account) {
      return { success: false, error: "Account not found" };
    }

    // Use pre-fetched price if available, otherwise fall back to Hyperliquid
    let midPrice: number;
    if (presetPrice && presetPrice > 0) {
      midPrice = presetPrice;
    } else {
      const { getMidPrice } = await import("@/lib/hyperliquid/prices");
      midPrice = await getMidPrice(market);
    }

    // Calculate fill price with slippage
    const slippageMultiplier = 1 + (side === "buy" ? 1 : -1) * (slippageBps / 10000);
    const fillPrice = midPrice * slippageMultiplier;

    // Calculate size
    const size = notionalUsd / fillPrice;

    // Calculate fee for this order (use roundTo to prevent floating point accumulation)
    const fee = roundTo((notionalUsd * feeBps) / 10000, 6);

    // Get existing position for this market
    const { data: existingPosition } = await serviceClient
      .from("virtual_positions")
      .select("*")
      .eq("account_id", account_id)
      .eq("market", market)
      .maybeSingle();

    let action: "open" | "close" | "reduce" = "open";
    let realizedPnl = 0;
    let newCashBalance = account.cash_balance;
    let executedSize = size; // Track the actual executed size (not PnL-inflated)

    if (existingPosition) {
      const existingSide = existingPosition.side;
      const existingSize = parseFloat(existingPosition.size);
      const existingAvgEntry = parseFloat(existingPosition.avg_entry);
      const desiredSide = side === "buy" ? "long" : "short";

      if (existingSide === desiredSide) {
        // Same direction - add to position (weighted average entry)
        action = "open";
        const totalCost = existingAvgEntry * existingSize + fillPrice * size;
        const totalSize = existingSize + size;
        const newAvgEntry = totalCost / totalSize;

        // CRITICAL: If totalSize is effectively zero (< epsilon), delete position instead
        const EPSILON = 1e-8;
        if (Math.abs(totalSize) < EPSILON) {
          // Position effectively zero - delete it
          await serviceClient
            .from("virtual_positions")
            .delete()
            .eq("id", existingPosition.id);
          
          // ASSERTION: Position should be deleted when size becomes effectively zero
          console.log(`[virtualBroker] Position ${existingPosition.market} (${existingSide}) became effectively zero after open (${totalSize}). Position deleted.`);
        } else {
          // Update position
          await serviceClient
            .from("virtual_positions")
            .update({
              size: totalSize,
              avg_entry: newAvgEntry,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingPosition.id);
          
          // ASSERTION: Position size should be positive after open
          if (totalSize <= 0) {
            console.error(`[virtualBroker] ASSERTION FAILED: totalSize (${totalSize}) should be > 0 after open. existingSize=${existingSize}, size=${size}`);
          }
        }

        // CASH-SETTLED PERP MODEL: Opening a position does NOT move notional in/out of cash
        // Only deduct fee (fee is a cost that reduces cash/equity)
        newCashBalance -= fee;
        if (newCashBalance < 0) {
          console.warn(`[virtualBroker] Cash balance would go negative ($${newCashBalance.toFixed(2)}) after fee. Clamping to 0.`);
          newCashBalance = 0;
        }
        // Note: realizedPnl remains 0 for open actions
      } else {
        // Opposite direction - CLOSE or REDUCE only (never flip)
        // CRITICAL FIX: Clamp size to existingSize to prevent accidental flips
        // When a CLOSE trade is slightly larger than the open position, it should
        // just close the position (set size to 0), not create a new position in the opposite direction.
        let closeSize = Math.min(size, existingSize);
        
        // PRECISION FIX: If close size is within 5% of existing size OR exceeds it, use exact size
        // This prevents partial closes and tiny leftovers from rounding/slippage/fees
        const sizeDiffPct = Math.abs((closeSize - existingSize) / existingSize);
        if (sizeDiffPct < 0.05 || closeSize >= existingSize * 0.95) {  // Within 5% or close enough
          closeSize = existingSize;  // ALWAYS use exact size to ensure clean close
          console.log(`[virtualBroker] 🎯 Using exact position size ${existingSize.toFixed(6)} for clean close (calculated: ${size.toFixed(6)}, diff: ${(sizeDiffPct * 100).toFixed(2)}%)`);
        }
        
        // ASSERTION: closeSize should never exceed existingSize
        if (closeSize > existingSize) {
          console.error(`[virtualBroker] ASSERTION FAILED: closeSize (${closeSize}) > existingSize (${existingSize}). This should never happen after clamping.`);
        }
        
        if (closeSize >= existingSize) {
          // Close: fully close position (clamp to existingSize, don't flip)
          action = "close";
          executedSize = existingSize; // BUGFIX: Record actual position size closed, not PnL-inflated size
          
          // Calculate realized PnL from closing existing position (pure price movement, NO fees)
          // Fees are separate costs, not part of realized PnL
          if (existingSide === "long") {
            realizedPnl = (fillPrice - existingAvgEntry) * existingSize;
          } else {
            realizedPnl = (existingAvgEntry - fillPrice) * existingSize;
          }

          // Delete position (fully closed)
          await serviceClient
            .from("virtual_positions")
            .delete()
            .eq("id", existingPosition.id);

          // CASH-SETTLED PERP MODEL:
          // - Add realized PnL to cash (this is the profit/loss from closing)
          // - Deduct fee for closing the existing position (proportional to existingSize)
          const closingFee = roundTo((existingSize * fillPrice * feeBps) / 10000, 6);

          newCashBalance += realizedPnl; // Add realized PnL
          newCashBalance -= closingFee; // Fee for closing existing position
          if (newCashBalance < 0) {
            console.warn(`[virtualBroker] Cash balance would go negative ($${newCashBalance.toFixed(2)}) after close fee. Clamping to 0.`);
            newCashBalance = 0;
          }

          // ASSERTION: Position should be deleted, not flipped
          console.log(`[virtualBroker] Position ${existingPosition.market} (${existingSide}) fully closed. Size was ${existingSize}, close size was ${size} (clamped to ${closeSize}). Position deleted.`);
        } else {
          // Reduce: partially close position
          action = "reduce";
          executedSize = closeSize; // BUGFIX: Record actual position size reduced, not PnL-inflated size
          
          // Calculate realized PnL from partially closing position (pure price movement, NO fees)
          if (existingSide === "long") {
            realizedPnl = (fillPrice - existingAvgEntry) * closeSize;
          } else {
            realizedPnl = (existingAvgEntry - fillPrice) * closeSize;
          }

          // Update position size
          const newSize = existingSize - closeSize;
          
          // CRITICAL: If newSize is effectively zero (< epsilon), delete position instead
          const EPSILON = 1e-8;
          if (Math.abs(newSize) < EPSILON) {
            // Position effectively zero - delete it
            await serviceClient
              .from("virtual_positions")
              .delete()
              .eq("id", existingPosition.id);
            action = "close"; // Update action to reflect full close
            
            // ASSERTION: Position should be deleted when size becomes effectively zero
            console.log(`[virtualBroker] Position ${existingPosition.market} (${existingSide}) reduced to effectively zero (${newSize}). Position deleted.`);
          } else {
            // Update position with new size
            await serviceClient
              .from("virtual_positions")
              .update({
                size: newSize,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingPosition.id);
            
            // ASSERTION: Position size should be positive after reduce
            if (newSize <= 0) {
              console.error(`[virtualBroker] ASSERTION FAILED: newSize (${newSize}) should be > 0 after reduce. existingSize=${existingSize}, closeSize=${closeSize}`);
            }
          }

          // CASH-SETTLED PERP MODEL:
          // - Add realized PnL to cash (this is the profit/loss from closing)
          // - Deduct fee for closing (proportional to closeSize)
          const closingFee = roundTo((closeSize * fillPrice * feeBps) / 10000, 6);
          newCashBalance += realizedPnl; // Add realized PnL
          newCashBalance -= closingFee; // Fee for closing
          if (newCashBalance < 0) {
            console.warn(`[virtualBroker] Cash balance would go negative ($${newCashBalance.toFixed(2)}) after reduce fee. Clamping to 0.`);
            newCashBalance = 0;
          }
        }
      }
    } else {
      // No existing position - open new
      action = "open";
      
      // Create new position
      await serviceClient.from("virtual_positions").insert({
        account_id,
        market,
        side: side === "buy" ? "long" : "short",
        size,
        avg_entry: fillPrice,
        unrealized_pnl: 0,
        peak_price: fillPrice, // Initialize for trailing stop tracking
      });

      // CASH-SETTLED PERP MODEL: Opening a position does NOT move notional in/out of cash
      // Only deduct fee (fee is a cost that reduces cash/equity)
      newCashBalance -= fee;
      if (newCashBalance < 0) {
        console.warn(`[virtualBroker] Cash balance would go negative ($${newCashBalance.toFixed(2)}) after new position fee. Clamping to 0.`);
        newCashBalance = 0;
      }
      // Note: realizedPnl remains 0 for open actions
    }

    // Record trade - ensure all required fields are valid
    if (!account_id || !strategy_id || !market || !action || !side || executedSize <= 0 || fillPrice <= 0) {
      const missingFields = [];
      if (!account_id) missingFields.push("account_id");
      if (!strategy_id) missingFields.push("strategy_id");
      if (!market) missingFields.push("market");
      if (!action) missingFields.push("action");
      if (!side) missingFields.push("side");
      if (executedSize <= 0) missingFields.push("executedSize (must be > 0)");
      if (fillPrice <= 0) missingFields.push("price (must be > 0)");
      
      console.error("Invalid trade data:", { account_id, strategy_id, session_id, market, action, side, executedSize, fillPrice });
      return { 
        success: false, 
        error: `Invalid trade data: Missing or invalid fields: ${missingFields.join(", ")}` 
      };
    }

    // Fee calculation: use the single fee for all actions
    // Note: Flips are no longer possible - close actions are clamped to existing size
    const feeToRecord = fee;

    const tradeData: any = {
      account_id,
      strategy_id,
      market,
      action,
      side,
      size: Number(executedSize), // BUGFIX: Use actual executed size, not PnL-inflated notional/price
      price: Number(fillPrice),
      fee: Number(feeToRecord),
      realized_pnl: Number(realizedPnl),
    };

    // session_id is optional but should be included if provided
    if (session_id) {
      tradeData.session_id = session_id;
    }

    console.log(`[virtualBroker] 💾 Inserting trade into database:`, tradeData);
    const { data: trade, error: tradeError } = await serviceClient
      .from("virtual_trades")
      .insert(tradeData)
      .select()
      .single();

    if (tradeError || !trade) {
      console.error("[virtualBroker] ❌ Error recording trade:", tradeError);
      console.error("[virtualBroker] Trade data attempted:", tradeData);
      console.error("[virtualBroker] Full error details:", JSON.stringify(tradeError, null, 2));
      return { 
        success: false, 
        error: `Failed to record trade: ${tradeError?.message || tradeError?.code || JSON.stringify(tradeError) || "Unknown error"}` 
      };
    }

    console.log(`[virtualBroker] ✅ Trade recorded successfully. ID: ${trade.id}, Action: ${action}, Market: ${market}, Size: ${executedSize}, Price: ${fillPrice}`);

    // BUGFIX VERIFICATION: For fully closed positions, ensure close size matches position size
    // and does NOT equal abs(realized_pnl)/price (which would indicate PnL-inflated size bug)
    if (action === "close" && existingPosition) {
      const existingSize = parseFloat(existingPosition.size);
      const sizeDiff = Math.abs(executedSize - existingSize);
      const pnlDerivedSize = Math.abs(realizedPnl) / fillPrice;
      const pnlSizeDiff = Math.abs(executedSize - pnlDerivedSize);
      
      // Step size tolerance (generous for exchange rounding)
      const STEP_SIZE_TOLERANCE = 0.0001;
      
      // ASSERTION: Close size should match existing size (within tolerance)
      if (sizeDiff > STEP_SIZE_TOLERANCE) {
        console.error(`[virtualBroker] ASSERTION WARNING: Close size (${executedSize}) differs from existing size (${existingSize}) by ${sizeDiff} (tolerance: ${STEP_SIZE_TOLERANCE})`);
      }
      
      // ASSERTION: Close size should NOT equal PnL-derived size (that's the bug we're fixing)
      if (pnlSizeDiff < STEP_SIZE_TOLERANCE && Math.abs(realizedPnl) > 1) {
        console.error(`[virtualBroker] ASSERTION FAILED: Close size (${executedSize}) equals PnL-derived size (${pnlDerivedSize})! This indicates the PnL-inflation bug is still present.`);
      } else {
        console.log(`[virtualBroker] ✓ Close size verification passed: executedSize=${executedSize}, existingSize=${existingSize}, pnlDerivedSize=${pnlDerivedSize}, realized_pnl=${realizedPnl}`);
      }
    }

    // Update account cash balance
    console.log(`[virtualBroker] 💰 Updating account ${account_id} cash balance: ${account.cash_balance.toFixed(2)} → ${newCashBalance.toFixed(2)}`);
    const { error: cashUpdateError } = await serviceClient
      .from("virtual_accounts")
      .update({ cash_balance: newCashBalance })
      .eq("id", account_id);
    
    if (cashUpdateError) {
      console.error(`[virtualBroker] ❌ Failed to update cash balance:`, cashUpdateError);
    } else {
      console.log(`[virtualBroker] ✅ Cash balance updated successfully`);
    }

    // REMOVED: markToMarket and equity point recording
    // The tick endpoint already handles this correctly at the end of each tick
    // with fresh prices for ALL markets. Recording equity here with only ONE
    // market's price causes fake equity spikes due to stale prices for other positions.

    return {
      success: true,
      trade_id: trade.id,
      realized_pnl: realizedPnl,
    };
  } catch (error: any) {
    console.error("Error placing market order:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}
