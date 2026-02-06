-- Legal Acceptance Migration
-- Adds fields to profiles table to track terms and risk disclosure acceptance

-- Add legal acceptance columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS risk_accepted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_ip TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_user_agent TEXT;

-- Create index for checking acceptance status
CREATE INDEX IF NOT EXISTS idx_profiles_legal_acceptance 
  ON profiles(id, terms_accepted_at, risk_accepted_at);

-- Update RLS policies to allow users to update their own legal acceptance
-- (This policy should already exist from update_profiles_rls.sql, but ensuring it covers new fields)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
