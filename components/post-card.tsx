"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { createClient } from "@/lib/supabase/browser";
import { FormattedDate } from "./formatted-date";
import { UploadIcon, BookmarkIcon, BookmarkFilledIcon, HeartIcon, HeartFilledIcon, ChatBubbleIcon } from "@radix-ui/react-icons";

interface PostCardProps {
  post: {
    id: string;
    user_id: string;
    profiles?: { username?: string; display_name?: string; avatar_url?: string } | null;
    title: string;
    body: string;
    created_at: string;
    likes_count?: number;
    post_media?: { id: string; media_url: string }[];
    source?: string; // "posts" or "profile_posts"
    original_id?: string; // Original ID for profile posts
  };
  commentCount: number;
  currentUserId: string | null;
  initialIsLiked?: boolean;
  initialIsSaved?: boolean;
  onSaveToggle?: () => void;
  onLikeUpdate?: (postId: string, newLikesCount: number) => void;
}

function UserAvatar({ url, name }: { url?: string; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
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
    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center text-xs font-medium flex-shrink-0">
      {initials || "?"}
    </span>
  );
}

export function PostCard({ post, commentCount, currentUserId, initialIsLiked = false, initialIsSaved = false, onSaveToggle, onLikeUpdate }: PostCardProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Get user ID from client-side as well (more reliable)
  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setClientUserId(session?.user?.id || null);
      console.log("Client-side user ID:", session?.user?.id || "null");
    };
    checkUser();
  }, []);

  // Use client-side user ID if available, otherwise fall back to server-provided one
  const effectiveUserId = clientUserId || currentUserId;
  const isOwner = effectiveUserId === post.user_id;
  
  // Debug logging - check if IDs match
  console.log("PostCard render:", {
    postId: post.id,
    postTitle: post.title,
    postUserId: post.user_id,
    currentUserId,
    clientUserId,
    effectiveUserId,
    isOwner,
    idsMatch: effectiveUserId === post.user_id,
  });

  const handleLike = async () => {
    if (!effectiveUserId) {
      alert("Please sign in to like posts");
      return;
    }

    // Optimistic update
    const wasLiked = isLiked;
    const newLikesCount = wasLiked ? Math.max(0, likesCount - 1) : likesCount + 1;
    setIsLiked(!wasLiked);
    setLikesCount(newLikesCount);
    
    // Notify parent component of the change
    if (onLikeUpdate) {
      onLikeUpdate(post.id, newLikesCount);
    }

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        // Revert
        setIsLiked(wasLiked);
        setLikesCount(likesCount);
        if (onLikeUpdate) {
          onLikeUpdate(post.id, likesCount);
        }
        return;
      }

      // Use the correct API endpoint based on post source
      const apiEndpoint = post.source === "profile_posts"
        ? `/api/profile-posts/${post.original_id}/like`
        : `/api/posts/${post.id}/like`;
      
      const response = await fetch(apiEndpoint, {
        method: wasLiked ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setIsLiked(wasLiked);
        setLikesCount(likesCount);
        if (onLikeUpdate) {
          onLikeUpdate(post.id, likesCount);
        }
      }
    } catch (err) {
      console.error("Error toggling like:", err);
      // Revert optimistic update
      setIsLiked(wasLiked);
      setLikesCount(likesCount);
      if (onLikeUpdate) {
        onLikeUpdate(post.id, likesCount);
      }
    }
  };

  const handleSave = async () => {
    if (!effectiveUserId) {
      alert("Please sign in to save posts");
      return;
    }

    // Optimistic update - instant UI feedback
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);

    try {
      const supabase = createClient();
      
      if (!wasSaved) {
        // Save post
        const { error } = await supabase
          .from("saved_posts")
          .insert({ user_id: effectiveUserId, post_id: post.id });

        if (error) {
          console.error("Error saving post:", error);
          setIsSaved(wasSaved); // Revert on error
        }
        // Don't reload the page - optimistic update is enough
      } else {
        // Unsave post
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("user_id", effectiveUserId)
          .eq("post_id", post.id);

        if (error) {
          console.error("Error unsaving post:", error);
          setIsSaved(wasSaved); // Revert on error
        }
        // Don't reload the page - optimistic update is enough
      }
    } catch (err) {
      console.error("Error toggling save:", err);
      setIsSaved(wasSaved); // Revert on error
    }
  };

  const handleShare = () => {
    setShareDialogOpen(true);
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/community/${post.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user || session.user.id !== post.user_id) {
        setError("You don't have permission to delete this post");
        setDeleting(false);
        return;
      }

      // Use API endpoint for profile_posts, direct supabase for regular posts
      if (post.source === "profile_posts") {
        // Profile posts use the API endpoint with original_id
        const response = await fetch(`/api/profile-posts/${post.original_id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const data = await response.json();
          console.error("Delete error:", data);
          setError(data.error || "Failed to delete post");
          setDeleting(false);
          return;
        }
      } else {
        // Regular posts use direct supabase delete
        const { error: deleteError } = await supabase
          .from("posts")
          .delete()
          .eq("id", post.id)
          .eq("user_id", session.user.id);

        if (deleteError) {
          console.error("Delete error:", deleteError);
          setError(deleteError.message || "Failed to delete post");
          setDeleting(false);
          return;
        }
      }

      // Success - refresh the page
      setDeleteDialogOpen(false);
      window.location.href = "/community?t=" + Date.now();
    } catch (err: any) {
      console.error("Delete error:", err);
      setError(err.message || "An unexpected error occurred");
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="hover:shadow-sm transition-shadow relative">
        <CardContent className="pt-4">
          {/* Author Info at Top (Twitter-style) */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <Link
              href={`/u/${post.user_id}`}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <UserAvatar
                url={post.profiles?.avatar_url}
                name={post.profiles?.display_name || post.profiles?.username || "User"}
              />
              <div className="flex flex-col">
                <span className="font-semibold text-sm text-foreground">
                  {post.profiles?.display_name || post.profiles?.username || `user_${post.user_id.substring(0, 8)}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  <FormattedDate date={post.created_at} />
                </span>
              </div>
            </Link>
            {isOwner && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
              >
                Delete
              </Button>
            )}
          </div>

          {/* Post Body (no title, just content) */}
          <Link 
            href={`/community/${post.id}`}
            className="block cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <p className="text-sm leading-relaxed mb-4 whitespace-pre-wrap">
              {post.body}
            </p>
          </Link>
          
          {/* Post Images */}
          {post.post_media && post.post_media.length > 0 && (
            <div className={`grid gap-2 mb-4 ${
              post.post_media.length === 1
                ? "grid-cols-1"
                : post.post_media.length === 2
                ? "grid-cols-2"
                : "grid-cols-3"
            }`}>
              {post.post_media.map((media) => (
                <img
                  key={media.id}
                  src={media.media_url}
                  alt=""
                  className="w-full h-48 object-contain bg-white rounded cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLightboxImage(media.media_url);
                  }}
                />
              ))}
            </div>
          )}

          {/* Actions at Bottom */}
          <div className="flex items-center gap-4 pt-2 border-t">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLike();
              }}
              className={`flex items-center gap-1 text-sm transition-colors ${
                isLiked 
                  ? "text-pink-500 hover:text-pink-600" 
                  : "text-muted-foreground hover:text-pink-500"
              }`}
              title={isLiked ? "Unlike" : "Like"}
            >
              {isLiked ? <HeartFilledIcon className="w-4 h-4" /> : <HeartIcon className="w-4 h-4" />}
              <span>{likesCount}</span>
            </button>
            
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Navigate to appropriate detail page based on post source
                if (post.source === "profile_posts") {
                  router.push(`/u/${post.user_id}`); // Profile posts go to user profile
                } else {
                  router.push(`/community/${post.id}`); // Regular posts go to post detail
                }
              }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue-500 transition-colors"
              title="View comments"
            >
              <ChatBubbleIcon className="w-4 h-4" />
              <span>{commentCount}</span>
            </button>
            
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              className={`flex items-center gap-1 text-sm transition-colors ${
                isSaved 
                  ? "text-blue-500 hover:text-blue-600" 
                  : "text-muted-foreground hover:text-blue-500"
              }`}
              title={isSaved ? "Unsave" : "Save"}
            >
              {isSaved ? <BookmarkFilledIcon className="w-4 h-4" /> : <BookmarkIcon className="w-4 h-4" />}
            </button>
            
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleShare();
              }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-blue-500 transition-colors"
              title="Share"
            >
              <UploadIcon className="w-4 h-4" />
            </button>
            
            <Button
              variant="link"
              className="p-0 h-auto text-sm ml-auto"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Navigating to post:", post.id);
                // Navigate to appropriate detail page based on post source
                if (post.source === "profile_posts") {
                  router.push(`/u/${post.user_id}`); // Profile posts go to user profile
                } else {
                  router.push(`/community/${post.id}`); // Regular posts go to post detail
                }
              }}
            >
              Read more →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent onClose={() => setDeleteDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
              All comments on this post will also be deleted.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setError(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Post</DialogTitle>
            <DialogDescription>
              Share this post with others
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/community/${post.id}`}
                className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
              />
              <Button onClick={copyShareLink} variant="outline" size="sm">
                {copiedLink ? "Copied!" : "Copy"}
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
    </>
  );
}
