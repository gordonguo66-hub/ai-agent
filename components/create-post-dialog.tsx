"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { createClient } from "@/lib/supabase/browser";

export function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("📷 Starting image upload:", file.name, file.type, file.size);

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }

    setUploadingImage(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setError("You must be signed in to upload images");
        setUploadingImage(false);
        return;
      }

      // Generate unique filename
      const ext = file.name.split(".").pop();
      const fileName = `${session.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      console.log("📷 Uploading to path:", fileName);

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from("post-media")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      console.log("📷 Upload result:", { data, uploadError });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        // Check for specific error types
        if (uploadError.message?.includes("Bucket not found")) {
          setError("Storage not configured. Please create 'post-media' bucket in Supabase Storage.");
        } else if (uploadError.message?.includes("not allowed")) {
          setError("Upload not allowed. Please check storage permissions.");
        } else {
          setError(`Failed to upload image: ${uploadError.message || "Unknown error"}`);
        }
        setUploadingImage(false);
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("post-media")
        .getPublicUrl(data.path);

      console.log("📷 Public URL:", publicUrl);
      setImages(prev => [...prev, publicUrl]);
    } catch (err: any) {
      console.error("Image upload error:", err);
      setError(`Failed to upload image: ${err.message}`);
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const trimmedBody = body.trim();
    
    console.log("Form submitted", { body: trimmedBody, images });
    
    if (!trimmedBody) {
      setError("Please write something");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Session error:", sessionError);
        setError("Authentication error. Please try signing out and back in.");
        setLoading(false);
        return;
      }

      if (!session?.user) {
        setError("You must be signed in");
        setLoading(false);
        return;
      }

      // Auto-generate title from first 100 chars of body (for database, not shown to user)
      const autoTitle = trimmedBody.substring(0, 100) + (trimmedBody.length > 100 ? "..." : "");

      // Create the post
      const { data, error: insertError } = await supabase
        .from("posts")
        .insert({
          title: autoTitle,
          body: trimmedBody,
          user_id: session.user.id,
        })
        .select();

      if (insertError) {
        console.error("Post insert error:", insertError);
        setError(insertError.message || "Failed to create post. Please try again.");
        setLoading(false);
        return;
      }
      
      if (!data || data.length === 0) {
        console.error("No data returned from insert");
        setError("Post created but no data returned. Please refresh the page.");
        setLoading(false);
        return;
      }

      const postId = data[0].id;

      // Insert media if any
      if (images.length > 0) {
        console.log("📷 Saving", images.length, "images to post_media for post:", postId);
        const mediaInserts = images.map(url => ({
          post_id: postId,
          media_url: url,
        }));
        console.log("📷 Media inserts:", mediaInserts);

        try {
          const { data: mediaData, error: mediaError } = await supabase
            .from("post_media")
            .insert(mediaInserts)
            .select();

          console.log("📷 Media insert result:", { mediaData, mediaError });

          if (mediaError) {
            console.error("Media insert error:", mediaError);
            // Show error to user but don't fail the post
            alert(`Post created but images failed to save: ${mediaError.message}\n\nPlease run the community_images_setup.sql migration.`);
          } else {
            console.log("📷 Media saved successfully:", mediaData);
          }
        } catch (err: any) {
          console.error("Media insert failed:", err);
          alert(`Post created but images failed to save: ${err.message}\n\nPlease run the community_images_setup.sql migration.`);
        }
      } else {
        console.log("📷 No images to save");
      }

      // Success - show notification, then close and refresh
      console.log("Post created successfully!", data[0]);
      setSuccess(true);
      setLoading(false);
      
      // Wait 1.5 seconds to show success message, then redirect
      setTimeout(() => {
        setOpen(false);
        setBody("");
        setImages([]);
        setError(null);
        setSuccess(false);
        window.location.href = "/community?t=" + Date.now();
      }, 1500);
    } catch (err: any) {
      console.error("Post creation error:", err);
      setError(err.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setBody("");
    setImages([]);
    setError(null);
  };

  return (
    <>
      <Button onClick={() => {
        setOpen(true);
        setError(null);
      }}>Create Post</Button>
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
        else setOpen(true);
      }}>
        <DialogContent onClose={handleClose}>
          <DialogHeader>
            <DialogTitle>Create Post</DialogTitle>
            <DialogDescription>
              Share your thoughts with the community
            </DialogDescription>
          </DialogHeader>
          <form 
            onSubmit={handleSubmit} 
            className="space-y-4"
            noValidate
          >
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                <strong>Error:</strong> {error}
              </div>
            )}
            {success && (
              <div className="p-4 text-sm text-emerald-300 bg-emerald-900/30 border border-emerald-700 rounded-md animate-in fade-in slide-in-from-top-2 duration-300">
                <strong>Success!</strong> Your post has been published to the Community.
              </div>
            )}
            {loading && !success && (
              <div className="p-3 text-sm text-muted-foreground bg-muted/50 rounded-md">
                Posting your message...
              </div>
            )}
            <div>
              <label htmlFor="body" className="text-sm font-medium">
                What's on your mind?
              </label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                required
                minLength={1}
                maxLength={5000}
                className="mt-1"
                placeholder="Share your thoughts..."
                disabled={loading || success}
              />
            </div>

            {/* Image Upload Section */}
            <div>
              <label className="text-sm font-medium">Images (optional)</label>
              <div className="mt-1 space-y-2">
                {/* Image Previews */}
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {images.map((url, index) => (
                      <div key={index} className="relative">
                        <img
                          src={url}
                          alt={`Upload ${index + 1}`}
                          className="w-20 h-20 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs disabled:opacity-50"
                          disabled={loading || success}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={loading || uploadingImage || success}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || uploadingImage || images.length >= 4 || success}
                >
                  {uploadingImage ? "Uploading..." : "Add Image"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Max 4 images, 5MB each
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button 
                type="submit" 
                disabled={loading || uploadingImage || !body.trim() || success} 
                className="flex-1"
              >
                {success ? "Posted!" : loading ? "Posting..." : "Post"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading || success}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
