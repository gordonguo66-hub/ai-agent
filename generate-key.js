#!/usr/bin/env node
/**
 * Generate a secure encryption key for CREDENTIALS_ENCRYPTION_KEY
 * Run with: node generate-key.js
 */

const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('base64');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     CREDENTIALS ENCRYPTION KEY GENERATOR                   ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');
console.log('📋 Copy the line below and add it to your .env.local file:\n');
console.log(`\x1b[32mCREDENTIALS_ENCRYPTION_KEY=${key}\x1b[0m`);
console.log('\n⚠️  IMPORTANT:');
console.log('   • Keep this key secret!');
console.log('   • Back it up securely');
console.log('   • If you lose it, encrypted API keys cannot be recovered');
console.log('\n✅ After adding to .env.local, restart your dev server\n');
