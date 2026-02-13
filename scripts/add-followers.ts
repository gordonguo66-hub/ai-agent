/**
 * Add fake followers to marcus1987's account.
 *
 * Usage: npx tsx scripts/add-followers.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MARCUS_ID = "b657704f-caea-4677-a1d3-08b228c3dad5";
const TARGET_FOLLOWERS = 56;

async function main() {
  // Check current follower count
  const { count } = await supabase
    .from("user_follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", MARCUS_ID);

  const currentFollowers = count || 0;
  const needed = TARGET_FOLLOWERS - currentFollowers;
  console.log(`marcus1987 has ${currentFollowers} followers, need ${needed} more`);

  if (needed <= 0) {
    console.log("Already has enough followers!");
    return;
  }

  // Use existing seed accounts as some followers first
  const existingUsers = [
    "cfb995bd-95e0-4e24-9815-6e79a959f0f9", // nateqt
    "6e145184-fdc6-4697-b4cf-0919b7e8f884", // dvrgnt
    "4de46b17-11b1-4b77-8102-dd0689b12dd5", // BJTexas
  ];

  let added = 0;

  // Add existing accounts as followers
  for (const userId of existingUsers) {
    if (added >= needed) break;
    const { error } = await supabase
      .from("user_follows")
      .insert({ follower_id: userId, following_id: MARCUS_ID })
      .select();
    if (!error) {
      added++;
      console.log(`  Added existing user ${userId} as follower`);
    } else if (error.code === "23505") {
      console.log(`  ${userId} already follows marcus`);
    } else {
      console.error(`  Error: ${error.message}`);
    }
  }

  // Create dummy accounts for remaining follows
  const dummyNames = [
    "trader_alex", "crypto_jen", "btc_mike", "eth_sarah", "sol_dave",
    "luna_kate", "defi_rob", "nft_lisa", "hodl_tom", "chain_amy",
    "block_ryan", "swap_emma", "yield_dan", "stake_nina", "mint_jack",
    "gas_zoe", "node_ben", "ape_carl", "long_maria", "short_phil",
    "degen_ivy", "whale_oscar", "bear_sue", "bull_greg", "moon_tina",
    "rekt_frank", "pump_lara", "bag_will", "wick_rosa", "candle_max",
    "fib_helen", "ema_troy", "rsi_gina", "macd_leon", "vwap_mary",
    "arb_pedro", "perp_clara", "spot_hank", "liq_nora", "margin_ed",
    "delta_ray", "gamma_jo", "theta_kai", "sigma_lex", "alpha_mia",
    "beta_cole", "omega_fay", "psi_drew", "phi_ava", "chi_luke",
    "zeta_iris", "eta_wade", "iota_sky",
  ];

  let nameIdx = 0;
  while (added < needed && nameIdx < dummyNames.length) {
    const name = dummyNames[nameIdx++];
    const email = `gordonguo66+${name}@gmail.com`;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "asdfghjkl",
      email_confirm: true,
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        // Find existing user and follow
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users?.find(u => u.email === email);
        if (existing) {
          const { error: followErr } = await supabase
            .from("user_follows")
            .insert({ follower_id: existing.id, following_id: MARCUS_ID })
            .select();
          if (!followErr) added++;
        }
      } else {
        console.error(`  Failed to create ${name}: ${error.message}`);
      }
      continue;
    }

    const userId = data.user.id;
    // Update profile display name
    await supabase.from("profiles").update({ display_name: name }).eq("id", userId);

    // Follow marcus
    const { error: followErr } = await supabase
      .from("user_follows")
      .insert({ follower_id: userId, following_id: MARCUS_ID })
      .select();

    if (!followErr) {
      added++;
      console.log(`  Created ${name} and followed marcus (${added}/${needed})`);
    }
  }

  // Verify final count
  const { count: finalCount } = await supabase
    .from("user_follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", MARCUS_ID);

  console.log(`\nDone! marcus1987 now has ${finalCount} followers`);
}

main().catch(console.error);
