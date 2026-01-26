# Pre-Launch Feature Verification Checklist

## Instructions
Follow each step in order. Test and report back what you see. I'll guide you based on your results.

---

## ✅ STEP 1: AI Context Debug - Verify AI Inputs Are Actually Sent

**What to do:**
1. Go to your running session detail page (`/dashboard/sessions/[session-id]`)
2. Click the "🔍 View AI Context" button
3. Take a screenshot or describe what you see

**What I need:**
- Does the dialog open without errors?
- Can you see "AI Inputs Configured" section?
- Can you see "Context Sent to AI" section with actual data?
- Specifically check:
  - **If candles are enabled** - Do you see `candles` array with actual price data?
  - **If orderbook is enabled** - Do you see `orderbook` with bid/ask/mid?
  - **If indicators are enabled** - Do you see `indicators` with RSI/ATR/EMA values (or null if not enough data)?
  - **If position state is enabled** - Do you see `positions` array and `currentMarketPosition`?
  - **If recent decisions is enabled** - Do you see `recentDecisions` array?

**Expected:** All enabled features should show actual data, not empty objects or nulls (except indicators that may be null if insufficient historical data).

---

## ✅ STEP 2: Verify Exit Rules Are Working

**What to do:**
1. Check if you have an open position (or create a test one)
2. Note the current unrealized PnL %
3. Set your exit rules to trigger:
   - **Take Profit:** Set to a value BELOW your current unrealized PnL % (e.g., if you're at +3%, set TP to 2%)
   - **Stop Loss:** If you have a losing position, set SL to trigger
   - **Max Hold Time:** Set to a short time (e.g., 5 minutes) if you want to test time-based exit

**What I need:**
- Does the position automatically close when exit conditions are met?
- Check the session decisions log - what does it say about the exit?
- Is the "Action Summary" clear about why it exited?

---

## ✅ STEP 3: Verify Risk Filters Are Enforced

**What to do:**
1. Set very strict risk limits:
   - Max Trades Per Hour: 1
   - Max Trades Per Day: 2
   - Min Confidence: 0.9 (90%)
   - Max Daily Loss: 1%
   - Max Position Size: $1000

2. Let the strategy run for a few ticks
3. Check the decisions log

**What I need:**
- Are trades being blocked when limits are reached?
- What do the "Action Summary" messages say? (e.g., "Trade frequency limit", "Confidence below minimum", etc.)
- Are the rejections accurate based on your settings?

---

## ✅ STEP 4: Verify Entry Rules Are Enforced

**What to do:**
1. Set strict entry rules:
   - Entry Aggressiveness: Conservative
   - Min Confidence: 0.8
   - Min Signals Required: 2
   - Require Trend Alignment: ON
   - Max Slippage: 0.05%

2. Let the strategy run
3. Check decisions log

**What I need:**
- Are trades being blocked due to entry confirmation failures?
- Check if "Entry confirmation: Need 2 signals, but only have 1" appears when appropriate
- Are confidence thresholds being enforced correctly?

---

## ✅ STEP 5: Verify AI Inputs (Candles, Orderbook, Indicators)

**What to do:**
1. Create a NEW strategy with specific AI inputs:
   - Enable Candles: ON, Count: 200, Timeframe: 5m
   - Enable Orderbook: ON
   - Enable Indicators: RSI (ON), ATR (ON), Volatility (ON), EMA (ON)
   - Enable Position State: ON
   - Enable Recent Decisions: ON

2. Start a new session with this strategy
3. After 1-2 ticks, click "🔍 View AI Context"

**What I need:**
- Does `contextSentToAI.marketData.candles` have 200 candles?
- Does `contextSentToAI.marketData.orderbook` have bid/ask/mid values?
- Does `contextSentToAI.indicators` show RSI/ATR/Volatility/EMA values (or null if not enough data)?
- Does `contextSentToAI.positions` show your current positions?
- Does `contextSentToAI.recentDecisions` show previous AI decisions?

---

## ✅ STEP 6: Verify Guardrails (Long/Short Restrictions)

**What to do:**
1. Set "Allow Long" to OFF
2. Let strategy run - AI should only suggest short or neutral
3. Reverse: Set "Allow Short" to OFF
4. Let strategy run - AI should only suggest long or neutral

**What I need:**
- When long is disabled, are long trades being blocked?
- When short is disabled, are short trades being blocked?
- What do the "Action Summary" messages say?

---

## ✅ STEP 7: Verify Trade Control (Cooldown, Min Hold, Re-entry)

**What to do:**
1. Set short cooldown: 1 minute
2. Set short min hold: 2 minutes
3. Execute a trade manually or let AI trade
4. Try to trade again immediately (or let AI try)

**What I need:**
- Is the cooldown being enforced? (Should block trades within cooldown period)
- Is min hold time being enforced? (Should block exits before min hold time)
- If "Allow Re-entry Same Direction" is OFF, are same-direction re-entries blocked?

---

## ✅ STEP 8: Verify Cadence Is Working

**What to do:**
1. Set cadence to 5 minutes (300 seconds)
2. Start a session
3. Monitor the decisions log and note timestamps

**What I need:**
- Are AI calls happening every ~5 minutes (not every 1 minute)?
- Check `last_tick_at` in the session - does it update at the correct cadence?
- If you have multiple markets, are they being processed in round-robin (one per tick)?

---

## ✅ STEP 9: Verify Confidence Scaling

**What to do:**
1. Enable "Confidence Scaling" in strategy settings
2. Let the strategy run and execute a few trades
3. Check position sizes vs. confidence levels

**What I need:**
- Do higher confidence trades result in larger position sizes?
- Are position sizes still capped by Max Position Size?
- Do low confidence trades result in smaller position sizes?

---

## ✅ STEP 10: Final UI/UX Check

**What to do:**
1. Navigate through all strategy tabs (Basics, Markets, AI Inputs, Entry/Exit, Risk)
2. Edit an existing strategy
3. Create a new strategy
4. View session detail page

**What I need:**
- Are all form fields saving correctly?
- Are all settings displaying correctly after editing?
- Is the session detail page showing all data (equity, PnL, decisions, positions)?
- Are there any UI errors or broken features?

---

## 🚨 CRITICAL CHECKS (Before Launch)

- [ ] No console errors in browser DevTools
- [ ] No 500 errors in Vercel logs
- [ ] Strategy features match what's configured
- [ ] All risk filters are actually blocking trades when they should
- [ ] Exit rules are actually closing positions when conditions are met
- [ ] AI inputs are actually being sent to the AI (verified via debug context)
- [ ] No placeholder/mock data - all features are real
- [ ] Partial Take Profit UI is removed (should not appear anywhere)

---

## 📝 How to Report Back

For each step, provide:
1. ✅ **PASS** - Feature works as expected
2. ❌ **FAIL** - Feature doesn't work / Shows error
3. ⚠️ **PARTIAL** - Works but has issues (describe)

Include:
- Screenshots if possible
- Error messages if any
- What you expected vs. what you saw
