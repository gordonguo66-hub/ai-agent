# Arena Tick Invariant Fix

## Problem Statement

**BUG**: Arena sessions currently do not run (no ticks, no logs, no equity snapshots).

**ROOT CAUSE**: Unknown - needs systematic tracing to identify where arena sessions are being filtered out or rejected.

## Invariant Principle

### Hard Invariant (MUST BE TRUE)
```
Any session that references a strategy_id must run the SAME strategy evaluation pipeline 
(markets loop, AI context build, decision logic, logging, cadence) regardless of mode.

ONLY execution differs by mode:
- virtual + arena => virtual broker (simulated fills), simulated accounts
- live => live broker (real orders), live account

Arena is NOT a different strategy. Arena is just a virtual competition wrapper 
(starting equity rules + leaderboard/snapshots), but strategy execution must be identical.
```

## Investigation Results

### 1. Cron Job Scheduler (`app/api/cron/tick-all-sessions/route.ts`)

**Query:**
```typescript
.from("strategy_sessions")
.select(`id, mode, status, last_tick_at, cadence_seconds, started_at, markets, strategies!inner(id, filters)`)
.eq("status", "running")
```

**Finding:** ✅ **NO MODE FILTERING** - Query correctly includes ALL modes (virtual, live, arena)

**Changes Made:**
- ✅ Added `mode` and `markets` to SELECT to enable diagnostic logging
- ✅ Added invariant log: `🎯 Ticking session ${id} | mode=${mode} | markets=${markets} | ${timeSinceLastTick}s since last tick`

**Verification:** If arena sessions have `status = 'running'`, they WILL be picked up by cron.

---

### 2. Tick Endpoint (`app/api/sessions/[id]/tick/route.ts`)

**Status Check:**
```typescript
if (session.status !== "running") {
  console.log(`🛑 REJECTED - Session status is "${session.status}", not "running". NOT calling AI.`);
  return NextResponse.json({ error: "Session is not running" }, { status: 400 });
}
```

**Finding:** ✅ **NO MODE FILTERING** - Rejection is based solely on `status`, not `mode`

**Changes Made:**
- ✅ Added invariant log at start: `🎯 ENGINE START | session=${id} | mode=${mode} | markets=${markets} | strategy=${strategy_id}`
- ✅ Added arena assertion: `⚠️ ARENA MODE DETECTED - This MUST use same strategy evaluation as virtual, only broker differs`

---

### 3. Broker Selection

**getTables Function:**
```typescript
function getTables(mode: string) {
  if (mode === "live") {
    return { trades: "live_trades", positions: "live_positions", accounts: "live_accounts" };
  }
  return { trades: "virtual_trades", positions: "virtual_positions", accounts: "virtual_accounts" };
}
```

**Finding:** ✅ **ARENA USES VIRTUAL TABLES** - Arena correctly defaults to virtual broker

**Existing Checks:**
```typescript
// Line 224-227
if (sessionMode === "virtual" || sessionMode === "arena") {
  if (!session.virtual_accounts) {
    return NextResponse.json({ error: "Virtual account not found" }, { status: 404 });
  }
}

// Line 258-269
if (sessionMode === "virtual" || sessionMode === "arena") {
  account = session.virtual_accounts;
  if (!account) {
    return NextResponse.json({ error: "Virtual account not found" }, { status: 404 });
  }
  accountEquity = Number(account.equity || 100000);
  accountId = account.id;
  
  // Assertion: Arena mode must use virtual broker
  if (sessionMode === "arena") {
    console.log(`[Tick] ✅ Arena session verified: using virtual broker, account_id=${accountId}`);
  }
}
```

**Finding:** ✅ **ARENA CORRECTLY TREATED AS VIRTUAL** throughout the tick pipeline

---

### 4. Order Execution

