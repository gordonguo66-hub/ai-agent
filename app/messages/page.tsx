"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuthGuard } from "@/components/auth-guard";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { createClient } from "@/lib/supabase/browser";
import { ImageIcon, Cross2Icon } from "@radix-ui/react-icons";

interface Conversation {
  userId: string;
  profile: {
    id: string;
    display_name: string;
    username?: string;
    avatar_url?: string;
  } | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  image_url?: string;
  read: boolean;
  created_at: string;
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

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get("user");
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadConversation(selectedUserId);
    }
  }, [selectedUserId]);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/messages", {
        headers: bearer ? { Authorization: bearer } : undefined,
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
        
        // Get current user ID from JWT
        if (bearer) {
          const parts = bearer.replace('Bearer ', '').split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            setCurrentUserId(payload.sub || null);
          }
        }
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversation = async (userId: string) => {
    setLoadingMessages(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/messages/conversation?user_id=${userId}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setSelectedUser(data.otherUser);
        
        // Refresh conversation list to update unread counts
        loadConversations();
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    } finally {
      setLoadingMessages(false);
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

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !imageUrl) || !selectedUserId) return;

    setSending(true);
    const contentToSend = newMessage.trim() || "[Image]";
    const imageToSend = imageUrl;
    setNewMessage(""); // Clear immediately for better UX
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
          recipient_id: selectedUserId,
          content: contentToSend,
          image_url: imageToSend,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Add new message to the list
        setMessages(prev => [...prev, data.message]);
      } else {
        // Restore message on error
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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <p className="text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 h-[calc(100vh-4rem)]">
        <div className="max-w-6xl mx-auto h-full">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 text-white">Messages</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100%-5rem)]">
            {/* Conversations List */}
            <Card className="md:col-span-1 overflow-hidden flex flex-col">
              <CardContent className="p-0 flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-muted-foreground text-sm">No conversations yet</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Visit a user's profile to start a conversation
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {conversations.map((conv) => (
                      <button
                        key={conv.userId}
                        onClick={() => router.push(`/messages?user=${conv.userId}`)}
                        className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                          selectedUserId === conv.userId ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <UserAvatar
                            url={conv.profile?.avatar_url}
                            name={conv.profile?.display_name || "User"}
                            size="md"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm truncate">
                                {conv.profile?.display_name || "User"}
                              </span>
                              {conv.unreadCount > 0 && (
                                <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5 ml-2">
                                  {conv.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {conv.lastMessage}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <FormattedDate date={conv.lastMessageTime} format="compact" />
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conversation View */}
            <Card className="md:col-span-2 overflow-hidden flex flex-col">
              {selectedUserId && selectedUser ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b flex items-center gap-3">
                    <Link href={`/u/${selectedUserId}`}>
                      <UserAvatar
                        url={selectedUser.avatar_url}
                        name={selectedUser.display_name}
                        size="md"
                      />
                    </Link>
                    <div>
                      <Link 
                        href={`/u/${selectedUserId}`}
                        className="font-medium hover:underline"
                      >
                        {selectedUser.display_name}
                      </Link>
                      {selectedUser.username && (
                        <p className="text-xs text-muted-foreground">
                          @{selectedUser.username}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loadingMessages ? (
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
                            className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                isMe
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
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
                  </CardContent>

                  {/* Message Input */}
                  <div className="p-4 border-t">
                    {/* Image Preview */}
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
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage || sending || !!imageUrl}
                        className="flex-shrink-0"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <Input
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        disabled={sending}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={sending || (!newMessage.trim() && !imageUrl)}
                      >
                        {sending ? "..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <CardContent className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">
                      Select a conversation to view messages
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Or visit a user's profile to start a new conversation
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard>
      <MessagesContent />
    </AuthGuard>
  );
}
