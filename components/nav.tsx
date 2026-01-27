"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Start as false - show content immediately
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: any;
    
    // Set loading to true only when we start checking
    setLoading(true);
    
    // Aggressive timeout - fail fast
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setError("Auth check timed out");
      }
    }, 2000); // 2 second max timeout
    
    (async () => {
      try {
        const supabase = createClient();
        // Use getSession instead of getUser for faster response (uses cookies)
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out")), 1500) // Even shorter timeout
        );
        
        try {
          const res: any = await Promise.race([sessionPromise, timeoutPromise]);
          
          if (cancelled) return;
          
          const userData = res?.data?.session?.user ?? null;
          setUser(userData);
          
          // Fetch username and avatar from profiles table
          if (userData?.id) {
            (async () => {
              try {
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("username, avatar_url")
                  .eq("id", userData.id)
                  .single();
                
                if (!cancelled) {
                  setUsername(profile?.username || null);
                  setAvatarUrl(profile?.avatar_url || null);
                }
              } catch (err: any) {
                console.error("Error fetching profile:", err);
              }
            })();
          }
          
          setLoading(false);
          clearTimeout(timeoutId);

          const {
            data: { subscription: sub },
          } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!cancelled) {
              const newUser = session?.user ?? null;
              setUser(newUser);
              
              // Fetch username and avatar when user changes
              if (newUser?.id) {
                (async () => {
                  try {
                    const { data: profile } = await supabase
                      .from("profiles")
                      .select("username, avatar_url")
                      .eq("id", newUser.id)
                      .single();
                    
                    if (!cancelled) {
                      setUsername(profile?.username || null);
                      setAvatarUrl(profile?.avatar_url || null);
                    }
                  } catch (err: any) {
                    console.error("Error fetching profile:", err);
                    if (!cancelled) {
                      setUsername(null);
                      setAvatarUrl(null);
                    }
                  }
                })();
              } else {
                setUsername(null);
                setAvatarUrl(null);
              }
            }
          });
          subscription = sub;
        } catch (raceError: any) {
          // Timeout or error - just show as not logged in
          if (!cancelled) {
            setUser(null);
            setLoading(false);
            clearTimeout(timeoutId);
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("Nav auth error:", e);
        // Don't set error - just show as not logged in
        setUser(null);
        setLoading(false);
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription?.unsubscribe?.();
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="border-b border-border/50 bg-[#030712] backdrop-blur-xl sticky top-0 z-50 shadow-lg shadow-black/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center border border-blue-700 transition-all group-hover:bg-blue-800">
                <span className="text-white font-bold text-lg">AI</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                Arena Trade
              </span>
            </Link>
            {user && (
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive("/dashboard")
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/arena"
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive("/arena")
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  Arena
                </Link>
                <Link
                  href="/community"
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive("/community")
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  Community
                </Link>
                <Link
                  href="/settings"
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    pathname?.startsWith("/settings")
                      ? "bg-blue-900/50 text-white border border-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-blue-950/30 border border-transparent"
                  }`}
                >
                  Settings
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-sm text-gray-400">Loading...</span>
            ) : user ? (
              <>
                <Link 
                  href={`/u/${user.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-900 bg-blue-950/30 hover:bg-blue-900/30 hover:border-blue-800 transition-all duration-300"
                >
                  <div className="relative w-8 h-8">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt={username || "Profile"} 
                        className="w-8 h-8 rounded-full object-cover border-2 border-blue-800"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-white font-bold text-sm border-2 border-blue-700">
                        {(username || user.email || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="hidden sm:inline-block text-sm font-medium text-white truncate max-w-[150px]">
                    {username || user.email?.split("@")[0] || `user_${user.id.substring(0, 8)}`}
                  </span>
                </Link>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut}
                  className="bg-transparent border-2 border-blue-700 text-white hover:text-white hover:border-blue-500 hover:bg-blue-900/50 transition-all duration-300"
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Link href="/auth">
                <Button size="sm" className="bg-blue-900 hover:bg-blue-800 text-white border border-blue-700 transition-all duration-300">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
