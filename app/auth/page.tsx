"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("signin");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  
  // Check for URL parameters (email confirmed, errors, etc.)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const confirmed = urlParams.get("confirmed");
    const errorParam = urlParams.get("error");
    
    if (confirmed === "true") {
      setSuccess("Email confirmed successfully! You can now sign in.");
      setActiveTab("signin");
      // Clear URL params
      window.history.replaceState({}, "", "/auth");
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
      // Clear URL params
      window.history.replaceState({}, "", "/auth");
    }
  }, []);

  // Check if user is already logged in and redirect to dashboard
  // Only check once on mount, don't interfere with signup flow
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Only redirect if we're not in the middle of a signup
          if (!loading && !success) {
            router.push("/dashboard");
          }
          return;
        }
      } catch (error) {
        // If check fails, just show the auth form
        console.error("Auth check error:", error);
      } finally {
        setCheckingAuth(false);
      }
    };
    // Only check on mount, not when loading/success changes
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message || "Failed to sign in. Please check your credentials.");
        setLoading(false);
      } else if (data.user) {
        // Success - redirect to dashboard
        window.location.href = "/dashboard";
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
    if (!usernameToCheck || usernameToCheck.length < 3) {
      return false;
    }

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
      console.error("Username check error:", err);
      setUsernameError("Failed to check username availability");
      return false;
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

    // Validate username
    if (!username || username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      setLoading(false);
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username.trim())) {
      setError("Username must be 3-20 characters and contain only letters, numbers, and underscores");
      setLoading(false);
      return;
    }

    // Check username availability one more time
    const available = await checkUsernameAvailability(username.trim());
    if (!available) {
      setError("This username is already taken. Please choose another.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
          },
        },
      });

      if (error) {
        console.error("Signup error:", error);
        setError(error.message || "Failed to create account. Please try again.");
        setLoading(false);
        return;
      }

      if (data.user) {
        console.log("User created:", data.user.id);
        
        // Update profile with username (the trigger should handle this, but we'll also do it explicitly)
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ username: username.trim() })
          .eq("id", data.user.id);

        if (profileError) {
          console.error("Profile update error:", profileError);
          // Don't fail signup if profile update fails - trigger should have created it
        } else {
          console.log("Profile updated with username:", username.trim());
        }

        // Check if email confirmation is required
        // If session exists, user is logged in immediately
        // If no session, email confirmation is required
        const { data: { session } } = await supabase.auth.getSession();
        
        console.log("Session after signup:", session ? "exists" : "none");
        console.log("User email confirmed:", data.user?.email_confirmed_at ? "yes" : "no");
        
        if (session && data.user?.email_confirmed_at) {
          // User is logged in immediately (email confirmation disabled or already confirmed)
          console.log("User logged in immediately, showing success message");
          setSuccess("Account created successfully! Redirecting to dashboard...");
          setLoading(false);
          // Wait a bit so user can see the success message
          setTimeout(() => {
            console.log("Redirecting to dashboard");
            window.location.href = "/dashboard";
          }, 2000);
        } else if (!session && !data.user?.email_confirmed_at) {
          // Email confirmation required - try to send custom email
          console.log("Account created, attempting to send custom confirmation email...");
          
          try {
            const emailResponse = await fetch("/api/auth/send-confirmation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email,
                userId: data.user.id,
              }),
            });

            const emailResult = await emailResponse.json();
            console.log("Email sending result:", emailResult);

            if (emailResult.success) {
              console.log("Custom confirmation email sent successfully!");
              setSuccess(
                `Account created successfully! Please check your email (${email}) for a confirmation link. ` +
                `Click the link to confirm your email and then sign in below.`
              );
              setLoading(false);
              // Switch to sign in tab after a delay
              setTimeout(() => {
                setActiveTab("signin");
              }, 5000);
              return;
            } else {
              // Email sending failed - fallback to auto sign-in
              console.log("Custom email failed, trying auto sign-in as fallback:", emailResult.error);
              const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
              });

              if (signInData?.session) {
                console.log("Auto sign-in successful after email failure");
                setSuccess("Account created successfully! You've been automatically signed in. Redirecting...");
                setLoading(false);
                setTimeout(() => {
                  window.location.href = "/dashboard";
                }, 1500);
                return;
              } else {
                console.log("Auto sign-in also failed:", signInError);
                setError(
                  `Account created, but email confirmation couldn't be sent. ` +
                  `Error: ${emailResult.error || "Unknown error"}. ` +
                  `Please check your Resend API key in .env.local and try signing in manually.`
                );
                setLoading(false);
                setTimeout(() => {
                  setActiveTab("signin");
                }, 5000);
              }
            }
          } catch (emailErr: any) {
            console.error("Email sending exception:", emailErr);
            // If email API fails completely, try auto sign-in as last resort
            const { data: signInData } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (signInData?.session) {
              setSuccess("Account created successfully! You've been automatically signed in. Redirecting...");
              setLoading(false);
              setTimeout(() => {
                window.location.href = "/dashboard";
              }, 1500);
              return;
            } else {
              setError(
                `Account created but failed to send confirmation email. ` +
                `Please check your Resend API key configuration. Error: ${emailErr.message}`
              );
              setLoading(false);
              setTimeout(() => {
                setActiveTab("signin");
              }, 5000);
            }
          }
          
          setLoading(false);
          // Switch to sign in tab
          setTimeout(() => {
            setActiveTab("signin");
          }, 5000);
        } else {
          // Edge case - account created but waiting for email
          console.log("Account created, waiting for email confirmation");
          setSuccess(
            `Account created! Please check your email (${email}) for a confirmation link. ` +
            `If you don't see it, check your spam folder. Once you confirm your email, sign in below.`
          );
          setLoading(false);
          // Clear form
          setEmail("");
          setPassword("");
          setUsername("");
          // Switch to sign in tab after a delay
          setTimeout(() => {
            setActiveTab("signin");
          }, 8000);
        }
      } else {
        setError("Account creation failed. Please try again.");
        setLoading(false);
      }
    } catch (err: any) {
      console.error("Signup exception:", err);
      setError(err.message || "Connection error. Please check your internet and try again.");
      setLoading(false);
    }
  };

  // Show loading state while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-md mx-auto">
            <Card>
              <CardContent className="pt-12 pb-12">
                <div className="text-center">
                  <p className="text-muted-foreground">Checking authentication...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl text-center">AI Arena Trade</CardTitle>
              <CardDescription className="text-center text-base">
                Sign in or create an account to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
                <TabsContent value="signin" className="mt-0">
                  <form onSubmit={handleSignIn} className="space-y-5">
                    {error && (
                      <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                        {error}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-semibold text-foreground">
                        Email
                      </label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-semibold text-foreground">
                        Password
                      </label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11" size="lg" disabled={loading}>
                      {loading ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup" className="mt-0">
                  <form onSubmit={handleSignUp} className="space-y-5">
                    {error && (
                      <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="p-4 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
                        {success}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label htmlFor="email-signup" className="text-sm font-semibold text-foreground">
                        Email
                      </label>
                      <Input
                        id="email-signup"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="username-signup" className="text-sm font-semibold text-foreground">
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
                        placeholder="3-20 characters, letters, numbers, underscores"
                        className="h-11"
                        disabled={checkingUsername}
                      />
                      {checkingUsername && (
                        <p className="text-xs text-muted-foreground">Checking availability...</p>
                      )}
                      {usernameError && (
                        <p className="text-xs text-destructive">{usernameError}</p>
                      )}
                      {username && !usernameError && !checkingUsername && username.length >= 3 && (
                        <p className="text-xs text-green-600">✓ Username available</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="password-signup" className="text-sm font-semibold text-foreground">
                        Password
                      </label>
                      <Input
                        id="password-signup"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Minimum 6 characters"
                        className="h-11"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11" size="lg" disabled={loading || checkingUsername || !!usernameError}>
                      {loading ? "Creating account..." : "Sign Up"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
