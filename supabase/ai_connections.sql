-- GenAI Connections (DeepSeek / OpenAI-compatible) migration
-- Add-only migration. Safe to run after supabase/schema.sql.

CREATE TABLE IF NOT EXISTS ai_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- e.g. 'deepseek', 'openai', 'openrouter', 'together', 'groq', 'perplexity', 'fireworks', 'xai', 'custom'
  base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com', -- OpenAI-compatible base URL (without trailing slash)
  default_model TEXT, -- e.g. 'deepseek-chat', 'gpt-4o-mini', etc.
  api_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill new columns for existing rows (safe no-op if already present)
ALTER TABLE ai_connections
  ADD COLUMN IF NOT EXISTS base_url TEXT;
ALTER TABLE ai_connections
  ADD COLUMN IF NOT EXISTS default_model TEXT;

UPDATE ai_connections
SET base_url = CASE
  WHEN provider = 'deepseek' THEN 'https://api.deepseek.com'
  WHEN provider = 'openai' THEN 'https://api.openai.com/v1'
  WHEN provider = 'openrouter' THEN 'https://openrouter.ai/api/v1'
  WHEN provider = 'together' THEN 'https://api.together.xyz/v1'
  WHEN provider = 'groq' THEN 'https://api.groq.com/openai/v1'
  WHEN provider = 'perplexity' THEN 'https://api.perplexity.ai'
  WHEN provider = 'fireworks' THEN 'https://api.fireworks.ai/inference/v1'
  WHEN provider = 'xai' THEN 'https://api.x.ai/v1'
  ELSE 'https://api.deepseek.com'
END
WHERE base_url IS NULL OR base_url = '';

-- Ensure defaults / constraints on existing deployments
ALTER TABLE ai_connections
  ALTER COLUMN base_url SET DEFAULT 'https://api.deepseek.com';

-- If there are still any nulls (shouldn't be), set a safe default
UPDATE ai_connections SET base_url = 'https://api.deepseek.com' WHERE base_url IS NULL OR base_url = '';

ALTER TABLE ai_connections
  ALTER COLUMN base_url SET NOT NULL;

-- Optional: link strategies to an AI connection. Keep existing api_key_ciphertext field unused.
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS ai_connection_id UUID REFERENCES ai_connections(id) ON DELETE SET NULL;

ALTER TABLE ai_connections ENABLE ROW LEVEL SECURITY;

-- Users can CRUD own connections (but API must never return api_key_encrypted)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_connections'
      AND policyname = 'Users can CRUD own ai_connections'
  ) THEN
    CREATE POLICY "Users can CRUD own ai_connections"
      ON ai_connections FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_connections_user_id ON ai_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_ai_connection_id ON strategies(ai_connection_id);

