'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';

/**
 * Checks if the current user is an admin via the server-side admin verify endpoint.
 * If so, excludes them from analytics tracking.
 * This replaces the old ?identify_admin=true query param which anyone could use.
 */
export function AdminIdentifier() {
  useEffect(() => {
    async function checkAdmin() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch('/api/admin/verify', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          localStorage.setItem('exclude_from_analytics', 'true');
        }
      } catch {
        // Not an admin or not logged in - do nothing
      }
    }
    checkAdmin();
  }, []);

  return null;
}
