-- Add position_type column to live_positions for Coinbase support
-- This column distinguishes between "spot" positions (Coinbase) and "perp" positions (Hyperliquid)

ALTER TABLE live_positions
ADD COLUMN IF NOT EXISTS position_type TEXT DEFAULT 'perp';

-- Add comment for documentation
COMMENT ON COLUMN live_positions.position_type IS 'Type of position: spot (Coinbase) or perp (Hyperliquid)';
