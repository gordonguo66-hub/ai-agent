import { Resend } from "resend";

// Initialize Resend client (fallback to env variable if not provided)
let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not found. Email sending will be disabled.");
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const client = getResendClient();
  
  if (!client) {
    console.error("Cannot send email: Resend client not initialized");
    return { success: false, error: "Email service not configured" };
  }

    try {
      // Default to Resend's test domain for development if no EMAIL_FROM is set
      // In production, user should set EMAIL_FROM to their verified domain (e.g., noreply@yourcompany.com)
      const fromEmail = options.from || process.env.EMAIL_FROM || "AI Arena Trade <onboarding@resend.dev>";
    
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error("Resend email error:", error);
      return { success: false, error: error.message || "Failed to send email" };
    }

    console.log("Email sent successfully:", data);
    return { success: true };
  } catch (err: any) {
    console.error("Email sending exception:", err);
    return { success: false, error: err.message || "Failed to send email" };
  }
}