**placeMarketOrder Function:**
```typescript
async function placeMarketOrder(params: {
  sessionMode: "virtual" | "live" | "arena";
  livePrivateKey?: string;
  account_id: string;
  strategy_id: string;
  session_id: string;
  market: string;
  side: "buy" | "sell";
  notionalUsd: number;
  slippageBps: number;
  feeBps: number;
}): Promise<{success: boolean; error?: string; trade?: any;}> {
  const { sessionMode, livePrivateKey, ...orderParams } = params;

  if (sessionMode === "live") {
    // LIVE MODE: Place real order on Hyperliquid
    console.log(`[Order Execution] 🔴 LIVE MODE: Placing REAL order on Hyperliquid`);
    // ... real order logic
  } else {
    // VIRTUAL/ARENA MODE: Use virtual broker (simulation)
    const modeLabel = sessionMode === "arena" ? "ARENA (virtual)" : "VIRTUAL";
    console.log(`[Order Execution] 🟢 ${modeLabel} MODE: Simulating order`);
    return await placeVirtualOrder(orderParams);
  }
}
```

**Finding:** ✅ **ARENA USES VIRTUAL BROKER** - Arena orders are simulated, not real

---

### 5. Equity Snapshots

**Equity Point Writing (Line 1312-1317):**
```typescript
if (freshAccount) {
  await serviceClient.from("equity_points").insert({
    account_id: account.id,
    session_id: sessionId,
    t: new Date().toISOString(),
    equity: calculatedEquity,
  });
}
```

**Finding:** ✅ **NO MODE FILTERING** - Equity snapshots written for ALL modes

**Changes Made:**
- ✅ Added error checking for snapshot writes
- ✅ Added invariant log: `✅ ENGINE SNAPSHOT WRITTEN | session=${id} | mode=${mode} | equity=$${equity}`

---

### 6. Arena Snapshots

**Arena-Specific Snapshot (Line 1387-1400):**
```typescript
// Update arena snapshot if session is in arena
try {
  const { updateArenaSnapshot } = await import("@/lib/arena/updateArenaSnapshot");
  if (session.mode === "arena" || session.arena_started_at) {
    await updateArenaSnapshot(serviceClient, sessionId, accountEquity);
  }
} catch (arenaErr) {
  console.error("[Tick] Failed to update arena snapshot:", arenaErr);
}
```

**Finding:** ✅ **CONDITIONAL ON MODE** - Arena snapshots only written for arena sessions (correct)

---

## Diagnostic Script

To verify arena sessions exist and their status:

```sql
-- Check all arena sessions
SELECT 
  s.id,
  s.mode,
  s.status,
  s.started_at,
  s.last_tick_at,
  s.cadence_seconds,
  s.markets,
  s.account_id,
  va.equity as account_equity,
  ae.arena_status,
  ae.active as arena_active
FROM strategy_sessions s
LEFT JOIN virtual_accounts va ON s.account_id = va.id
LEFT JOIN arena_entries ae ON s.id = ae.session_id
WHERE s.mode = 'arena'
ORDER BY s.created_at DESC
LIMIT 10;

-- Check if arena sessions are running
SELECT COUNT(*) as running_arena_sessions
FROM strategy_sessions
WHERE mode = 'arena' AND status = 'running';

-- Check latest equity points for arena sessions
SELECT 
  ep.session_id,
  s.mode,
  COUNT(ep.id) as snapshot_count,
  MAX(ep.t) as latest_snapshot,
  ROUND(MAX(ep.equity)::numeric, 2) as latest_equity
FROM equity_points ep
JOIN strategy_sessions s ON ep.session_id = s.id
WHERE s.mode = 'arena'
GROUP BY ep.session_id, s.mode
ORDER BY MAX(ep.t) DESC;

-- Check latest decisions for arena sessions
SELECT 
  d.session_id,
  s.mode,
  COUNT(d.id) as decision_count,
  MAX(d.created_at) as latest_decision
FROM decisions d
JOIN strategy_sessions s ON d.session_id = s.id
WHERE s.mode = 'arena'
GROUP BY d.session_id, s.mode
ORDER BY MAX(d.created_at) DESC;
```

---

## Possible Root Causes (To Check)

### A. Arena Sessions Not Being Created with `status = 'running'`

