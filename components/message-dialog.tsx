"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { getBearerToken } from "@/lib/api/clientAuth";
import { createClient } from "@/lib/supabase/browser";
import { FormattedDate } from "./formatted-date";
import { ImageIcon, Cross2Icon } from "@radix-ui/react-icons";

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  image_url?: string;
  read: boolean;
  created_at: string;
}

interface MessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string;
  currentUserId: string;
}

function UserAvatar({ url, name, size = "md" }: { url?: string; name: string; size?: "sm" | "md" }) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
  };

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0`}
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
    <span className={`${sizeClasses[size]} rounded-full bg-primary/10 text-primary inline-flex items-center justify-center font-medium flex-shrink-0`}>
      {initials || "?"}
    </span>
  );
}

export function MessageDialog({
  open,
  onOpenChange,
  recipientId,
  recipientName,
  recipientAvatar,
  currentUserId,
}: MessageDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && recipientId) {
      loadMessages();
    }
  }, [open, recipientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/messages/conversation?user_id=${recipientId}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const fileName = `${currentUserId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      const { data, error: uploadError } = await supabase.storage
        .from("post-media")
        .upload(fileName, file);

      if (uploadError) {
        alert("Failed to upload image");
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("post-media")
        .getPublicUrl(data.path);

      setImageUrl(publicUrl);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !imageUrl) || !recipientId) return;

    setSending(true);
    const contentToSend = newMessage.trim() || "[Image]";
    const imageToSend = imageUrl;
    setNewMessage("");
    setImageUrl(null);

    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: bearer } : {}),
        },
        body: JSON.stringify({
          recipient_id: recipientId,
          content: contentToSend,
          image_url: imageToSend,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, data.message]);
      } else {
        setNewMessage(contentToSend === "[Image]" ? "" : contentToSend);
        setImageUrl(imageToSend);
        const error = await response.json();
        alert(error.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(contentToSend === "[Image]" ? "" : contentToSend);
      setImageUrl(imageToSend);
      alert("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[600px] p-0 flex flex-col bg-background" onClose={() => onOpenChange(false)}>
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3 flex-shrink-0">
          <UserAvatar url={recipientAvatar} name={recipientName} size="md" />
          <div className="flex-1">
            <h3 className="font-semibold">{recipientName}</h3>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}
                >
                  {!isMe && (
                    <UserAvatar
                      url={recipientAvatar}
                      name={recipientName}
                      size="sm"
                    />
                  )}
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                      isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border"
                    }`}
                  >
                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        alt="Shared image"
                        className="max-w-full rounded mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ maxHeight: "300px" }}
                        onClick={() => window.open(msg.image_url, "_blank")}
                      />
                    )}
                    {msg.content && msg.content !== "[Image]" && (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    )}
                    <p className={`text-xs mt-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      <FormattedDate date={msg.created_at} format="time" />
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t flex-shrink-0 bg-background">
          {imageUrl && (
            <div className="mb-3 relative inline-block">
              <img
                src={imageUrl}
                alt="Upload preview"
                className="w-32 h-32 object-cover rounded"
              />
              <button
                onClick={() => setImageUrl(null)}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center"
              >
                <Cross2Icon className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage || sending || !!imageUrl}
              className="flex-shrink-0"
            >
              <ImageIcon className="w-5 h-5" />
            </Button>
            <Input
              placeholder="Message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={sending || (!newMessage.trim() && !imageUrl)}
              size="sm"
            >
              {sending ? "..." : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
