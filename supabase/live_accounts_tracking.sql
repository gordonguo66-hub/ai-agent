-- Live Trading Data Tracking
-- Creates tables to track live trading data (positions, trades, equity) 
-- mirroring the virtual system so live sessions get all the same UI features.

-- 1. LIVE ACCOUNTS
-- Tracks the live account state (equity, cash balance) synced from Hyperliquid
CREATE TABLE IF NOT EXISTS live_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange_connection_id UUID NOT NULL REFERENCES exchange_connections(id) ON DELETE CASCADE,
  starting_equity NUMERIC NOT NULL, -- Initial equity when account tracking started
  cash_balance NUMERIC NOT NULL DEFAULT 0, -- Current cash balance
  equity NUMERIC NOT NULL DEFAULT 0, -- Total equity (cash + unrealized PnL)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, exchange_connection_id)
);

-- 2. LIVE POSITIONS
-- Tracks current live positions synced from Hyperliquid
CREATE TABLE IF NOT EXISTS live_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES live_accounts(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  size NUMERIC NOT NULL DEFAULT 0, -- Signed size (+: long, -: short)
  avg_entry NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, market) -- One position per market per account
);

-- 3. LIVE TRADES
-- Records live trades executed on Hyperliquid
CREATE TABLE IF NOT EXISTS live_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES live_accounts(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES strategy_sessions(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('open', 'close', 'increase', 'reduce', 'flip')),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  venue_order_id TEXT, -- Hyperliquid order ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. UPDATE equity_points to support live mode
-- The existing equity_points table should already work for live mode
-- Just need to ensure it accepts live_account_id
-- (This is a note - no schema change needed if account_id is generic UUID)

-- Enable RLS
ALTER TABLE live_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_trades ENABLE ROW LEVEL SECURITY;

-- RLS: live_accounts (direct ownership)
CREATE POLICY "Users can CRUD own live_accounts"
  ON live_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS: live_positions (via account ownership)
CREATE POLICY "Users can read own live_positions"
  ON live_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM live_accounts a
      WHERE a.id = live_positions.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert/update/delete live_positions"
  ON live_positions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM live_accounts a
      WHERE a.id = live_positions.account_id
      AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM live_accounts a
      WHERE a.id = live_positions.account_id
      AND a.user_id = auth.uid()
    )
  );

-- RLS: live_trades (via account ownership)
CREATE POLICY "Users can read own live_trades"
  ON live_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM live_accounts a
      WHERE a.id = live_trades.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert live_trades"
  ON live_trades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM live_accounts a
      WHERE a.id = live_trades.account_id
      AND a.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_accounts_user_id ON live_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_live_accounts_exchange_connection ON live_accounts(exchange_connection_id);
CREATE INDEX IF NOT EXISTS idx_live_positions_account_id ON live_positions(account_id);
CREATE INDEX IF NOT EXISTS idx_live_positions_market ON live_positions(market);
CREATE INDEX IF NOT EXISTS idx_live_trades_account_id ON live_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_live_trades_session_id ON live_trades(session_id);
CREATE INDEX IF NOT EXISTS idx_live_trades_created_at ON live_trades(created_at DESC);

-- Add live_account_id to strategy_sessions if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'strategy_sessions' AND column_name = 'live_account_id'
  ) THEN
    ALTER TABLE strategy_sessions ADD COLUMN live_account_id UUID REFERENCES live_accounts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_strategy_sessions_live_account ON strategy_sessions(live_account_id);
  END IF;
END $$;
