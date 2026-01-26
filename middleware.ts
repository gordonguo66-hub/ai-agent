import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: any;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // CRITICAL: Actually refresh the session to keep it alive
  // This ensures cookies are updated with fresh tokens
  try {
    await supabase.auth.getUser();
  } catch (error) {
    // If getUser fails, try getSession as fallback
    try {
      await supabase.auth.getSession();
    } catch (sessionError) {
      // Session is invalid - let pages handle redirect
    }
  }

  // Let pages handle their own auth checks with requireAuth()
  // Middleware ensures cookies are properly set/refreshed
  // Pages will redirect to /auth if not authenticated

  return response;
}

export const config = {
  matcher: [
    // Exclude /api routes from middleware to avoid hanging route handlers.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
