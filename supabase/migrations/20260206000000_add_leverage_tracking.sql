-- Add leverage tracking to trades and positions
-- This allows tracking what leverage was used for each trade

-- Add leverage to live_trades
ALTER TABLE live_trades ADD COLUMN IF NOT EXISTS leverage INTEGER DEFAULT 1;

-- Add leverage to live_positions
ALTER TABLE live_positions ADD COLUMN IF NOT EXISTS leverage INTEGER DEFAULT 1;

-- Add leverage to virtual_trades (for consistency)
ALTER TABLE virtual_trades ADD COLUMN IF NOT EXISTS leverage INTEGER DEFAULT 1;

-- Add leverage to virtual_positions (for consistency)
ALTER TABLE virtual_positions ADD COLUMN IF NOT EXISTS leverage INTEGER DEFAULT 1;

-- Comment on columns
COMMENT ON COLUMN live_trades.leverage IS 'Leverage used for this trade (1-50x)';
COMMENT ON COLUMN live_positions.leverage IS 'Current leverage on this position (synced from exchange)';
COMMENT ON COLUMN virtual_trades.leverage IS 'Leverage used for this simulated trade';
COMMENT ON COLUMN virtual_positions.leverage IS 'Simulated leverage on this position';
