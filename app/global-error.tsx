"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error details for debugging
    console.error("Global Error Boundary caught:", {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: window.location.pathname,
    });

    // Try to send error to API (fail silently if it doesn't work)
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        isGlobal: true,
      }),
    }).catch(() => {
      // Silently ignore if error reporting fails
    });
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 max-w-md px-4">
            <h2 className="text-2xl font-bold">Application Error</h2>
            <p className="text-muted-foreground">
              {error.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
