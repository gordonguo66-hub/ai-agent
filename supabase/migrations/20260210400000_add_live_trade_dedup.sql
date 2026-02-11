-- Add unique index on venue_order_id for live trades to prevent duplicate trade records.
-- Without this, network retries or webhook re-delivery could create duplicate entries,
-- inflating PnL calculations and corrupting trade history.

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_trades_venue_order_id
  ON live_trades(venue_order_id) WHERE venue_order_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
