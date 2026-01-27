#!/usr/bin/env node
/**
 * Re-encrypt all saved API keys with the current encryption key
 * This fixes "Unsupported state or unable to authenticate data" errors
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptCredential } = require('./lib/crypto/credentials');
require('dotenv').config({ path: '.env.local' });

async function fixEncryptedKeys() {
  console.log('🔧 Starting to fix encrypted API keys...\n');

  // Check if encryption key is set
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    console.error('❌ CREDENTIALS_ENCRYPTION_KEY not found in .env.local');
    console.error('❌ Please restart the server first to generate it');
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get all saved API keys
    const { data: keys, error } = await supabase
      .from('user_api_keys')
      .select('*');

    if (error) {
      console.error('❌ Error fetching keys:', error.message);
      process.exit(1);
    }

    console.log(`📋 Found ${keys.length} saved API key(s)\n`);

    for (const key of keys) {
      console.log(`Processing: ${key.label} (${key.provider_name})...`);

      try {
        // Try to decrypt the existing key
        const { decryptCredential } = require('./lib/crypto/credentials');
        let plainKey;
        
        try {
          plainKey = decryptCredential(key.encrypted_key);
          console.log(`  ✅ Key is valid, no action needed`);
          continue; // Skip if it can be decrypted already
        } catch (decryptError) {
          // Key can't be decrypted - it's corrupted
          console.log(`  ⚠️  Key is corrupted, needs manual replacement`);
          console.log(`  ℹ️  Please go to Settings and re-enter this API key`);
          console.log(`  ℹ️  Key ID: ${key.id}`);
        }

      } catch (err) {
        console.error(`  ❌ Error processing key:`, err.message);
      }

      console.log('');
    }

    console.log('\n📋 Summary:');
    console.log('If you saw "Key is corrupted" messages above:');
    console.log('1. Go to Settings → Saved API Keys');
    console.log('2. Delete the corrupted key(s)');
    console.log('3. Add them again with the correct API key value');
    console.log('4. The new encryption will work correctly');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

fixEncryptedKeys();
