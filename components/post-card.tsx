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
  };
  commentCount: number;
  currentUserId: string | null;
  initialIsLiked?: boolean;
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

export function PostCard({ post, commentCount, currentUserId, initialIsLiked = false }: PostCardProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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
    setIsLiked(!wasLiked);
    setLikesCount(prev => wasLiked ? Math.max(0, prev - 1) : prev + 1);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        // Revert
        setIsLiked(wasLiked);
        setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
        return;
      }

      const response = await fetch(`/api/posts/${post.id}/like`, {
        method: wasLiked ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setIsLiked(wasLiked);
        setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Error toggling like:", err);
      // Revert optimistic update
      setIsLiked(wasLiked);
      setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
    }
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

      const { error: deleteError } = await supabase
        .from("posts")
        .delete()
        .eq("id", post.id)
        .eq("user_id", session.user.id); // Double-check ownership

      if (deleteError) {
        console.error("Delete error:", deleteError);
        setError(deleteError.message || "Failed to delete post");
        setDeleting(false);
      } else {
        // Success - refresh the page
        setDeleteDialogOpen(false);
        window.location.href = "/community?t=" + Date.now();
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      setError(err.message || "An unexpected error occurred");
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="hover:shadow-sm transition-shadow relative">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link 
                href={`/community/${post.id}`}
                className="block"
                onClick={(e) => {
                  // Allow navigation
                  e.stopPropagation();
                }}
              >
                <CardTitle className="text-lg mb-2 hover:text-primary cursor-pointer transition-colors">
                  {post.title}
                </CardTitle>
              </Link>
              <CardDescription className="text-sm flex items-center gap-2">
                <Link
                  href={`/u/${post.user_id}`}
                  className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <UserAvatar
                    url={post.profiles?.avatar_url}
                    name={post.profiles?.display_name || post.profiles?.username || "User"}
                  />
                  <span className="font-medium text-foreground hover:underline">
                    {post.profiles?.display_name || post.profiles?.username || `user_${post.user_id.substring(0, 8)}`}
                  </span>
                </Link>
                <span>•</span>
                <FormattedDate date={post.created_at} />
              </CardDescription>
            </div>
            <Badge variant="outline" className="flex-shrink-0">
              {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed mb-4">
            {post.body}
          </p>
          
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
                  className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLightboxImage(media.media_url);
                  }}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleLike();
                }}
                className={`flex items-center gap-1 text-sm transition-colors ${
                  isLiked 
                    ? "text-red-500 hover:text-red-600" 
                    : "text-muted-foreground hover:text-red-500"
                }`}
              >
                <span>{isLiked ? "❤️" : "🤍"}</span>
                <span>{likesCount}</span>
              </button>
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Navigating to post:", post.id);
                  router.push(`/community/${post.id}`);
                }}
              >
                Read more →
              </Button>
            </div>
            {isOwner && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
