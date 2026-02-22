/**
 * Normalize model names to valid API model IDs.
 *
 * Some model names in existing strategies don't match actual API model IDs.
 * This maps legacy/incorrect names to valid ones so API calls succeed.
 */

const DEEPSEEK_MODEL_MAP: Record<string, string> = {
  // DeepSeek V3 is accessed via "deepseek-chat" in their API
  "deepseek-v3": "deepseek-chat",
  "deepseek-v2": "deepseek-chat",
  // DeepSeek Coder was merged into the chat model
  "deepseek-coder": "deepseek-chat",
};

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  // Dot-notation names are not valid API model IDs
  "claude-opus-4.5": "claude-opus-4-5-20251101",
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
  "claude-haiku-4.5": "claude-haiku-4-5-20251001",
};

export function normalizeModelName(provider: string, model: string): string {
  const trimmed = model.trim();

  if (provider === "deepseek") {
    return DEEPSEEK_MODEL_MAP[trimmed] || trimmed;
  }

  if (provider === "anthropic") {
    return ANTHROPIC_MODEL_MAP[trimmed] || trimmed;
  }

  return trimmed;
}
