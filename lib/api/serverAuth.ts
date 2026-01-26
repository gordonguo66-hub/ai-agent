import { NextRequest } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/api/withTimeout";

export async function getUserFromRequest(request: NextRequest) {
  const authHeader =
    request.headers.get("authorization") || request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const supabase = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await withTimeout(
      supabase.auth.getUser(token),
      4000,
      "auth.getUser(bearer)"
    );
    if (error) throw new Error(error.message);
    return data.user ?? null;
  }

  // Fallback: cookie-based session (may be absent depending on client setup)
  const cookieSupabase = await createCookieClient();
  const {
    data: { session },
  } = await withTimeout(cookieSupabase.auth.getSession(), 2000, "auth.getSession(cookie)");
  return session?.user ?? null;
}

