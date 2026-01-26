-- Drop table if exists to avoid constraint issues (only run this once)
DROP TABLE IF EXISTS email_confirmations CASCADE;

-- Create email_confirmations table for storing confirmation tokens
-- Note: We use UUID without foreign key constraint to auth.users to avoid timing issues
CREATE TABLE email_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_confirmations_token ON email_confirmations(token);
CREATE INDEX IF NOT EXISTS idx_email_confirmations_user_id ON email_confirmations(user_id);

-- RLS policies
ALTER TABLE email_confirmations ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (for API routes)
CREATE POLICY "Service role can manage email confirmations"
  ON email_confirmations FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow users to read their own confirmations
CREATE POLICY "Users can read own email confirmations"
  ON email_confirmations FOR SELECT
  USING (auth.uid() = user_id);
