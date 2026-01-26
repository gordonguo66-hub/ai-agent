-- Create exchange_connections table for storing encrypted Hyperliquid credentials
-- Run this in your Supabase SQL Editor

-- 1. Create the table
CREATE TABLE IF NOT EXISTS exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue TEXT NOT NULL DEFAULT 'hyperliquid',
  wallet_address TEXT NOT NULL,
  key_material_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exchange_connections_user_id ON exchange_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_connections_venue ON exchange_connections(venue);

-- 3. Enable RLS
ALTER TABLE exchange_connections ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Users can view their own connections
CREATE POLICY "Users can view their own exchange connections"
  ON exchange_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own connections
CREATE POLICY "Users can insert their own exchange connections"
  ON exchange_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own connections
CREATE POLICY "Users can update their own exchange connections"
  ON exchange_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own connections
CREATE POLICY "Users can delete their own exchange connections"
  ON exchange_connections FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Add unique constraint (one connection per user per venue)
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_connections_user_venue 
  ON exchange_connections(user_id, venue);
