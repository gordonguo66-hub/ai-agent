-- Add missing session_id column to virtual_trades table
-- Run this in your Supabase SQL Editor

-- Check if column exists first (optional, but helpful for debugging)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'virtual_trades' 
    AND column_name = 'session_id'
  ) THEN
    -- Add the session_id column
    ALTER TABLE virtual_trades
    ADD COLUMN session_id UUID REFERENCES strategy_sessions(id) ON DELETE CASCADE;
    
    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_virtual_trades_session_id ON virtual_trades(session_id);
    
    RAISE NOTICE 'Added session_id column to virtual_trades table';
  ELSE
    RAISE NOTICE 'Column session_id already exists in virtual_trades table';
  END IF;
END $$;
