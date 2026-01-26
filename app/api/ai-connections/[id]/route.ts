import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { normalizeBaseUrl } from "@/lib/ai/openaiCompatible";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = params.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await request.json();
    const updates: any = {};
    if (typeof body.provider === "string" && body.provider.trim()) updates.provider = body.provider.trim();
    if (typeof body.base_url === "string" && body.base_url.trim()) updates.base_url = normalizeBaseUrl(body.base_url);
    if (typeof body.default_model === "string") updates.default_model = body.default_model.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const service = createServiceRoleClient();

    // Ownership check
    const { data: conn, error: connErr } = await service
      .from("ai_connections")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (connErr || !conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((conn as any).user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await service
      .from("ai_connections")
      .update(updates)
      .eq("id", id)
      .select("id, provider, base_url, default_model, created_at")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
    return NextResponse.json({ connection: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = params.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const service = createServiceRoleClient();

    // Ownership check
    const { data: conn, error: connErr } = await service
      .from("ai_connections")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (connErr || !conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((conn as any).user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Remove references from strategies (FK is SET NULL, but update keeps things explicit)
    await service.from("strategies").update({ ai_connection_id: null }).eq("ai_connection_id", id);

    const { error: delErr } = await service.from("ai_connections").delete().eq("id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

