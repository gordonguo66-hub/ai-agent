import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const commentId = params.id;
    const serviceClient = createServiceRoleClient();

    // Fetch the comment to check ownership and get post_id
    const { data: comment, error: fetchError } = await serviceClient
      .from("comments")
      .select("id, user_id, post_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Fetch the post to check if user is the post author
    const { data: post, error: postError } = await serviceClient
      .from("posts")
      .select("user_id")
      .eq("id", comment.post_id)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if user is the comment author OR the post author
    const isCommentAuthor = comment.user_id === user.id;
    const isPostAuthor = post.user_id === user.id;

    if (!isCommentAuthor && !isPostAuthor) {
      return NextResponse.json(
        { error: "You don't have permission to delete this comment" },
        { status: 403 }
      );
    }

    // Delete the comment (this will cascade delete all replies due to ON DELETE CASCADE)
    const { error: deleteError } = await serviceClient
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (deleteError) {
      console.error(`[Comment DELETE] ❌ Failed to delete comment ${commentId}:`, deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete comment" },
        { status: 500 }
      );
    }

    console.log(`[Comment DELETE] ✅ Comment ${commentId} deleted by user ${user.id}`);
    return NextResponse.json({ message: "Comment deleted successfully" }, { status: 200 });
  } catch (error: any) {
    console.error(`[Comment DELETE] ❌ Exception deleting comment:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
