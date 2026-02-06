-- Coinbase Advanced Trade API Support Migration
-- Adds support for Coinbase alongside existing Hyperliquid integration

-- 1. Add Coinbase credential columns to exchange_connections
-- Hyperliquid uses: wallet_address + key_material_encrypted (private key)
-- Coinbase uses: api_key + api_secret_encrypted

ALTER TABLE exchange_connections
ADD COLUMN IF NOT EXISTS api_key TEXT,
ADD COLUMN IF NOT EXISTS api_secret_encrypted TEXT,
ADD COLUMN IF NOT EXISTS credential_type TEXT DEFAULT 'private_key';

-- Add comments for clarity
COMMENT ON COLUMN exchange_connections.credential_type IS 'private_key (Hyperliquid) or api_key (Coinbase)';
COMMENT ON COLUMN exchange_connections.wallet_address IS 'Hyperliquid: Ethereum wallet address (nullable for Coinbase)';
COMMENT ON COLUMN exchange_connections.key_material_encrypted IS 'Hyperliquid: encrypted private key (nullable for Coinbase)';
COMMENT ON COLUMN exchange_connections.api_key IS 'Coinbase: CDP API key identifier (nullable for Hyperliquid)';
COMMENT ON COLUMN exchange_connections.api_secret_encrypted IS 'Coinbase: encrypted EC private key PEM (nullable for Hyperliquid)';

-- 2. Make Hyperliquid-specific columns nullable (they were NOT NULL before)
-- This allows Coinbase connections which don't have wallet_address

-- Check if columns are currently NOT NULL and alter if needed
DO $$
BEGIN
  -- Make wallet_address nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exchange_connections'
    AND column_name = 'wallet_address'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE exchange_connections ALTER COLUMN wallet_address DROP NOT NULL;
  END IF;

  -- Make key_material_encrypted nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exchange_connections'
    AND column_name = 'key_material_encrypted'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE exchange_connections ALTER COLUMN key_material_encrypted DROP NOT NULL;
  END IF;
END $$;

-- 3. Add venue column to strategy_sessions for quick lookup
ALTER TABLE strategy_sessions
ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'hyperliquid';

CREATE INDEX IF NOT EXISTS idx_strategy_sessions_venue ON strategy_sessions(venue);

-- 4. Add venue column to live_positions for tracking
ALTER TABLE live_positions
ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'hyperliquid';

-- 5. Add venue column to live_trades for tracking
ALTER TABLE live_trades
ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'hyperliquid';

-- 6. Add position_type to distinguish spot vs perpetual
ALTER TABLE live_positions
ADD COLUMN IF NOT EXISTS position_type TEXT DEFAULT 'perpetual';

COMMENT ON COLUMN live_positions.position_type IS 'perpetual (Hyperliquid) or spot (Coinbase)';
COMMENT ON COLUMN live_positions.side IS 'For spot: always long. For perpetual: long/short based on signed size';

-- 7. Add venue column to virtual_positions for consistency
ALTER TABLE virtual_positions
ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'hyperliquid';

ALTER TABLE virtual_positions
ADD COLUMN IF NOT EXISTS position_type TEXT DEFAULT 'perpetual';

-- 8. Add venue column to virtual_trades for consistency
ALTER TABLE virtual_trades
ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'hyperliquid';

-- 9. Create check constraint for credential type validation
-- Ensures Hyperliquid connections have wallet_address and Coinbase has api_key
ALTER TABLE exchange_connections
ADD CONSTRAINT valid_credentials CHECK (
  (credential_type = 'private_key' AND wallet_address IS NOT NULL AND key_material_encrypted IS NOT NULL)
  OR
  (credential_type = 'api_key' AND api_key IS NOT NULL AND api_secret_encrypted IS NOT NULL)
);

-- 10. Add index for credential type lookups
CREATE INDEX IF NOT EXISTS idx_exchange_connections_credential_type
  ON exchange_connections(credential_type);

-- 11. Update existing rows to have credential_type = 'private_key'
UPDATE exchange_connections
SET credential_type = 'private_key'
WHERE credential_type IS NULL;
