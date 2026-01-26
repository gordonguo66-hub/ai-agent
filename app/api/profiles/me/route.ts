import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * GET /api/profiles/me
 * Returns current user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: profile, error } = await serviceClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, gender, age, created_at, updated_at")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching profile:", error);
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }

    // If profile doesn't exist, create it
    if (!profile) {
      const displayName = user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        `User ${user.id.substring(0, 8)}`;

      const { data: newProfile, error: insertError } = await serviceClient
        .from("profiles")
        .insert({
          id: user.id,
          username: user.user_metadata?.username || null,
          display_name: displayName,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating profile:", insertError);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }

      return NextResponse.json({ profile: newProfile });
    }

    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error("Profile me error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profiles/me
 * Upsert current user's profile (display_name, bio, gender, age, avatar_url)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { display_name, bio, gender, age, avatar_url } = body;

    // Validate inputs
    if (display_name !== undefined && typeof display_name !== "string") {
      return NextResponse.json({ error: "display_name must be a string" }, { status: 400 });
    }
    if (display_name !== undefined && display_name.trim().length === 0) {
      return NextResponse.json({ error: "display_name cannot be empty" }, { status: 400 });
    }
    if (gender !== undefined && gender !== null && gender.length > 32) {
      return NextResponse.json({ error: "gender must be 32 characters or less" }, { status: 400 });
    }
    if (age !== undefined && age !== null && (age <= 0 || age >= 120)) {
      return NextResponse.json({ error: "age must be between 1 and 119" }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};
    if (display_name !== undefined) updateData.display_name = display_name.trim();
    if (bio !== undefined) updateData.bio = bio;
    if (gender !== undefined) updateData.gender = gender;
    if (age !== undefined) updateData.age = age;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

    // Check if profile exists
    const { data: existingProfile } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    let profile;
    if (existingProfile) {
      // Update existing profile
      const { data, error } = await serviceClient
        .from("profiles")
        .update(updateData)
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating profile:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
      }
      profile = data;
    } else {
      // Create new profile
      const displayName = display_name?.trim() ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        `User ${user.id.substring(0, 8)}`;

      const { data, error } = await serviceClient
        .from("profiles")
        .insert({
          id: user.id,
          username: user.user_metadata?.username || null,
          display_name: displayName,
          ...updateData,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating profile:", error);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
      profile = data;
    }

    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error("Profile upsert error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
