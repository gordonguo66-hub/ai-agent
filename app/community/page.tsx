"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PostCard } from "@/components/post-card";
import { AuthGuard } from "@/components/auth-guard";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import { ImageIcon, Zap, Clock, Flame, Users, Globe } from "lucide-react";

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

interface NewsItem {
  title: string;
  source: string;
  url: string;
  timeAgo: string;
  sentiment: "positive" | "negative" | "normal";
  categories: string;
}

function CommunityContent() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"latest" | "mostLiked">("latest");
  const [feedFilter, setFeedFilter] = useState<"all" | "following">("all");
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);

  // News state
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  // Inline create post state
  const [postBody, setPostBody] = useState("");
  const [postImages, setPostImages] = useState<string[]>([]);
  const [postingLoading, setPostingLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [postFocused, setPostFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    loadNews();
  }, []);

  useEffect(() => {
    if (feedFilter === "following" && currentUserId && followingIds.length === 0) {
      loadFollowingIds();
    }
  }, [feedFilter, currentUserId]);

  const loadNews = async () => {
    try {
      const res = await fetch("/api/news");
      if (res.ok) {
        const data = await res.json();
        setNewsItems(data.articles || []);
      }
    } catch {
      // News is non-critical
    } finally {
      setNewsLoading(false);
    }
  };

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
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      setCurrentUserId(userId);

      // Fetch user avatar
      if (userId) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", userId)
          .single();
        if (profileData?.avatar_url) setUserAvatar(profileData.avatar_url);
      }

      let postsData: any[] = [];

      const { data: regularPosts, error: regularPostsError } = await supabase
        .from("posts")
        .select("id, user_id, title, body, created_at, likes_count")
        .order("created_at", { ascending: false });

      if (!regularPostsError && regularPosts) {
        postsData = regularPosts.map(p => ({
          ...p,
          source: "posts",
          likes_count: p.likes_count || 0,
        }));
      }

      const { data: profilePosts, error: profilePostsError } = await supabase
        .from("profile_posts")
        .select("id, author_id, content, created_at, likes_count")
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      if (!profilePostsError && profilePosts) {
        const normalizedProfilePosts = profilePosts.map(p => ({
          id: `profile_${p.id}`,
          original_id: p.id,
          user_id: p.author_id,
          title: p.content.substring(0, 100),
          body: p.content,
          created_at: p.created_at,
          likes_count: p.likes_count || 0,
          source: "profile_posts",
        }));
        postsData = [...postsData, ...normalizedProfilePosts];
      }

      postsData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (postsData && postsData.length > 0) {
        const userIds = [...new Set(postsData.map(p => p.user_id))];

        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);

        const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

        let mediaByPost = new Map<string, any[]>();

        try {
          const regularPostIds = postsData.filter(p => p.source === "posts").map(p => p.id);
          if (regularPostIds.length > 0) {
            const { data: mediaData, error: mediaError } = await supabase
              .from("post_media")
              .select("id, post_id, media_url")
              .in("post_id", regularPostIds);
            if (!mediaError && mediaData) {
              mediaData.forEach(m => {
                if (!mediaByPost.has(m.post_id)) mediaByPost.set(m.post_id, []);
                mediaByPost.get(m.post_id)!.push({ id: m.id, media_url: m.media_url });
              });
            }
          }
        } catch (err) {
          console.error("post_media fetch error:", err);
        }

        try {
          const profilePostIds = postsData.filter(p => p.source === "profile_posts").map(p => p.original_id);
          if (profilePostIds.length > 0) {
            const { data: profileMediaData, error: profileMediaError } = await supabase
              .from("profile_post_media")
              .select("id, post_id, media_url")
              .in("post_id", profilePostIds);
            if (!profileMediaError && profileMediaData) {
              profileMediaData.forEach(m => {
                const prefixedId = `profile_${m.post_id}`;
                if (!mediaByPost.has(prefixedId)) mediaByPost.set(prefixedId, []);
                mediaByPost.get(prefixedId)!.push({ id: m.id, media_url: m.media_url });
              });
            }
          }
        } catch (err) {
          console.error("profile_post_media fetch error:", err);
        }

        postsData = postsData.map(post => ({
          ...post,
          likes_count: post.likes_count || 0,
          profiles: profilesMap.get(post.user_id) || null,
          post_media: mediaByPost.get(post.id) || [],
        }));
      }

      let postsWithLikes = postsData || [];

      if (userId && postsWithLikes.length > 0) {
        try {
          const likedPostIds = new Set<string>();
          const savedPostIds = new Set<string>();

          const regularPostIds = postsWithLikes.filter(p => p.source === "posts").map(p => p.id);
          if (regularPostIds.length > 0) {
            const { data: userLikes } = await supabase
              .from("post_likes")
              .select("post_id")
              .eq("user_id", userId)
              .in("post_id", regularPostIds);
            (userLikes || []).forEach(l => likedPostIds.add(l.post_id));

            const { data: userSaves } = await supabase
              .from("saved_posts")
              .select("post_id")
              .eq("user_id", userId)
              .in("post_id", regularPostIds);
            (userSaves || []).forEach(s => savedPostIds.add(s.post_id));
          }

          const profilePostOriginalIds = postsWithLikes.filter(p => p.source === "profile_posts").map(p => p.original_id);
          if (profilePostOriginalIds.length > 0) {
            const { data: profileLikes } = await supabase
              .from("profile_post_likes")
              .select("post_id")
              .eq("user_id", userId)
              .in("post_id", profilePostOriginalIds);
            (profileLikes || []).forEach(l => likedPostIds.add(`profile_${l.post_id}`));
          }

          postsWithLikes = postsWithLikes.map(post => ({
            ...post,
            isLiked: likedPostIds.has(post.id),
            isSaved: savedPostIds.has(post.id),
          }));
        } catch (err) {
          console.error("Error fetching likes/saves:", err);
          postsWithLikes = postsWithLikes.map(post => ({ ...post, isLiked: false, isSaved: false }));
        }
      } else {
        postsWithLikes = postsWithLikes.map(post => ({ ...post, isLiked: false, isSaved: false }));
      }

      setPosts(postsWithLikes);

      const counts: Record<string, number> = {};
      const { data: commentData } = await supabase.from("comments").select("post_id");
      (commentData || []).forEach((c: any) => {
        counts[c.post_id] = (counts[c.post_id] || 0) + 1;
      });
      const { data: replyData } = await supabase.from("profile_post_replies").select("post_id");
      (replyData || []).forEach((r: any) => {
        const prefixedId = `profile_${r.post_id}`;
        counts[prefixedId] = (counts[prefixedId] || 0) + 1;
      });
      setCommentCounts(counts);
    } catch (error) {
      console.error("Error loading community data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Inline post creation
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;

    setUploadingImage(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setUploadingImage(false); return; }

      const ext = file.name.split(".").pop();
      const fileName = `${session.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const { data, error: uploadError } = await supabase.storage
        .from("post-media")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });

      if (uploadError) { setUploadingImage(false); return; }

      const { data: { publicUrl } } = supabase.storage.from("post-media").getPublicUrl(data.path);
      setPostImages(prev => [...prev, publicUrl]);
    } catch {
      // silently fail
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreatePost = async () => {
    const trimmed = postBody.trim();
    if (!trimmed) return;

    setPostingLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setPostingLoading(false); return; }

      const autoTitle = trimmed.substring(0, 100) + (trimmed.length > 100 ? "..." : "");
      const { data, error: insertError } = await supabase
        .from("posts")
        .insert({ title: autoTitle, body: trimmed, user_id: session.user.id })
        .select();

      if (insertError || !data?.length) { setPostingLoading(false); return; }

      const postId = data[0].id;

      if (postImages.length > 0) {
        const mediaInserts = postImages.map(url => ({ post_id: postId, media_url: url }));
        await supabase.from("post_media").insert(mediaInserts);
      }

      setPostBody("");
      setPostImages([]);
      setPostFocused(false);
      loadData();
    } catch {
      // silently fail
    } finally {
      setPostingLoading(false);
    }
  };

  const handleLikeUpdate = (postId: string, newLikesCount: number) => {
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.id === postId ? { ...post, likes_count: newLikesCount } : post
      )
    );
  };

  const filteredPosts = feedFilter === "following" && currentUserId
    ? posts.filter(post => followingIds.includes(post.user_id))
    : posts;

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === "mostLiked") {
      const likeDiff = (b.likes_count || 0) - (a.likes_count || 0);
      if (likeDiff === 0) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return likeDiff;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-white">Community</h1>
            <p className="text-gray-300">Share insights and learn from others</p>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Left Sidebar: Happening Now */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <div className="rounded-xl border border-blue-900/40" style={{ background: "#0A0E1A" }}>
                  <div className="p-4 pb-3 flex items-center justify-between border-b border-blue-900/30">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-blue-400" />
                      <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#94a3b8" }}>Market Pulse</h2>
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">Live</span>
                  </div>
                  <div className="px-4 py-3 space-y-0 max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {newsLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-400"></div>
                      </div>
                    ) : newsItems.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "#6b7280" }}>No news available</p>
                    ) : (
                      newsItems.map((item, i) => (
                        <a
                          key={i}
                          href={item.url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block py-3 border-b border-blue-900/20 last:border-0 hover:bg-blue-900/10 -mx-4 px-4 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${
                                item.sentiment === "positive"
                                  ? "bg-green-500/20 text-green-400"
                                  : item.sentiment === "negative"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-gray-700/50 text-gray-400"
                              }`}
                            >
                              {item.sentiment.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[13px] leading-snug line-clamp-2 font-medium hover:text-blue-300 transition-colors" style={{ color: "#e5e7eb" }}>
                            {item.title}
                          </p>
                          <p className="text-[10px] mt-1.5 font-medium" style={{ color: "#6b7280" }}>{item.timeAgo}</p>
                        </a>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </aside>

            {/* Right Column: Feed */}
            <div className="min-w-0">
              {/* Inline Create Post */}
              {currentUserId && (
                <div className="rounded-xl border border-blue-900/40 mb-5" style={{ background: "#0A0E1A" }}>
                  <div className="p-4">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 pt-0.5">
                        {userAvatar ? (
                          <img src={userAvatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-900/30" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-blue-900/50 flex items-center justify-center text-blue-400 text-sm font-medium ring-2 ring-blue-900/30">
                            ?
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <textarea
                          value={postBody}
                          onChange={(e) => setPostBody(e.target.value)}
                          onFocus={() => setPostFocused(true)}
                          placeholder="What's on your mind?"
                          rows={postFocused || postBody ? 3 : 1}
                          maxLength={5000}
                          style={{ color: "#e5e7eb", background: "transparent" }}
                          className="w-full border-none outline-none resize-none text-sm placeholder-gray-500"
                          disabled={postingLoading}
                        />
                        {postImages.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {postImages.map((url, idx) => (
                              <div key={idx} className="relative">
                                <img src={url} alt="" className="w-16 h-16 object-cover rounded" />
                                <button
                                  type="button"
                                  onClick={() => setPostImages(prev => prev.filter((_, i) => i !== idx))}
                                  className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                                  disabled={postingLoading}
                                >
                                  x
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-blue-900/30">
                      <div className="flex items-center gap-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={postingLoading || uploadingImage}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={postingLoading || uploadingImage || postImages.length >= 4}
                          className="flex items-center gap-1.5 text-xs hover:text-blue-400 disabled:opacity-40 transition-colors"
                          style={{ color: "#9ca3af" }}
                        >
                          <ImageIcon className="h-4 w-4" />
                          {uploadingImage ? "Uploading..." : "Image"}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleCreatePost}
                        disabled={postingLoading || !postBody.trim()}
                        className="px-6"
                      >
                        {postingLoading ? "Posting..." : "Post"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Feed Tabs */}
              <div className="flex items-center gap-1 mb-5 border-b border-gray-800/60 pb-0">
                <button
                  onClick={() => { setSortBy("latest"); setFeedFilter("all"); }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-[1px] ${
                    sortBy === "latest" && feedFilter === "all"
                      ? "border-blue-500 text-white"
                      : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  New
                </button>
                <button
                  onClick={() => { setSortBy("mostLiked"); setFeedFilter("all"); }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-[1px] ${
                    sortBy === "mostLiked" && feedFilter === "all"
                      ? "border-blue-500 text-white"
                      : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                  }`}
                >
                  <Flame className="h-3.5 w-3.5" />
                  Hot
                </button>
                {currentUserId && (
                  <button
                    onClick={() => { setFeedFilter("following"); setSortBy("latest"); }}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-[1px] ${
                      feedFilter === "following"
                        ? "border-blue-500 text-white"
                        : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Following
                  </button>
                )}
              </div>

              {/* Posts Feed */}
              {followingLoading ? (
                <Card className="border-dashed">
                  <CardContent className="pt-12 pb-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                      <p className="text-muted-foreground mt-4 text-base">Loading...</p>
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
                            You aren&apos;t following anyone yet.
                          </p>
                          <Button variant="default" onClick={() => setFeedFilter("all")}>
                            View All Posts
                          </Button>
                        </>
                      ) : (
                        <p className="text-muted-foreground text-base">
                          No posts yet. Be the first to share!
                        </p>
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
