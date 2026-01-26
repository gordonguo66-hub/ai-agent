"use client";

import { useEffect } from "react";

// Track last 10 fetch calls for error context
const fetchHistory: Array<{
  url: string;
  status: number | null;
  timestamp: number;
  responseSnippet?: string;
}> = [];

// Intercept fetch to track requests (only in browser)
let originalFetch: typeof fetch = fetch;
if (typeof window !== 'undefined') {
  originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let url: string;
    if (typeof args[0] === "string") {
      url = args[0];
    } else if (args[0] instanceof URL) {
      url = args[0].toString();
    } else {
      url = args[0].url;
    }
    const timestamp = Date.now();

    try {
      const response = await originalFetch(...args);
      
      // Store in history (keep last 10)
      fetchHistory.push({
        url,
        status: response.status,
        timestamp,
      });
      
      if (fetchHistory.length > 10) {
        fetchHistory.shift();
      }

      return response;
    } catch (error) {
      fetchHistory.push({
        url,
        status: null,
        timestamp,
      });
      
      if (fetchHistory.length > 10) {
        fetchHistory.shift();
      }
      
      throw error;
    }
  };
}

export function ErrorLogger() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorData = {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        fetchHistory: fetchHistory.slice(-10), // Last 10 fetch calls
      };

      console.error("Unhandled error:", errorData);

      // Send to API (fail silently)
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(errorData),
      }).catch(() => {
        // Silently ignore
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const errorData = {
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        fetchHistory: fetchHistory.slice(-10),
        isPromiseRejection: true,
      };

      console.error("Unhandled promise rejection:", errorData);

      // Send to API (fail silently)
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(errorData),
      }).catch(() => {
        // Silently ignore
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null; // This component doesn't render anything
}
