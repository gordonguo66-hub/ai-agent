/**
 * Admin Authentication Utility
 *
 * Provides authentication for admin-only endpoints.
 * Admin user IDs must be configured in ADMIN_USER_IDS environment variable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";

/**
 * Check if a user is an authorized admin
 * Returns the user if authorized, or an error response if not
 */
export async function requireAdmin(request: NextRequest): Promise<{
  authorized: boolean;
  user?: { id: string; email?: string };
  response?: NextResponse;
}> {
  // Get the authenticated user from the request
  const user = await getUserFromRequest(request);

  if (!user) {
    console.warn("[Admin Auth] Unauthorized access attempt - no valid session");
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized - valid authentication required" },
        { status: 401 }
      ),
    };
  }

  // Get admin user IDs from environment variable (comma-separated)
  const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const adminUserIds = process.env.ADMIN_USER_IDS?.split(",")
    .map(id => id.trim())
    .filter(id => {
      if (!id) return false;
      if (!UUID_REGEX.test(id)) {
        console.warn(`[Admin Auth] Ignoring malformed admin UUID: "${id}"`);
        return false;
      }
      return true;
    }) || [];

  if (adminUserIds.length === 0) {
    console.error("[Admin Auth] ADMIN_USER_IDS environment variable not configured");
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Admin access not configured" },
        { status: 503 }
      ),
    };
  }

  if (!adminUserIds.includes(user.id)) {
    console.warn(`[Admin Auth] Forbidden - user ${user.id} attempted admin access`);
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden - admin access required" },
        { status: 403 }
      ),
    };
  }

  console.log(`[Admin Auth] Authorized admin access for user ${user.id}`);
  return { authorized: true, user };
}

/**
 * Check if ADMIN_USER_IDS is configured
 * Useful for health checks
 */
export function isAdminConfigured(): boolean {
  const adminUserIds = process.env.ADMIN_USER_IDS?.split(",").filter(Boolean) || [];
  return adminUserIds.length > 0;
}
