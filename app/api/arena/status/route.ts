import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/arena/status
 * Returns whether the current user has joined any arena (virtual or live)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    // Check if user has any active arena entries
    const { data: entries, error } = await serviceClient
      .from("arena_entries")
      .select("id, mode, session_id")
      .eq("user_id", user.id)
      .eq("active", true);

    if (error) {
      console.error("Failed to check arena status:", error);
      return NextResponse.json({ error: "Failed to check arena status" }, { status: 500 });
    }

    const hasJoinedVirtual = entries?.some((e) => e.mode === "virtual") || false;
    const hasJoinedLive = entries?.some((e) => e.mode === "live") || false;

    return NextResponse.json({
      hasJoinedVirtual,
      hasJoinedLive,
      hasJoined: hasJoinedVirtual || hasJoinedLive,
      entries: entries || [],
    });
  } catch (error: any) {
    console.error("Arena status error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
