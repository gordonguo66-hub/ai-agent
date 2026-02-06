-- Add peak_price column to track trailing stop high-water mark
-- This allows the trailing stop to properly track the highest (for longs) or lowest (for shorts)
-- price reached during the position, updating each tick when price moves favorably

ALTER TABLE virtual_positions ADD COLUMN IF NOT EXISTS peak_price NUMERIC;
ALTER TABLE sim_positions ADD COLUMN IF NOT EXISTS peak_price NUMERIC;
ALTER TABLE live_positions ADD COLUMN IF NOT EXISTS peak_price NUMERIC;
