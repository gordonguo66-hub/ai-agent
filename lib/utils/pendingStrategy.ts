const PENDING_STRATEGY_KEY = "pending_strategy_form";

/**
 * Check if there's a pending strategy in localStorage.
 * Returns "/strategy/new" if pending data exists and is less than 1 hour old,
 * otherwise returns null.
 */
export function getPendingStrategyRedirect(): string | null {
  try {
    const saved = localStorage.getItem(PENDING_STRATEGY_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    if (data._savedAt && Date.now() - data._savedAt > 60 * 60 * 1000) {
      localStorage.removeItem(PENDING_STRATEGY_KEY);
      return null;
    }
    return "/strategy/new";
  } catch {
    return null;
  }
}
