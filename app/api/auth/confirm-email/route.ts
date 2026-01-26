import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");
    const email = searchParams.get("email");

    if (!token || !email) {
      return NextResponse.redirect(new URL("/auth?error=missing_params", request.url));
    }

    const serviceClient = createServiceRoleClient();

    // Find confirmation token in database
    console.log("Looking for confirmation token:", { token: token.substring(0, 10) + "...", email });
    const { data: confirmation, error: tokenError } = await serviceClient
      .from("email_confirmations")
      .select("user_id, email, expires_at")
      .eq("token", token)
      .eq("email", email)
      .single();

    if (tokenError) {
      console.error("Error finding confirmation token:", tokenError);
      console.error("Token error details:", {
        code: tokenError.code,
        message: tokenError.message,
        details: tokenError.details,
        hint: tokenError.hint,
      });
      
      // Check if table doesn't exist
      if (tokenError.code === '42P01' || tokenError.message?.includes('does not exist')) {
        return NextResponse.redirect(new URL("/auth?error=table_not_found", request.url));
      }
      
      return NextResponse.redirect(new URL("/auth?error=invalid_token", request.url));
    }

    if (!confirmation) {
      console.error("Confirmation token not found in database");
      return NextResponse.redirect(new URL("/auth?error=invalid_token", request.url));
    }
    
    console.log("Token found, confirming user:", confirmation.user_id);

    // Check if token is expired
    if (new Date(confirmation.expires_at) < new Date()) {
      // Delete expired token
      await serviceClient
        .from("email_confirmations")
        .delete()
        .eq("token", token);
      return NextResponse.redirect(new URL("/auth?error=token_expired", request.url));
    }

    const userId = confirmation.user_id;

    // Try multiple approaches to confirm email
    // Approach 1: Use admin API with retries
    let confirmError = null;
    let confirmed = false;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      // Wait longer on each retry
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
      
      console.log(`Attempting to confirm email for user: ${userId} (attempt ${attempt + 1}/3)`);
      
      const { data: updatedUser, error: error } = await serviceClient.auth.admin.updateUserById(
        userId,
        {
          email_confirm: true,
        }
      );

      if (!error && updatedUser) {
        confirmed = true;
        console.log("Email confirmed successfully for user:", userId);
        break;
      } else {
        confirmError = error;
        console.log(`Attempt ${attempt + 1} failed:`, error?.message);
      }
    }

    if (!confirmed) {
      console.error("Error confirming email after all retries:", confirmError);
      console.error("Confirm error details:", {
        status: confirmError?.status,
        message: confirmError?.message,
        code: confirmError?.code,
        name: confirmError?.name,
      });
      
      // If admin API fails, mark as confirmed in our database anyway
      // The user can still sign in if email confirmation is disabled in Supabase
      console.log("Admin API failed, but token is valid. Marking as confirmed in database.");
      
      // Update our database to mark this confirmation as used/confirmed
      // User can sign in once Supabase propagates or if email confirmation is disabled
      await serviceClient
        .from("email_confirmations")
        .update({ expires_at: new Date().toISOString() }) // Mark as expired/used
        .eq("token", token);
      
      // Return success anyway - if email confirmation is disabled in Supabase, they can sign in
      // If it's enabled, they might need to wait or disable it
      return NextResponse.redirect(new URL("/auth?confirmed=partial&message=Token_valid_but_awaiting_verification", request.url));
    }

    // Delete the used confirmation token
    await serviceClient
      .from("email_confirmations")
      .delete()
      .eq("token", token);

    // Redirect to sign in with success message
    return NextResponse.redirect(new URL("/auth?confirmed=true", request.url));
  } catch (error: any) {
    console.error("Email confirmation error:", error);
    return NextResponse.redirect(new URL("/auth?error=server_error", request.url));
  }
}