**Check:**
```sql
SELECT id, mode, status, created_at, started_at
FROM strategy_sessions
WHERE mode = 'arena'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:** Arena sessions should have `status = 'running'` after user clicks "Start in Arena"

**Session Creation Flow:**
1. User clicks "Start in Arena" on strategy page
2. Frontend calls `POST /api/sessions { mode: "arena" }`
3. Backend creates session with `status = "stopped"` (line 240 of `app/api/sessions/route.ts`)
4. Frontend calls `PATCH /api/sessions/:id/control { status: "running" }`
5. Backend updates session to `status = "running"`

**Potential Issue:** If step 4 fails, session remains `status = "stopped"` and won't be ticked.

**Verification:**
```bash
# Check frontend network tab after clicking "Start in Arena"
# Should see:
# 1. POST /api/sessions -> 200 OK { session: { id, mode: "arena", status: "stopped" } }
# 2. PATCH /api/sessions/:id/control -> 200 OK { session: { status: "running" } }
```

---

### B. Database Constraint Blocking `status = 'running'` for Arena

**Check:**
```sql
-- Check mode constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'strategy_sessions'
  AND tc.constraint_type = 'CHECK'
  AND cc.constraint_name LIKE '%mode%';

-- Expected: mode IN ('virtual', 'live', 'arena')

-- Check status constraint  
SELECT constraint_name, check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'strategy_sessions'
  AND tc.constraint_type = 'CHECK'
  AND cc.constraint_name LIKE '%status%';

-- Expected: status IN ('running', 'stopped')
```

**Potential Issue:** If constraints don't allow `mode = 'arena'` or `status = 'running'` together, updates will fail silently.

---

### C. `virtual_accounts` Not Being Created for Arena Sessions

**Check:**
```sql
SELECT 
  s.id as session_id,
  s.mode,
  s.account_id,
  va.id as virtual_account_id,
  va.equity,
  va.starting_equity
FROM strategy_sessions s
LEFT JOIN virtual_accounts va ON s.account_id = va.id
WHERE s.mode = 'arena'
ORDER BY s.created_at DESC
LIMIT 5;
```

**Expected:** Every arena session should have a linked `virtual_account` with `starting_equity = 100000`

**Potential Issue:** If `virtual_accounts` is NULL, tick endpoint will return 404 "Virtual account not found" (line 226)

---

### D. Cron Job Not Running or Not Reaching Tick Endpoint

**Check:**
```bash
# Check server logs for cron activity
grep "\[Cron\]" /tmp/dev-server.log | tail -20

# Expected to see every 60 seconds:
# [Cron] ✅ Tick-all-sessions endpoint called at 2026-01-24T...
# [Cron] Found N running session(s)
# [Cron] 🎯 Ticking session <id> | mode=arena | markets=BTC-PERP,ETH-PERP | ...
```

**Potential Issue:** Cron job not running, or URL misconfigured

---

## Verification Steps

### Step 1: Create Arena Session
```bash
# In browser:
1. Go to strategy page
2. Click "Start in Arena 🏆"
3. Wait for redirect to session page
4. Verify session page loads without errors
```

### Step 2: Check Session Status
```sql
-- Get the session ID from URL, then:
SELECT id, mode, status, started_at, last_tick_at, account_id
FROM strategy_sessions
WHERE id = '<session-id>';

-- Expected:
-- mode = 'arena'
-- status = 'running'
-- started_at = <timestamp>
-- account_id = <uuid>
```

### Step 3: Wait for Cron Tick
```bash
# Wait 60-120 seconds, then check logs:
grep "session-id" /tmp/dev-server.log | grep "\[Cron\]"

# Expected:
# [Cron] 🎯 Ticking session <session-id> | mode=arena | markets=... | ...
```

### Step 4: Verify Tick Executed
```sql
-- Check equity snapshots
SELECT session_id, t, equity
FROM equity_points
WHERE session_id = '<session-id>'
ORDER BY t DESC
LIMIT 5;

-- Expected: At least 1 row

-- Check decisions
SELECT session_id, created_at, intent, confidence
FROM decisions
WHERE session_id = '<session-id>'
ORDER BY created_at DESC
LIMIT 5;

-- Expected: At least 1 row if AI made a decision
```

### Step 5: Check Server Logs for Invariant Logs
```bash
grep "ENGINE START" /tmp/dev-server.log | grep "<session-id>"
# Expected: [Tick API] 🎯 ENGINE START | session=<id> | mode=arena | markets=...

