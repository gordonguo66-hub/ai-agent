"use client";

import { createClient } from "@/lib/supabase/browser";

// Simple in-memory cache to prevent race conditions when multiple calls happen simultaneously
let tokenCache: { token: string; expiresAt: number } | null = null;
let refreshPromise: Promise<string | null> | null = null;

export async function getBearerToken(): Promise<string | null> {
  const supabase = createClient();
  
  try {
    // If there's an ongoing refresh, wait for it instead of starting a new one
    if (refreshPromise) {
      console.log(`[getBearerToken] Waiting for ongoing refresh...`);
      return await refreshPromise;
    }
    
    // Check cache first (valid for 1 second to prevent rapid successive calls)
    if (tokenCache && tokenCache.expiresAt > Date.now()) {
      console.log(`[getBearerToken] Using cached token`);
      return tokenCache.token;
    }
    
    // Start refresh (will be shared by concurrent calls)
    refreshPromise = (async () => {
      try {
        // First, try to get the current session
        let {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        
        // If session exists but might be expired, check if token is still valid
        if (session?.access_token) {
          // Check if token is expired (with 5 minute buffer)
          const expiresAt = session.expires_at;
          if (expiresAt) {
            const expiresAtMs = expiresAt * 1000;
            const bufferMs = 5 * 60 * 1000; // 5 minutes
            const now = Date.now();
            
            // If token expires soon, try to refresh proactively
            if (expiresAtMs - now < bufferMs) {
              console.log(`[getBearerToken] Token expires soon, refreshing proactively...`);
              const {
                data: { session: refreshedSession },
                error: refreshError,
              } = await supabase.auth.refreshSession();
              
              if (!refreshError && refreshedSession) {
                session = refreshedSession;
                console.log(`[getBearerToken] ✅ Session refreshed successfully`);
              } else {
                console.warn(`[getBearerToken] ⚠️ Failed to refresh session:`, refreshError);
              }
            }
          }
        }
        
        // If no session, try to refresh (might have refresh token in cookies)
        if (!session) {
          console.log(`[getBearerToken] No session found, attempting refresh...`);
          const {
            data: { session: refreshedSession },
            error: refreshError,
          } = await supabase.auth.refreshSession();
          
          if (!refreshError && refreshedSession) {
            session = refreshedSession;
            console.log(`[getBearerToken] ✅ Session restored via refresh`);
          } else {
            console.warn(`[getBearerToken] ⚠️ Cannot restore session - user needs to sign in`);
          }
        }
        
        const token = session?.access_token;
        
        if (!token) {
          console.warn(`[getBearerToken] ❌ No session token available - user may need to sign in`);
          tokenCache = null;
          return null;
        }
        
        const bearerToken = `Bearer ${token}`;
        
        // Cache the token for 1 second (prevents rapid successive calls from all refreshing)
        tokenCache = {
          token: bearerToken,
          expiresAt: Date.now() + 1000, // 1 second cache
        };
        
        return bearerToken;
      } finally {
        // Clear the refresh promise so next call can start a new one if needed
        refreshPromise = null;
      }
    })();
    
    return await refreshPromise;
  } catch (error: any) {
    console.error(`[getBearerToken] ❌ Error getting bearer token:`, error);
    refreshPromise = null;
    tokenCache = null;
    return null;
  }
}

