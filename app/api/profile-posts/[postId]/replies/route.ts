import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/profile-posts/:postId/replies
 * Get all replies for a profile post
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const postId = params.postId;

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: replies, error } = await serviceClient
      .from("profile_post_replies")
      .select(`
        id,
        content,
        created_at,
        author:profiles!profile_post_replies_author_id_fkey(id, display_name, avatar_url)
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching replies:", error);
      return NextResponse.json({ error: "Failed to fetch replies" }, { status: 500 });
    }

    return NextResponse.json({ replies: replies || [] });
  } catch (error: any) {
    console.error("Replies fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profile-posts/:postId/replies
 * Create a reply for a profile post
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

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Verify post exists
    const { data: post } = await serviceClient
      .from("profile_posts")
      .select("id")
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Ensure profile exists for the replier
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      // Create profile if it doesn't exist
      const displayName = user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        `User ${user.id.substring(0, 8)}`;

      await serviceClient.from("profiles").insert({
        id: user.id,
        username: user.user_metadata?.username || null,
        display_name: displayName,
      });
    }

    // Create the reply
    const { data: reply, error: replyError } = await serviceClient
      .from("profile_post_replies")
      .insert({
        post_id: postId,
        author_id: user.id,
        content: content.trim(),
      })
      .select(`
        id,
        content,
        created_at,
        author:profiles!profile_post_replies_author_id_fkey(id, display_name, avatar_url)
      `)
      .single();

    if (replyError) {
      console.error("Error creating reply:", replyError);
      return NextResponse.json({ error: "Failed to create reply" }, { status: 500 });
    }

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error: any) {
    console.error("Reply creation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
