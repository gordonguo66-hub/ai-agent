import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto/credentials";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { CoinbaseClient } from "@/lib/coinbase/client";

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

    // Route to venue-specific verification
    if (connection.venue === "coinbase") {
      return verifyCoinbaseConnection(connection);
    } else {
      return verifyHyperliquidConnection(connection);
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

async function verifyHyperliquidConnection(connection: any) {
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
    // Fetch both perp account state and total equity (includes spot USDC)
    const [accountState, totalEquity] = await Promise.all([
      hyperliquidClient.getAccountState(connection.wallet_address),
      hyperliquidClient.getTotalEquity(connection.wallet_address),
    ]);

    if (!accountState) {
      return NextResponse.json({
        success: false,
        error: "Could not fetch account state from Hyperliquid",
      });
    }

    // Use total equity which includes both perp margin and spot USDC
    const marginSummary = accountState.marginSummary;
    const totalMarginUsed = marginSummary?.totalMarginUsed || "0";
    const totalNtlPos = marginSummary?.totalNtlPos || "0";

    return NextResponse.json({
      success: true,
      message: "Connection verified successfully",
      account: {
        wallet_address: connection.wallet_address,
        // Use total equity (perp + spot) instead of just perp account value
        account_value: totalEquity.totalEquity.toFixed(2),
        perp_equity: totalEquity.perpEquity.toFixed(2),
        spot_usdc: totalEquity.spotUsdcBalance.toFixed(2),
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
}

async function verifyCoinbaseConnection(connection: any) {
  // Decrypt the API secret
  let apiSecret: string;
  try {
    apiSecret = decryptCredential(connection.api_secret_encrypted);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to decrypt API secret",
        details: error.message,
      },
      { status: 500 }
    );
  }

  // Test the connection by fetching account info
  try {
    const client = new CoinbaseClient();
    client.initialize(connection.api_key, apiSecret);

    // Test connection and get balances
    const balances = await client.getSpotBalances();
    const totalEquity = balances.reduce((sum, b) => sum + b.usdValue, 0);

    // Count non-dust balances
    const nonDustBalances = balances.filter((b) => b.usdValue >= 1);

    return NextResponse.json({
      success: true,
      message: "Connection verified successfully",
      account: {
        api_key: connection.api_key,
        equity: totalEquity,
        balances_count: nonDustBalances.length,
        balances: nonDustBalances.slice(0, 5).map((b) => ({
          asset: b.asset,
          available: b.available,
          usdValue: b.usdValue,
        })),
      },
    });
  } catch (error: any) {
    console.error("[Verify Connection] Coinbase API error:", error);
    return NextResponse.json({
      success: false,
      error: "Failed to connect to Coinbase",
      details: error.message || "Unknown error",
    });
  }
}
