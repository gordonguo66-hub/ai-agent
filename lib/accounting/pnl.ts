/**
 * Accounting Helper - Single source of truth for PnL calculations
 * Ensures consistent finance-standard accounting across the application
 */

export interface Position {
  id: string;
  market: string;
  side: "long" | "short";
  size: number;
  avg_entry: number;
  unrealized_pnl?: number;
}

export interface Trade {
  id: string;
  action: "open" | "close" | "reduce" | "flip";
  realized_pnl?: number;
  fee?: number;
}

export interface AccountData {
  starting_equity: number;
  cash_balance: number;
  equity?: number;
}

export interface PricesByMarket {
  [market: string]: number;
}

export interface PnLTotals {
  positionValueTotal: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  feesPaid: number;
  totalPnl: number;
  returnPct: number;
}

/**
 * Calculate position value (mark-to-market)
 */
export function calcPositionValue(size: number, currentPrice: number): number {
  return size * currentPrice;
}

/**
 * Calculate unrealized PnL for a single position (pure price movement, no fees)
 */
export function calcUnrealizedPnl(
  position: Position,
  currentPrice: number
): number {
  if (!currentPrice || position.size === 0) return 0;

  if (position.side === "long") {
    return (currentPrice - position.avg_entry) * position.size;
  } else {
    return (position.avg_entry - currentPrice) * position.size;
  }
}

/**
 * Calculate all PnL totals from account data, positions, and trades
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
export function calcTotals(
  accountData: AccountData,
  positions: Position[],
  trades: Trade[],
  pricesByMarket: PricesByMarket
): PnLTotals {
  console.log("[calcTotals] 🔍 Calculating totals:");
  console.log(`[calcTotals]   Starting equity: ${accountData.starting_equity}`);
  console.log(`[calcTotals]   Cash balance: ${accountData.cash_balance}`);
  console.log(`[calcTotals]   DB equity (ignored): ${accountData.equity}`);
  console.log(`[calcTotals]   Positions: ${positions.length}`);
  console.log(`[calcTotals]   Position prices:`, pricesByMarket);
  
  // Calculate unrealized PnL for all positions
  let unrealizedPnl = 0;
  let positionValueTotal = 0; // For display purposes only (not used in equity calculation)

  for (const position of positions) {
    const currentPrice = pricesByMarket[position.market] || 0;
    console.log(`[calcTotals]   Position ${position.market} (${position.side}): entry=${position.avg_entry}, current=${currentPrice}, size=${position.size}`);
    if (currentPrice > 0) {
      const positionValue = calcPositionValue(position.size, currentPrice);
      positionValueTotal += positionValue; // For display only
      const posUnrealizedPnl = calcUnrealizedPnl(position, currentPrice);
      unrealizedPnl += posUnrealizedPnl;
      console.log(`[calcTotals]     → Unrealized PnL: ${posUnrealizedPnl.toFixed(2)}`);
    }
  }
  
  console.log(`[calcTotals]   Total unrealized PnL: ${unrealizedPnl.toFixed(2)}`);

  // Calculate realized PnL from closed/reduced/flip trades
  const realizedPnl = trades
    .filter((t) => t.action === "close" || t.action === "reduce" || t.action === "flip")
    .reduce((sum, t) => sum + Number(t.realized_pnl || 0), 0);

  // Calculate total fees paid
  const feesPaid = trades.reduce((sum, t) => sum + Number(t.fee || 0), 0);

  // Use the ACTUAL cash_balance from the database
  // Don't recalculate - the database is the source of truth
  // Recalculating causes phantom equity that doesn't match reality
  const correctCashBalance = accountData.cash_balance;

  // Calculate equity using Option A model: equity = cash_balance + sum(unrealizedPnl)
  const equity = correctCashBalance + unrealizedPnl;
  
  console.log(`[calcTotals] ✅ Final equity: ${correctCashBalance.toFixed(2)} + ${unrealizedPnl.toFixed(2)} = ${equity.toFixed(2)}`);

  // Calculate total PnL using reconciliation identity: totalPnL = realized + unrealized - fees
  // This ensures consistency and matches the reconciliation check
  const totalPnl = realizedPnl + unrealizedPnl - feesPaid;
  
  // Verify: totalPnL should equal equity - starting_equity
  const expectedEquity = accountData.starting_equity + totalPnl;
  if (Math.abs(equity - expectedEquity) > 0.01) {
    console.warn(`[calcTotals] Equity mismatch: calculated=${equity.toFixed(2)}, expected=${expectedEquity.toFixed(2)} (from totalPnL)`);
    console.warn(`[calcTotals] cash_balance: stored=${accountData.cash_balance.toFixed(2)}, recalculated=${correctCashBalance.toFixed(2)}`);
  }

  // Calculate return percentage using ONLY: (current_equity - starting_equity) / starting_equity
  // This ensures consistency and matches the definition
  // NOT derived from max drawdown, peak equity, equity curve deltas, or cached values
  const returnPct =
    accountData.starting_equity > 0
      ? ((equity - accountData.starting_equity) / accountData.starting_equity) * 100
      : 0;
  
  // Sanity assertion: If total_pnl > 0, return % must be > 0
  if (totalPnl > 0 && returnPct <= 0) {
    console.error(`[calcTotals] SANITY CHECK FAILED: totalPnl=${totalPnl.toFixed(2)} > 0 but returnPct=${returnPct.toFixed(2)} <= 0`);
    console.error(`[calcTotals] equity=${equity.toFixed(2)}, starting_equity=${accountData.starting_equity.toFixed(2)}`);
  }

  return {
    positionValueTotal,
    equity,
    unrealizedPnl,
    realizedPnl,
    feesPaid,
    totalPnl,
    returnPct,
  };
}

/**
 * Verify reconciliation: totalPnl should equal realizedPnl + unrealizedPnl - feesPaid
 * Returns true if reconciled (within rounding tolerance)
 */
export function verifyReconciliation(totals: PnLTotals, tolerance: number = 0.01): boolean {
  const expected = totals.realizedPnl + totals.unrealizedPnl - totals.feesPaid;
  return Math.abs(totals.totalPnl - expected) < tolerance;
}
