-- Migration: Platform-Only AI Access
-- Date: 2026-02-10
-- Description: All strategies use Corebound platform keys - no user API keys allowed.
--              This ensures Corebound earns revenue on every AI call.

-- Add use_platform_key column to strategies table (always TRUE)
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS use_platform_key BOOLEAN DEFAULT true;

-- Force ALL strategies to use platform keys (no user keys)
UPDATE strategies
SET use_platform_key = true;

-- Clear any existing user API keys (no longer used)
UPDATE strategies
SET api_key_ciphertext = NULL,
    saved_api_key_id = NULL;

-- Make api_key_ciphertext nullable (not required since we use platform keys)
ALTER TABLE strategies
ALTER COLUMN api_key_ciphertext DROP NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN strategies.use_platform_key IS
  'Always TRUE - all AI calls use Corebound platform keys and are billed to user balance.';

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_strategies_use_platform_key
ON strategies(use_platform_key)
WHERE use_platform_key = true;
