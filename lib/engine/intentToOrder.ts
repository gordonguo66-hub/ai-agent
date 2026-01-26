import { Intent } from "@/lib/ai/intentSchema";
import { OrderRequest } from "./types";
import { DEFAULT_MAX_POSITION_USD, StrategyFilters } from "./risk";

/**
 * Convert structured intent -> order request.
 * This is shared between VIRTUAL and LIVE to keep strategy logic identical.
 */
export function intentToOrder(args: {
  intent: Intent;
  market: string;
  midPrice: number;
  filters: StrategyFilters;
  clientOrderId: string;
}): OrderRequest {
  const { intent, market, midPrice, filters, clientOrderId } = args;

  if (intent.bias === "neutral") {
    return { market, side: "buy", size: 0, clientOrderId };
  }

  const side = intent.bias === "long" ? "buy" : "sell";

  // Size in base units. Use max_position_usd (or safety default) as "budget",
  // scaled by risk + confidence.
  const notionalBudgetUsd = filters.max_position_usd ?? DEFAULT_MAX_POSITION_USD;
  const score = clamp01(intent.risk) * clamp01(intent.confidence);
  const notionalUsd = notionalBudgetUsd * score;
  const size = midPrice > 0 ? notionalUsd / midPrice : 0;

  return { market, side, size, clientOrderId };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

