import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { decryptCredential } from "@/lib/crypto/credentials";
import { normalizeBaseUrl } from "@/lib/ai/openaiCompatible";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = params.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const service = createServiceRoleClient();
    const { data: conn, error: connErr } = await service
      .from("ai_connections")
      .select("id, user_id, base_url, api_key_encrypted")
      .eq("id", id)
      .single();
    if (connErr || !conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((conn as any).user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const baseUrl = normalizeBaseUrl((conn as any).base_url);
    const apiKey = decryptCredential((conn as any).api_key_encrypted);

    const res = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json(
        { error: `Failed to fetch models (${res.status}): ${t.slice(0, 200)}` },
        { status: 400 }
      );
    }

    const json = await res.json();
    const list: string[] = Array.isArray(json?.data)
      ? json.data.map((m: any) => m?.id).filter(Boolean)
      : Array.isArray(json)
        ? json.map((m: any) => m?.id ?? m).filter(Boolean)
        : [];

    // Return sorted unique list
    const models = Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ models });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

