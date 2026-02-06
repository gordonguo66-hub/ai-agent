"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function LegalAcceptancePage() {
  const router = useRouter();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and acknowledge the Risk Disclosure to continue");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/legal/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        // Redirect to dashboard
        window.location.href = "/dashboard";
      } else {
        const data = await response.json();
        setError(data.error || "Failed to record acceptance");
        setLoading(false);
      }
    } catch (err: any) {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070d1a] flex items-center justify-center py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <Card className="border-blue-900/50">
            <CardHeader>
              <CardTitle className="text-2xl">Legal Agreement Required</CardTitle>
              <CardDescription className="text-base">
                Before you can use Corebound, you must agree to our terms and acknowledge the risks involved in trading.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-muted/30 border border-border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Please Review:</h3>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <Link
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        → Terms of Service
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/risk"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        → Risk Disclosure
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        → Privacy Policy
                      </Link>
                    </li>
                  </ul>
                </div>

                <div className="flex items-start gap-3 p-4 bg-yellow-900/10 border border-yellow-700/50 rounded-md">
                  <input
                    type="checkbox"
                    id="acceptance-checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="acceptance-checkbox" className="text-sm leading-relaxed">
                    I have read and agree to the{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      Terms of Service
                    </Link>{" "}
                    and acknowledge the{" "}
                    <Link
                      href="/risk"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      Risk Disclosure
                    </Link>
                    . I understand that trading involves substantial risk and Corebound does not provide financial advice.
                  </label>
                </div>
              </div>

              <Button
                onClick={handleAccept}
                disabled={!agreedToTerms || loading}
                className="w-full"
                size="lg"
              >
                {loading ? "Processing..." : "Accept and Continue"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
