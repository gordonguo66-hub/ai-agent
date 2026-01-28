import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * POST /api/follow
 * Follow a user. Body: { following_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { following_id } = body;

    if (!following_id) {
      return NextResponse.json(
        { error: "following_id is required" },
        { status: 400 }
      );
    }

    // Prevent self-follow (also enforced at DB level)
    if (user.id === following_id) {
      return NextResponse.json(
        { error: "Cannot follow yourself" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Check if the user to follow exists
    const { data: targetProfile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", following_id)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Insert follow relationship
    const { error: insertError } = await serviceClient
      .from("user_follows")
      .insert({
        follower_id: user.id,
        following_id: following_id,
      });

    if (insertError) {
      // Check for duplicate key error (already following)
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "Already following this user" },
          { status: 409 }
        );
      }
      console.error("Error following user:", insertError);
      return NextResponse.json(
        { error: "Failed to follow user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Follow error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/follow
 * Unfollow a user. Body: { following_id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { following_id } = body;

    if (!following_id) {
      return NextResponse.json(
        { error: "following_id is required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Delete follow relationship
    const { error: deleteError } = await serviceClient
      .from("user_follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", following_id);

    if (deleteError) {
      console.error("Error unfollowing user:", deleteError);
      return NextResponse.json(
        { error: "Failed to unfollow user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unfollow error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/follow?user_id=xxx
 * Get list of user IDs that the specified user (or current user) is following
 * Used for the Following feed filter
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id") || user.id;

    const serviceClient = createServiceRoleClient();

    // Get list of users being followed
    const { data: follows, error } = await serviceClient
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", userId);

    if (error) {
      console.error("Error fetching follows:", error);
      return NextResponse.json(
        { error: "Failed to fetch follows" },
        { status: 500 }
      );
    }

    const followingIds = (follows || []).map((f) => f.following_id);

    return NextResponse.json({ following_ids: followingIds });
  } catch (error: any) {
    console.error("Get follows error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
