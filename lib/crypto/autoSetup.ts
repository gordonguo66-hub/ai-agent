/**
 * Auto-setup encryption key for development
 * In production, the key MUST be manually set via environment variables
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

export function ensureEncryptionKey() {
  // If key is already set, we're good!
  if (process.env.CREDENTIALS_ENCRYPTION_KEY) {
    console.log("✅ CREDENTIALS_ENCRYPTION_KEY is configured");
    return;
  }

  // Production: REQUIRE manual setup
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    console.error("\n❌ ========================================");
    console.error("❌  PRODUCTION ERROR: ENCRYPTION KEY MISSING");
    console.error("❌ ========================================");
    console.error("❌  ");
    console.error("❌  You MUST set CREDENTIALS_ENCRYPTION_KEY in production!");
    console.error("❌  ");
    console.error("❌  1. Run locally: node generate-key.js");
    console.error("❌  2. Add to Vercel: Settings → Environment Variables");
    console.error("❌  3. Redeploy");
    console.error("❌  ");
    console.error("❌ ========================================\n");
    return; // Don't auto-generate in production
  }

  // Development: Auto-generate and save to .env.local
  console.log("\n🔧 ========================================");
  console.log("🔧  FIRST-TIME SETUP: Generating encryption key...");
  console.log("🔧 ========================================\n");

  const key = crypto.randomBytes(32).toString("base64");
  const envLocalPath = path.join(process.cwd(), ".env.local");

  try {
    // Read existing .env.local or create new one
    let envContent = "";
    if (fs.existsSync(envLocalPath)) {
      envContent = fs.readFileSync(envLocalPath, "utf8");
    }

    // Check if key already exists in file (but not loaded)
    if (envContent.includes("CREDENTIALS_ENCRYPTION_KEY=")) {
      console.log("⚠️  Encryption key exists in .env.local but isn't loaded.");
      console.log("⚠️  Please restart your dev server: npm run dev");
      return;
    }

    // Add the key
    const newLine = envContent && !envContent.endsWith("\n") ? "\n" : "";
    const keyLine = `\n# Auto-generated encryption key for API credentials\nCREDENTIALS_ENCRYPTION_KEY=${key}\n`;
    
    fs.writeFileSync(envLocalPath, envContent + newLine + keyLine);

    // Set it in the current process
    process.env.CREDENTIALS_ENCRYPTION_KEY = key;

    console.log("✅ Generated and saved encryption key to .env.local");
    console.log("\n📝 IMPORTANT:");
    console.log("   • Your encryption key has been saved to .env.local");
    console.log("   • For PRODUCTION, you must add this key to Vercel manually!");
    console.log("   • Run 'node generate-key.js' to get a production key");
    console.log("   • Backup your key securely!");
    console.log("\n🔧 ========================================\n");

  } catch (error: any) {
    console.error("❌ Failed to auto-generate encryption key:", error.message);
    console.error("❌ Please run manually: node generate-key.js");
  }
}
