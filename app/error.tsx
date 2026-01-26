"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error details for debugging
    console.error("Error Boundary caught:", {
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
      }),
    }).catch(() => {
      // Silently ignore if error reporting fails
    });
  }, [error]);

  const copyDebugInfo = () => {
    const debugInfo = {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      route: window.location.pathname,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    alert("Debug info copied to clipboard!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        <h2 className="text-2xl font-bold">Something went wrong</h2>
        <p className="text-muted-foreground">
          {error.message || "An unexpected error occurred"}
        </p>
        {error.stack && (
          <details className="text-left mt-4">
            <summary className="cursor-pointer text-sm font-semibold mb-2">Stack Trace</summary>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
              {error.stack}
            </pre>
          </details>
        )}
        <div className="flex gap-2 justify-center flex-wrap">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Go to Dashboard
          </Button>
          <Button variant="outline" onClick={copyDebugInfo}>
            Copy Debug Info
          </Button>
        </div>
      </div>
    </div>
  );
}
