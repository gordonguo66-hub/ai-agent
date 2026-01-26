# Virtual Trading Implementation - Complete

## Overview

A complete virtual trading system has been implemented that uses **real Hyperliquid market prices** (no authentication required) and executes trades in a simulated broker environment. Users can start virtual sessions with $100k, run forward-only ticks, and see performance metrics.

## Key Features

✅ **Real Market Prices** - Fetches live prices from Hyperliquid public API  
✅ **No Authentication Required** - Virtual mode doesn't need user's Hyperliquid credentials  
✅ **Forward-Only Trading** - No backtesting, only forward execution  
✅ **Virtual Broker** - Simulates order execution with slippage and fees  
✅ **Position Management** - Handles opening, closing, reducing, and flipping positions  
✅ **Performance Tracking** - Equity curve, PnL, drawdown, win rate  
✅ **Decision Logging** - Full transparency of AI decisions and execution

## Database Schema

All tables are in `supabase/virtual_trading.sql`:

1. **virtual_accounts** - Demo accounts with $100k starting equity
2. **virtual_positions** - Open positions (one per market, netted)
3. **virtual_trades** - Complete trade history with realized PnL
4. **equity_points** - Time-series equity data for charts
5. **strategy_sessions** - Active trading sessions
6. **session_decisions** - AI decision log with full context

## Implementation Files

### Server-Side

1. **`lib/hyperliquid/prices.ts`**
   - `getMidPrice(market)` - Fetch single market price
   - `getMidPrices(markets)` - Fetch multiple prices in parallel
   - 3-second cache to avoid rate limits

2. **`lib/brokers/virtualBroker.ts`**
   - `getAccount(account_id)` - Get account details
   - `getPositions(account_id)` - Get all positions
   - `markToMarket(account_id, prices)` - Update unrealized PnL
   - `placeMarketOrder(params)` - Execute virtual trade
   - Handles: open, close, reduce, flip actions
   - Applies slippage (0.05%) and fees (0.05%)

3. **`app/api/sessions/[id]/tick/route.ts`**
   - Processes up to 5 markets per tick
   - Fetches real prices from Hyperliquid
   - Calls AI model with market data
   - Applies guardrails and frequency limits
   - Executes trades via virtual broker
   - Records decisions and equity points

4. **`app/api/sessions/route.ts`**
   - `GET` - List user's sessions
   - `POST` - Create new virtual session

5. **`app/api/sessions/[id]/control/route.ts`**
   - `PATCH` - Update session status

6. **`app/api/sessions/[id]/pause/route.ts`**
   - `POST` - Pause session

7. **`app/api/sessions/[id]/resume/route.ts`**
   - `POST` - Resume session

8. **`app/api/sessions/[id]/stop/route.ts`**
   - `POST` - Stop session

### Client-Side

1. **`app/dashboard/page.tsx`**
   - Shows strategies with "Start Virtual ($100k)" button
   - Lists active sessions with status and equity

2. **`app/dashboard/sessions/[id]/page.tsx`**
   - Equity curve chart (from equity_points)
   - Performance metrics (return %, drawdown, win rate, trades)
   - Trade history table
   - Decision log with confidence and execution status
   - Controls: Start/Pause/Resume/Stop/Tick Now

## How to Test

### 1. Setup Database

Run the SQL migration in Supabase:

```sql
-- Execute supabase/virtual_trading.sql in Supabase SQL Editor
```

### 2. Create a Strategy

1. Navigate to `/strategy/new`
2. Fill in all tabs:
   - **Basics**: Name, model, API key, prompt
   - **Markets**: Select at least one market (e.g., BTC-PERP)
   - **AI Inputs**: Configure indicators (optional for MVP)
   - **Entry/Exit**: Set entry/exit modes
   - **Risk**: Set position limits, leverage, confidence threshold
3. Click "Create Strategy"

### 3. Start Virtual Session

1. Go to `/dashboard`
2. Find your strategy
3. Click "Start Virtual ($100k)"
4. This creates:
   - Virtual account with $100,000
   - Session with status "stopped"

### 4. Run Ticks

1. Navigate to `/dashboard/sessions/[id]`
2. Click **Start** to set status to "running"
3. Click **Tick Now** to execute one decision cycle:
   - Fetches real prices from Hyperliquid
   - Calls AI model
   - Applies guardrails
   - Executes trade if conditions met
   - Records decision and equity point
4. Repeat clicking **Tick Now** to generate more decisions

### 5. View Performance

On the session detail page, you'll see:

- **Equity Curve**: Chart showing PnL over time
- **Metrics Cards**:
  - Total Return %
  - Max Drawdown %
  - Win Rate %
  - Total Trades
- **Trade History**: Table with all executed trades
- **Decision Log**: Every AI decision with confidence and execution status

## Key Behaviors

### Price Fetching
- Uses Hyperliquid's `/info` endpoint with `type: "allMids"`
- Caches prices for 3 seconds to avoid rate limits
- Falls back to cached price if API fails

### Trade Execution
- Market orders only
- Slippage: 0.05% (buy adds, sell subtracts)
- Fee: 0.05% per trade
- Position netting: One position per market (long or short)
- Weighted average entry for adding to same direction
- Realized PnL calculated on close/reduce

### Guardrails
- Min confidence threshold
- Trade frequency limits (per hour/day)
- Cooldown between trades
- Min hold time
- Allow long/short toggles

### Equity Tracking
- Equity = Cash Balance + Unrealized PnL
- Unrealized PnL updated after each tick (mark-to-market)
- Equity point recorded after each tick
- Chart built from equity_points table

## API Endpoints

- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/[id]` - Get session details
- `POST /api/sessions/[id]/tick` - Execute one tick
- `POST /api/sessions/[id]/pause` - Pause session
- `POST /api/sessions/[id]/resume` - Resume session
- `POST /api/sessions/[id]/stop` - Stop session
- `PATCH /api/sessions/[id]/control` - Update status (alternative)

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Can create strategy with markets selected
- [ ] Can start virtual session (creates $100k account)
- [ ] Can click "Tick Now" and see decision logged
- [ ] Real prices are fetched from Hyperliquid
- [ ] AI model is called with market data
- [ ] Trades are executed when conditions met
- [ ] Equity curve shows data after trades
- [ ] Metrics calculate correctly
- [ ] Trade history displays all trades
- [ ] Decision log shows confidence and execution status
- [ ] Pause/Resume/Stop buttons work

## Troubleshooting

### "Failed to fetch market prices"
- Check Hyperliquid API is accessible
- Verify market symbol format (e.g., "BTC-PERP" → base "BTC")
- Check network connectivity

### "Session is not running"
- Click "Start" button before ticking
- Verify session status in database

### "No markets configured"
- Strategy must have at least one market in `filters.markets`
- Check strategy was created with markets selected

### Equity not updating
- Verify `markToMarket` is called after each tick
- Check `equity_points` table has new rows
- Verify account equity is recalculated

### Trades not executing
- Check guardrails (confidence, frequency limits)
- Verify AI returns non-neutral bias
- Check allowLong/allowShort settings
- Review decision log for rejection reasons

## Next Steps (Future Enhancements)

- Automated ticking (cron or WebSocket)
- More sophisticated indicators (RSI, EMA, etc.)
- Historical candles from Hyperliquid
- Multi-market parallel processing
- Advanced order types (limit, stop-loss)
- Position sizing algorithms
- Risk metrics (Sharpe ratio, etc.)
