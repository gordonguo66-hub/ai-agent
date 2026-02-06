import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = params.id;
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

    // Update status to stopped
    const { data: updatedSession, error: updateError } = await serviceClient
      .from("strategy_sessions")
      .update({ status: "stopped" })
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error stopping session:", updateError);
      return NextResponse.json({ error: "Failed to stop session" }, { status: 500 });
    }

    // Mark any arena entry for this session as ended
    await serviceClient
      .from("arena_entries")
      .update({ arena_status: "ended", active: false })
      .eq("session_id", sessionId)
      .eq("user_id", user.id);

    return NextResponse.json({ session: updatedSession });
  } catch (error: any) {
    console.error("Stop session error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
