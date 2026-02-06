-- Add Coinbase International (INTX) support
-- INTX allows non-US users to trade perpetuals with leverage

-- Add intx_enabled flag to exchange_connections
ALTER TABLE exchange_connections
ADD COLUMN IF NOT EXISTS intx_enabled BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN exchange_connections.intx_enabled IS
  'Whether user has Coinbase International (INTX) access for perpetuals trading. Only applicable when venue=coinbase.';
