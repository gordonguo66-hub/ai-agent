import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { 
          error: "Username must be 3-20 characters and contain only letters, numbers, and underscores",
          available: false
        },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();
    
    // Check if username exists
    const { data, error } = await serviceClient
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" which is what we want
      console.error("Error checking username:", error);
      return NextResponse.json(
        { error: "Failed to check username availability" },
        { status: 500 }
      );
    }

    const available = !data; // If no data found, username is available

    return NextResponse.json({ available });
  } catch (error: any) {
    console.error("Check username error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
