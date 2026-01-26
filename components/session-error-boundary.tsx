"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class SessionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to browser console
    console.error("========== SESSION ERROR BOUNDARY ==========");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    console.error("Component Stack:", errorInfo.componentStack);
    console.error("Full Error Object:", error);
    console.error("Full Error Info:", errorInfo);
    console.error("===========================================");

    // Log to server console (via API)
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        route: window.location.pathname,
        errorBoundary: "SessionErrorBoundary",
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        fullErrorInfo: JSON.stringify(errorInfo, Object.getOwnPropertyNames(errorInfo)),
      }),
    }).catch((e) => console.error("Failed to log error:", e));

    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container mx-auto px-4 py-16">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Session Page Error
            </h2>
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">Error Message:</p>
                <pre className="mt-1 p-3 bg-white dark:bg-gray-900 rounded border overflow-x-auto text-sm">
                  {this.state.error?.message || "Unknown error"}
                </pre>
              </div>
              {this.state.error?.stack && (
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300">Stack Trace:</p>
                  <pre className="mt-1 p-3 bg-white dark:bg-gray-900 rounded border overflow-x-auto text-xs whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}
              {this.state.errorInfo?.componentStack && (
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300">Component Stack:</p>
                  <pre className="mt-1 p-3 bg-white dark:bg-gray-900 rounded border overflow-x-auto text-xs whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}
              <div className="mt-4">
                <button
                  onClick={() => {
                    const debugInfo = {
                      message: this.state.error?.message,
                      stack: this.state.error?.stack,
                      componentStack: this.state.errorInfo?.componentStack,
                      route: window.location.pathname,
                      userAgent: navigator.userAgent,
                      timestamp: new Date().toISOString(),
                    };
                    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                    alert("Debug info copied to clipboard!");
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Copy Debug Info
                </button>
              </div>
              <p className="text-sm text-red-700 dark:text-red-400 mt-4">
                Check browser console and server logs for full error details.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
