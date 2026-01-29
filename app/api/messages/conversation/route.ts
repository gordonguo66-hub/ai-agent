import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/messages/conversation?user_id=xxx
 * Get all messages in a conversation with a specific user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const otherUserId = searchParams.get("user_id");

    if (!otherUserId) {
      return NextResponse.json(
        { error: "user_id query parameter is required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Fetch other user's profile
    const { data: otherUser, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .eq("id", otherUserId)
      .single();

    if (profileError || !otherUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Fetch all messages between these two users
    const { data: messages, error: messagesError } = await serviceClient
      .from("direct_messages")
      .select("id, sender_id, recipient_id, content, image_url, read, created_at")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching conversation:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch conversation" },
        { status: 500 }
      );
    }

    // Mark all unread messages from the other user as read
    await serviceClient
      .from("direct_messages")
      .update({ read: true })
      .eq("recipient_id", user.id)
      .eq("sender_id", otherUserId)
      .eq("read", false);

    return NextResponse.json({
      otherUser,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error("Conversation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
