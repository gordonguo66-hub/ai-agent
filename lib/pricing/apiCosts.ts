/**
 * API Cost Calculation for AI Models
 *
 * This module defines the actual API pricing for different AI models
 * and provides functions to calculate costs based on tiered subscription markups.
 *
 * Pricing as of January 2025 (per 1M tokens)
 *
 * BILLING SYSTEM:
 * - Balance stored in cents (integer) for precision
 * - Tiered markup based on subscription tier
 * - On-demand: 100% markup (2× cost)
 * - Pro ($19/mo): 60% markup → 25% more AI usage
 * - Pro+ ($89/mo): 48% markup → 35% more AI usage
 * - Ultra ($249/mo): 33% markup → 50% more AI usage
 */

// ============================================
// TIERED MARKUP SYSTEM
// ============================================

/**
 * Subscription tier markups (as decimal, e.g., 1.00 = 100% markup)
 * Higher tiers get lower markups = more value for their money
 */
export const TIER_MARKUPS = {
  'on_demand': 1.00,   // 100% markup (2× cost) - baseline
  'pro': 0.60,         // 60% markup (1.6× cost) - 25% more usage
  'pro_plus': 0.48,    // 48% markup (1.48× cost) - 35% more usage
  'ultra': 0.33,       // 33% markup (1.33× cost) - 50% more usage
} as const;

export type SubscriptionTier = keyof typeof TIER_MARKUPS;

/**
 * Subscription plan details for reference
 * Note: Actual plan data should come from database, this is for display/calculation
 */
export const SUBSCRIPTION_TIERS = {
  'pro': {
    name: 'Pro',
    price_cents: 1900,      // $19/mo
    markup: 0.60,
    more_usage_percent: 25,  // "25% more AI usage"
  },
  'pro_plus': {
    name: 'Pro+',
    price_cents: 8900,      // $89/mo
    markup: 0.48,
    more_usage_percent: 35,  // "35% more AI usage"
  },
  'ultra': {
    name: 'Ultra',
    price_cents: 24900,     // $249/mo
    markup: 0.33,
    more_usage_percent: 50,  // "50% more AI usage"
  },
} as const;

/**
 * Get the markup rate for a subscription tier
 * @param tier - The subscription tier (null = on_demand)
 * @returns Markup as decimal (e.g., 0.60 for 60%)
 */
export function getMarkupForTier(tier: SubscriptionTier | string | null): number {
  if (!tier || tier === 'on_demand') return TIER_MARKUPS.on_demand;
  return TIER_MARKUPS[tier as SubscriptionTier] ?? TIER_MARKUPS.on_demand;
}

/**
 * Calculate the charged amount in cents based on actual cost and tier
 * @param actualCostUsd - Actual API cost in USD (e.g., 0.06)
 * @param tier - User's subscription tier (null = on_demand)
 * @returns Amount to charge in cents (integer)
 */
export function calculateChargedCents(
  actualCostUsd: number,
  tier: SubscriptionTier | string | null = null
): number {
  const markup = getMarkupForTier(tier);
  const chargedUsd = actualCostUsd * (1 + markup);
  // Convert to cents and round to nearest cent
  return Math.round(chargedUsd * 100);
}

// ============================================
// API PRICING DATA
// ============================================

// Actual API pricing from providers (per 1 million tokens)
export const API_PRICING = {
  // Anthropic Claude models
  'claude-opus-4': {
    input_per_1m: 15.00,
    output_per_1m: 75.00,
  },
  'claude-sonnet-4': {
    input_per_1m: 3.00,
    output_per_1m: 15.00,
  },
  'claude-3-5-sonnet-20241022': {
    input_per_1m: 3.00,
    output_per_1m: 15.00,
  },

  // OpenAI models
  'gpt-4o': {
    input_per_1m: 5.00,
    output_per_1m: 15.00,
  },
  'gpt-4o-mini': {
    input_per_1m: 0.15,
    output_per_1m: 0.60,
  },
  'gpt-4-turbo': {
    input_per_1m: 10.00,
    output_per_1m: 30.00,
  },

  // DeepSeek
  'deepseek-chat': {
    input_per_1m: 0.14,
    output_per_1m: 0.28,
  },

  // Google Gemini
  'gemini-pro': {
    input_per_1m: 0.50,
    output_per_1m: 1.50,
  },
  'gemini-1.5-pro': {
    input_per_1m: 1.25,
    output_per_1m: 5.00,
  },

  // xAI
  'grok-beta': {
    input_per_1m: 5.00,
    output_per_1m: 15.00,
  },
} as const;

// Fallback pricing for unknown models (conservative estimate based on GPT-4o)
const FALLBACK_PRICING = {
  input_per_1m: 5.00,
  output_per_1m: 15.00,
};

/**
 * Calculate the actual API cost for a given number of tokens
 *
 * @param model - The model identifier (e.g., 'gpt-4o', 'claude-opus-4')
 * @param inputTokens - Number of input tokens consumed
 * @param outputTokens - Number of output tokens generated
 * @returns Actual cost in USD
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Get pricing for the model, or use fallback
  const pricing = API_PRICING[model as keyof typeof API_PRICING] || FALLBACK_PRICING;

  if (!API_PRICING[model as keyof typeof API_PRICING]) {
    console.warn(`[apiCosts] Unknown model pricing for "${model}", using fallback (GPT-4o equivalent)`);
  }

  // Calculate cost: (tokens × price per 1M) / 1M
  const inputCost = (inputTokens * pricing.input_per_1m) / 1_000_000;
  const outputCost = (outputTokens * pricing.output_per_1m) / 1_000_000;

  return inputCost + outputCost;
}

/**
 * @deprecated Use calculateChargedCents instead
 * Calculate credits to deduct from user's balance (legacy, for backwards compatibility)
 */
export function calculateCreditsToDeduct(
  actualCost: number,
  markup: number = 1.00
): number {
  const chargedCost = actualCost * (1 + markup);
  // 1 credit = $0.01, so divide by 0.01 = multiply by 100
  return chargedCost * 100;
}

/**
 * Get a detailed summary of cost calculation for logging/debugging
 * @param model - The AI model used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param tier - User's subscription tier
 */
export function getCostSummary(
  model: string,
  inputTokens: number,
  outputTokens: number,
  tier: SubscriptionTier | string | null = null
) {
  const actualCostUsd = calculateCost(model, inputTokens, outputTokens);
  const markup = getMarkupForTier(tier);
  const chargedCents = calculateChargedCents(actualCostUsd, tier);
  const chargedUsd = chargedCents / 100;

  return {
    model,
    tier: tier || 'on_demand',
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
    costs: {
      actual_usd: actualCostUsd,
      actual_cents: Math.round(actualCostUsd * 100),
      charged_usd: chargedUsd,
      charged_cents: chargedCents,
      markup_percent: markup * 100,
    },
  };
}

/**
 * Check if a user has sufficient balance for an estimated AI call
 * @param balanceCents - User's current balance in cents
 * @param estimatedCostUsd - Estimated API cost in USD
 * @param tier - User's subscription tier
 * @returns true if balance is sufficient
 */
export function hasSufficientBalance(
  balanceCents: number,
  estimatedCostUsd: number,
  tier: SubscriptionTier | string | null = null
): boolean {
  const requiredCents = calculateChargedCents(estimatedCostUsd, tier);
  return balanceCents >= requiredCents;
}
