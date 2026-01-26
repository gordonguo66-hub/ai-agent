import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { encryptCredential } from "@/lib/crypto/credentials";
import { validateOpenAICompatibleKey, normalizeBaseUrl } from "@/lib/ai/openaiCompatible";

// Provider to base URL mapping for API key validation
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  groq: "https://api.groq.com/openai/v1",
  perplexity: "https://api.perplexity.ai",
  fireworks: "https://api.fireworks.ai/inference/v1",
  meta: "https://api.together.xyz/v1",
  qwen: "https://api.together.xyz/v1",
  glm: "https://api.together.xyz/v1",
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const strategyId = params.id;
    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    return NextResponse.json({ strategy: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const strategyId = params.id;
    const body = await request.json();
    const { name, model_provider, model_name, prompt, filters, api_key, saved_api_key_id } = body;

    const serviceClient = createServiceRoleClient();

    // Verify strategy exists and belongs to user
    const { data: existingStrategy, error: fetchError } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingStrategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Build update object
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = String(name);
    }

    if (model_provider !== undefined) {
      updateData.model_provider = String(model_provider);
    }

    if (model_name !== undefined) {
      updateData.model_name = String(model_name);
    }

    if (prompt !== undefined) {
      updateData.prompt = String(prompt);
    }

    if (filters !== undefined) {
      // Validate cadence (minimum 60 seconds due to cron frequency)
      if (filters?.cadenceSeconds && filters.cadenceSeconds < 60) {
        return NextResponse.json(
          { error: "Minimum AI cadence is 60 seconds (1 minute). The system checks for decisions every minute." },
          { status: 400 }
        );
      }
      updateData.filters = filters;
    }

    // Handle API key update (either saved key or manual key)
    // If saved_api_key_id is explicitly provided (even if null), update it
    if (saved_api_key_id !== undefined) {
      if (saved_api_key_id === null) {
        // Explicitly clearing saved key
        updateData.saved_api_key_id = null;
      } else {
        // Verify saved key belongs to user and matches provider
        const { data: savedKey, error: keyError } = await serviceClient
          .from("user_api_keys")
          .select("id, user_id, provider")
          .eq("id", saved_api_key_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (keyError || !savedKey) {
          return NextResponse.json(
            { error: "Invalid saved API key or key does not belong to you" },
            { status: 400 }
          );
        }

        const provider = model_provider || existingStrategy.model_provider;
        if (savedKey.provider !== provider) {
          return NextResponse.json(
            { error: `Saved key is for ${savedKey.provider}, but strategy uses ${provider}` },
            { status: 400 }
          );
        }

        updateData.saved_api_key_id = saved_api_key_id;
        // When using saved key, clear the manual key
        updateData.api_key_ciphertext = null;
      }
    }

    // Handle manual API key update (only if provided and not using saved key)
    if (api_key !== undefined && api_key !== null && api_key.trim() !== "") {
      // Validate API key if provider is provided
      const provider = model_provider || existingStrategy.model_provider;
      const baseUrl = PROVIDER_BASE_URLS[provider];
      
      if (baseUrl) {
        try {
          if (provider === "anthropic") {
            // Anthropic doesn't have a /models endpoint, skip validation
          } else {
            await validateOpenAICompatibleKey({
              baseUrl: normalizeBaseUrl(baseUrl),
              apiKey: api_key.trim(),
            });
          }
        } catch (validationError: any) {
          console.warn(`API key validation failed for provider ${provider}:`, validationError.message);
          // Still allow update - validation will happen on actual use
        }
      }

      // Encrypt and update API key
      updateData.api_key_ciphertext = encryptCredential(api_key.trim());
      // When using manual key, clear saved key reference
      updateData.saved_api_key_id = null;
    }

    // Update strategy
    const { data, error } = await serviceClient
      .from("strategies")
      .update(updateData)
      .eq("id", strategyId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to update strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategy: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
