-- Create client_errors table for production error diagnostics
CREATE TABLE IF NOT EXISTS client_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  path TEXT,
  message TEXT,
  stack TEXT,
  component_stack TEXT,
  user_agent TEXT,
  digest TEXT,
  error_boundary TEXT,
  full_error JSONB,
  full_error_info JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT
);

-- Enable RLS
ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert (for API endpoint)
-- Note: API endpoint uses service role, so this policy allows inserts
CREATE POLICY "Service role can insert client errors"
  ON client_errors FOR INSERT
  WITH CHECK (true);

-- Allow users to view their own errors (optional, for future dashboard)
CREATE POLICY "Users can view own errors"
  ON client_errors FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_path ON client_errors(path);
CREATE INDEX IF NOT EXISTS idx_client_errors_user_id ON client_errors(user_id);
