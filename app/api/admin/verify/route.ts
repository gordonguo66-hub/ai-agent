import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/verify
 * Check if the current user is an authorized admin
 */
export async function GET(request: NextRequest) {
  const { authorized, response } = await requireAdmin(request);

  if (!authorized) {
    return response;
  }

  return NextResponse.json({ admin: true });
}
