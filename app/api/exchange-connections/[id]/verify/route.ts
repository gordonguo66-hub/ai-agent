import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto/credentials";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { hyperliquidClient } from "@/lib/hyperliquid/client";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connectionId = params.id;
    const serviceClient = createServiceRoleClient();

    // Get the connection
    const { data: connection, error: connError } = await serviceClient
      .from("exchange_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Decrypt the private key
    let privateKey: string;
    try {
      privateKey = decryptCredential(connection.key_material_encrypted);
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to decrypt private key",
          details: error.message,
        },
        { status: 500 }
      );
    }

    // Test the connection by fetching account info
    try {
      // Use the hyperliquidClient singleton to fetch account state
      const accountState = await hyperliquidClient.getAccountState(
        connection.wallet_address
      );

      if (!accountState) {
        return NextResponse.json({
          success: false,
          error: "Could not fetch account state from Hyperliquid",
        });
      }

      // Calculate total account value
      const marginSummary = accountState.marginSummary;
      const accountValue = marginSummary?.accountValue || "0";
      const totalMarginUsed = marginSummary?.totalMarginUsed || "0";
      const totalNtlPos = marginSummary?.totalNtlPos || "0";

      return NextResponse.json({
        success: true,
        message: "Connection verified successfully",
        account: {
          wallet_address: connection.wallet_address,
          account_value: accountValue,
          margin_used: totalMarginUsed,
          total_position_value: totalNtlPos,
          positions_count: accountState.positions?.length || 0,
        },
      });
    } catch (error: any) {
      console.error("[Verify Connection] Hyperliquid API error:", error);
      return NextResponse.json({
        success: false,
        error: "Failed to connect to Hyperliquid",
        details: error.message || "Unknown error",
      });
    }
  } catch (error: any) {
    console.error("[Verify Connection] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
