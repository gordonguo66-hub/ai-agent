#!/bin/bash
cd /Users/gordon/Desktop/AI\ Agent

# Check if key already exists
if grep -q "CREDENTIALS_ENCRYPTION_KEY" .env.local 2>/dev/null; then
    echo "✅ Key already exists in .env.local"
else
    # Generate new key
    KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    
    # Add to .env.local
    echo "" >> .env.local
    echo "# Auto-generated encryption key" >> .env.local
    echo "CREDENTIALS_ENCRYPTION_KEY=$KEY" >> .env.local
    
    echo "✅ Added CREDENTIALS_ENCRYPTION_KEY to .env.local"
fi

# Show the key (hidden)
echo ""
echo "Key in .env.local:"
grep "CREDENTIALS_ENCRYPTION_KEY" .env.local | sed 's/=.*/=********/'
