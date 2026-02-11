import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rateLimit";

export async function POST(request: Request) {
  try {
    // Rate limit: 3 contact form submissions per IP per 5 minutes
    const clientIp = (request as any).headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateCheck = checkRateLimit(`contact:${clientIp}`, 3, 300_000);
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const { email, subject, message } = await request.json();

    // Validate inputs
    if (!email || !subject || !message) {
      console.log("[Contact Form] Validation failed: missing fields");
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Get logged-in user info (if available)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    let accountEmail = null;
    let username = null;
    
    if (user) {
      // User is logged in - get their profile info
      accountEmail = user.email;
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", user.id)
        .single();
      
      username = profile?.display_name || profile?.username || null;
      console.log("[Contact Form] Logged-in user:", username, accountEmail);
    } else {
      console.log("[Contact Form] Anonymous submission");
    }

    // Format message with user account info if logged in
    const fullMessage = user 
      ? `━━━━━━━━━━━━━━━━━━━━━━━━
LOGGED-IN USER INFO:
━━━━━━━━━━━━━━━━━━━━━━━━
Username: ${username || 'N/A'}
Account Email: ${accountEmail || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━
CONTACT EMAIL: ${email}
━━━━━━━━━━━━━━━━━━━━━━━━

MESSAGE:
${message}`
      : `━━━━━━━━━━━━━━━━━━━━━━━━
Anonymous User (Not Logged In)
━━━━━━━━━━━━━━━━━━━━━━━━
CONTACT EMAIL: ${email}
━━━━━━━━━━━━━━━━━━━━━━━━

MESSAGE:
${message}`;

    // Send via Formspree
    const formspreeEndpoint = process.env.FORMSPREE_ENDPOINT || "https://formspree.io/f/xykpjbwp";
    if (!process.env.FORMSPREE_ENDPOINT) {
      console.warn("[Contact Form] FORMSPREE_ENDPOINT not set, using hardcoded fallback");
    }
    
    const formspreeResponse = await fetch(formspreeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        email: email,
        subject: subject,
        message: fullMessage,
        _replyto: email,
        _subject: `Corebound Contact: ${subject}`,
      }),
    });

    const responseData = await formspreeResponse.json();
    console.log("[Contact Form] Formspree response:", responseData);

    if (!formspreeResponse.ok) {
      console.error("[Contact Form] Formspree error:", responseData);
      return NextResponse.json(
        { error: responseData.error || "Failed to send message. Please try again." },
        { status: 500 }
      );
    }

    console.log("[Contact Form] ✅ Message sent successfully via Formspree");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Contact Form] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
