import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { encryptCredential } from "@/lib/crypto/credentials";
import { validateOpenAICompatibleKey, normalizeBaseUrl } from "@/lib/ai/openaiCompatible";

// Provider to base URL mapping for API key validation
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1", // Uses /messages endpoint, not /chat/completions
  google: "https://generativelanguage.googleapis.com/v1beta/openai", // OpenAI-compatible endpoint
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  groq: "https://api.groq.com/openai/v1",
  perplexity: "https://api.perplexity.ai",
  fireworks: "https://api.fireworks.ai/inference/v1",
  meta: "https://api.together.xyz/v1", // LLaMA models typically via Together or similar
  qwen: "https://api.together.xyz/v1", // Often via aggregators
  glm: "https://api.together.xyz/v1", // Often via aggregators
};

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, model_provider, model_name, prompt, filters, api_key, saved_api_key_id } = body;

    if (!name || !model_provider || !model_name || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, model_provider, model_name, prompt" },
        { status: 400 }
      );
    }

    // Check that either a saved key ID or a manual API key is provided
    if (!saved_api_key_id && (!api_key || !api_key.trim())) {
      return NextResponse.json(
        { error: "API Key is required - either provide a saved key or enter an API key" },
        { status: 400 }
      );
    }

    // Validate cadence (minimum 60 seconds due to cron frequency)
    if (filters?.cadenceSeconds && filters.cadenceSeconds < 60) {
      return NextResponse.json(
        { error: "Minimum AI cadence is 60 seconds (1 minute). The system checks for decisions every minute." },
        { status: 400 }
      );
    }

    // Validate API key before storing (non-blocking - key will be validated on actual use)
    // Only validate if using manual API key (not saved key)
    if (api_key && api_key.trim()) {
      const baseUrl = PROVIDER_BASE_URLS[model_provider];
      if (baseUrl) {
        try {
          // Anthropic uses different validation endpoint
          if (model_provider === "anthropic") {
            // Anthropic doesn't have a /models endpoint, skip validation
            // Will be validated on actual use
          } else {
            await validateOpenAICompatibleKey({
              baseUrl: normalizeBaseUrl(baseUrl),
              apiKey: api_key.trim(),
            });
          }
          // Validation passed - continue
        } catch (validationError: any) {
          // Validation failed - log but don't block strategy creation
          // The key will be validated when actually used in paper runs
          console.warn(`API key validation failed for provider ${model_provider}:`, validationError.message);
          // Still allow strategy creation - validation will happen on actual use
        }
      }
    }

    const serviceClient = createServiceRoleClient();

    // Prepare strategy data
    const strategyData: any = {
      user_id: user.id,
      name: String(name),
      model_provider: String(model_provider),
      model_name: String(model_name),
      prompt: String(prompt),
      filters: filters || {},
    };

    // Handle API key: either saved key reference or encrypted manual key
    if (saved_api_key_id) {
      // Using saved key - store reference, set api_key_ciphertext to null
      strategyData.saved_api_key_id = saved_api_key_id;
      strategyData.api_key_ciphertext = null;
    } else if (api_key && api_key.trim()) {
      // Using manual key - encrypt and store
      strategyData.api_key_ciphertext = encryptCredential(api_key.trim());
      strategyData.saved_api_key_id = null;
    }

    const { data, error } = await serviceClient
      .from("strategies")
      .insert(strategyData)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategy: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
