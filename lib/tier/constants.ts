/**
 * Free tier restrictions — single source of truth for server and client code.
 */

export const FREE_TIER_LIMITS = {
  planId: 'free',
  maxSessions: 1,
  maxMarketsPerStrategy: 1,
  minCadenceSeconds: 600,       // 10 minutes
  allowedProviders: ['deepseek'],
  allowedModels: ['deepseek-chat', 'deepseek-reasoner'],
  allowedModes: ['virtual', 'arena'],
  signupCreditCents: 1000,      // $10.00
} as const;

export function isFreeTier(planId: string | null | undefined): boolean {
  return planId === 'free';
}
