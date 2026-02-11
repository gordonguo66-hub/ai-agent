import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { requireValidOrigin } from "@/lib/api/csrfProtection";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const csrfCheck = requireValidOrigin(request);
    if (csrfCheck) return csrfCheck;

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = params.id;
    const body = await request.json();
    const { status } = body;

    if (!["running", "stopped"].includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be 'running' or 'stopped'" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Verify session belongs to user
    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Update status
    const updateData: any = { status };
    if (status === "running" && !session.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    const { data: updatedSession, error: updateError } = await serviceClient
      .from("strategy_sessions")
      .update(updateData)
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating session:", updateError);
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }

    return NextResponse.json({ session: updatedSession });
  } catch (error: any) {
    console.error("Session control error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
