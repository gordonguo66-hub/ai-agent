import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * POST /api/posts/:postId/like
 * Like a community post
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const postId = params.postId;
    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Check if post exists
    const { data: post } = await serviceClient
      .from("posts")
      .select("id")
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Try to insert like (will fail if already liked due to unique constraint)
    const { error: likeError } = await serviceClient
      .from("post_likes")
      .insert({
        post_id: postId,
        user_id: user.id,
      });

    if (likeError) {
      if (likeError.code === "23505") {
        // Unique constraint violation - already liked
        return NextResponse.json({ error: "Already liked" }, { status: 409 });
      }
      console.error("Error liking post:", likeError);
      return NextResponse.json({ error: "Failed to like post" }, { status: 500 });
    }

    // Get updated like count
    const { data: updatedPost } = await serviceClient
      .from("posts")
      .select("likes_count")
      .eq("id", postId)
      .single();

    return NextResponse.json({ 
      success: true, 
      liked: true,
      likesCount: updatedPost?.likes_count || 0
    });
  } catch (error: any) {
    console.error("Like post error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/:postId/like
 * Unlike a community post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const postId = params.postId;
    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Delete the like
    const { error: unlikeError } = await serviceClient
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);

    if (unlikeError) {
      console.error("Error unliking post:", unlikeError);
      return NextResponse.json({ error: "Failed to unlike post" }, { status: 500 });
    }

    // Get updated like count
    const { data: updatedPost } = await serviceClient
      .from("posts")
      .select("likes_count")
      .eq("id", postId)
      .single();

    return NextResponse.json({ 
      success: true, 
      liked: false,
      likesCount: updatedPost?.likes_count || 0
    });
  } catch (error: any) {
    console.error("Unlike post error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
