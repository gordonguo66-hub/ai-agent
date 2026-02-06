import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get client IP and user agent (optional)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwardedFor?.split(",")[0] || realIp || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Update profile with legal acceptance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        terms_accepted_at: new Date().toISOString(),
        risk_accepted_at: new Date().toISOString(),
        accepted_ip: ip,
        accepted_user_agent: userAgent,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Legal acceptance update error:", updateError);
      return NextResponse.json(
        { error: "Failed to record acceptance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Legal acceptance error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
