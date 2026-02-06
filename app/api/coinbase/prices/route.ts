import { NextRequest, NextResponse } from "next/server";
import { getMidPrices } from "@/lib/coinbase/prices";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { markets } = body;

    if (!markets || !Array.isArray(markets) || markets.length === 0) {
      return NextResponse.json(
        { error: "markets array is required" },
        { status: 400 }
      );
    }

    // Fetch fresh prices from Coinbase (supports both spot and INTX products)
    const prices = await getMidPrices(markets);

    return NextResponse.json({ prices }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching Coinbase prices:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
