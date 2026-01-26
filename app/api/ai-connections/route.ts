import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { encryptCredential } from "@/lib/crypto/credentials";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { validateOpenAICompatibleKey, normalizeBaseUrl } from "@/lib/ai/openaiCompatible";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { provider, api_key, base_url, default_model } = body;

    if (!provider || !api_key || !base_url) {
      return NextResponse.json({ error: "Missing provider, base_url, or api_key" }, { status: 400 });
    }

    // Validate key before storing (prevents junk like "a" / "b")
    await validateOpenAICompatibleKey({
      baseUrl: normalizeBaseUrl(String(base_url)),
      apiKey: String(api_key),
    });

    const encrypted = encryptCredential(String(api_key));
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("ai_connections")
      .insert({
        user_id: user.id,
        provider,
        base_url: normalizeBaseUrl(String(base_url)),
        default_model: default_model ? String(default_model) : null,
        api_key_encrypted: encrypted,
      })
      .select("id, provider, base_url, default_model, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to create connection" }, { status: 500 });
    }

    return NextResponse.json({ connection: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("ai_connections")
      .select("id, provider, base_url, default_model, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ connections: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

