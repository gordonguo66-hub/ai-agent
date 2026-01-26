import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendConfirmationEmail } from "@/lib/email/templates";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userId } = body;

    if (!email || !userId) {
      return NextResponse.json(
        { error: "Email and userId are required" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Check if user exists and get username
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    // Generate a secure confirmation token
    const confirmationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // 24 hour expiry

    // Store token in email_confirmations table (more reliable than user metadata)
    const { error: insertError } = await serviceClient
      .from("email_confirmations")
      .insert({
        user_id: userId,
        token: confirmationToken,
        email: email,
        expires_at: tokenExpiry.toISOString(),
      });

    if (insertError) {
      console.error("Error storing confirmation token in database:", insertError);
      console.error("Insert error details:", {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      });
      
      // Check if table doesn't exist
      if (insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: "Database table not found. Please run the SQL migration: supabase/add_email_confirmations_table.sql",
            details: "The email_confirmations table needs to be created in Supabase"
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { 
          error: "Failed to generate confirmation token",
          details: insertError.message || "Failed to store token"
        },
        { status: 500 }
      );
    }
    
    console.log("Token stored successfully in database for user:", userId);

    // Send confirmation email
    const emailResult = await sendConfirmationEmail(
      email,
      profile?.username || "User",
      confirmationToken
    );

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to send confirmation email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: "Confirmation email sent successfully"
    });
  } catch (error: any) {
    console.error("Send confirmation email error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
