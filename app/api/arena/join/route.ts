import { NextRequest, NextResponse } from "next/server";

/**
 * DEPRECATED: Arena join endpoint
 * 
 * As of 2026-01-24, users can no longer join the Arena from an existing session.
 * Arena participation must be chosen at strategy start time to ensure fair comparison.
 * 
 * To join the Arena:
 * 1. Go to your strategy page
 * 2. Click "Start in Arena" button
 * 3. This creates a NEW session with standardized starting conditions ($100k equity)
 * 
 * This endpoint now returns 410 Gone to indicate the feature has been permanently moved.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { 
      error: "This endpoint is no longer available. To join the Arena, start a new session from the strategy page using the 'Start in Arena' button. Arena participation must be chosen at session creation time to ensure fair comparison with standardized starting conditions.",
      deprecated: true,
      migration: {
        message: "Use 'Start in Arena' button on strategy page instead",
        url: "/dashboard"
      }
    },
    { status: 410 } // 410 Gone - resource permanently removed
  );
}
