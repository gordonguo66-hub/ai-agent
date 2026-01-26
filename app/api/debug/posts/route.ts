import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const serviceClient = createServiceRoleClient();
  
  // Get ALL profile_posts
  const { data: allPosts, error } = await serviceClient
    .from("profile_posts")
    .select("*")
    .limit(20);
  
  return NextResponse.json({ 
    allPosts,
    error: error?.message,
    count: allPosts?.length || 0
  });
}
