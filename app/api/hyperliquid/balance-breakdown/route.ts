import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { decryptCredential } from "@/lib/crypto/credentials";

/**
 * GET /api/hyperliquid/balance-breakdown
 * Returns the spot vs perp balance breakdown for the current user's Hyperliquid connection.
 * Used to warn users when funds are in spot but not perps (can't trade).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Get user's exchange connection
    const { data: connection, error: connError } = await supabase
      .from("exchange_connections")
      .select("wallet_address")
      .eq("user_id", user.id)
      .eq("venue", "hyperliquid")
      .maybeSingle();

    if (connError || !connection) {
      return NextResponse.json({
        perpEquity: 0,
        spotUsdcBalance: 0,
        totalEquity: 0,
        hasConnection: false,
      });
    }

    // Get balance breakdown from Hyperliquid
    const breakdown = await hyperliquidClient.getTotalEquity(connection.wallet_address);

    return NextResponse.json({
      perpEquity: breakdown.perpEquity,
      spotUsdcBalance: breakdown.spotUsdcBalance,
      totalEquity: breakdown.totalEquity,
      hasConnection: true,
      // Include warning flags
      // With unified accounts, spot USDC can be used for perp trading without transfer
      fundsInSpotOnly: breakdown.spotUsdcBalance > 1 && breakdown.perpEquity < 1,
      tradingAvailable: breakdown.totalEquity >= 1, // Use total equity for unified accounts
    });
  } catch (error: any) {
    console.error("Balance breakdown error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get balance breakdown" },
      { status: 500 }
    );
  }
}
