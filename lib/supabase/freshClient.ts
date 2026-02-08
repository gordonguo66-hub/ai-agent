import { createClient } from "@supabase/supabase-js";

/**
 * Creates a fresh Supabase service client for each request.
 *
 * This avoids caching issues in Vercel's serverless environment where
 * connection pooling or client reuse can return stale data.
 *
 * Use this for ALL operations that read/write user_balance or other
 * critical billing data.
 */
export function createFreshServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      },
    }
  );
}
