"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const ALLOWED_ROUTES = ["/terms", "/privacy", "/risk", "/legal-acceptance", "/auth", "/contact"];

export function LegalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [hasAccepted, setHasAccepted] = useState(false);

  useEffect(() => {
    const checkLegalAcceptance = async () => {
      // Allow access to legal pages and auth
      if (ALLOWED_ROUTES.some(route => pathname.startsWith(route))) {
        setLoading(false);
        setHasAccepted(true);
        return;
      }

      try {
        const supabase = createClient();
        
        // Get current user
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          // Not logged in, allow access (AuthGuard will handle)
          setLoading(false);
          setHasAccepted(true);
          return;
        }

        // Check if user has accepted terms and risk
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("terms_accepted_at, risk_accepted_at")
          .eq("id", session.user.id)
          .single();

        if (error) {
          console.error("Failed to check legal acceptance:", error);
          setLoading(false);
          setHasAccepted(true); // Fail open to avoid blocking legitimate users
          return;
        }

        const accepted = profile?.terms_accepted_at && profile?.risk_accepted_at;
        
        if (!accepted) {
          // Redirect to legal acceptance page
          router.push("/legal-acceptance");
          return;
        }

        setHasAccepted(true);
      } catch (error) {
        console.error("Legal gate error:", error);
        setHasAccepted(true); // Fail open
      } finally {
        setLoading(false);
      }
    };

    checkLegalAcceptance();
  }, [pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1a]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAccepted) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
