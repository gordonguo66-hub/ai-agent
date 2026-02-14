"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { sanitizeReturnUrl } from "@/lib/utils/urlValidation";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [returnUrl, setReturnUrl] = useState<string>("/dashboard");
  const [showResendOption, setShowResendOption] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const router = useRouter();
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const confirmed = urlParams.get("confirmed");
    const errorParam = urlParams.get("error");
    const nextParam = urlParams.get("next");
    const tabParam = urlParams.get("tab");
    
    // Validate and sanitize return URL to prevent open redirect attacks
    setReturnUrl(sanitizeReturnUrl(nextParam));
    
    if (tabParam === "signup") {
      setIsSignUp(true);
    }
    
    const resetParam = urlParams.get("reset");
    
    if (confirmed === "true") {
      setSuccess("Email confirmed successfully! You can now sign in.");
      setIsSignUp(false);
      const newUrl = nextParam ? `/auth?next=${encodeURIComponent(nextParam)}` : "/auth";
      window.history.replaceState({}, "", newUrl);
    } else if (resetParam === "success") {
      setSuccess("Password reset successfully! You can now sign in with your new password.");
      setIsSignUp(false);
      const newUrl = nextParam ? `/auth?next=${encodeURIComponent(nextParam)}` : "/auth";
      window.history.replaceState({}, "", newUrl);
    } else if (errorParam) {
      switch (errorParam) {
        case "invalid_token":
          setError("Invalid or expired confirmation link.");
          break;
        case "token_expired":
          setError("Confirmation link has expired. Please request a new one.");
          break;
        default:
          setError("An error occurred. Please try again.");
      }
      const newUrl = nextParam ? `/auth?next=${encodeURIComponent(nextParam)}` : "/auth";
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (!loading && !success) {
            const urlParams = new URLSearchParams(window.location.search);
            const nextParam = urlParams.get("next");
            // Validate return URL to prevent open redirect attacks
            const redirectTo = sanitizeReturnUrl(nextParam);
            router.push(redirectTo);
          }
          return;
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // Check if the error is because email is not confirmed
        if (error.message?.toLowerCase().includes("email not confirmed")) {
          setError("Please confirm your email address before signing in. Check your inbox for the confirmation link.");
          setShowResendOption(true);
        } else {
          setError(error.message || "Failed to sign in. Please check your credentials.");
          setShowResendOption(false);
        }
        setLoading(false);
      } else if (data.user) {
        // Double-check email confirmation status
        if (!data.user.email_confirmed_at) {
          // User hasn't confirmed email yet - sign them out and show message
          await supabase.auth.signOut();
          setError("Please confirm your email address before signing in. Check your inbox for the confirmation link.");
          setShowResendOption(true);
          setLoading(false);
          return;
        }
        setShowResendOption(false);
        // Use router.push for client-side navigation (safer than window.location.href)
        router.push(sanitizeReturnUrl(returnUrl));
      } else {
        setError("Sign in failed. Please try again.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Connection error. Please check your internet and try again.");
      setLoading(false);
    }
  };

  const checkUsernameAvailability = async (usernameToCheck: string): Promise<boolean> => {
    if (!usernameToCheck || usernameToCheck.length < 3) return false;

    try {
      const response = await fetch("/api/check-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameToCheck }),
      });
      const data = await response.json();
      if (!response.ok) {
        setUsernameError(data.error || "Failed to check username");
        return false;
      }
      return data.available === true;
    } catch (err) {
      setUsernameError("Failed to check username availability");
      return false;
    }
  };

  const handleResendConfirmation = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    
    setResendingEmail(true);
    setError(null);
    setSuccess(null);
    
    try {
      const supabase = createClient();

      const emailRedirectTo = `${window.location.origin}/auth?confirmed=true${
        returnUrl ? `&next=${encodeURIComponent(returnUrl)}` : ""
      }`;

      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo },
      });

      if (error) {
        setError(error.message || "Failed to resend confirmation email. Please try again.");
        return;
      }

      setSuccess(`Confirmation email sent! Please check your inbox (${email}) and click the link to verify your account.`);
      setShowResendOption(false);
    } catch {
      setError("Failed to resend confirmation email. Please try again.");
    } finally {
      setResendingEmail(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setSendingResetEmail(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      const resetRedirectTo = `${window.location.origin}/auth/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectTo,
      });

      if (error) {
        setError(error.message || "Failed to send reset email. Please try again.");
      } else {
        setSuccess(`Password reset link sent! Please check your email (${email}) and click the link to reset your password.`);
        setShowForgotPassword(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleUsernameBlur = async () => {
    if (!username || username.length < 3) {
      setUsernameError(null);
      return;
    }
    setCheckingUsername(true);
    setUsernameError(null);
    const available = await checkUsernameAvailability(username);
    if (!available && username.length >= 3) {
      setUsernameError("This username is already taken");
    }
    setCheckingUsername(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setUsernameError(null);

    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and acknowledge the Risk Disclosure");
      setLoading(false);
      return;
    }

    // Password validation
    if (password.length < 12) {
      setError("Password must be at least 12 characters long");
      setLoading(false);
      return;
    }

    if (password.length > 64) {
      setError("Password cannot exceed 64 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (!username || username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      setLoading(false);
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username.trim())) {
      setError("Username must be 3-20 characters with only letters, numbers, and underscores");
      setLoading(false);
      return;
    }

    const available = await checkUsernameAvailability(username.trim());
    if (!available) {
      setError("This username is already taken. Please choose another.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      const emailRedirectTo = `${window.location.origin}/auth?confirmed=true${
        returnUrl ? `&next=${encodeURIComponent(returnUrl)}` : ""
      }`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() }, emailRedirectTo },
      });

      if (error) {
        setError(error.message || "Failed to create account. Please try again.");
        setLoading(false);
        return;
      }

      if (data.user) {
        await supabase.from("profiles").update({ username: username.trim() }).eq("id", data.user.id);
        
        try {
          await fetch("/api/legal/accept", { method: "POST", headers: { "Content-Type": "application/json" } });
        } catch {}

        // Supabase will send the verification email when "Confirm email" is enabled.
        // If it's disabled (dev), Supabase may return a session and the user can continue immediately.
        if (data.session?.user && data.user.email_confirmed_at) {
          // Use router.push for client-side navigation (safer than window.location.href)
          router.push(sanitizeReturnUrl(returnUrl));
          return;
        }

        setSuccess(`Account created! Please check your email (${email}) and click the confirmation link to activate your account.`);
        setLoading(false);
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setUsername("");
        setAgreedToTerms(false);
        setTimeout(() => setIsSignUp(false), 5000);
      } else {
        setError("Account creation failed. Please try again.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Connection error. Please try again.");
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 25%, #f1f5f9 50%, #dbeafe 75%, #f8fafc 100%)' }}>
        <p className="text-slate-500">Loading...</p>
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

      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top left - Lines */}
        <svg className="absolute top-20 left-10 w-14 h-14 text-slate-300/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        
        {/* Top right - Dots */}
        <svg className="absolute top-24 right-20 w-16 h-16 text-blue-300/50" viewBox="0 0 100 100">
          {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2, 3, 4].map((col) => (
              <circle key={`${row}-${col}`} cx={10 + col * 20} cy={10 + row * 20} r="2.5" fill="currentColor" />
            ))
          )}
        </svg>
        
        {/* Bottom left - Grid */}
        <svg className="absolute bottom-28 left-14 w-12 h-12 text-slate-300/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.75">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        
        {/* Right - Diamond/Ethereum shape */}
        <svg className="absolute bottom-40 right-14 w-16 h-20 text-slate-300/50" viewBox="0 0 24 30" fill="none" stroke="currentColor" strokeWidth="0.75">
          <path d="M12 2L2 12L12 28L22 12L12 2Z" />
          <path d="M2 12L12 16L22 12" />
          <path d="M12 2L12 16" />
        </svg>
        
        {/* Small triangle */}
        <svg className="absolute top-1/2 right-10 w-10 h-10 text-blue-200/50" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4L4 20h16L12 4z" />
        </svg>
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-md px-6">
        {/* No card - content floats directly on background */}
        <div>
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <h1 className="text-2xl font-bold text-slate-800">
                {showForgotPassword ? "Reset Your Password" : isSignUp ? "Create Your Account" : "Sign in to Corebound"}
              </h1>
            </div>
            {isSignUp && !showForgotPassword && (
              <p className="text-slate-500 text-sm mt-2 ml-5">
                Join Corebound to start building AI trading strategies
              </p>
            )}
            {showForgotPassword && (
              <p className="text-slate-500 text-sm mt-2 ml-5">
                Enter your email to receive a password reset link
              </p>
            )}
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-6 p-4 text-sm text-red-700 bg-red-50/80 border border-red-200 rounded-xl">
              {error}
              {showResendOption && !isSignUp && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendingEmail}
                  className="mt-3 block w-full text-center py-2 px-4 bg-red-100 hover:bg-red-200 text-red-800 font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {resendingEmail ? "Sending..." : "Resend Confirmation Email"}
                </button>
              )}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 text-sm text-emerald-700 bg-emerald-50/80 border border-emerald-200 rounded-xl">
              {success}
            </div>
          )}

          {/* Forgot Password Form */}
          {showForgotPassword && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="reset-email" className="block text-sm font-semibold text-slate-700">
                  Email
                </label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter your email address"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <Button
                type="submit"
                disabled={sendingResetEmail}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all"
              >
                {sendingResetEmail ? "Sending..." : "Send Reset Link"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* Sign In Form */}
          {!isSignUp && !showForgotPassword && (
            <form onSubmit={handleSignIn} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter Email"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter Password"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-sm font-medium text-slate-700 hover:text-blue-600 underline decoration-slate-400 hover:decoration-blue-500"
                >
                  Forgot your password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          )}

          {/* Sign Up Form */}
          {isSignUp && !showForgotPassword && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email-signup" className="block text-sm font-semibold text-slate-700">
                  Email
                </label>
                <Input
                  id="email-signup"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter Email"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="username-signup" className="block text-sm font-semibold text-slate-700">
                  Username
                </label>
                <Input
                  id="username-signup"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameError(null);
                  }}
                  onBlur={handleUsernameBlur}
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]{3,20}"
                  placeholder="Choose a username"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                  disabled={checkingUsername}
                />
                {checkingUsername && (
                  <p className="text-xs text-slate-500">Checking availability...</p>
                )}
                {usernameError && (
                  <p className="text-xs text-red-600">{usernameError}</p>
                )}
                {username && !usernameError && !checkingUsername && username.length >= 3 && (
                  <p className="text-xs text-emerald-600">✓ Username available</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="password-signup" className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <Input
                  id="password-signup"
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
                <label htmlFor="confirm-password-signup" className="block text-sm font-semibold text-slate-700">
                  Confirm Password
                </label>
                <Input
                  id="confirm-password-signup"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={64}
                  placeholder="Re-enter your password"
                  className="h-12 bg-blue-50/40 border-slate-200/80 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl text-slate-700 placeholder:text-slate-400"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-600">Passwords do not match</p>
                )}
                {confirmPassword && password === confirmPassword && password.length >= 12 && (
                  <p className="text-xs text-emerald-600">✓ Passwords match</p>
                )}
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-3 p-3 bg-blue-50/30 border border-slate-200/60 rounded-xl">
                <input
                  type="checkbox"
                  id="terms-checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  required
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400/20"
                />
                <label htmlFor="terms-checkbox" className="text-sm text-slate-600 leading-relaxed">
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                    Terms of Service
                  </a>{" "}
                  and acknowledge the{" "}
                  <a href="/risk" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                    Risk Disclosure
                  </a>
                </label>
              </div>

              <Button
                type="submit"
                disabled={loading || checkingUsername || !!usernameError || !agreedToTerms || password.length < 12 || password !== confirmPassword}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {loading ? "Creating account..." : "Sign Up"}
              </Button>
            </form>
          )}

          {/* Toggle Sign In / Sign Up */}
          {!showForgotPassword && (
            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                    setSuccess(null);
                    setConfirmPassword("");
                  }}
                  className="font-semibold text-slate-800 hover:text-blue-600 transition-colors"
                >
                  {isSignUp ? "Sign In" : "Sign Up"}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
