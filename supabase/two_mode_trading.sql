-- Two-mode trading (VIRTUAL + LIVE) migration
-- Add-only migration. Safe to run after supabase/schema.sql.
--
-- Notes:
-- - VIRTUAL mode uses real Hyperliquid market data, simulated execution, starting balance $100,000
-- - LIVE mode uses real Hyperliquid execution (server-side only)
-- - No backtesting / no historical replay; sessions are forward-running only

-- SIM accounts (one per virtual session for MVP)
CREATE TABLE IF NOT EXISTS sim_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starting_balance NUMERIC NOT NULL DEFAULT 100000,
  cash_balance NUMERIC NOT NULL DEFAULT 100000,
  equity NUMERIC NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES sim_accounts(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  size NUMERIC NOT NULL DEFAULT 0, -- signed base units (+: long, -: short)
  avg_entry NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES sim_accounts(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equity curve points (per tick) to power charts.
CREATE TABLE IF NOT EXISTS sim_equity_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES sim_accounts(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  equity NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (new system)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('virtual','live')),
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running','paused','stopped')),
  market TEXT NOT NULL DEFAULT 'BTC-PERP',
  cadence_seconds INT NOT NULL DEFAULT 30,
  sim_account_id UUID REFERENCES sim_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_tick_at TIMESTAMPTZ
);

-- Decisions (new system)
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_order JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed BOOLEAN NOT NULL DEFAULT false,
  error TEXT
);

-- Orders (new system)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('virtual','live')),
  client_order_id TEXT NOT NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  size NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','sent','filled','failed','skipped')),
  venue_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sim_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sim_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sim_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sim_equity_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- RLS: sim_accounts (direct ownership)
CREATE POLICY "Users can CRUD own sim_accounts"
  ON sim_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS: sim_positions (via account ownership)
CREATE POLICY "Users can read own sim_positions"
  ON sim_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_positions.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update/delete own sim_positions"
  ON sim_positions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_positions.account_id
      AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_positions.account_id
      AND a.user_id = auth.uid()
    )
  );

-- RLS: sim_trades (via account ownership)
CREATE POLICY "Users can read own sim_trades"
  ON sim_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_trades.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update/delete own sim_trades"
  ON sim_trades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_trades.account_id
      AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_trades.account_id
      AND a.user_id = auth.uid()
    )
  );

-- RLS: sim_equity_points (via account ownership)
CREATE POLICY "Users can read own sim_equity_points"
  ON sim_equity_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_equity_points.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update/delete own sim_equity_points"
  ON sim_equity_points FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_equity_points.account_id
      AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sim_accounts a
      WHERE a.id = sim_equity_points.account_id
      AND a.user_id = auth.uid()
    )
  );

-- RLS: sessions (direct ownership)
CREATE POLICY "Users can CRUD own sessions"
  ON sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS: decisions (via session ownership)
CREATE POLICY "Users can read own decisions"
  ON decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = decisions.session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update/delete own decisions"
  ON decisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = decisions.session_id
      AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = decisions.session_id
      AND s.user_id = auth.uid()
    )
  );

-- RLS: orders (via session ownership)
CREATE POLICY "Users can read own orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = orders.session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update/delete own orders"
  ON orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = orders.session_id
      AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = orders.session_id
      AND s.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sim_accounts_user_id ON sim_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_sim_positions_account_id ON sim_positions(account_id);
CREATE INDEX IF NOT EXISTS idx_sim_trades_account_id ON sim_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_sim_trades_session_id ON sim_trades(session_id);
CREATE INDEX IF NOT EXISTS idx_sim_equity_points_account_id ON sim_equity_points(account_id);
CREATE INDEX IF NOT EXISTS idx_sim_equity_points_session_id ON sim_equity_points(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_strategy_id ON sessions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session_id ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_decision_id ON orders(decision_id);

