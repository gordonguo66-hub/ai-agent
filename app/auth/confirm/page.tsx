"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Force dynamic rendering to prevent prerendering errors
export const dynamic = 'force-dynamic';

function ConfirmEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirming your email...");

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email");

    if (!token || !email) {
      setStatus("error");
      setMessage("Invalid confirmation link. Please request a new confirmation email.");
      return;
    }

    // Call the confirmation API
    fetch(`/api/auth/confirm-email?token=${token}&email=${encodeURIComponent(email)}`)
      .then((res) => {
        if (res.redirected) {
          const url = new URL(res.url);
          const error = url.searchParams.get("error");
          const confirmed = url.searchParams.get("confirmed");

          if (confirmed === "true") {
            setStatus("success");
            setMessage("Email confirmed successfully! You can now sign in.");
            setTimeout(() => {
              router.push("/auth?confirmed=true");
            }, 2000);
          } else if (error) {
            setStatus("error");
            switch (error) {
              case "invalid_token":
                setMessage("Invalid or expired confirmation link. Please request a new one.");
                break;
              case "token_expired":
                setMessage("This confirmation link has expired. Please request a new one.");
                break;
              case "user_not_found":
                setMessage("User account not found. Please sign up again.");
                break;
              case "table_not_found":
                setMessage("Database table not found. Please run the SQL migration: supabase/add_email_confirmations_table.sql");
                break;
              case "confirmation_failed":
                setMessage("Failed to confirm email in Supabase. Please check server logs or contact support.");
                break;
              default:
                setMessage(`Failed to confirm email. Error: ${error}. Please try again or contact support.`);
            }
          }
        } else {
          setStatus("error");
          setMessage("Failed to confirm email. Please try again.");
        }
      })
      .catch((err) => {
        console.error("Confirmation error:", err);
        setStatus("error");
        setMessage("An error occurred. Please try again.");
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl text-center">Confirm Email</CardTitle>
              <CardDescription className="text-center text-base">
                {status === "loading" && "Please wait..."}
                {status === "success" && "Success!"}
                {status === "error" && "Error"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                {status === "loading" && (
                  <div className="py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  </div>
                )}
                {status === "success" && (
                  <div className="py-4">
                    <div className="text-green-600 text-5xl mb-4">✓</div>
                  </div>
                )}
                {status === "error" && (
                  <div className="py-4">
                    <div className="text-destructive text-5xl mb-4">✗</div>
                  </div>
                )}
                <p className="text-foreground">{message}</p>
                {status === "error" && (
                  <Button
                    onClick={() => router.push("/auth")}
                    className="mt-4"
                  >
                    Go to Sign In
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-md mx-auto">
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Loading...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    }>
      <ConfirmEmailContent />
    </Suspense>
  );
}
