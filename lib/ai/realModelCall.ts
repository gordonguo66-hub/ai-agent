import { Intent } from "@/lib/ai/intentSchema";
import { openAICompatibleIntentCall, IntentWithUsage } from "@/lib/ai/openaiCompatible";

export async function realModelCall(args: {
  provider: string; // e.g. "deepseek", "openai", "openrouter", etc.
  baseUrl: string;
  apiKey: string;
  model: string; // model name (e.g. "deepseek-chat")
  prompt: string;
  context: {
    market: string;
    marketData: any;
    positions: any;
  };
}): Promise<IntentWithUsage> {
  const { baseUrl, apiKey, model, prompt, context } = args;
  // For now, we support OpenAI-compatible providers through baseUrl.
  // provider is kept for display/selection/filtering.
  return await openAICompatibleIntentCall({
    baseUrl,
    apiKey,
    model,
    prompt,
    context,
  });
}
