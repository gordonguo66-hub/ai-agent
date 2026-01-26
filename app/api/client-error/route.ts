import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const errorData = await request.json();
    
    // Log to console in production (Vercel will capture this)
    console.error("[CLIENT ERROR]", JSON.stringify(errorData, null, 2));
    
    // Extract session_id from path if available
    const path = errorData.route || errorData.path || "";
    const sessionIdMatch = path.match(/\/dashboard\/sessions\/([^\/]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : errorData.session_id || null;
    
    // Extract user_id from path or error data if available
    // Note: We can't get user_id from auth in API route without cookies, so we'll leave it null
    // The error boundary can pass it if needed
    
    // Store in Supabase using service role (bypasses RLS)
    try {
      const supabase = createServiceRoleClient();
      const { error: dbError } = await supabase.from("client_errors").insert({
        path: errorData.route || errorData.path || null,
        message: errorData.message || null,
        stack: errorData.stack || null,
        component_stack: errorData.componentStack || errorData.component_stack || null,
        user_agent: errorData.userAgent || errorData.user_agent || null,
        digest: errorData.digest || null,
        error_boundary: errorData.errorBoundary || errorData.error_boundary || null,
        full_error: errorData.fullError ? (typeof errorData.fullError === 'string' ? JSON.parse(errorData.fullError) : errorData.fullError) : null,
        full_error_info: errorData.fullErrorInfo ? (typeof errorData.fullErrorInfo === 'string' ? JSON.parse(errorData.fullErrorInfo) : errorData.fullErrorInfo) : null,
        user_id: errorData.userId || errorData.user_id || null,
        session_id: sessionId,
      });
      
      if (dbError) {
        console.error("[CLIENT ERROR] Failed to insert into Supabase:", dbError);
        // Continue anyway - don't fail the request
      }
    } catch (dbErr: any) {
      console.error("[CLIENT ERROR] Database error:", dbErr);
      // Continue anyway - don't fail the request
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    // Fail silently - don't break the app if error reporting fails
    console.error("Failed to log client error:", error);
    return NextResponse.json({ received: false }, { status: 200 }); // Return 200 to not break client
  }
}
