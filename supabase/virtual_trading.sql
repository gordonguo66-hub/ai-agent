-- Virtual Trading Tables
-- Forward-only virtual trading system (no backtesting)

-- 1. Virtual Accounts
CREATE TABLE IF NOT EXISTS virtual_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Demo Account',
  starting_equity NUMERIC NOT NULL DEFAULT 100000,
  cash_balance NUMERIC NOT NULL DEFAULT 100000,
  equity NUMERIC NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Virtual Positions
CREATE TABLE IF NOT EXISTS virtual_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES virtual_accounts(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size NUMERIC NOT NULL,
  avg_entry NUMERIC NOT NULL,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, market)
);

-- 3. Virtual Trades
CREATE TABLE IF NOT EXISTS virtual_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES virtual_accounts(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  session_id UUID REFERENCES strategy_sessions(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('open', 'close', 'reduce', 'flip')),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Equity Points (for equity curve)
CREATE TABLE IF NOT EXISTS equity_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES virtual_accounts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES strategy_sessions(id) ON DELETE CASCADE,
  t TIMESTAMPTZ DEFAULT NOW(),
  equity NUMERIC NOT NULL
);

-- 5. Strategy Sessions
CREATE TABLE IF NOT EXISTS strategy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'virtual' CHECK (mode IN ('virtual')),
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'paused', 'stopped')),
  account_id UUID REFERENCES virtual_accounts(id) ON DELETE SET NULL,
  markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  cadence_seconds INT NOT NULL DEFAULT 30,
  started_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Session Decisions
CREATE TABLE IF NOT EXISTS session_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES strategy_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  market_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  indicators_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  action_summary TEXT,
  risk_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_order JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed BOOLEAN NOT NULL DEFAULT false,
  error TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_virtual_accounts_user_id ON virtual_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_positions_account_id ON virtual_positions(account_id);
CREATE INDEX IF NOT EXISTS idx_virtual_trades_account_id ON virtual_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_virtual_trades_strategy_id ON virtual_trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_virtual_trades_created_at ON virtual_trades(created_at);
CREATE INDEX IF NOT EXISTS idx_strategy_sessions_user_id ON strategy_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_strategy_sessions_strategy_id ON strategy_sessions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_sessions_status ON strategy_sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_decisions_session_id ON session_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_decisions_created_at ON session_decisions(created_at);

-- RLS Policies
ALTER TABLE virtual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE equity_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_decisions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own accounts
CREATE POLICY "Users can view their own virtual accounts"
  ON virtual_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own virtual accounts"
  ON virtual_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own virtual accounts"
  ON virtual_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only access positions for their accounts
CREATE POLICY "Users can view positions for their accounts"
  ON virtual_positions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = virtual_positions.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage positions for their accounts"
  ON virtual_positions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = virtual_positions.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );

-- Users can only access trades for their accounts
CREATE POLICY "Users can view trades for their accounts"
  ON virtual_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = virtual_trades.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert trades for their accounts"
  ON virtual_trades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = virtual_trades.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );

-- Users can only access their own sessions
CREATE POLICY "Users can view their own sessions"
  ON strategy_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sessions"
  ON strategy_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Users can only access decisions for their sessions
CREATE POLICY "Users can view decisions for their sessions"
  ON session_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategy_sessions
      WHERE strategy_sessions.id = session_decisions.session_id
      AND strategy_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert decisions for their sessions"
  ON session_decisions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM strategy_sessions
      WHERE strategy_sessions.id = session_decisions.session_id
      AND strategy_sessions.user_id = auth.uid()
    )
  );

-- Users can only access equity points for their accounts
-- Note: DROP IF EXISTS first to avoid conflicts if re-running
DROP POLICY IF EXISTS "Users can view equity points for their accounts" ON equity_points;
DROP POLICY IF EXISTS "Users can insert equity points for their accounts" ON equity_points;

CREATE POLICY "Users can view equity points for their accounts"
  ON equity_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = equity_points.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert equity points for their accounts"
  ON equity_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = equity_points.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );
