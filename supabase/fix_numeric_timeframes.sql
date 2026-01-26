-- Migration: Fix numeric timeframes in filters->aiInputs->candles
-- Convert numeric timeframe values to string format (e.g., 2 -> "2m")

-- First, let's see which strategies have numeric timeframes
SELECT 
  s.id,
  s.name,
  s.filters->'aiInputs'->'candles'->>'timeframe' as current_timeframe,
  CASE 
    WHEN s.filters->'aiInputs'->'candles'->>'timeframe' ~ '^[0-9]+$' 
    THEN s.filters->'aiInputs'->'candles'->>'timeframe' || 'm'
    ELSE s.filters->'aiInputs'->'candles'->>'timeframe'
  END as fixed_timeframe
FROM strategies s
WHERE s.filters->'aiInputs'->'candles'->>'timeframe' ~ '^[0-9]+$';

-- Now update them to string format with 'm' suffix
UPDATE strategies
SET filters = jsonb_set(
  filters::jsonb,
  '{aiInputs,candles,timeframe}',
  to_jsonb((filters->'aiInputs'->'candles'->>'timeframe')::text || 'm')
)
WHERE filters->'aiInputs'->'candles'->>'timeframe' ~ '^[0-9]+$';

-- Verify the fix
SELECT 
  s.id,
  s.name,
  s.filters->'aiInputs'->'candles'->>'timeframe' as timeframe_after_fix
FROM strategies s;
