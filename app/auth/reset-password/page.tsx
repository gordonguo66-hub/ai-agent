"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const supabase = createClient();
      
      // Supabase passes the recovery token in the URL hash
      // The client library should automatically handle this
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("Session error:", error);
        setIsValidSession(false);
        setError("Invalid or expired reset link. Please request a new password reset.");
        return;
      }

      if (session) {
        setIsValidSession(true);
      } else {
        // Try to exchange the token from URL
        // Supabase automatically handles the token exchange when the page loads
        // Wait a moment for the auth state to update
        setTimeout(async () => {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession) {
            setIsValidSession(true);
          } else {
            setIsValidSession(false);
            setError("Invalid or expired reset link. Please request a new password reset.");
          }
        }, 1000);
      }
    };

    checkSession();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Password validation
    if (password.length < 12) {
      setError("Password must be at least 12 characters long");
      return;
    }

    if (password.length > 64) {
      setError("Password cannot exceed 64 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message || "Failed to reset password. Please try again.");
        setLoading(false);
        return;
      }

      // Sign out after password reset so user can sign in with new password
      await supabase.auth.signOut();
      
      setSuccess("Password reset successfully! Redirecting to sign in...");
      setLoading(false);
      
      setTimeout(() => {
        router.push("/auth?reset=success");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password. Please try again.");
      setLoading(false);
    }
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ 
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 35%, #dbeafe 70%, #eff6ff 85%, #f8fafc 100%)'
        }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ 
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 35%, #dbeafe 70%, #eff6ff 85%, #f8fafc 100%)'
      }}
    >
      {/* Soft color blobs for the gradient transition effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-32 left-24 w-96 h-96 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, #dbeafe 0%, transparent 70%)' }}
        />
        <div 
          className="absolute top-1/4 right-6 w-80 h-80 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #c7d2fe 0%, transparent 70%)' }}
        />
        <div 
          className="absolute -bottom-20 left-[55%] w-72 h-72 rounded-full opacity-35"
          style={{ background: 'radial-gradient(circle, #bfdbfe 0%, transparent 70%)' }}
        />
        <div 
          className="absolute bottom-1/3 right-8 w-64 h-64 rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #e0e7ff 0%, transparent 70%)' }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div>
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <h1 className="text-2xl font-bold text-slate-800">
                Set New Password
              </h1>
            </div>
            <p className="text-slate-500 text-sm mt-2 ml-5">
              Enter your new password below
            </p>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-6 p-4 text-sm text-red-700 bg-red-50/80 border border-red-200 rounded-xl">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 text-sm text-emerald-700 bg-emerald-50/80 border border-emerald-200 rounded-xl">
              {success}
            </div>
          )}

          {/* Invalid session - show error and link back */}
          {isValidSession === false && !success && (
            <div className="text-center">
              <Button
                onClick={() => router.push("/auth")}
                className="mt-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl"
              >
                Go to Sign In
              </Button>
            </div>
          )}

          {/* Reset Password Form */}
          {isValidSession && !success && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700">
                  New Password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={64}
                  placeholder="Minimum 12 characters"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
                {password && password.length < 12 && (
                  <p className="text-xs text-amber-600">Password must be at least 12 characters ({password.length}/12)</p>
                )}
                {password && password.length >= 12 && (
                  <p className="text-xs text-emerald-600">✓ Password length OK</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-new-password" className="block text-sm font-semibold text-slate-700">
                  Confirm New Password
                </label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={64}
                  placeholder="Re-enter your new password"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-600">Passwords do not match</p>
                )}
                {confirmPassword && password === confirmPassword && password.length >= 12 && (
                  <p className="text-xs text-emerald-600">✓ Passwords match</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || password.length < 12 || password !== confirmPassword}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => router.push("/auth")}
                  className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
