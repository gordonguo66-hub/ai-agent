-- Live Trading Tables Migration
-- Run this in Supabase SQL Editor after running schema.sql

-- Exchange connections table
CREATE TABLE IF NOT EXISTS exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue TEXT NOT NULL DEFAULT 'hyperliquid',
  wallet_address TEXT NOT NULL,
  key_material_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade sessions table
CREATE TABLE IF NOT EXISTS trade_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  exchange_connection_id UUID NOT NULL REFERENCES exchange_connections(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('dry', 'live')),
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'paused', 'stopped')),
  market TEXT NOT NULL DEFAULT 'BTC-PERP',
  cadence_seconds INT NOT NULL DEFAULT 30,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decisions table
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trade_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  market_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  positions_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_orders JSONB NOT NULL DEFAULT '[]'::jsonb,
  executed BOOLEAN NOT NULL DEFAULT false,
  error TEXT
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trade_sessions(id) ON DELETE CASCADE,
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  venue TEXT NOT NULL DEFAULT 'hyperliquid',
  mode TEXT NOT NULL CHECK (mode IN ('dry', 'live')),
  client_order_id TEXT NOT NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  size NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'sent', 'filled', 'failed', 'skipped')),
  venue_response JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Exchange connections policies
CREATE POLICY "Users can CRUD own exchange connections"
  ON exchange_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trade sessions policies
CREATE POLICY "Users can CRUD own trade sessions"
  ON trade_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Decisions policies
CREATE POLICY "Users can read decisions from own sessions"
  ON decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trade_sessions
      WHERE trade_sessions.id = decisions.session_id
      AND trade_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert decisions for own sessions"
  ON decisions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trade_sessions
      WHERE trade_sessions.id = decisions.session_id
      AND trade_sessions.user_id = auth.uid()
    )
  );

-- Orders policies
CREATE POLICY "Users can read orders from own sessions"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trade_sessions
      WHERE trade_sessions.id = orders.session_id
      AND trade_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert orders for own sessions"
  ON orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trade_sessions
      WHERE trade_sessions.id = orders.session_id
      AND trade_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update orders for own sessions"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trade_sessions
      WHERE trade_sessions.id = orders.session_id
      AND trade_sessions.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trade_sessions_user_id ON trade_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_strategy_id ON trade_sessions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session_id ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_decision_id ON orders(decision_id);
CREATE INDEX IF NOT EXISTS idx_exchange_connections_user_id ON exchange_connections(user_id);
