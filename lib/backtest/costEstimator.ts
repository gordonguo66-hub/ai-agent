import {
  calculateCost,
  calculateChargedCents,
  API_PRICING,
  type SubscriptionTier,
} from "@/lib/pricing/apiCosts";

export interface BacktestCostEstimate {
  totalTicks: number;
  estimatedInputTokensPerTick: number;
  estimatedOutputTokensPerTick: number;
  baseCostPerTickUsd: number;
  chargedCentsPerTick: number;
  totalEstimatedCents: number;
  totalEstimatedUsd: number;
  tier: string;
  model: string;
  resolution: string;
  durationDays: number;
}

const RESOLUTION_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

const AVG_INPUT_TOKENS_PER_TICK = 8000;
const AVG_OUTPUT_TOKENS_PER_TICK = 150;

export function estimateBacktestCost(args: {
  startDate: Date;
  endDate: Date;
  resolution: string;
  model: string;
  tier: SubscriptionTier | string | null;
  marketsCount?: number;
}): BacktestCostEstimate {
  const { startDate, endDate, resolution, model, tier, marketsCount = 1 } = args;

  const durationMs = endDate.getTime() - startDate.getTime();
  const resolutionMs = RESOLUTION_MS[resolution] || RESOLUTION_MS["1h"];
  const ticksPerMarket = Math.ceil(durationMs / resolutionMs);
  const totalTicks = ticksPerMarket * marketsCount;
  const durationDays = durationMs / (24 * 60 * 60 * 1000);

  const baseCostPerTickUsd = calculateCost(
    model,
    AVG_INPUT_TOKENS_PER_TICK,
    AVG_OUTPUT_TOKENS_PER_TICK
  );

  const chargedCentsPerTick = Math.max(1, calculateChargedCents(baseCostPerTickUsd, tier));
  const totalEstimatedCents = chargedCentsPerTick * totalTicks;

  return {
    totalTicks,
    estimatedInputTokensPerTick: AVG_INPUT_TOKENS_PER_TICK,
    estimatedOutputTokensPerTick: AVG_OUTPUT_TOKENS_PER_TICK,
    baseCostPerTickUsd,
    chargedCentsPerTick,
    totalEstimatedCents,
    totalEstimatedUsd: totalEstimatedCents / 100,
    tier: tier || "on_demand",
    model,
    resolution,
    durationDays,
  };
}

export function getSupportedResolutions() {
  return [
    { value: "15m", label: "15 minutes", description: "Most ticks, highest cost" },
    { value: "1h", label: "1 hour", description: "Recommended balance of detail and cost" },
    { value: "4h", label: "4 hours", description: "Fewest ticks, lowest cost" },
  ];
}

export function isModelPricingKnown(model: string): boolean {
  return model in API_PRICING;
}
