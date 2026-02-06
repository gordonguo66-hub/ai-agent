// Quick test to check Hyperliquid API response
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase env vars, checking .env.local...");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // Get the user's exchange connection
  const { data: connections, error } = await supabase
    .from("exchange_connections")
    .select("wallet_address, user_id")
    .eq("venue", "hyperliquid")
    .limit(5);
  
  if (error) {
    console.error("Error fetching connections:", error);
    return;
  }
  
  console.log("Found", connections?.length, "exchange connections");
  
  for (const conn of connections || []) {
    console.log("\n--- Testing wallet:", conn.wallet_address, "---");
    try {
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "clearinghouseState",
          user: conn.wallet_address,
        }),
      });
      
      if (!response.ok) {
        console.error("API error:", response.statusText);
        continue;
      }
      
      const data = await response.json();
      console.log("marginSummary:", data.marginSummary);
      console.log("accountValue:", data.marginSummary?.accountValue);
      console.log("totalRawUsd:", data.marginSummary?.totalRawUsd);
      console.log("positions count:", data.assetPositions?.length || 0);
    } catch (err) {
      console.error("Error:", err.message);
    }
  }
}

test().catch(console.error);
