-- Migration: User Saved API Keys
-- This allows users to save and reuse API keys across strategies

-- Create user_api_keys table
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_preview TEXT NOT NULL, -- Last 4 chars for display (e.g., "****abcd")
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique labels per user per provider
  UNIQUE(user_id, provider, label)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(user_id, provider);

-- Add saved_api_key_id to strategies table (nullable FK)
ALTER TABLE strategies 
ADD COLUMN IF NOT EXISTS saved_api_key_id UUID REFERENCES user_api_keys(id) ON DELETE SET NULL;

-- Create index for strategies.saved_api_key_id
CREATE INDEX IF NOT EXISTS idx_strategies_saved_api_key_id ON strategies(saved_api_key_id);

-- Enable RLS on user_api_keys
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_api_keys
-- Users can only see their own saved API keys
CREATE POLICY "Users can view own api keys"
  ON user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own API keys
CREATE POLICY "Users can insert own api keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys (label only - key is immutable)
CREATE POLICY "Users can update own api keys"
  ON user_api_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete own api keys"
  ON user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE user_api_keys IS 'User-saved API keys for LLM providers that can be reused across strategies';
COMMENT ON COLUMN user_api_keys.encrypted_key IS 'AES-256-GCM encrypted API key using CREDENTIALS_ENCRYPTION_KEY';
COMMENT ON COLUMN user_api_keys.key_preview IS 'Masked preview showing last 4 chars (e.g., ****abcd) for UI display';
COMMENT ON COLUMN strategies.saved_api_key_id IS 'Reference to user_api_keys. If set, use saved key instead of api_key_ciphertext';
