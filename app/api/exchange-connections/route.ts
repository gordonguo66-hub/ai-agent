import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { encryptCredential } from "@/lib/crypto/credentials";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { hyperliquidClient } from "@/lib/hyperliquid/client";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();

    const { wallet_address, key_material_encrypted, venue = "hyperliquid" } = body;

    if (!wallet_address || !key_material_encrypted) {
      return NextResponse.json(
        { error: "Missing required fields: wallet_address, key_material_encrypted" },
        { status: 400 }
      );
    }

    // Validate private key format
    if (!key_material_encrypted.startsWith("0x") || key_material_encrypted.length !== 66) {
      return NextResponse.json(
        { 
          error: "Invalid private key format. Private key must start with '0x' and be 66 characters long (0x + 64 hex characters)." 
        },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!wallet_address.startsWith("0x") || wallet_address.length !== 42) {
      return NextResponse.json(
        { 
          error: "Invalid wallet address format. Address must start with '0x' and be 42 characters long." 
        },
        { status: 400 }
      );
    }

    // VERIFY credentials BEFORE saving
    console.log("[Exchange Connection] Verifying wallet address on Hyperliquid...");
    try {
      const accountState = await hyperliquidClient.getAccountState(wallet_address);
      if (!accountState) {
        return NextResponse.json(
          { error: "Could not find this wallet address on Hyperliquid. Make sure you're using the correct address." },
          { status: 400 }
        );
      }
      console.log("[Exchange Connection] ✅ Wallet address verified on Hyperliquid");
      console.log("[Exchange Connection] Account Value:", accountState.marginSummary?.accountValue);
    } catch (verifyError: any) {
      console.error("[Exchange Connection] ❌ Verification failed:", verifyError);
      return NextResponse.json(
        { 
          error: "Could not connect to Hyperliquid. Please check your wallet address and try again.", 
          details: verifyError.message 
        },
        { status: 400 }
      );
    }

    // Encrypt server-side if CREDENTIALS_ENCRYPTION_KEY is configured.
    const encrypted = encryptCredential(String(key_material_encrypted));

    const serviceClient = createServiceRoleClient();

    const { data: connection, error } = await serviceClient
      .from("exchange_connections")
      .insert({
        user_id: user.id,
        venue,
        wallet_address,
        key_material_encrypted: encrypted,
      })
      .select()
      .single();

    if (error || !connection) {
      return NextResponse.json(
        { error: error?.message || "Failed to create connection" },
        { status: 500 }
      );
    }

    // Don't return key_material_encrypted to client
    const { key_material_encrypted: _, ...safeConnection } = connection;

    return NextResponse.json({ 
      connection: safeConnection,
      verified: true 
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const serviceClient = createServiceRoleClient();

    const { data: connections, error } = await serviceClient
      .from("exchange_connections")
      .select("id, venue, wallet_address, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ connections: connections || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
