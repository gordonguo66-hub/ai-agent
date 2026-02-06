-- Add api_passphrase_encrypted column for Coinbase INTX
-- INTX requires a passphrase in addition to API key and secret

ALTER TABLE exchange_connections
ADD COLUMN IF NOT EXISTS api_passphrase_encrypted TEXT;

-- Comment explaining the field
COMMENT ON COLUMN exchange_connections.api_passphrase_encrypted IS 'Encrypted API passphrase for Coinbase INTX. Required for non-US users with perpetuals access.';
