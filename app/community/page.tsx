"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { PostCard } from "@/components/post-card";
import { AuthGuard } from "@/components/auth-guard";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";

interface Post {
  id: string;
  user_id: string;
  profiles?: { username?: string; display_name?: string; avatar_url?: string } | null;
  title: string;
  body: string;
  created_at: string;
  likes_count: number;
  isLiked?: boolean;
  isSaved?: boolean;
  post_media?: { id: string; media_url: string }[];
}

function CommunityContent() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"latest" | "mostLiked">("latest");
  const [feedFilter, setFeedFilter] = useState<"all" | "following">("all");
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Load following list when filter changes to "following"
  useEffect(() => {
    if (feedFilter === "following" && currentUserId && followingIds.length === 0) {
      loadFollowingIds();
    }
  }, [feedFilter, currentUserId]);

  const loadFollowingIds = async () => {
    if (!currentUserId) return;
    
    setFollowingLoading(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/follow", {
        headers: bearer ? { Authorization: bearer } : undefined,
      });
      
      if (response.ok) {
        const data = await response.json();
        setFollowingIds(data.following_ids || []);
      }
    } catch (error) {
      console.error("Error loading following ids:", error);
    } finally {
      setFollowingLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      setCurrentUserId(userId);

      // Fetch posts (without join - we'll fetch profiles separately)
      let postsData: any[] | null = null;

      // Try with likes_count first
      const { data: postsWithLikesData, error: postsWithLikesError } = await supabase
        .from("posts")
        .select("id, user_id, title, body, created_at, likes_count")
        .order("created_at", { ascending: false });

      if (postsWithLikesError) {
        console.error("Error fetching posts with likes_count:", postsWithLikesError);
        // Fallback: try without likes_count column
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("posts")
          .select("id, user_id, title, body, created_at")
          .order("created_at", { ascending: false });
        
        if (fallbackError) {
          console.error("Error fetching posts:", fallbackError);
        }
        postsData = (fallbackData || []).map(p => ({ ...p, likes_count: 0 }));
      } else {
        postsData = postsWithLikesData;
      }

      // Fetch profiles and media separately and attach to posts
      if (postsData && postsData.length > 0) {
        const postIds = postsData.map(p => p.id);
        const userIds = [...new Set(postsData.map(p => p.user_id))];
        
        // Fetch profiles
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);

        const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

        // Fetch media (may not exist yet)
        let mediaByPost = new Map<string, any[]>();
        try {
          console.log("📷 Fetching media for posts:", postIds);
          const { data: mediaData, error: mediaError } = await supabase
            .from("post_media")
            .select("id, post_id, media_url")
            .in("post_id", postIds);
          
          console.log("📷 Media fetch result:", { mediaData, mediaError });
          
          if (!mediaError && mediaData) {
            mediaData.forEach(m => {
              if (!mediaByPost.has(m.post_id)) {
                mediaByPost.set(m.post_id, []);
              }
              mediaByPost.get(m.post_id)!.push({ id: m.id, media_url: m.media_url });
            });
            console.log("📷 Media by post:", Object.fromEntries(mediaByPost));
          }
        } catch (err) {
          console.error("📷 post_media fetch error:", err);
          // post_media table might not exist yet
        }

        postsData = postsData.map(post => ({
          ...post,
          likes_count: post.likes_count || 0, // Ensure likes_count is never null
          profiles: profilesMap.get(post.user_id) || null,
          post_media: mediaByPost.get(post.id) || [],
        }));
      }

      let postsWithLikes = postsData || [];

      // Check which posts the current user has liked
      if (userId && postsWithLikes.length > 0) {
        const postIds = postsWithLikes.map(p => p.id);
        try {
          // Fetch likes
          const { data: userLikes, error: likesError } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", postIds);
          
          // Fetch saved posts
          const { data: userSaves, error: savesError } = await supabase
            .from("saved_posts")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", postIds);
          
          if (!likesError && !savesError) {
            const likedPostIds = new Set((userLikes || []).map(l => l.post_id));
            const savedPostIds = new Set((userSaves || []).map(s => s.post_id));
            postsWithLikes = postsWithLikes.map(post => ({
              ...post,
              isLiked: likedPostIds.has(post.id),
              isSaved: savedPostIds.has(post.id),
            }));
          } else {
            // Tables might not exist yet
            postsWithLikes = postsWithLikes.map(post => ({
              ...post,
              isLiked: false,
              isSaved: false,
            }));
          }
        } catch {
          // Likes/saves table doesn't exist yet
          postsWithLikes = postsWithLikes.map(post => ({
            ...post,
            isLiked: false,
            isSaved: false,
          }));
        }
      } else {
        postsWithLikes = postsWithLikes.map(post => ({
          ...post,
          isLiked: false,
          isSaved: false,
        }));
      }

      setPosts(postsWithLikes);

      // Fetch comment counts (including all replies)
      const { data: commentData } = await supabase
        .from("comments")
        .select("post_id");

      const counts: Record<string, number> = {};
      (commentData || []).forEach((c: any) => {
        counts[c.post_id] = (counts[c.post_id] || 0) + 1;
      });
      setCommentCounts(counts);
    } catch (error) {
      console.error("Error loading community data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Update likes count when a post is liked/unliked
  const handleLikeUpdate = (postId: string, newLikesCount: number) => {
    setPosts(prevPosts => 
      prevPosts.map(post => 
        post.id === postId ? { ...post, likes_count: newLikesCount } : post
      )
    );
  };

  // Filter posts by following if needed, then sort
  const filteredPosts = feedFilter === "following" && currentUserId
    ? posts.filter(post => followingIds.includes(post.user_id))
    : posts;

  // Sort posts based on current sort option
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === "mostLiked") {
      const likeDiff = (b.likes_count || 0) - (a.likes_count || 0);
      // If likes are equal, sort by most recent
      if (likeDiff === 0) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return likeDiff;
    }
    // Default: latest
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-white">Community</h1>
              <p className="text-gray-300">Share insights and learn from others</p>
            </div>
            <CreatePostDialog />
          </div>

          {/* Feed Filter and Sort Options */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            {/* Feed Filter (only show if logged in) */}
            {currentUserId && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Show:</span>
                <div className="flex gap-1">
                  <Button
                    variant={feedFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFeedFilter("all")}
                    className={feedFilter === "all" ? "" : "text-white border-gray-600 hover:bg-blue-900/30 hover:text-white"}
                  >
                    All
                  </Button>
                  <Button
                    variant={feedFilter === "following" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFeedFilter("following")}
                    className={feedFilter === "following" ? "" : "text-white border-gray-600 hover:bg-blue-900/30 hover:text-white"}
                  >
                    Following
                  </Button>
                </div>
              </div>
            )}

            {/* Sort Options */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">Sort by:</span>
              <div className="flex gap-1">
                <Button
                  variant={sortBy === "latest" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("latest")}
                  className={sortBy === "latest" ? "" : "text-white border-gray-600 hover:bg-blue-900/30 hover:text-white"}
                >
                  Latest
                </Button>
                <Button
                  variant={sortBy === "mostLiked" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortBy("mostLiked")}
                  className={sortBy === "mostLiked" ? "" : "text-white border-gray-600 hover:bg-blue-900/30 hover:text-white"}
                >
                  Most Liked
                </Button>
              </div>
            </div>
          </div>

          {followingLoading ? (
            <Card className="border-dashed">
              <CardContent className="pt-12 pb-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                  <p className="text-muted-foreground mt-4 text-base">
                    Loading...
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : sortedPosts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-12 pb-12">
                <div className="text-center">
                  {feedFilter === "following" && currentUserId ? (
                    <>
                      <p className="text-muted-foreground mb-4 text-base">
                        You aren't following anyone yet.
                      </p>
                      <Button
                        variant="default"
                        onClick={() => setFeedFilter("all")}
                      >
                        View All Posts
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground mb-4 text-base">
                        No posts yet. Be the first to share!
                      </p>
                      <CreatePostDialog />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedPosts.map((post: any) => (
                <PostCard
                  key={post.id}
                  post={post}
                  commentCount={commentCounts[post.id] || 0}
                  currentUserId={currentUserId}
                  initialIsLiked={post.isLiked}
                  initialIsSaved={post.isSaved}
                  onSaveToggle={loadData}
                  onLikeUpdate={handleLikeUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  return (
    <AuthGuard>
      <CommunityContent />
    </AuthGuard>
  );
}
