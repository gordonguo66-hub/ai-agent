/**
 * Known models for each provider as fallback when /models endpoint is unavailable
 * or doesn't return all models. These are updated as of Jan 2026.
 */

export const KNOWN_MODELS: Record<string, string[]> = {
  // OpenAI (GPT Family)
  "https://api.openai.com/v1": [
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
  ],

  // Anthropic Claude (note: may not have /models endpoint, but we include known models)
  "https://api.anthropic.com/v1": [
    "claude-opus-4.5",
    "claude-sonnet-4.5",
    "claude-3.5-opus",
    "claude-3.5-sonnet",
    "claude-3.5-haiku",
    "claude-3-opus",
    "claude-3-sonnet",
    "claude-3-haiku",
  ],

  // Google Gemini (OpenAI-compatible)
  "https://generativelanguage.googleapis.com/v1beta/openai": [
    "gemini-3-pro",
    "gemini-3-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],

  // xAI Grok
  "https://api.x.ai/v1": [
    "grok-4",
    "grok-4.1",
    "grok-4.1-thinking",
    "grok-beta",
    "grok-2",
  ],

  // DeepSeek (can use /v1 or root)
  "https://api.deepseek.com": [
    "deepseek-chat",
    "deepseek-coder",
    "deepseek-reasoner",
    "deepseek-v3",
    "deepseek-v2",
  ],
  "https://api.deepseek.com/v1": [
    "deepseek-chat",
    "deepseek-coder",
    "deepseek-reasoner",
    "deepseek-v3",
    "deepseek-v2",
  ],

  // OpenRouter (many models via aggregator)
  "https://openrouter.ai/api/v1": [
    "openai/gpt-5.2",
    "openai/gpt-5.2-pro",
    "openai/gpt-5-mini",
    "anthropic/claude-opus-4.5",
    "anthropic/claude-sonnet-4.5",
    "google/gemini-3-pro",
    "x-ai/grok-4",
    "deepseek/deepseek-v3.2",
    "meta-llama/llama-4-70b-instruct",
    "meta-llama/llama-3.1-70b-instruct",
    "qwen/qwen-3",
    "perplexity/sonar",
  ],

  // Together AI
  "https://api.together.xyz/v1": [
    "meta-llama/Llama-4-70B-Instruct",
    "meta-llama/Llama-3.1-70B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
    "mistralai/Mixtral-8x7B-Instruct",
  ],

  // Groq
  "https://api.groq.com/openai/v1": [
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instruct",
    "mixtral-8x7b-32768",
    "gemma-7b-it",
  ],

  // Perplexity
  "https://api.perplexity.ai": [
    "sonar",
    "sonar-pro",
    "sonar-online",
  ],

  // Fireworks
  "https://api.fireworks.ai/inference/v1": [
    "accounts/fireworks/models/llama-v3p1-8b-instruct",
    "accounts/fireworks/models/llama-v3p1-70b-instruct",
    "accounts/fireworks/models/mixtral-8x7b-instruct",
  ],
};

/**
 * Get known models for a base URL (normalized)
 */
export function getKnownModels(baseUrl: string): string[] {
  const normalized = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  
  // Try exact match first
  for (const [key, models] of Object.entries(KNOWN_MODELS)) {
    if (key.toLowerCase() === normalized) {
      return models;
    }
  }
  
  // Try partial match (e.g., "api.openai.com" matches "https://api.openai.com/v1")
  for (const [key, models] of Object.entries(KNOWN_MODELS)) {
    const keyDomain = new URL(key).hostname;
    try {
      const urlDomain = new URL(baseUrl).hostname;
      if (keyDomain === urlDomain) {
        return models;
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  // Special case: DeepSeek - both root and /v1 work
  if (baseUrl.includes("api.deepseek.com")) {
    return KNOWN_MODELS["https://api.deepseek.com"] || KNOWN_MODELS["https://api.deepseek.com/v1"] || [];
  }
  
  return [];
}