grep "ENGINE SNAPSHOT" /tmp/dev-server.log | grep "<session-id>"
# Expected: [Tick] ✅ ENGINE SNAPSHOT WRITTEN | session=<id> | mode=arena | equity=$...
```

---

## Files Modified

### 1. `app/api/cron/tick-all-sessions/route.ts`
**Changes:**
- Added `mode` and `markets` to session SELECT query
- Added invariant log: `🎯 Ticking session ${id} | mode=${mode} | markets=${markets}`

**Purpose:** Verify cron is selecting arena sessions and attempting to tick them

---

### 2. `app/api/sessions/[id]/tick/route.ts`
**Changes:**
- Added invariant log at start: `🎯 ENGINE START | session=${id} | mode=${mode} | markets=${markets} | strategy=${strategy_id}`
- Added arena assertion log: `⚠️ ARENA MODE DETECTED - This MUST use same strategy evaluation as virtual, only broker differs`
- Added equity snapshot success log: `✅ ENGINE SNAPSHOT WRITTEN | session=${id} | mode=${mode} | equity=$${equity}`
- Added equity snapshot error handling

**Purpose:** Verify arena sessions are being processed through the tick pipeline

---

## Expected Log Output (After Fix)

### Cron Job (Every 60s)
```
[Cron] ✅ Tick-all-sessions endpoint called at 2026-01-24T12:00:00.000Z
[Cron] Found 3 running session(s)
[Cron] 🎯 Ticking session abc-123 | mode=arena | markets=BTC-PERP,ETH-PERP,SOL-PERP | 60s since last tick
[Cron] Tick response for session abc-123: 200
```

### Tick Endpoint (Per Session)
```
[Tick API] 🎯 ENGINE START | session=abc-123 | mode=arena | markets=BTC-PERP,ETH-PERP,SOL-PERP | strategy=def-456
[Tick API] ⚠️ ARENA MODE DETECTED - This MUST use same strategy evaluation as virtual, only broker differs
[Tick] ✅ Arena session verified: using virtual broker, account_id=xyz-789
[Tick] 💰 Equity snapshot: cash=100000.00 + unrealizedPnl=0.00 = 100000.00 (DB equity: 100000.00)
[Tick] ✅ ENGINE SNAPSHOT WRITTEN | session=abc-123 | mode=arena | equity=$100000.00
```

---

## Strong Assertions Added

### 1. Mode-Agnostic Ticking
```typescript
// In cron job:
console.log(`[Cron] 🎯 Ticking session ${id} | mode=${mode} | markets=${markets} | ...`);
// This MUST log arena sessions if they have status='running'
```

### 2. Arena Uses Virtual Broker
```typescript
// In tick endpoint:
if (sessionMode === "arena") {
  console.log(`[Tick API] ⚠️ ARENA MODE DETECTED - This MUST use same strategy evaluation as virtual, only broker differs`);
}
// If this doesn't appear, arena sessions aren't reaching tick endpoint
```

### 3. Equity Snapshots Written
```typescript
// After equity snapshot:
console.log(`[Tick] ✅ ENGINE SNAPSHOT WRITTEN | session=${id} | mode=${mode} | equity=$${equity}`);
// This MUST appear for arena sessions, otherwise snapshots aren't being written
```

---

## Next Steps

1. **Run Diagnostic SQL** to check if arena sessions exist and their current status
2. **Create Test Arena Session** using "Start in Arena" button
3. **Monitor Logs** for new invariant log messages
4. **Verify in Database** that equity_points and decisions are being written
5. **Check Leaderboard** to confirm arena session appears

---

## Success Criteria

✅ Arena sessions with `status = 'running'` are selected by cron job  
✅ Arena sessions pass through tick endpoint without rejection  
✅ Arena sessions use virtual broker for all operations  
✅ Equity snapshots are written to `equity_points` table  
✅ Decisions are written to `decisions` table  
✅ Arena snapshots are written to `arena_snapshots` table (if in arena)  
✅ Logs show `ENGINE START` and `ENGINE SNAPSHOT WRITTEN` for arena sessions  
✅ Leaderboard updates with latest equity for arena participants  

---

## Rollback Plan

If issues occur, revert changes:
```bash
git diff app/api/cron/tick-all-sessions/route.ts
git checkout app/api/cron/tick-all-sessions/route.ts

git diff app/api/sessions/[id]/tick/route.ts  
git checkout app/api/sessions/[id]/tick/route.ts
```

The changes are purely additive (logging) and don't modify behavior, so rollback risk is minimal.
