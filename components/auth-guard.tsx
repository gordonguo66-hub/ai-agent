"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * AuthGuard - Blocks rendering until auth is confirmed.
 * Shows a loading spinner while checking, redirects if not authenticated.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const supabase = createClient();

        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        );

        const {
          data: { session },
        } = await Promise.race([sessionPromise, timeoutPromise]);

        if (cancelled) return;

        if (session?.user) {
          setAuthenticated(true);
        } else {
          router.push("/auth");
        }
      } catch {
        // Timeout or error — redirect to auth to be safe
        if (!cancelled) {
          router.push("/auth");
        }
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return <>{children}</>;
}
