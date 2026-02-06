-- Add 'side' column to live_positions table
-- This column tracks whether the position is long or short

ALTER TABLE live_positions
ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('long', 'short'));

-- Backfill existing positions based on size sign (if any exist)
UPDATE live_positions
SET side = CASE 
  WHEN size > 0 THEN 'long'
  WHEN size < 0 THEN 'short'
  ELSE 'long'  -- Default to long if size is 0
END
WHERE side IS NULL;

-- Make side NOT NULL after backfill
ALTER TABLE live_positions
ALTER COLUMN side SET NOT NULL;
