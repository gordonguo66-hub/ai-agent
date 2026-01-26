import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Verify session belongs to user
    const { data: session } = await serviceClient
      .from("strategy_sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // First, check if there are any active arena entries for this session
    const { data: existingEntries, error: checkError } = await serviceClient
      .from("arena_entries")
      .select("id, active")
      .eq("session_id", sessionId)
      .eq("user_id", user.id);

    if (checkError) {
      console.error("Failed to check arena entries:", checkError);
      return NextResponse.json({ error: "Failed to check arena entries" }, { status: 500 });
    }

    if (!existingEntries || existingEntries.length === 0) {
      return NextResponse.json({ success: true, message: "No arena entry found for this session" });
    }

    // Mark as "left" - sets arena_status='left', left_at=now(), active=false
    const { data: updatedEntries, error: updateError } = await serviceClient
      .from("arena_entries")
      .update({ 
        active: false,
        arena_status: 'left',
        left_at: new Date().toISOString()
      })
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .select("id");

    if (updateError) {
      console.error("Failed to leave arena:", updateError);
      return NextResponse.json({ error: "Failed to leave arena" }, { status: 500 });
    }

    console.log(`[Arena Leave] User left arena: ${updatedEntries?.length || 0} entry/entries for session ${sessionId} marked as 'left'`);

    return NextResponse.json({ 
      success: true, 
      left: updatedEntries?.length || 0,
      message: "Successfully left arena. Your session will no longer appear on the leaderboard." 
    });
  } catch (error: any) {
    console.error("Arena leave error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
