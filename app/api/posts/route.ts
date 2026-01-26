import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

export async function POST(request: NextRequest) {
  try {
    // Try bearer token first, then fall back to cookies
    let user;
    try {
      user = await getUserFromRequest(request);
    } catch (authError: any) {
      console.error("Authentication error in POST /api/posts:", authError);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    
    if (!user) {
      console.error("No user found in POST /api/posts - authentication failed");
      console.error("Request headers:", {
        authorization: request.headers.get("authorization"),
        cookie: request.headers.get("cookie") ? "present" : "missing",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Authenticated user:", user.id);

    const body = await request.json();
    const { title, body: postBody } = body;

    if (!title || !postBody) {
      return NextResponse.json(
        { error: "Title and body are required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from("posts")
      .insert({
        title: title.trim(),
        body: postBody.trim(),
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Post creation error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create post" },
        { status: 500 }
      );
    }

    return NextResponse.json({ post: data }, { status: 201 });
  } catch (error: any) {
    console.error("Post API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
