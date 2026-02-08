import { NextRequest, NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";

// Disable Next.js caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/subscriptions/plans
 * Get all available subscription plans (public endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    const serviceClient = createFreshServiceClient();

    // Try raw SQL query to bypass any caching
    const { data, error } = await serviceClient
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })
      .limit(100); // Add limit to force fresh query

    if (error) {
      console.error("[GET /api/subscriptions/plans] Error fetching plans:", error);
      return NextResponse.json(
        { error: "Failed to fetch subscription plans" },
        { status: 500 }
      );
    }

    // Log the actual data we're getting from the database
    console.log("[GET /api/subscriptions/plans] Retrieved plans:", JSON.stringify(data, null, 2));

    return NextResponse.json({
      plans: data || [],
      _debug: { timestamp: new Date().toISOString() } // Add timestamp to prevent caching
    });
  } catch (error: any) {
    console.error("[GET /api/subscriptions/plans] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
