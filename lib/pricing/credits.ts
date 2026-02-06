/**
 * Credit pricing configuration
 *
 * Internal cost: $0.013 per credit (hidden from users)
 * On-demand markup: 80% over internal cost
 * On-demand price: $0.013 × 1.80 = $0.0234 per credit
 */

// Internal cost per credit (in dollars) - DO NOT expose to frontend
export const INTERNAL_CREDIT_COST = 0.013;

// On-demand markup percentage (80%)
export const ON_DEMAND_MARKUP = 0.80;

// Calculated on-demand price per credit
export const ON_DEMAND_PRICE_PER_CREDIT = INTERNAL_CREDIT_COST * (1 + ON_DEMAND_MARKUP);

// Fixed on-demand price per credit
export const ON_DEMAND_RATE_PER_CREDIT_CENTS = 3.0; // $0.03 per credit

// On-demand credit packages (all at fixed $0.03/credit rate)
export const ON_DEMAND_PACKAGES = [
  {
    id: 'credits_100',
    credits: 100,
    price_cents: 300, // 100 × $0.03 = $3.00
    popular: false,
  },
  {
    id: 'credits_250',
    credits: 250,
    price_cents: 750, // 250 × $0.03 = $7.50
    popular: false,
  },
  {
    id: 'credits_500',
    credits: 500,
    price_cents: 1500, // 500 × $0.03 = $15.00
    popular: true,
  },
  {
    id: 'credits_1000',
    credits: 1000,
    price_cents: 3000, // 1000 × $0.03 = $30.00
    popular: false,
  },
] as const;

// Helper to get price per credit for a package
export function getPricePerCredit(package_id: string): number {
  const pkg = ON_DEMAND_PACKAGES.find(p => p.id === package_id);
  if (!pkg) return ON_DEMAND_PRICE_PER_CREDIT;
  return pkg.price_cents / 100 / pkg.credits;
}

// Credit costs per AI model (shown to users)
export const MODEL_CREDIT_COSTS = {
  'gpt-4o-mini': 0.2,
  'gpt-4o': 1.0,
  'claude-sonnet': 1.5,
  'claude-opus': 3.0,
  'deepseek': 0.3,
  'gemini-pro': 0.5,
} as const;

// Helper to estimate credits needed based on usage
export function estimateCreditsNeeded(decisionsPerDay: number, model: keyof typeof MODEL_CREDIT_COSTS = 'gpt-4o'): number {
  const creditsPerDecision = MODEL_CREDIT_COSTS[model];
  return Math.ceil(decisionsPerDay * 30 * creditsPerDecision); // Monthly estimate
}
