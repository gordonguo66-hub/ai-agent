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

    // Fetch profile posts
    let profilePosts: any[] = [];
    const { data: postsWithLikes, error: postsWithLikesError } = await serviceClient
      .from("profile_posts")
      .select("id, content, created_at, author_id, likes_count")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (postsWithLikesError) {
      const { data: fallbackPosts } = await serviceClient
        .from("profile_posts")
        .select("id, content, created_at, author_id")
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      profilePosts = (fallbackPosts || []).map(p => ({ ...p, likes_count: 0 }));
    } else {
      profilePosts = postsWithLikes || [];
    }

    // Fetch community posts by this user
    let communityPosts: any[] = [];
    const { data: communityPostsData } = await serviceClient
      .from("posts")
      .select("id, title, body, created_at, user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (communityPostsData) {
      // Get likes counts for community posts
      for (const cp of communityPostsData) {
        const { count: likesCount } = await serviceClient
          .from("post_likes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", cp.id);

        const { count: commentsCount } = await serviceClient
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("post_id", cp.id);

        communityPosts.push({
          ...cp,
          likes_count: likesCount || 0,
          comments_count: commentsCount || 0,
          source: "community",
        });
      }
    }

    // Fetch media for profile posts
    const profilePostIds = profilePosts.map(p => p.id);
    if (profilePostIds.length > 0) {
      const { data: media } = await serviceClient
        .from("profile_post_media")
        .select("id, post_id, media_url")
        .in("post_id", profilePostIds);

      const mediaByPost = new Map<string, any[]>();
      (media || []).forEach(m => {
        if (!mediaByPost.has(m.post_id)) {
          mediaByPost.set(m.post_id, []);
        }
        mediaByPost.get(m.post_id)!.push({ id: m.id, media_url: m.media_url });
      });

      profilePosts.forEach((post: any) => {
        post.profile_post_media = mediaByPost.get(post.id) || [];
        post.source = "profile";
      });
    }

    // Fetch media for community posts
    const communityPostIds = communityPosts.map(p => p.id);
    if (communityPostIds.length > 0) {
      const { data: media } = await serviceClient
        .from("post_media")
        .select("id, post_id, media_url")
        .in("post_id", communityPostIds);

      const mediaByPost = new Map<string, any[]>();
      (media || []).forEach(m => {
        if (!mediaByPost.has(m.post_id)) {
          mediaByPost.set(m.post_id, []);
        }
        mediaByPost.get(m.post_id)!.push({ id: m.id, media_url: m.media_url });
      });

      communityPosts.forEach((post: any) => {
        post.post_media = mediaByPost.get(post.id) || [];
      });
    }

    // Merge and sort all posts by created_at
    let allPosts = [...profilePosts, ...communityPosts];
    allPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    allPosts = allPosts.slice(0, 30);

    // Check likes for profile posts
    if (currentUserId && profilePostIds.length > 0) {
      try {
        const { data: userLikes, error: likesError } = await serviceClient
          .from("profile_post_likes")
          .select("post_id")
          .eq("user_id", currentUserId)
          .in("post_id", profilePostIds);

        if (!likesError) {
          const likedPostIds = new Set((userLikes || []).map(l => l.post_id));
          allPosts.forEach((post: any) => {
            if (post.source === "profile") {
              post.isLiked = likedPostIds.has(post.id);
            }
          });
        }
      } catch {
        // profile_post_likes table might not exist yet
      }
    }

    // Check likes for community posts
    if (currentUserId && communityPostIds.length > 0) {
      try {
        const { data: userLikes, error: likesError } = await serviceClient
          .from("post_likes")
          .select("post_id")
          .eq("user_id", currentUserId)
          .in("post_id", communityPostIds);

        if (!likesError) {
          const likedPostIds = new Set((userLikes || []).map(l => l.post_id));
          allPosts.forEach((post: any) => {
            if (post.source === "community") {
              post.isLiked = likedPostIds.has(post.id);
            }
          });
        }
      } catch {
        // post_likes table might not exist yet
      }
    }

    // Set isLiked to false for any posts that weren't checked
    allPosts.forEach((post: any) => {
      if (post.isLiked === undefined) post.isLiked = false;
    });

    // For profile posts, fetch reply count and latest 3 replies
    const postsWithReplies = await Promise.all(
      allPosts.map(async (post) => {
        if (post.source === "community") {
          // Community posts already have comments_count
          return {
            ...post,
            replyCount: post.comments_count || 0,
            replies: [],
          };
        }

        // Profile posts: get reply count and replies
        const { count } = await serviceClient
          .from("profile_post_replies")
          .select("id", { count: "exact", head: true })
          .eq("post_id", post.id);

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
