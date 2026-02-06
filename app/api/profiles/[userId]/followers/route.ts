import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/profiles/:userId/followers
 * Returns the list of users who follow the specified user.
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

    const serviceClient = createServiceRoleClient();

    // Get IDs of users who follow this user
    const { data: follows, error } = await serviceClient
      .from("user_follows")
      .select("follower_id")
      .eq("following_id", params.userId);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch followers" }, { status: 500 });
    }

    const followerIds = (follows || []).map((f) => f.follower_id);

    if (followerIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Fetch profile info for each follower
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", followerIds);

    return NextResponse.json({ users: profiles || [] });
  } catch (error: any) {
    console.error("Fetch followers error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
