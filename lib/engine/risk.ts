import { EngineAccountState, OrderRequest } from "./types";

export interface StrategyFilters {
  max_position_usd?: number;
  max_leverage?: number;
  max_daily_loss_pct?: number;
}

export interface RiskResult {
  passed: boolean;
  reason?: string;
  checks: Record<string, { passed: boolean; reason?: string }>;
}

// Mandatory cap if filter missing (safety)
export const DEFAULT_MAX_POSITION_USD = 100;

export function runRiskChecks(args: {
  proposed: OrderRequest;
  account: EngineAccountState;
  filters: StrategyFilters;
  midPrice: number;
  startingBalanceUsd?: number; // for daily loss approximation
}): RiskResult {
  const { proposed, account, filters, midPrice, startingBalanceUsd } = args;

  const checks: RiskResult["checks"] = {};

  // If size is 0, nothing to execute.
  if (!proposed.size || proposed.size <= 0) {
    return { passed: false, reason: "No-op order (size=0)", checks: { noop: { passed: false } } };
  }

  // Max position notional for THIS order (simple guard)
  const maxPos = filters.max_position_usd ?? DEFAULT_MAX_POSITION_USD;
  const orderNotional = proposed.size * midPrice;
  if (orderNotional > maxPos) {
    checks.max_position_usd = {
      passed: false,
      reason: `Order notional $${orderNotional.toFixed(2)} exceeds max $${maxPos}`,
    };
  } else {
    checks.max_position_usd = { passed: true };
  }

  // Max leverage (approx): grossExposure / equity
  if (typeof filters.max_leverage === "number") {
    const lev = account.equityUsd > 0 ? account.grossExposureUsd / account.equityUsd : Infinity;
    if (lev > filters.max_leverage) {
      checks.max_leverage = {
        passed: false,
        reason: `Leverage ${lev.toFixed(2)}x exceeds max ${filters.max_leverage}x`,
      };
    } else {
      checks.max_leverage = { passed: true };
    }
  }

  // Max daily loss (approx, MVP): compare current equity to starting balance.
  if (typeof filters.max_daily_loss_pct === "number" && startingBalanceUsd && startingBalanceUsd > 0) {
    const maxLossPct = Math.abs(filters.max_daily_loss_pct);
    const lossPct = (startingBalanceUsd - account.equityUsd) / startingBalanceUsd;
    if (lossPct > maxLossPct) {
      checks.max_daily_loss_pct = {
        passed: false,
        reason: `Loss ${(lossPct * 100).toFixed(2)}% exceeds max ${(maxLossPct * 100).toFixed(2)}%`,
      };
    } else {
      checks.max_daily_loss_pct = { passed: true };
    }
  }

  const failed = Object.values(checks).find((c) => !c.passed);
  return {
    passed: !failed,
    reason: failed?.reason,
    checks,
  };
}

