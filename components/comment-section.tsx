"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardHeader } from "./ui/card";
import { createClient } from "@/lib/supabase/browser";
import { FormattedDate } from "./formatted-date";

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

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  profiles?: { username: string; display_name?: string; avatar_url?: string } | null;
}

interface CommentSectionProps {
  postId: string;
  comments: Comment[];
}

interface CommentItemProps {
  comment: Comment;
  replies: Comment[];
  onReply: (parentId: string, body: string) => Promise<void>;
  currentUserId: string | null;
}

function CommentItem({ comment, replies, onReply, currentUserId }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    setReplying(true);
    setReplyError(null);

    try {
      await onReply(comment.id, replyBody.trim());
      setReplyBody("");
      setShowReplyForm(false);
    } catch (err: any) {
      setReplyError(err.message || "Failed to post reply");
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="border-l-4 border-l-primary/20">
        <CardHeader className="pb-3">
          <CardDescription className="text-sm flex items-center gap-2">
            <Link
              href={`/u/${comment.user_id}`}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <UserAvatar
                url={comment.profiles?.avatar_url}
                name={comment.profiles?.display_name || comment.profiles?.username || "User"}
              />
              <span className="font-semibold text-foreground hover:underline">
                {comment.profiles?.display_name || comment.profiles?.username || `user_${comment.user_id.substring(0, 8)}`}
              </span>
            </Link>
            <span>•</span>
            <FormattedDate date={comment.created_at} />
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground mb-3">
            {comment.body}
          </div>
          {currentUserId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              {showReplyForm ? "Cancel" : "Reply"}
            </Button>
          )}
        </CardContent>
      </Card>

      {showReplyForm && (
        <Card className="ml-6 border-l-2 border-l-muted">
          <CardContent className="pt-4">
            <form onSubmit={handleReplySubmit} className="space-y-3">
              {replyError && (
                <div className="p-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  {replyError}
                </div>
              )}
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={`Reply to ${comment.profiles?.username || `user_${comment.user_id.substring(0, 8)}`}...`}
                rows={3}
                required
                className="resize-none text-sm"
              />
              <Button type="submit" disabled={replying} size="sm">
                {replying ? "Posting..." : "Post Reply"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {replies.length > 0 && (
        <div className="ml-6 space-y-3 border-l-2 border-l-muted pl-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]}
              onReply={onReply}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentSection({ postId, comments: initialComments }: CommentSectionProps) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Organize comments into a tree structure
  const topLevelComments = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent = comments.reduce((acc, comment) => {
    if (comment.parent_comment_id) {
      if (!acc[comment.parent_comment_id]) {
        acc[comment.parent_comment_id] = [];
      }
      acc[comment.parent_comment_id].push(comment);
    }
    return acc;
  }, {} as Record<string, Comment[]>);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      setError("You must be signed in");
      setLoading(false);
      return;
    }

    const { data: newComment, error: insertError } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        body: body.trim(),
        user_id: session.user.id,
        parent_comment_id: null,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Comment insert error:", insertError);
      setError(insertError.message || "Failed to post comment");
      setLoading(false);
    } else if (newComment) {
      // Fetch profile for the new comment
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", session.user.id)
        .single();

      const commentWithProfile: Comment = {
        ...newComment,
        parent_comment_id: null,
        profiles: profileData ? {
          username: profileData.username,
          display_name: profileData.display_name,
          avatar_url: profileData.avatar_url
        } : null
      };
      
      setComments([...comments, commentWithProfile]);
      setBody("");
      setError(null);
      setLoading(false);
    } else {
      setError("Comment posted but no data returned");
      setLoading(false);
    }
  };

  const handleReply = async (parentId: string, replyBody: string) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      throw new Error("You must be signed in");
    }

    const { data: newReply, error: insertError } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        body: replyBody,
        user_id: session.user.id,
        parent_comment_id: parentId,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Reply insert error:", insertError);
      // Check if it's a schema error
      if (insertError.message?.includes("parent_comment_id") || insertError.message?.includes("schema cache")) {
        throw new Error("Database migration required. Please run the SQL migration in Supabase: ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;");
      }
      throw new Error(insertError.message || "Failed to post reply");
    }

    if (newReply) {
      // Fetch profile for the new reply
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", session.user.id)
        .single();

      const replyWithProfile: Comment = {
        ...newReply,
        parent_comment_id: parentId,
        profiles: profileData ? {
          username: profileData.username,
          display_name: profileData.display_name,
          avatar_url: profileData.avatar_url
        } : null
      };
      
      setComments([...comments, replyWithProfile]);
    } else {
      throw new Error("Reply posted but no data returned");
    }
  };

  // Count total comments including replies
  const totalCommentCount = comments.length;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">
        Comments ({totalCommentCount})
      </h2>

      <Card className="mb-8">
        <CardHeader className="pb-4">
          <CardDescription className="text-base">Add a comment</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {error}
              </div>
            )}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your comment..."
              rows={5}
              required
              className="resize-none"
            />
            <Button type="submit" disabled={loading} size="lg">
              {loading ? "Posting..." : "Post Comment"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {topLevelComments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No comments yet.</p>
            <p className="text-sm text-muted-foreground">Be the first to comment!</p>
          </div>
        ) : (
          topLevelComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesByParent[comment.id] || []}
              onReply={handleReply}
              currentUserId={currentUserId}
            />
          ))
        )}
      </div>
    </div>
  );
}
