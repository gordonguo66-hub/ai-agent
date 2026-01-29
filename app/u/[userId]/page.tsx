"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AuthGuard } from "@/components/auth-guard";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { HeartIcon, HeartFilledIcon } from "@radix-ui/react-icons";

interface Profile {
  id: string;
  username?: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  gender?: string;
  age?: number;
  created_at: string;
  followers_count?: number;
  following_count?: number;
}

interface ProfilePost {
  id: string;
  content: string;
  created_at: string;
  profile_post_media?: { id: string; media_url: string }[];
  replyCount: number;
  likesCount: number;
  isLiked: boolean;
  replies: {
    id: string;
    content: string;
    created_at: string;
    author?: { id: string; display_name: string; avatar_url?: string };
  }[];
}

function UserAvatar({ url, name, size = "md" }: { url?: string; name: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-16 h-16 text-xl",
    xl: "w-24 h-24 text-3xl",
  };

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    );
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <span
      className={`${sizeClasses[size]} rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-medium`}
    >
      {initials || "?"}
    </span>
  );
}

interface SavedPost {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
  likes_count: number;
  comments_count: number;
  post_media?: { id: string; media_url: string }[];
  isLiked?: boolean;
}

function ProfileContent({ userId }: { userId: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "saved">("posts");
  const [loading, setLoading] = useState(true);
  const [loadingSavedPosts, setLoadingSavedPosts] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: "",
    bio: "",
    gender: "",
    age: "",
  });
  const [saving, setSaving] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostMedia, setNewPostMedia] = useState<string[]>([]);
  const [creatingPost, setCreatingPost] = useState(false);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [postVisibility, setPostVisibility] = useState<"public" | "profile_only">("public");

  const isOwner = currentUserId === userId;

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id || null);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  useEffect(() => {
    console.log(`[Profile] useEffect triggered:`, { activeTab, isOwner, savedPostsLength: savedPosts.length, userId, currentUserId });
    if (activeTab === "saved" && isOwner && currentUserId) {
      console.log(`[Profile] 🎯 Triggering loadSavedPosts`);
      loadSavedPosts();
    }
  }, [activeTab, currentUserId]);

  const loadProfile = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const bearer = await getBearerToken();
      // Add cache-busting timestamp to force fresh data
      const response = await fetch(`/api/profiles/${userId}?t=${Date.now()}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 404) {
          router.push("/community");
          return;
        }
        throw new Error("Failed to load profile");
      }

      const data = await response.json();
      setProfile(data.profile);
      setIsFollowing(data.isFollowing || false);
      // Map API response to ProfilePost interface
      const mappedPosts = (data.posts || []).map((post: any) => ({
        ...post,
        likesCount: post.likes_count || 0,
        isLiked: post.isLiked || false,
      }));
      setPosts(mappedPosts);
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadSavedPosts = async () => {
    if (!isOwner) {
      console.log("[Profile] Not owner, skipping saved posts load");
      return; // Only owner can see saved posts
    }
    
    console.log(`[Profile] 🔄 Loading saved posts for user ${userId}`);
    setLoadingSavedPosts(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/profiles/${userId}/saved-posts?t=${Date.now()}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
        cache: "no-store",
      });

      console.log(`[Profile] 📡 Response status:`, response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[Profile] ✅ Loaded ${data.savedPosts?.length || 0} saved posts`);
        setSavedPosts(data.savedPosts || []);
      } else {
        const error = await response.json();
        console.error(`[Profile] ❌ Error response:`, error);
      }
    } catch (error) {
      console.error("[Profile] ❌ Exception loading saved posts:", error);
    } finally {
      setLoadingSavedPosts(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUserId || isOwner) return;
    
    setFollowLoading(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/follow", {
        method: isFollowing ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: bearer } : {}),
        },
        body: JSON.stringify({ following_id: userId }),
      });

      if (response.ok) {
        setIsFollowing(!isFollowing);
        // Update follower count in profile
        if (profile) {
          setProfile({
            ...profile,
            followers_count: isFollowing
              ? Math.max(0, (profile.followers_count || 0) - 1)
              : (profile.followers_count || 0) + 1,
          });
        }
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update follow status");
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      alert("Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleEditProfile = () => {
    if (profile) {
      setEditForm({
        display_name: profile.display_name || "",
        bio: profile.bio || "",
        gender: profile.gender || "",
        age: profile.age?.toString() || "",
      });
      setEditDialogOpen(true);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/profiles/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: bearer } : {}),
        },
        body: JSON.stringify({
          display_name: editForm.display_name,
          bio: editForm.bio || null,
          gender: editForm.gender || null,
          age: editForm.age ? parseInt(editForm.age) : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
        setEditDialogOpen(false);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to save profile");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const bearer = await getBearerToken();
      const response = await fetch("/api/profiles/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: bearer } : {}),
        },
        body: JSON.stringify({ avatar_url: publicUrl }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
      }
    } catch (error) {
      console.error("Error uploading avatar:", error);
      alert("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      const supabase = createClient();
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("post-media")
          .upload(fileName, file);

        if (uploadError) {
          console.error("Error uploading image:", uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("post-media")
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      setNewPostMedia([...newPostMedia, ...uploadedUrls]);
    } catch (error) {
      console.error("Error uploading images:", error);
      alert("Failed to upload images");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;

    setCreatingPost(true);
    const contentToPost = newPostContent;
    const mediaToPost = [...newPostMedia];
    const visibilityToPost = postVisibility;
    
    // Clear inputs immediately for better UX
    setNewPostContent("");
    setNewPostMedia([]);
    
    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/profile-posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: bearer } : {}),
        },
        body: JSON.stringify({
          content: contentToPost,
          media_urls: mediaToPost,
          visibility: visibilityToPost,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Optimistically add the new post to the top of the list
        const newPost: ProfilePost = {
          id: data.post.id,
          content: data.post.content,
          created_at: data.post.created_at,
          profile_post_media: data.post.profile_post_media || [],
          replyCount: 0,
          likesCount: 0,
          isLiked: false,
          replies: [],
        };
        setPosts(prev => [newPost, ...prev]);
      } else {
        const error = await response.json();
        // Restore inputs on error
        setNewPostContent(contentToPost);
        setNewPostMedia(mediaToPost);
        alert(error.error || "Failed to create post");
      }
    } catch (error) {
      console.error("Error creating post:", error);
      // Restore inputs on error
      setNewPostContent(contentToPost);
      setNewPostMedia(mediaToPost);
      alert("Failed to create post");
    } finally {
      setCreatingPost(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/profile-posts/${postId}`, {
        method: "DELETE",
        headers: bearer ? { Authorization: bearer } : undefined,
      });

      if (response.ok) {
        // Remove post from state immediately
        setPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete post");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post");
    }
  };

  const handleLikePost = async (postId: string, isCurrentlyLiked: boolean) => {
    if (!currentUserId) {
      alert("Please sign in to like posts");
      return;
    }

    // Optimistic update
    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { 
            ...p, 
            isLiked: !isCurrentlyLiked, 
            likesCount: isCurrentlyLiked ? Math.max(0, p.likesCount - 1) : p.likesCount + 1 
          }
        : p
    ));

    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/profile-posts/${postId}/like`, {
        method: isCurrentlyLiked ? "DELETE" : "POST",
        headers: bearer ? { Authorization: bearer } : undefined,
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setPosts(prev => prev.map(p => 
          p.id === postId 
            ? { 
                ...p, 
                isLiked: isCurrentlyLiked, 
                likesCount: isCurrentlyLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1)
              }
            : p
        ));
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      // Revert optimistic update
      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { 
              ...p, 
              isLiked: isCurrentlyLiked, 
              likesCount: isCurrentlyLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1)
            }
          : p
      ));
    }
  };

  const handleReply = async (postId: string) => {
    const content = replyInputs[postId];
    if (!content?.trim()) return;

    setSubmittingReply(postId);
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/profile-posts/${postId}/replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: bearer } : {}),
        },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        setReplyInputs({ ...replyInputs, [postId]: "" });
        loadProfile(); // Refresh to show new reply
      } else {
        const error = await response.json();
        alert(error.error || "Failed to post reply");
      }
    } catch (error) {
      console.error("Error posting reply:", error);
      alert("Failed to post reply");
    } finally {
      setSubmittingReply(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <p className="text-muted-foreground">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          {/* Back button */}
          <div className="mb-6">
            <Link href="/community">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-blue-900/30">← Back to Community</Button>
            </Link>
          </div>

          {/* Profile Header */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex items-start gap-6">
                <div className="relative">
                  <UserAvatar
                    url={profile.avatar_url}
                    name={profile.display_name}
                    size="xl"
                  />
                  {isOwner && (
                    <>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm hover:bg-primary/90 disabled:opacity-50"
                      >
                        {uploadingAvatar ? "..." : "+"}
                      </button>
                    </>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold truncate">
                      {profile.display_name}
                    </h1>
                    {isOwner ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditProfile}
                      >
                        Edit Profile
                      </Button>
                    ) : currentUserId && (
                      <Button
                        variant={isFollowing ? "outline" : "default"}
                        size="sm"
                        onClick={handleFollowToggle}
                        disabled={followLoading}
                      >
                        {followLoading ? "..." : isFollowing ? "Unfollow" : "Follow"}
                      </Button>
                    )}
                  </div>

                  {profile.username && (
                    <p className="text-sm text-muted-foreground mb-2">
                      @{profile.username}
                    </p>
                  )}

                  {/* Follower/Following counts */}
                  <div className="flex gap-4 mb-3 text-sm">
                    <span>
                      <span className="font-semibold">{profile.followers_count || 0}</span>{" "}
                      <span className="text-muted-foreground">Followers</span>
                    </span>
                    <span>
                      <span className="font-semibold">{profile.following_count || 0}</span>{" "}
                      <span className="text-muted-foreground">Following</span>
                    </span>
                  </div>

                  {profile.bio && (
                    <p className="text-sm mb-3">{profile.bio}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {profile.gender && (
                      <Badge variant="secondary">{profile.gender}</Badge>
                    )}
                    {profile.age && (
                      <Badge variant="secondary">{profile.age} years old</Badge>
                    )}
                    <Badge variant="outline">
                      Joined <FormattedDate date={profile.created_at} format="date" />
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Post Composer (owner only) */}
          {isOwner && (
            <Card className="mb-6">
              <CardContent className="pt-4">
                <Textarea
                  placeholder="What's on your mind?"
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  className="mb-3 min-h-[80px]"
                />

                {newPostMedia.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {newPostMedia.map((url, i) => (
                      <div key={i} className="relative w-20 h-20">
                        <img
                          src={url}
                          alt=""
                          className="w-full h-full object-cover rounded"
                        />
                        <button
                          onClick={() => setNewPostMedia(newPostMedia.filter((_, j) => j !== i))}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Visibility Toggle */}
                <div className="flex items-center gap-2 mb-3 p-3 bg-muted/50 rounded-md">
                  <Switch
                    checked={postVisibility === "public"}
                    onCheckedChange={(checked) => setPostVisibility(checked ? "public" : "profile_only")}
                    id="post-visibility"
                  />
                  <Label htmlFor="post-visibility" className="cursor-pointer">
                    <span className="font-medium">
                      {postVisibility === "public" ? "🌎 Public" : "👤 Profile Only"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {postVisibility === "public" 
                        ? "Post will appear in Community feed" 
                        : "Only visible on your profile"}
                    </span>
                  </Label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? "Uploading..." : "Add Images"}
                    </Button>
                  </div>
                  <Button
                    onClick={handleCreatePost}
                    disabled={creatingPost || !newPostContent.trim()}
                  >
                    {creatingPost ? "Posting..." : "Post"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs (only show for owner) */}
          {isOwner && (
            <div className="flex gap-2 mb-6">
              <Button
                variant={activeTab === "posts" ? "default" : "outline"}
                onClick={() => setActiveTab("posts")}
                className={activeTab === "posts" ? "bg-blue-600 text-white hover:bg-blue-700" : "text-white border-gray-700 hover:bg-blue-900/30"}
              >
                My Posts
              </Button>
              <Button
                variant={activeTab === "saved" ? "default" : "outline"}
                onClick={() => setActiveTab("saved")}
                className={activeTab === "saved" ? "bg-blue-600 text-white hover:bg-blue-700" : "text-white border-gray-700 hover:bg-blue-900/30"}
              >
                Saved Posts
              </Button>
            </div>
          )}

          {/* Posts Feed */}
          {activeTab === "posts" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Posts</h2>

              {posts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">
                    {isOwner ? "You haven't posted anything yet." : "No posts yet."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id}>
                  <CardContent className="pt-4">
                    {/* Post Header with Delete */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        {/* Post Content */}
                        <p className="whitespace-pre-wrap">{post.content}</p>
                      </div>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive -mt-1 -mr-2"
                          onClick={() => handleDeletePost(post.id)}
                        >
                          ×
                        </Button>
                      )}
                    </div>

                    {/* Post Media */}
                    {post.profile_post_media && post.profile_post_media.length > 0 && (
                      <div className={`grid gap-2 mb-3 ${
                        post.profile_post_media.length === 1
                          ? "grid-cols-1"
                          : post.profile_post_media.length === 2
                          ? "grid-cols-2"
                          : "grid-cols-3"
                      }`}>
                        {post.profile_post_media.map((media) => (
                          <img
                            key={media.id}
                            src={media.media_url}
                            alt=""
                            className="w-full h-48 object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setLightboxImage(media.media_url)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Post Meta with Like Button */}
                    <div className="flex items-center gap-4 mb-3">
                      <button
                        onClick={() => handleLikePost(post.id, post.isLiked)}
                        className={`flex items-center gap-1 text-sm transition-colors ${
                          post.isLiked 
                            ? "text-pink-500 hover:text-pink-600" 
                            : "text-muted-foreground hover:text-pink-500"
                        }`}
                      >
                        {post.isLiked ? <HeartFilledIcon className="w-4 h-4" /> : <HeartIcon className="w-4 h-4" />}
                        <span>{post.likesCount || 0}</span>
                      </button>
                      <p className="text-xs text-muted-foreground">
                        <FormattedDate date={post.created_at} format="datetime" /> · {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
                      </p>
                    </div>

                    {/* Replies */}
                    {post.replies.length > 0 && (
                      <div className="border-t pt-3 space-y-3">
                        {post.replies.map((reply) => (
                          <div key={reply.id} className="flex gap-2">
                            <UserAvatar
                              url={reply.author?.avatar_url}
                              name={reply.author?.display_name || "User"}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/u/${reply.author?.id}`}
                                  className="text-sm font-medium hover:underline"
                                >
                                  {reply.author?.display_name || "User"}
                                </Link>
                                <FormattedDate date={reply.created_at} format="datetime" className="text-xs text-muted-foreground" />
                              </div>
                              <p className="text-sm">{reply.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Input */}
                    {currentUserId && (
                      <div className="border-t pt-3 mt-3 flex gap-2">
                        <Input
                          placeholder="Write a reply..."
                          value={replyInputs[post.id] || ""}
                          onChange={(e) => setReplyInputs({ ...replyInputs, [post.id]: e.target.value })}
                          className="flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleReply(post.id);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleReply(post.id)}
                          disabled={submittingReply === post.id || !replyInputs[post.id]?.trim()}
                        >
                          {submittingReply === post.id ? "..." : "Reply"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
            </div>
          )}

          {/* Saved Posts Feed */}
          {activeTab === "saved" && isOwner && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Saved Posts</h2>

              {loadingSavedPosts ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">Loading saved posts...</p>
                  </CardContent>
                </Card>
              ) : savedPosts.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">
                      You haven't saved any posts yet. Save posts from the community to see them here!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                savedPosts.map((post) => (
                  <Card key={post.id} className="cursor-pointer hover:border-blue-800 transition-colors">
                    <CardContent className="pt-4">
                      {/* Author Info */}
                      <div className="flex items-center gap-2 mb-3">
                        <Link href={`/u/${post.author.id}`} onClick={(e) => e.stopPropagation()}>
                          <UserAvatar
                            url={post.author.avatar_url}
                            name={post.author.display_name}
                            size="sm"
                          />
                        </Link>
                        <div>
                          <Link
                            href={`/u/${post.author.id}`}
                            className="text-sm font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {post.author.display_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            <FormattedDate date={post.created_at} format="datetime" />
                          </p>
                        </div>
                      </div>

                      {/* Post Title */}
                      <Link href={`/community/${post.id}`}>
                        <h3 className="text-lg font-semibold mb-2 hover:text-blue-400 transition-colors">
                          {post.title}
                        </h3>
                      </Link>

                      {/* Post Body Preview */}
                      <Link href={`/community/${post.id}`}>
                        <p className="text-muted-foreground mb-3 line-clamp-3">
                          {post.body}
                        </p>
                      </Link>

                      {/* Post Images */}
                      {post.post_media && post.post_media.length > 0 && (
                        <Link href={`/community/${post.id}`}>
                          <div className={`grid gap-2 mb-3 ${
                            post.post_media.length === 1
                              ? "grid-cols-1"
                              : post.post_media.length === 2
                              ? "grid-cols-2"
                              : "grid-cols-3"
                          }`}>
                            {post.post_media.slice(0, 3).map((media) => (
                              <img
                                key={media.id}
                                src={media.media_url}
                                alt=""
                                className="w-full h-32 object-contain bg-white rounded hover:opacity-90 transition-opacity"
                              />
                            ))}
                          </div>
                        </Link>
                      )}

                      {/* Post Meta */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {post.isLiked ? (
                            <HeartFilledIcon className="w-4 h-4 text-pink-500" />
                          ) : (
                            <HeartIcon className="w-4 h-4" />
                          )} {post.likes_count}
                        </span>
                        <span>💬 {post.comments_count}</span>
                        <Link
                          href={`/community/${post.id}`}
                          className="text-blue-400 hover:text-blue-300 ml-auto"
                        >
                          Read more →
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent onClose={() => setEditDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={editForm.display_name}
                onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={editForm.bio}
                onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                placeholder="Tell us about yourself..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Input
                  id="gender"
                  value={editForm.gender}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  placeholder="Optional"
                  maxLength={32}
                />
              </div>
              <div>
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={editForm.age}
                  onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                  placeholder="Optional"
                  min={1}
                  max={119}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveProfile} disabled={saving || !editForm.display_name.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-50"
            onClick={() => setLightboxImage(null)}
          >
            ×
          </button>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default function UserProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  return (
    <AuthGuard>
      <ProfileContent userId={params.userId} />
    </AuthGuard>
  );
}
