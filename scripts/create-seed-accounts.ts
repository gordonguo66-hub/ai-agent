/**
 * One-time script to create real Supabase accounts for seed traders.
 *
 * Usage: npx tsx scripts/create-seed-accounts.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dependency)
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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TRUMP_AVATAR = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/200px-Donald_Trump_official_portrait.jpg";

const BASE_EMAIL = "gordonguo66";
const PASSWORD = "asdfghjkl";

const TRADERS = [
  { username: "marcus1987", displayName: "marcus1987", avatarUrl: "/avatars/seed/IMG_6382.jpg" },
  { username: "nateqt",     displayName: "nateqt",     avatarUrl: "/avatars/seed/IMG_6380.jpg" },
  { username: "dvrgnt",     displayName: "dvrgnt",     avatarUrl: "/avatars/seed/IMG_6383.jpg" },
  { username: "BJTexas",    displayName: "BJTexas",     avatarUrl: TRUMP_AVATAR },
];

async function main() {
  console.log("Creating seed trader accounts...\n");

  for (const trader of TRADERS) {
    const email = `${BASE_EMAIL}+${trader.username.toLowerCase()}@gmail.com`;
    console.log(`--- ${trader.displayName} (${email}) ---`);

    // 1. Create auth user (email_confirm: true skips verification)
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message.includes("already been registered")) {
        console.log("  Account already exists — updating profile");
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users?.find(u => u.email === email);
        if (existing) {
          await updateProfile(existing.id, trader);
        }
      } else {
        console.error(`  FAILED: ${createError.message}`);
      }
      continue;
    }

    const userId = userData.user.id;
    console.log(`  Created auth user: ${userId}`);

    // 2. Update profile (trigger already created the row)
    await updateProfile(userId, trader);
  }

  console.log("\n=== Done! ===");
  console.log("\nLogin credentials:");
  for (const trader of TRADERS) {
    const email = `${BASE_EMAIL}+${trader.username.toLowerCase()}@gmail.com`;
    console.log(`  ${trader.displayName}: ${email} / ${PASSWORD}`);
  }
}

async function updateProfile(userId: string, trader: { username: string; displayName: string; avatarUrl: string }) {
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      username: trader.username,
      display_name: trader.displayName,
      avatar_url: trader.avatarUrl,
    })
    .eq("id", userId);

  if (profileError) {
    console.error(`  FAILED to update profile: ${profileError.message}`);
  } else {
    console.log(`  Profile updated: ${trader.displayName} | avatar: ${trader.avatarUrl}`);
  }
}

main().catch(console.error);
