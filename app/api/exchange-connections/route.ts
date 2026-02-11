import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { encryptCredential, isEncryptionConfigured } from "@/lib/crypto/credentials";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { requireValidOrigin } from "@/lib/api/csrfProtection";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { CoinbaseClient } from "@/lib/coinbase/client";
import { Venue } from "@/lib/engine/types";

export async function POST(request: NextRequest) {
  try {
    const csrfCheck = requireValidOrigin(request);
    if (csrfCheck) return csrfCheck;

    // SECURITY: Verify encryption is configured before accepting any credentials
    if (!isEncryptionConfigured()) {
      console.error("[SECURITY] Encryption key not configured - refusing to store credentials");
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 503 }
      );
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();

    const venue: Venue = body.venue || "hyperliquid";

    // Route to venue-specific handler
    if (venue === "coinbase") {
      return handleCoinbaseConnection(user.id, body);
    } else {
      return handleHyperliquidConnection(user.id, body);
    }
  } catch (error: any) {
    // Don't leak encryption errors to client - log server-side
    if (error.message?.includes("SECURITY ERROR")) {
      console.error("[SECURITY]", error.message);
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Handle Hyperliquid connection (existing flow)
 */
async function handleHyperliquidConnection(userId: string, body: any) {
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
        error: "Invalid private key format. Private key must start with '0x' and be 66 characters long (0x + 64 hex characters).",
      },
      { status: 400 }
    );
  }

  // Validate wallet address format
  if (!wallet_address.startsWith("0x") || wallet_address.length !== 42) {
    return NextResponse.json(
      {
        error: "Invalid wallet address format. Address must start with '0x' and be 42 characters long.",
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
        details: verifyError.message,
      },
      { status: 400 }
    );
  }

  // Encrypt server-side
  const encrypted = encryptCredential(String(key_material_encrypted));

  const serviceClient = createServiceRoleClient();

  const { data: connection, error } = await serviceClient
    .from("exchange_connections")
    .insert({
      user_id: userId,
      venue,
      wallet_address,
      key_material_encrypted: encrypted,
      credential_type: "private_key",
    })
    .select()
    .single();

  if (error || !connection) {
    return NextResponse.json(
      { error: error?.message || "Failed to create connection" },
      { status: 500 }
    );
  }

  // Don't return sensitive fields to client
  const { key_material_encrypted: _, ...safeConnection } = connection;

  return NextResponse.json(
    {
      connection: safeConnection,
      verified: true,
    },
    { status: 201 }
  );
}

/**
 * Handle Coinbase connection
 * Note: INTX perpetuals use the same API credentials as spot (no passphrase needed)
 */
async function handleCoinbaseConnection(userId: string, body: any) {
  const { api_key, api_secret, intx_enabled = false } = body;

  if (!api_key || !api_secret) {
    return NextResponse.json(
      { error: "Missing required fields: api_key, api_secret" },
      { status: 400 }
    );
  }

  // Validate API key - just ensure it's not empty
  if (api_key.trim().length < 5) {
    return NextResponse.json(
      { error: "Invalid API Key ID. Please enter your Coinbase API Key ID." },
      { status: 400 }
    );
  }

  // Validate API secret - just ensure it has content
  // The actual verification will happen when we test the connection
  if (api_secret.trim().length < 20) {
    return NextResponse.json(
      { error: "Invalid API Secret. Please paste your complete private key from Coinbase." },
      { status: 400 }
    );
  }

  // VERIFY credentials BEFORE saving by making a test request
  console.log("[Exchange Connection] Verifying Coinbase API credentials...");
  try {
    const client = new CoinbaseClient();
    client.initialize(api_key, api_secret);
    await client.testConnection();
    console.log("[Exchange Connection] ✅ Coinbase credentials verified");
  } catch (verifyError: any) {
    console.error("[Exchange Connection] ❌ Coinbase verification failed:", verifyError);

    // Provide more specific error messages
    const errorMsg = verifyError.message || "";
    let userError = "Could not connect to Coinbase. Please check your API Key ID and Secret.";

    if (errorMsg.includes("401") || errorMsg.includes("Unauthorized") || errorMsg.includes("authentication")) {
      userError = "Invalid API credentials. Please verify your API Key ID and Secret are correct.";
    } else if (errorMsg.includes("403") || errorMsg.includes("Forbidden") || errorMsg.includes("permission")) {
      userError = "API key lacks trading permissions. Please enable trading permissions in Coinbase CDP.";
    } else if (errorMsg.includes("network") || errorMsg.includes("ENOTFOUND") || errorMsg.includes("timeout")) {
      userError = "Network error connecting to Coinbase. Please try again.";
    }

    return NextResponse.json(
      {
        error: userError,
        details: verifyError.message,
      },
      { status: 400 }
    );
  }

  // Encrypt the API secret
  const encryptedSecret = encryptCredential(api_secret);

  const serviceClient = createServiceRoleClient();

  const { data: connection, error } = await serviceClient
    .from("exchange_connections")
    .insert({
      user_id: userId,
      venue: "coinbase",
      api_key,
      api_secret_encrypted: encryptedSecret,
      credential_type: "api_key",
      intx_enabled: Boolean(intx_enabled),
    })
    .select()
    .single();

  if (error || !connection) {
    // Check if it's a duplicate key error
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "You already have a Coinbase connection. Please delete the existing one first." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error?.message || "Failed to create connection" },
      { status: 500 }
    );
  }

  // Don't return sensitive fields to client
  const { api_secret_encrypted: _, ...safeConnection } = connection;

  return NextResponse.json(
    {
      connection: safeConnection,
      verified: true,
    },
    { status: 201 }
  );
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
      .select("id, venue, wallet_address, api_key, credential_type, intx_enabled, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform connections to show appropriate identifier per venue
    const safeConnections = (connections || []).map((conn) => ({
      id: conn.id,
      venue: conn.venue,
      credential_type: conn.credential_type,
      // Show wallet address for Hyperliquid, truncated API key for Coinbase
      identifier:
        conn.venue === "coinbase"
          ? conn.api_key?.split("/").pop() || "Connected"
          : conn.wallet_address,
      wallet_address: conn.wallet_address,
      api_key: conn.api_key,
      intx_enabled: conn.intx_enabled || false,
      created_at: conn.created_at,
    }));

    return NextResponse.json({ connections: safeConnections });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
