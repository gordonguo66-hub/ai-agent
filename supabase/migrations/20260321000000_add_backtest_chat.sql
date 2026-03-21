-- Backtest Analysis Chat Messages
-- Stores conversation between user and AI analyst for backtest result analysis

CREATE TABLE IF NOT EXISTS backtest_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_chat_backtest
  ON backtest_chat_messages(backtest_id, created_at);

CREATE INDEX IF NOT EXISTS idx_backtest_chat_user
  ON backtest_chat_messages(user_id);

-- RLS policies
ALTER TABLE backtest_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat messages"
  ON backtest_chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat messages"
  ON backtest_chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
