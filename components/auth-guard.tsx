"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * AuthGuard - NON-BLOCKING version
 * Always shows content immediately, checks auth in background
 * Only redirects if definitely not authenticated (after content is shown)
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    
    // Check auth in background - NEVER block rendering
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        
        // Use a very short timeout - fail fast
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 300)
        );

        try {
          const {
            data: { session },
          } = await Promise.race([sessionPromise, timeoutPromise]);

          if (cancelled) return;

          // Only redirect if we're 100% sure user is not authenticated
          if (!session?.user) {
            // Small delay to let page render first
            setTimeout(() => {
              if (!cancelled) {
                router.push("/auth");
              }
            }, 100);
          }
        } catch (raceError: any) {
          // Timeout or error - DO NOTHING, show content
          // Don't redirect on timeout - user might be authenticated
          if (!cancelled) {
            console.log("Auth check timed out - showing content anyway");
          }
        }
      } catch (e: any) {
        // Any error - DO NOTHING, show content
        if (!cancelled) {
          console.log("Auth check error - showing content anyway:", e.message);
        }
      }
    };

    // Check auth after a tiny delay to ensure page renders first
    const timer = setTimeout(() => {
      checkAuth();
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  // ALWAYS show content immediately - NEVER block
  return <>{children}</>;
}
