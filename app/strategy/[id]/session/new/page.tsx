"use client";

import { AuthGuard } from "@/components/auth-guard";
export default function CreateSessionPage() {
  return (
    <AuthGuard>
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-3xl mx-auto">
            <div className="border rounded-lg p-6">
              <h1 className="text-2xl font-semibold mb-2">Session creation moved</h1>
              <p className="text-muted-foreground">
                Sessions are now created from the Strategy page to keep Virtual/Live flows identical.
              </p>
              <p className="text-muted-foreground mt-2">
                Go back and click <span className="font-medium">Start Session</span> on the strategy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
