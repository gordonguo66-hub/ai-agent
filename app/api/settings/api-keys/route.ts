import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { encryptCredential } from "@/lib/crypto/credentials";

/**
 * GET /api/settings/api-keys
 * List all saved API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from("user_api_keys")
      .select("id, provider, label, key_preview, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/settings/api-keys] Error fetching keys:", error);
      return NextResponse.json(
        { error: "Failed to fetch saved API keys" },
        { status: 500 }
      );
    }

    return NextResponse.json({ keys: data || [] }, { status: 200 });
  } catch (error: any) {
    console.error("[GET /api/settings/api-keys] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/api-keys
 * Create a new saved API key
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { provider, label, api_key } = body;

    // Validate required fields
    if (!provider || !label || !api_key) {
      return NextResponse.json(
        { error: "Missing required fields: provider, label, api_key" },
        { status: 400 }
      );
    }

    // Validate provider
    const validProviders = [
      "openai",
      "anthropic",
      "google",
      "xai",
      "deepseek",
      "meta",
      "qwen",
      "glm",
      "perplexity",
      "openrouter",
      "together",
      "groq",
      "fireworks",
    ];

    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate label (max 50 chars, alphanumeric + spaces/dashes)
    if (label.length > 50) {
      return NextResponse.json(
        { error: "Label must be 50 characters or less" },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(label)) {
      return NextResponse.json(
        { error: "Label can only contain letters, numbers, spaces, dashes, and underscores" },
        { status: 400 }
      );
    }

    // Validate API key format (basic check)
    const trimmedKey = api_key.trim();
    if (trimmedKey.length < 10) {
      return NextResponse.json(
        { error: "API key appears to be invalid (too short)" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Check for duplicate label+provider for this user
    const { data: existing } = await serviceClient
      .from("user_api_keys")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("label", label.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `You already have a key labeled "${label}" for ${provider}` },
        { status: 409 }
      );
    }

    // Encrypt the API key
    const encrypted_key = encryptCredential(trimmedKey);

    // Generate preview (last 4 chars)
    const key_preview = trimmedKey.length >= 4 
      ? `****${trimmedKey.slice(-4)}` 
      : "****";

    // Insert the new saved key
    const { data, error } = await serviceClient
      .from("user_api_keys")
      .insert({
        user_id: user.id,
        provider,
        label: label.trim(),
        encrypted_key,
        key_preview,
      })
      .select("id, provider, label, key_preview, created_at")
      .single();

    if (error || !data) {
      console.error("[POST /api/settings/api-keys] Error creating key:", error);
      return NextResponse.json(
        { error: error?.message || "Failed to save API key" },
        { status: 500 }
      );
    }

    return NextResponse.json({ key: data }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/settings/api-keys] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
