"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { AuthGateModal } from "./auth-gate-modal";
import posthog from "posthog-js";

interface AuthGateContextType {
  /** Current user object or null if not signed in */
  user: any | null;
  /** Whether auth state is still loading */
  loading: boolean;
  /** 
   * Check if user is signed in and navigate if so.
   * If not signed in, shows the auth gate modal.
   * @param href - The URL to navigate to
   * @param options - Optional settings
   * @returns true if user is signed in (navigation will proceed), false if gate was shown
   */
  gatedNavigate: (href: string, options?: { title?: string; description?: string }) => boolean;
  /**
   * Show the auth gate modal without navigation
   * @param returnTo - URL to redirect to after signing in
   * @param options - Optional title and description
   */
  showAuthGate: (returnTo?: string, options?: { title?: string; description?: string }) => void;
}

const AuthGateContext = createContext<AuthGateContextType | undefined>(undefined);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReturnTo, setModalReturnTo] = useState<string | undefined>();
  const [modalTitle, setModalTitle] = useState<string | undefined>();
  const [modalDescription, setModalDescription] = useState<string | undefined>();

  // Check auth state on mount and listen for changes
  useEffect(() => {
    let cancelled = false;
    let subscription: any;

    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!cancelled) {
          setUser(session?.user ?? null);
          setLoading(false);
          if (session?.user) {
            posthog.identify(session.user.id, { email: session.user.email });
          }
        }

        // Listen for auth changes
        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) {
            setUser(session?.user ?? null);
            if (session?.user) {
              posthog.identify(session.user.id, { email: session.user.email });
            } else {
              posthog.reset();
            }
          }
        });
        subscription = sub;
      } catch (error) {
        console.error("Auth check error:", error);
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, []);

  const showAuthGate = useCallback((returnTo?: string, options?: { title?: string; description?: string }) => {
    setModalReturnTo(returnTo);
    setModalTitle(options?.title);
    setModalDescription(options?.description);
    setModalOpen(true);
  }, []);

  const gatedNavigate = useCallback((href: string, options?: { title?: string; description?: string }): boolean => {
    if (user) {
      // User is signed in, navigate normally
      router.push(href);
      return true;
    } else {
      // User is not signed in, show gate
      showAuthGate(href, options);
      return false;
    }
  }, [user, router, showAuthGate]);

  return (
    <AuthGateContext.Provider value={{ user, loading, gatedNavigate, showAuthGate }}>
      {children}
      <AuthGateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        returnTo={modalReturnTo}
        title={modalTitle}
        description={modalDescription}
      />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const context = useContext(AuthGateContext);
  if (context === undefined) {
    throw new Error("useAuthGate must be used within an AuthGateProvider");
  }
  return context;
}
