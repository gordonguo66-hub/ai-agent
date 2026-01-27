"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentSection } from "@/components/comment-section";
import { AuthGuard } from "@/components/auth-guard";
import { FormattedDate } from "@/components/formatted-date";

function UserAvatar({ url, name }: { url?: string; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
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
    <span className="w-8 h-8 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center text-sm font-medium flex-shrink-0">
      {initials || "?"}
    </span>
  );
}

function PostDetailContent({ postId }: { postId: string }) {
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [media, setMedia] = useState<{ id: string; media_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      const supabase = createClient();

      // Fetch post first
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (postError || !postData) {
        console.error("Error loading post:", postError);
        router.push("/community");
        return;
      }

      // Fetch profile for the post author
      let postWithProfile = postData;
      if (postData.user_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", postData.user_id)
          .single();

        postWithProfile = {
          ...postData,
          profiles: profileData ? {
            username: profileData.username,
            display_name: profileData.display_name,
            avatar_url: profileData.avatar_url,
          } : null
        };
      }

      // Fetch media for the post
      try {
        const { data: mediaData, error: mediaError } = await supabase
          .from("post_media")
          .select("id, media_url")
          .eq("post_id", postId);

        if (!mediaError && mediaData) {
          setMedia(mediaData);
        }
      } catch {
        // post_media table might not exist
      }

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      
      if (commentsError) {
        console.error("Error loading comments:", commentsError);
      }

      // Fetch profiles for all comment authors
      let commentsWithProfiles = (commentsData || []).map((c: any) => ({
        ...c,
        parent_comment_id: c.parent_comment_id || null,
        profiles: null
      }));

      if (commentsWithProfiles.length > 0) {
        const userIds = [...new Set(commentsWithProfiles.map(c => c.user_id))];
        const { data: commentProfiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);

        const profilesMap = new Map((commentProfiles || []).map(p => [p.id, p]));
        commentsWithProfiles = commentsWithProfiles.map(comment => ({
          ...comment,
          profiles: profilesMap.get(comment.user_id) ? {
            username: profilesMap.get(comment.user_id)?.username || '',
            display_name: profilesMap.get(comment.user_id)?.display_name || '',
            avatar_url: profilesMap.get(comment.user_id)?.avatar_url || null,
          } : null
        }));
      }

      setPost(postWithProfile);
      setComments(commentsWithProfiles);
      setLoading(false);
    };

    loadPost();
  }, [postId, router]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!post) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link href="/community">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-blue-900/30">← Back to Community</Button>
            </Link>
          </div>

          <Card className="mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl mb-3">{post.title}</CardTitle>
              <CardDescription className="text-sm flex items-center gap-2">
                <Link
                  href={`/u/${post.user_id}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
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
            </CardHeader>
            <CardContent className="pt-0">
              <div className="whitespace-pre-wrap text-base leading-relaxed text-foreground mb-4">
                {post.body}
              </div>

              {/* Post Images */}
              {media.length > 0 && (
                <div className={`grid gap-3 ${
                  media.length === 1
                    ? "grid-cols-1"
                    : media.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 md:grid-cols-3"
                }`}>
                  {media.map((m) => (
                    <img
                      key={m.id}
                      src={m.media_url}
                      alt=""
                      className="w-full h-64 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxImage(m.media_url)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <CommentSection postId={postId} comments={comments} />
        </div>
      </div>

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

export default function PostDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGuard>
      <PostDetailContent postId={params.id} />
    </AuthGuard>
  );
}
