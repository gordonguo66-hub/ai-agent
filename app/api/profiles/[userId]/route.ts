import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/profiles/:userId
 * Returns profile + latest 20 posts + media for each post + replies + likes + follower counts + follow status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const userId = params.userId;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Get current user (optional - for checking if they liked posts)
    let currentUserId: string | null = null;
    try {
      const user = await getUserFromRequest(request);
      currentUserId = user?.id || null;
    } catch {
      // Not logged in, that's fine
    }

    const serviceClient = createServiceRoleClient();

    // Fetch profile
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, gender, age, timezone, created_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Fetch follower count (users who follow this profile)
    const { count: followersCount } = await serviceClient
      .from("user_follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId);

    // Fetch following count (users this profile follows)
    const { count: followingCount } = await serviceClient
      .from("user_follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId);

    // Check if current user is following this profile
    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      const { data: followData } = await serviceClient
        .from("user_follows")
        .select("follower_id")
        .eq("follower_id", currentUserId)
        .eq("following_id", userId)
        .single();
      
      isFollowing = !!followData;
    }

    // Fetch latest 20 profile posts with likes_count
    // Try with likes_count, fallback without if column doesn't exist
    let posts: any[] | null = null;
    let postsError: any = null;

    const { data: postsWithLikes, error: postsWithLikesError } = await serviceClient
      .from("profile_posts")
      .select("id, content, created_at, author_id, likes_count")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (postsWithLikesError) {
      // Fallback: try without likes_count
      const { data: fallbackPosts, error: fallbackError } = await serviceClient
        .from("profile_posts")
        .select("id, content, created_at, author_id")
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      
      posts = (fallbackPosts || []).map(p => ({ ...p, likes_count: 0 }));
      postsError = fallbackError;
    } else {
      posts = postsWithLikes;
    }

    if (postsError) {
      console.error("Error fetching profile posts:", postsError);
    }
    
    // Fetch media separately for each post
    if (posts && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      
      // Get media
      const { data: media } = await serviceClient
        .from("profile_post_media")
        .select("id, post_id, media_url")
        .in("post_id", postIds);
      
      // Attach media to posts
      const mediaByPost = new Map<string, any[]>();
      (media || []).forEach(m => {
        if (!mediaByPost.has(m.post_id)) {
          mediaByPost.set(m.post_id, []);
        }
        mediaByPost.get(m.post_id)!.push({ id: m.id, media_url: m.media_url });
      });
      
      posts.forEach((post: any) => {
        post.profile_post_media = mediaByPost.get(post.id) || [];
      });

      // Check which posts the current user has liked
      if (currentUserId) {
        try {
          const { data: userLikes, error: likesError } = await serviceClient
            .from("profile_post_likes")
            .select("post_id")
            .eq("user_id", currentUserId)
            .in("post_id", postIds);
          
          if (!likesError) {
            const likedPostIds = new Set((userLikes || []).map(l => l.post_id));
            posts.forEach((post: any) => {
              post.isLiked = likedPostIds.has(post.id);
            });
          } else {
            // profile_post_likes table might not exist yet
            posts.forEach((post: any) => {
              post.isLiked = false;
            });
          }
        } catch {
          // Likes table doesn't exist yet
          posts.forEach((post: any) => {
            post.isLiked = false;
          });
        }
      } else {
        posts.forEach((post: any) => {
          post.isLiked = false;
        });
      }
    }

    // For each post, fetch reply count and latest 3 replies
    const postsWithReplies = await Promise.all(
      (posts || []).map(async (post) => {
        // Get reply count
        const { count } = await serviceClient
          .from("profile_post_replies")
          .select("id", { count: "exact", head: true })
          .eq("post_id", post.id);

        // Get latest 3 replies with author info
        const { data: replies } = await serviceClient
          .from("profile_post_replies")
          .select(`
            id,
            content,
            created_at,
            author:profiles!profile_post_replies_author_id_fkey(id, display_name, avatar_url)
          `)
          .eq("post_id", post.id)
          .order("created_at", { ascending: true })
          .limit(3);

        return {
          ...post,
          replyCount: count || 0,
          replies: replies || [],
        };
      })
    );

    return NextResponse.json({
      profile: {
        ...profile,
        followers_count: followersCount || 0,
        following_count: followingCount || 0,
      },
      posts: postsWithReplies,
      isFollowing,
    });
  } catch (error: any) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
