#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');

try {
  // Read existing .env.local
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Check if key already exists
  if (envContent.includes('CREDENTIALS_ENCRYPTION_KEY=')) {
    console.log('✅ CREDENTIALS_ENCRYPTION_KEY already exists in .env.local');
    console.log('✅ Server restart should fix the issue');
    process.exit(0);
  }

  // Generate new key
  const key = crypto.randomBytes(32).toString('base64');

  // Add to .env.local
  const newLine = envContent && !envContent.endsWith('\n') ? '\n' : '';
  const keyLine = `\n# Encryption key for customer API keys\nCREDENTIALS_ENCRYPTION_KEY=${key}\n`;
  
  fs.writeFileSync(envPath, envContent + newLine + keyLine);

  console.log('✅ Added CREDENTIALS_ENCRYPTION_KEY to .env.local');
  console.log('✅ Key has been set. Restart the server now.');
  console.log('\n📋 Copy this key to Vercel (Settings → Environment Variables):');
  console.log(`CREDENTIALS_ENCRYPTION_KEY=${key}`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
