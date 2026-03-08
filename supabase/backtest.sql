-- Backtest Tables
-- Enables LLM-replay backtesting: step through historical candles,
-- call the AI at each tick, simulate trades, and store results.

-- 1. Backtest Runs (one per backtest execution)
CREATE TABLE IF NOT EXISTS backtest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

  -- Configuration
  markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  venue TEXT NOT NULL DEFAULT 'hyperliquid',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  resolution TEXT NOT NULL DEFAULT '1h',
  model_provider TEXT,
  model_name TEXT,
  starting_equity NUMERIC NOT NULL DEFAULT 100000,

  -- Progress
  total_ticks INT NOT NULL DEFAULT 0,
  completed_ticks INT NOT NULL DEFAULT 0,
  estimated_cost_cents INT NOT NULL DEFAULT 0,
  actual_cost_cents INT NOT NULL DEFAULT 0,

  -- Results (populated on completion)
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- result_summary schema: { return_pct, total_pnl, win_rate, max_drawdown_pct,
  --   total_trades, winning_trades, losing_trades, sharpe_ratio, avg_trade_pnl,
  --   final_equity }

  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 2. Backtest Trades (individual trades within a backtest)
CREATE TABLE IF NOT EXISTS backtest_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('open', 'close', 'reduce', 'flip')),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  tick_index INT NOT NULL,
  tick_timestamp TIMESTAMPTZ NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Backtest Equity Points (equity curve for charting)
CREATE TABLE IF NOT EXISTS backtest_equity_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  tick_index INT NOT NULL,
  equity NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL DEFAULT 0,
  tick_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Backtest Decisions (AI decisions at each tick, for analysis)
CREATE TABLE IF NOT EXISTS backtest_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  tick_index INT NOT NULL,
  market TEXT NOT NULL,
  tick_timestamp TIMESTAMPTZ NOT NULL,
  price NUMERIC NOT NULL,
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  reasoning TEXT,
  action_summary TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_id ON backtest_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy_id ON backtest_runs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_status ON backtest_runs(status);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_tick_index ON backtest_trades(tick_index);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_points_backtest_id ON backtest_equity_points(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_points_tick_index ON backtest_equity_points(tick_index);
CREATE INDEX IF NOT EXISTS idx_backtest_decisions_backtest_id ON backtest_decisions(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_decisions_tick_index ON backtest_decisions(tick_index);

-- RLS
ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_equity_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_decisions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own backtests
CREATE POLICY "Users can view their own backtest runs"
  ON backtest_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own backtest runs"
  ON backtest_runs FOR ALL
  USING (auth.uid() = user_id);

-- Backtest trades: access via backtest ownership
CREATE POLICY "Users can view trades for their backtests"
  ON backtest_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM backtest_runs
      WHERE backtest_runs.id = backtest_trades.backtest_id
      AND backtest_runs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage trades for their backtests"
  ON backtest_trades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM backtest_runs
      WHERE backtest_runs.id = backtest_trades.backtest_id
      AND backtest_runs.user_id = auth.uid()
    )
  );

-- Equity points: access via backtest ownership
CREATE POLICY "Users can view equity points for their backtests"
  ON backtest_equity_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM backtest_runs
      WHERE backtest_runs.id = backtest_equity_points.backtest_id
      AND backtest_runs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage equity points for their backtests"
  ON backtest_equity_points FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM backtest_runs
      WHERE backtest_runs.id = backtest_equity_points.backtest_id
      AND backtest_runs.user_id = auth.uid()
    )
  );

-- Decisions: access via backtest ownership
CREATE POLICY "Users can view decisions for their backtests"
  ON backtest_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM backtest_runs
      WHERE backtest_runs.id = backtest_decisions.backtest_id
      AND backtest_runs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage decisions for their backtests"
  ON backtest_decisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM backtest_runs
      WHERE backtest_runs.id = backtest_decisions.backtest_id
      AND backtest_runs.user_id = auth.uid()
    )
  );
