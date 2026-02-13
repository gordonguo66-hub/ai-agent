import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/profiles/:userId/following
 * Returns the list of users that the specified user is following.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow users to view their own following list
    if (user.id !== params.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const serviceClient = createServiceRoleClient();

    // Get IDs of users this user is following
    const { data: follows, error } = await serviceClient
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", params.userId);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch following" }, { status: 500 });
    }

    const followingIds = (follows || []).map((f) => f.following_id);

    if (followingIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Fetch profile info for each followed user
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", followingIds);

    return NextResponse.json({ users: profiles || [] });
  } catch (error: any) {
    console.error("Fetch following error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
