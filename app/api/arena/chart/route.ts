import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Arena chart endpoint - returns empty chart data structure
// until arena competition sessions exist
export async function GET() {
  return NextResponse.json({
    equityChartData: [],
    returnChartData: [],
    participants: [],
    equityYAxis: null,
    returnYAxis: null,
    maxElapsedMs: 0,
    minTime: 0,
    maxTime: 0,
  });
}
