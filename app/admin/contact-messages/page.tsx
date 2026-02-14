"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/auth-guard";
import { getBearerToken } from "@/lib/api/clientAuth";

interface ContactSubmission {
  id: string;
  user_id: string | null;
  email: string;
  subject: string;
  message: string;
  account_email: string | null;
  username: string | null;
  submitted_at: string;
  read: boolean;
}

function AdminContactMessagesContent() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    verifyAdminAndLoad();
  }, []);

  const verifyAdminAndLoad = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) {
        router.push("/dashboard");
        return;
      }

      // Verify admin access via server-side check
      const verifyRes = await fetch("/api/admin/verify", {
        headers: { Authorization: bearer },
      });

      if (!verifyRes.ok) {
        router.push("/dashboard");
        return;
      }

      setAuthorized(true);

      // Load submissions
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contact_submissions")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error("Failed to load contact submissions:", error);
      } else {
        setSubmissions(data || []);
      }
    } catch (error) {
      console.error("Error loading submissions:", error);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading || !authorized) {
    return (
      <div className="min-h-screen bg-[#070d1a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070d1a] py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Contact Form Submissions</h1>
          <p className="text-gray-300">All messages from users via the contact form</p>
        </div>

        {submissions.length === 0 ? (
          <Card className="border-blue-900/50 bg-[#0A0E1A]">
            <CardContent className="py-12">
              <div className="text-center text-gray-400">
                No contact form submissions yet.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <Card key={submission.id} className="border-blue-900/50 bg-[#0A0E1A]">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <CardTitle className="text-xl text-white">{submission.subject}</CardTitle>
                      <div className="space-y-1">
                        <CardDescription className="text-base">
                          Contact Email: <span className="text-blue-400 font-medium">{submission.email}</span>
                        </CardDescription>
                        {submission.username && (
                          <CardDescription className="text-sm">
                            User: <span className="text-white font-medium">{submission.username}</span>
                            {submission.account_email && (
                              <span className="text-gray-400"> ({submission.account_email})</span>
                            )}
                          </CardDescription>
                        )}
                        {!submission.username && submission.account_email && (
                          <CardDescription className="text-sm">
                            Account: <span className="text-white">{submission.account_email}</span>
                          </CardDescription>
                        )}
                        {!submission.username && !submission.account_email && (
                          <Badge variant="outline" className="text-xs">Anonymous (not logged in)</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {new Date(submission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                    {!submission.read && (
                      <Badge className="bg-blue-900/50 text-white border-blue-700">New</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-[#070d1a] border border-blue-900/30 rounded-lg p-4">
                    <p className="text-gray-300 whitespace-pre-wrap">{submission.message}</p>
                  </div>
                  <div className="mt-4">
                    <a
                      href={`mailto:${submission.email}?subject=Re: ${submission.subject}`}
                      className="text-blue-400 hover:underline text-sm"
                    >
                      → Reply to {submission.email}
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminContactMessagesPage() {
  return (
    <AuthGuard>
      <AdminContactMessagesContent />
    </AuthGuard>
  );
}
