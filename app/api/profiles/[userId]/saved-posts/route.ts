import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      console.log("[Saved Posts] ❌ Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = params;
    console.log(`[Saved Posts] 📋 Fetching saved posts for user ${userId}`);

    // Only allow users to view their own saved posts
    if (user.id !== userId) {
      console.log(`[Saved Posts] ❌ Forbidden: user ${user.id} trying to access ${userId}'s saved posts`);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const serviceClient = createServiceRoleClient();

    // Step 1: Get saved post IDs
    const { data: savedPostsData, error: savedPostsError } = await serviceClient
      .from("saved_posts")
      .select("post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    console.log(`[Saved Posts] 📦 Saved posts query result:`, { 
      count: savedPostsData?.length || 0, 
      error: savedPostsError,
      data: savedPostsData
    });

    if (savedPostsError) {
      console.error("[Saved Posts] Error fetching saved posts:", savedPostsError);
      return NextResponse.json(
        { error: savedPostsError.message || "Failed to fetch saved posts" },
        { status: 500 }
      );
    }

    if (!savedPostsData || savedPostsData.length === 0) {
      return NextResponse.json({ savedPosts: [] }, { status: 200 });
    }

    // Step 2: Get post details for all saved posts
    const postIds = savedPostsData.map((sp: any) => sp.post_id);
    
    const { data: postsData, error: postsError } = await serviceClient
      .from("posts")
      .select(`
        id,
        title,
        body,
        created_at,
        user_id,
        post_media (
          id,
          media_url
        )
      `)
      .in("id", postIds);

    console.log(`[Saved Posts] 📝 Posts query result:`, { 
      count: postsData?.length || 0, 
      error: postsError,
      data: postsData
    });

    if (postsError) {
      console.error("[Saved Posts] Error fetching posts:", postsError);
      return NextResponse.json(
        { error: postsError.message || "Failed to fetch posts" },
        { status: 500 }
      );
    }

    // Step 3: Get author details
    const authorIds = [...new Set(postsData?.map((p: any) => p.user_id).filter(Boolean) || [])];
    
    const { data: authorsData, error: authorsError } = await serviceClient
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", authorIds);

    console.log(`[Saved Posts] 👤 Authors query result:`, { 
      count: authorsData?.length || 0, 
      error: authorsError
    });

    const authorsMap = (authorsData || []).reduce((acc: Record<string, any>, author: any) => {
      acc[author.id] = author;
      return acc;
    }, {});

    // Step 4: Get likes and comments count
    let likesCountMap: Record<string, number> = {};
    let commentsCountMap: Record<string, number> = {};
    let userLikedSet: Set<string> = new Set();

    if (postIds.length > 0) {
      // Get likes count
      const { data: likesData } = await serviceClient
        .from("post_likes")
        .select("post_id")
        .in("post_id", postIds);

      likesCountMap = (likesData || []).reduce((acc: Record<string, number>, like: any) => {
        acc[like.post_id] = (acc[like.post_id] || 0) + 1;
        return acc;
      }, {});

      // Check which posts the current user has liked
      const { data: userLikesData } = await serviceClient
        .from("post_likes")
        .select("post_id")
        .eq("user_id", userId)
        .in("post_id", postIds);

      userLikedSet = new Set((userLikesData || []).map((like: any) => like.post_id));

      // Get comments count
      const { data: commentsData } = await serviceClient
        .from("comments")
        .select("post_id")
        .in("post_id", postIds);

      commentsCountMap = (commentsData || []).reduce((acc: Record<string, number>, comment: any) => {
        acc[comment.post_id] = (acc[comment.post_id] || 0) + 1;
        return acc;
      }, {});
    }

    // Step 5: Format the response
    const postsMap = (postsData || []).reduce((acc: Record<string, any>, post: any) => {
      acc[post.id] = post;
      return acc;
    }, {});

    const savedPosts = savedPostsData
      .map((sp: any) => {
        const post = postsMap[sp.post_id];
        if (!post) return null; // Post was deleted
        
        const author = authorsMap[post.user_id];
        
        return {
          id: post.id,
          title: post.title,
          body: post.body,
          created_at: post.created_at,
          author: {
            id: author?.id || post.user_id,
            display_name: author?.display_name || "Unknown User",
            avatar_url: author?.avatar_url,
          },
          likes_count: likesCountMap[post.id] || 0,
          comments_count: commentsCountMap[post.id] || 0,
          post_media: post.post_media || [],
          isLiked: userLikedSet.has(post.id),
        };
      })
      .filter(Boolean); // Remove any null entries

    console.log(`[Saved Posts] ✅ Returning ${savedPosts.length} saved posts`);

    return NextResponse.json({ savedPosts }, { status: 200 });
  } catch (error: any) {
    console.error("[Saved Posts] Exception:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
