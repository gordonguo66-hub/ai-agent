# Virtual Trading System - Testing Guide

## Overview

The virtual trading system has been implemented with the following features:

1. **Enhanced Strategy Builder** - Advanced configuration tabs (Basics, Markets, AI Inputs, Entry/Exit, Risk)
2. **Virtual Trading Tables** - Database schema for accounts, positions, trades, sessions, and decisions
3. **Session Management** - Create and control virtual trading sessions
4. **Tick Engine** - Forward-only execution that calls AI models and executes virtual trades
5. **Performance Dashboard** - Equity curves, metrics, trade history, and decision logs

## Setup Steps

### 1. Run Database Migrations

Execute the SQL schema file in your Supabase dashboard:

```bash
# In Supabase SQL Editor, run:
supabase/virtual_trading.sql
```

This creates:
- `virtual_accounts` - Demo accounts with $100k starting equity
- `virtual_positions` - Open positions per account
- `virtual_trades` - Trade history
- `strategy_sessions` - Active trading sessions
- `session_decisions` - AI decision log

### 2. Verify Environment

Ensure your `.env.local` has:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREDENTIALS_ENCRYPTION_KEY`

## Testing Workflow

### Step 1: Create a Strategy

1. Navigate to `/strategy/new`
2. Fill in **Basics** tab:
   - Strategy name
   - Model provider (e.g., OpenAI, Anthropic, DeepSeek)
   - Model name
   - API key (required)
   - Trading prompt

3. Configure **Markets** tab:
   - Select at least one market (BTC-PERP, ETH-PERP, SOL-PERP)
   - Set cadence (10s, 30s, 60s, 5min)

4. Configure **AI Inputs** tab:
   - Enable/disable candles, orderbook, indicators
   - Toggle position state and recent decisions

5. Configure **Entry/Exit** tab:
   - Set entry mode (signal, breakout, meanReversion)
   - Set exit mode (signal, trailingStop, timeBased)
   - Configure TP/SL percentages

6. Configure **Risk** tab:
   - Max daily loss %
   - Max position size (USD)
   - Max leverage
   - Min confidence threshold
   - Allow long/short positions

7. Click **Create Strategy**

### Step 2: Start a Virtual Session

1. Go to `/dashboard`
2. Find your strategy card
3. Click **Start Virtual** (or go to `/strategy/[id]` and click "Start Virtual ($100k)")
4. This creates a virtual account with $100,000 and starts a session

### Step 3: Run Ticks

1. Navigate to `/dashboard/sessions/[id]`
2. Click **Start** to set status to "running"
3. Click **Tick Now** to execute one decision cycle:
   - Fetches current market price (synthetic for MVP)
   - Builds AI input payload (candles, indicators, positions)
   - Calls your AI model with the trading prompt
   - Applies guardrails (confidence, frequency limits)
   - Executes virtual trade if conditions met
   - Records decision in log

4. Repeat clicking **Tick Now** to generate more decisions and trades

### Step 4: View Performance

On the session detail page (`/dashboard/sessions/[id]`), you'll see:

- **Metrics Cards**:
  - Total Return %
  - Max Drawdown %
  - Win Rate %
  - Total Trades

- **Equity Curve Chart**:
  - Shows PnL over time
  - Built from trade history

- **Trade History Table**:
  - All executed trades
  - Shows action, side, size, price, fee, realized PnL

- **Decision Log**:
  - Every AI decision with confidence
  - Indicators used
  - Action summary
  - Execution status

## Key Features

### Forward-Only Trading
- No backtesting - each tick moves forward in time
- Synthetic price generator (deterministic but forward-only)
- Real AI model calls with your API keys

### Virtual Execution
- Market orders only
- Simple fee calculation (0.05% per trade)
- Position management (open/close/flip)
- Real-time equity updates

### Guardrails
- Min confidence threshold
- Trade frequency limits (per hour/day)
- Position size limits
- Leverage limits
- Long/short toggles

### AI Integration
- Real API calls to your chosen provider
- Structured intent output (bias, confidence, entry zones, reasoning)
- Full decision transparency in logs

## Troubleshooting

### "Session not found"
- Verify you're logged in
- Check session belongs to your user (RLS policies)

### "AI call failed"
- Verify API key is correct and valid
- Check provider base URL is correct
- Ensure model name matches provider's API

### "No trades generated"
- Check guardrails (min confidence, frequency limits)
- Verify AI is returning non-neutral bias
- Check allowLong/allowShort settings

### Equity not updating
- Trades must be executed (not just proposed)
- Check virtual_accounts.equity is being updated
- Verify positions are being tracked

## Next Steps

To enhance the system:

1. **Real Market Data**: Replace synthetic prices with Hyperliquid API
2. **Automated Ticking**: Add cron job or WebSocket for auto-ticks
3. **Advanced Order Types**: Limit orders, stop losses, take profits
4. **Multi-Market**: Process all markets in parallel
5. **Backtesting**: Add historical simulation mode (separate from forward trading)

## API Endpoints

- `POST /api/sessions` - Create new session
- `GET /api/sessions` - List user's sessions
- `GET /api/sessions/[id]` - Get session details
- `PATCH /api/sessions/[id]/control` - Update session status
- `POST /api/sessions/[id]/tick` - Execute one tick

All endpoints require authentication via Bearer token or session cookie.
