import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/messages
 * Get all conversations for the current user (list of users they've messaged with)
 * Returns: Array of conversations with last message, unread count, and other user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    // Get all unique users the current user has conversations with
    const { data: messages, error } = await serviceClient
      .from("direct_messages")
      .select("sender_id, recipient_id, content, created_at, read")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Build conversations map
    const conversationsMap = new Map<string, any>();

    for (const msg of messages || []) {
      const otherUserId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      
      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          userId: otherUserId,
          lastMessage: msg.content,
          lastMessageTime: msg.created_at,
          unreadCount: 0,
        });
      }

      // Count unread messages (messages sent TO current user that are unread)
      if (msg.recipient_id === user.id && !msg.read) {
        const conv = conversationsMap.get(otherUserId)!;
        conv.unreadCount++;
      }
    }

    const conversations = Array.from(conversationsMap.values());

    // Fetch profiles for all conversation participants
    const userIds = conversations.map(c => c.userId);
    if (userIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", userIds);

      const profilesMap = new Map(
        (profiles || []).map(p => [p.id, p])
      );

      conversations.forEach(conv => {
        conv.profile = profilesMap.get(conv.userId) || null;
      });
    }

    // Sort by last message time
    conversations.sort((a, b) => 
      new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error("Messages error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages
 * Send a new message. Body: { recipient_id: string, content: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { recipient_id, content } = body;

    if (!recipient_id || !content?.trim()) {
      return NextResponse.json(
        { error: "recipient_id and content are required" },
        { status: 400 }
      );
    }

    // Prevent self-messaging
    if (user.id === recipient_id) {
      return NextResponse.json(
        { error: "Cannot send messages to yourself" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Verify recipient exists
    const { data: recipient, error: recipientError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", recipient_id)
      .single();

    if (recipientError || !recipient) {
      return NextResponse.json(
        { error: "Recipient not found" },
        { status: 404 }
      );
    }

    // Insert message
    const { data: message, error: insertError } = await serviceClient
      .from("direct_messages")
      .insert({
        sender_id: user.id,
        recipient_id: recipient_id,
        content: content.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error sending message:", insertError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
