import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * POST /api/profile-posts
 * Create a post for the current user's profile (content + optional media_url list)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { content, media_urls, visibility = "profile_only" } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Validate visibility
    if (visibility !== "public" && visibility !== "profile_only") {
      return NextResponse.json({ error: "Invalid visibility value" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Ensure profile exists
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

    // Create the post
    console.log("[Create Post] Creating post for user:", user.id, "content:", content.substring(0, 50), "visibility:", visibility);
    const { data: post, error: postError } = await serviceClient
      .from("profile_posts")
      .insert({
        author_id: user.id,
        content: content.trim(),
        visibility: visibility,
      })
      .select()
      .single();

    console.log("[Create Post] Insert result:", { post, postError });

    if (postError) {
      console.error("Error creating profile post:", postError);
      return NextResponse.json({ error: "Failed to create post", details: postError.message }, { status: 500 });
    }

    // Add media if provided
    if (media_urls && Array.isArray(media_urls) && media_urls.length > 0) {
      const mediaInserts = media_urls
        .filter((url: string) => typeof url === "string" && url.trim().length > 0)
        .map((url: string) => ({
          post_id: post.id,
          media_url: url.trim(),
        }));

      if (mediaInserts.length > 0) {
        const { error: mediaError } = await serviceClient
          .from("profile_post_media")
          .insert(mediaInserts);

        if (mediaError) {
          console.error("Error adding media to post:", mediaError);
          // Don't fail the whole request, post was created
        }
      }
    }

    // Fetch the post with media
    const { data: fullPost } = await serviceClient
      .from("profile_posts")
      .select(`
        id,
        content,
        created_at,
        profile_post_media(id, media_url)
      `)
      .eq("id", post.id)
      .single();

    return NextResponse.json({ post: fullPost || post }, { status: 201 });
  } catch (error: any) {
    console.error("Profile post creation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
