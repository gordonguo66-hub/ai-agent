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

    // Allow resuming from any non-running status (stopped sessions are now resumable)
    if (session.status === "running") {
      return NextResponse.json({
        error: "Session is already running"
      }, { status: 400 });
    }

    console.log(`[Resume] Resuming session ${sessionId} from status: ${session.status}`);

    // Update status to running
    const updateData: any = { status: "running" };
    if (!session.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    const { data: updatedSession, error: updateError } = await serviceClient
      .from("strategy_sessions")
      .update(updateData)
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error resuming session:", updateError);
      return NextResponse.json({ error: "Failed to resume session" }, { status: 500 });
    }

    return NextResponse.json({ session: updatedSession });
  } catch (error: any) {
    console.error("Resume session error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
