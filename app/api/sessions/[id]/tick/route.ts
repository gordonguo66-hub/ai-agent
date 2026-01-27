import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { decryptCredential } from "@/lib/crypto/credentials";
import { resolveStrategyApiKey } from "@/lib/ai/resolveApiKey";
import { openAICompatibleIntentCall, normalizeBaseUrl } from "@/lib/ai/openaiCompatible";
import { getMidPrices } from "@/lib/hyperliquid/prices";
import { getCandles } from "@/lib/hyperliquid/candles";
import { placeMarketOrder as placeVirtualOrder, markToMarket, getPositions } from "@/lib/brokers/virtualBroker";
import { calcTotals, verifyReconciliation } from "@/lib/accounting/pnl";
import { HyperliquidBroker } from "@/lib/brokers/hyperliquidBroker";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { calculateIndicators } from "@/lib/indicators/calculations";
import { BrokerContext, MarketData, OrderRequest } from "@/lib/engine/types";
import {
  getOrCreateLiveAccount,
  syncPositionsFromHyperliquid,
  updateAccountEquity,
  recordLiveTrade,
  getLivePositions,
  getLiveTrades,
} from "@/lib/brokers/liveBroker";
import { placeMarketOrder as placeRealOrder } from "@/lib/hyperliquid/orderExecution";

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  groq: "https://api.groq.com/openai/v1",
  perplexity: "https://api.perplexity.ai",
  fireworks: "https://api.fireworks.ai/inference/v1",
  meta: "https://api.together.xyz/v1",
  qwen: "https://api.together.xyz/v1",
  glm: "https://api.together.xyz/v1",
};

// Helper to get table names based on session mode
function getTables(mode: string) {
  if (mode === "live") {
    return {
      trades: "live_trades",
      positions: "live_positions",
      accounts: "live_accounts",
    };
  }
  return {
    trades: "virtual_trades",
    positions: "virtual_positions",
    accounts: "virtual_accounts",
  };
}

/**
 * Unified order execution that routes to either real or virtual broker based on session mode
 */
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
}): Promise<{
  success: boolean;
  error?: string;
  trade?: any;
}> {
  const { sessionMode, livePrivateKey, ...orderParams } = params;

  if (sessionMode === "live") {
    // LIVE MODE: Place real order on Hyperliquid
    if (!livePrivateKey) {
      return { success: false, error: "Private key required for live trading" };
    }

    console.log(`[Order Execution] 🔴 LIVE MODE: Placing REAL order on Hyperliquid`);
    
    try {
      // Remove -PERP suffix if present (SDK uses coin name without suffix)
      const coin = orderParams.market.replace(/-PERP$/i, "");
      
      const result = await placeRealOrder(
        livePrivateKey,
        coin,
        orderParams.side,
        orderParams.notionalUsd,
        orderParams.slippageBps / 10000 // Convert bps to decimal (e.g., 5 bps = 0.0005)
      );

      if (result.success) {
        console.log(`[Order Execution] ✅ REAL order placed successfully: ${result.orderId}`);
        return {
          success: true,
          trade: {
            order_id: result.orderId,
            fill_price: result.fillPrice,
            fill_size: result.fillSize,
          },
        };
      } else {
        console.error(`[Order Execution] ❌ REAL order failed: ${result.error}`);
        return {
          success: false,
          error: result.error || "Order failed",
        };
      }
    } catch (error: any) {
      console.error(`[Order Execution] ❌ Exception placing REAL order:`, error);
      return {
        success: false,
        error: error.message || "Failed to place order",
      };
    }
  } else {
    // VIRTUAL/ARENA MODE: Use virtual broker (simulation)
    // Arena is virtual-only ($100k competition), so it uses the same virtual broker as regular virtual mode
    const modeLabel = sessionMode === "arena" ? "ARENA (virtual)" : "VIRTUAL";
    console.log(`[Order Execution] 🟢 ${modeLabel} MODE: Simulating order`);
    return await placeVirtualOrder(orderParams);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  console.log(`[Tick API] ⚡ TICK HANDLER CALLED for session ${sessionId}`);
  
  try {
    // Allow internal cron calls (bypass auth for server-side cron)
    const internalApiKey = request.headers.get("X-Internal-API-Key");
    const cronSecret = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
    
    // Debug logging
    if (internalApiKey) {
      console.log(`[Tick API] Received X-Internal-API-Key header (first 8 chars: ${internalApiKey.substring(0, 8)}...)`);
    } else {
      console.log(`[Tick API] No X-Internal-API-Key header received`);
    }
    console.log(`[Tick API] Environment INTERNAL_API_KEY/CRON_SECRET: ${cronSecret ? `${cronSecret.substring(0, 8)}...` : 'NOT SET'}`);
    let user = null;
    let isInternalCall = false;
    
    if (internalApiKey && cronSecret && internalApiKey === cronSecret) {
      // Internal cron call - get user from session instead
      isInternalCall = true;
      const serviceClient = createServiceRoleClient();
      const { data: session } = await serviceClient
        .from("strategy_sessions")
        .select("user_id")
        .eq("id", sessionId)
        .single();
      
      if (session) {
        // Create a minimal user object for internal calls
        user = { id: session.user_id } as any;
        console.log(`[Tick API] Internal cron call for session ${sessionId}`);
      } else {
        return NextResponse.json({ error: "Session not found for internal call" }, { status: 404 });
      }
    } else {
      // Normal API call - require user authentication
      try {
        user = await getUserFromRequest(request);
        if (!user) {
          console.error(`[Tick API] ❌ No user found from request - authentication failed`);
          return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
        }
        console.log(`[Tick API] ✅ User authenticated: ${user.id}`);
      } catch (authError: any) {
        console.error(`[Tick API] ❌ Authentication error:`, authError.message);
        return NextResponse.json({ error: `Authentication failed: ${authError.message}` }, { status: 401 });
      }
    }
    const serviceClient = createServiceRoleClient();

    // Load session with strategy and accounts (both virtual and live)
    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .select(`
        *,
        strategies(
          id,
          user_id,
          name,
          model_provider,
          model_name,
          prompt,
          filters,
          api_key_ciphertext,
          saved_api_key_id,
          created_at
        ),
        virtual_accounts(*),
        live_accounts(*)
      `)
      .eq("id", sessionId)
      .single();
    
    if (sessionError || !session) {
      console.error(`[Tick API] ❌ Failed to load session ${sessionId}:`, sessionError);
      console.error(`[Tick API] Session data:`, session);
      return NextResponse.json({ error: "Session not found", details: sessionError?.message }, { status: 404 });
    }
    
    // For internal calls, verify user_id matches (security check)
    if (isInternalCall && session && session.user_id !== user.id) {
      return NextResponse.json({ error: "User mismatch in internal call" }, { status: 403 });
    }
    
    // For normal calls, verify ownership
    if (!isInternalCall && session && session.user_id !== user.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "running") {
      console.log(`[Tick API] 🛑 REJECTED - Session status is "${session.status}", not "running". NOT calling AI.`);
      return NextResponse.json({ error: "Session is not running" }, { status: 400 });
    }
    
    // INVARIANT LOG: Verify tick is processing this session with correct mode and markets
    const sessionMode = session.mode || "virtual";
    const sessionMarkets = session.markets || [];
    console.log(`[Tick API] 🎯 ENGINE START | session=${sessionId} | mode=${sessionMode} | markets=${sessionMarkets.join(',')} | strategy=${session.strategy_id}`);
    
    // CRITICAL ASSERTION: Arena mode must use same evaluation pipeline as virtual
    if (sessionMode === "arena") {
      console.log(`[Tick API] ⚠️ ARENA MODE DETECTED - This MUST use same strategy evaluation as virtual, only broker differs`);
    }

    const strategy = session.strategies;
    const filters = strategy.filters || {};
    const tables = getTables(sessionMode);
    
    // Log loaded strategy details to verify fresh data is being fetched on each tick
    console.log(`[Tick API] 📋 FRESH STRATEGY DATA loaded for session ${sessionId}:`, {
      strategy_id: strategy.id,
      strategy_name: strategy.name,
      model_provider: strategy.model_provider,
      model_name: strategy.model_name,
      cadence_seconds: filters.cadenceSeconds,
      candle_timeframe: filters.aiInputs?.candles?.timeframe,
      has_saved_key: !!strategy.saved_api_key_id,
      saved_key_id: strategy.saved_api_key_id,
      has_direct_key: !!strategy.api_key_ciphertext,
      direct_key_length: strategy.api_key_ciphertext?.length || 0,
      timestamp: new Date().toISOString(),
    });
    console.log(`[Tick API] ✅ Strategy edits ARE applied to running sessions - this data is fresh from DB!`);

    // Validate session setup based on mode
    // Arena is virtual-only, so both "virtual" and "arena" use virtual accounts
    if (sessionMode === "virtual" || sessionMode === "arena") {
      if (!session.virtual_accounts) {
        return NextResponse.json({ error: "Virtual account not found" }, { status: 404 });
      }
    } else if (sessionMode === "live") {
      // Verify exchange connection exists for live mode
      const { data: exchangeConnection } = await serviceClient
        .from("exchange_connections")
        .select("id, wallet_address")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!exchangeConnection) {
        return NextResponse.json(
          { error: "No exchange connection found. Please connect your Hyperliquid account in Settings." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ error: `Invalid session mode: ${sessionMode}` }, { status: 400 });
    }

    // Get account/equity based on mode
    let accountEquity = 0;
    let account: any = null;
    let accountId: string | null = null;
    let liveBroker: HyperliquidBroker | null = null;
    let liveWalletAddress: string | null = null;
    let livePrivateKey: string | null = null;
    let exchangeConnectionId: string | null = null;

    // Arena mode is virtual-only, so both "virtual" and "arena" use virtual broker
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
    } else {
      // Live mode: get or create live account
      liveBroker = new HyperliquidBroker();
      
      // Get exchange connection with encrypted credentials
      const { data: exchangeConnection } = await serviceClient
        .from("exchange_connections")
        .select("id, wallet_address, key_material_encrypted")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (!exchangeConnection) {
        return NextResponse.json({ error: "Exchange connection not found" }, { status: 404 });
      }
      
      liveWalletAddress = exchangeConnection.wallet_address;
      exchangeConnectionId = exchangeConnection.id;
      
      // Decrypt private key for order signing
      try {
        livePrivateKey = decryptCredential(exchangeConnection.key_material_encrypted);
        console.log(`[Tick] 🔐 Decrypted private key for live trading`);
      } catch (err: any) {
        console.error("[Tick] Failed to decrypt private key:", err);
        return NextResponse.json({ error: "Failed to decrypt exchange credentials" }, { status: 500 });
      }
      
      if (!liveWalletAddress) {
        return NextResponse.json({ error: "Exchange connection missing wallet address" }, { status: 400 });
      }
      
      // Get or create live account (tracks equity/positions in DB)
      account = await getOrCreateLiveAccount(user.id, serviceClient);
      accountId = account.id;
      
      if (!accountId) {
        return NextResponse.json({ error: "Failed to create live account" }, { status: 500 });
      }
      
      // liveWalletAddress is guaranteed to be non-null here due to check above
      const walletAddr = liveWalletAddress!;
      
      // Sync positions and equity from Hyperliquid
      await syncPositionsFromHyperliquid(accountId, walletAddr);
      const { equity } = await updateAccountEquity(accountId, walletAddr);
      accountEquity = equity;
      
      // Update account object with fresh data
      account.equity = equity;
      
      console.log(`[Tick] Live mode - Account ${accountId} equity: $${accountEquity.toFixed(2)}`);
    }

    // Get markets to process
    const markets = filters.markets || [];
    if (markets.length === 0) {
      return NextResponse.json({ error: "No markets configured in strategy" }, { status: 400 });
    }
    
    // Round-robin: Process only ONE market per tick to reduce AI call frequency
    // Calculate which market to process based on session start time and cadence
    // Use strategy filters cadence (most up-to-date) if available, otherwise session cadence
    const strategyFilters = strategy.filters || {};
    const cadenceSeconds = strategyFilters.cadenceSeconds || session.cadence_seconds || 30;
    const sessionStartTime = session.started_at 
      ? new Date(session.started_at).getTime() 
      : new Date(session.created_at).getTime();
    const cadenceMs = cadenceSeconds * 1000;
    const ticksSinceStart = Math.floor((Date.now() - sessionStartTime) / cadenceMs);
    const marketIndex = ticksSinceStart % markets.length;
    const marketsToProcess = [markets[marketIndex]]; // Process only one market per tick
    
    console.log(`[Tick] 🔄 Round-robin: Processing market ${marketIndex + 1}/${markets.length} (${marketsToProcess[0]})`);
    console.log(`[Tick] 📊 This reduces AI calls from ${markets.length} per tick to 1 per tick`);
    console.log(`[Tick] 📊 With ${markets.length} markets and ${cadenceSeconds}s cadence: ${markets.length} calls/${cadenceSeconds}s → 1 call/${cadenceSeconds}s`);

    // Get positions early so we can price ALL open markets for accurate equity
    let allPositionsForExit: any[] = [];
    // Arena is virtual-only, so both "virtual" and "arena" use virtual broker
    if ((sessionMode === "virtual" || sessionMode === "arena") && accountId) {
      allPositionsForExit = await getPositions(accountId);
    } else if (sessionMode === "live" && accountId) {
      allPositionsForExit = await getLivePositions(accountId);
    }

    // Fetch real prices from Hyperliquid
    // IMPORTANT: include ALL open position markets so equity reflects full portfolio
    let pricesByMarket: Record<string, number>;
    try {
      const pricingMarkets = new Set<string>(marketsToProcess);
      for (const position of allPositionsForExit) {
        if (position?.market) pricingMarkets.add(position.market);
      }
      pricesByMarket = await getMidPrices(Array.from(pricingMarkets));
      if (Object.keys(pricesByMarket).length === 0) {
        return NextResponse.json({ error: "Failed to fetch prices for any market" }, { status: 500 });
      }
    } catch (error: any) {
      console.error("Error fetching prices:", error);
      return NextResponse.json({ error: `Failed to fetch market prices: ${error.message}` }, { status: 500 });
    }

    // Mark existing positions to market (virtual/arena mode only, not live)
    // Arena is virtual-only, so both "virtual" and "arena" use virtual broker
    if ((sessionMode === "virtual" || sessionMode === "arena") && accountId) {
      await markToMarket(accountId, pricesByMarket);
    }

    // ENFORCE EXIT RULES - Check all positions for exit conditions BEFORE processing new trades
    const entryExit = filters.entryExit || {};
    const exitRules = entryExit.exit || {};
    
    const now = new Date();
    
    for (const position of allPositionsForExit) {
      const positionPrice = pricesByMarket[position.market];
      if (!positionPrice) continue;

      const entryPrice = Number(position.avg_entry);
      const size = Number(position.size);
      
      // Recalculate unrealized PnL from current price (more accurate than stored value)
      // This ensures exit checks use the latest market price
      let unrealizedPnl = 0;
      if (position.side === "long") {
        unrealizedPnl = (positionPrice - entryPrice) * size;
      } else {
        unrealizedPnl = (entryPrice - positionPrice) * size;
      }
      
      // Calculate unrealized PnL as percentage
      const unrealizedPnlPct = entryPrice > 0 && size > 0 ? (unrealizedPnl / (entryPrice * size)) * 100 : 0;
      
      // Get when position was opened (from first trade for this position)
      const { data: firstTrade } = await serviceClient
        .from(tables.trades)
        .select("created_at")
        .eq("account_id", account.id)
        .eq("market", position.market)
        .eq("action", "open")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      const positionAgeMinutes = firstTrade 
        ? (now.getTime() - new Date(firstTrade.created_at).getTime()) / (60 * 1000)
        : 0;

      let shouldExit = false;
      let exitReason = "";

      // Check exit rules based on exit mode
      
      // MODE: SIGNAL (AI-driven) - Only check optional safety guardrails
      if (exitRules.mode === "signal") {
        // Optional emergency override: max loss protection
        if (exitRules.maxLossProtectionPct && unrealizedPnlPct <= -Math.abs(exitRules.maxLossProtectionPct)) {
          shouldExit = true;
          exitReason = `Max loss protection: ${unrealizedPnlPct.toFixed(2)}% <= -${exitRules.maxLossProtectionPct}% (emergency guardrail)`;
        }
        // Optional emergency override: max profit cap
        else if (exitRules.maxProfitCapPct && unrealizedPnlPct >= exitRules.maxProfitCapPct) {
          shouldExit = true;
          exitReason = `Max profit cap: ${unrealizedPnlPct.toFixed(2)}% >= ${exitRules.maxProfitCapPct}% (emergency guardrail)`;
        }
        // Otherwise, only AI can trigger exits (checked after AI call)
      }
      
      // MODE: TP/SL - Use take profit and stop loss rules
      else if (exitRules.mode === "tp_sl") {
        // Take Profit
        if (exitRules.takeProfitPct && unrealizedPnlPct >= exitRules.takeProfitPct) {
          shouldExit = true;
          exitReason = `Take profit: ${unrealizedPnlPct.toFixed(2)}% >= ${exitRules.takeProfitPct}%`;
        }
        // Stop Loss
        else if (exitRules.stopLossPct && unrealizedPnlPct <= -Math.abs(exitRules.stopLossPct)) {
          shouldExit = true;
          exitReason = `Stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitRules.stopLossPct}%`;
        }
      }

      // MODE: TRAILING STOP - Track peak and exit on drawdown
      else if (exitRules.mode === "trailing" && exitRules.trailingStopPct) {
        // Get peak price for this position (stored in position metadata or calculate from trades)
        const { data: positionTrades } = await serviceClient
          .from(tables.trades)
          .select("price, created_at")
          .eq("account_id", account.id)
          .eq("market", position.market)
          .order("created_at", { ascending: false });
        
        // Calculate peak price (highest price for long, lowest for short)
        let peakPrice = entryPrice;
        if (positionTrades && positionTrades.length > 0) {
          const prices = positionTrades.map(t => Number(t.price));
          if (position.side === "long") {
            peakPrice = Math.max(...prices, entryPrice);
          } else {
            peakPrice = Math.min(...prices, entryPrice);
          }
        }
        
        // Check if current price has dropped by trailingStopPct from peak
        const dropFromPeakPct = position.side === "long"
          ? ((peakPrice - positionPrice) / peakPrice) * 100
          : ((positionPrice - peakPrice) / peakPrice) * 100;
        
        if (dropFromPeakPct >= exitRules.trailingStopPct && positionPrice !== peakPrice) {
          shouldExit = true;
          exitReason = `Trailing stop: ${dropFromPeakPct.toFixed(2)}% drop from peak ${peakPrice.toFixed(2)} >= ${exitRules.trailingStopPct}%`;
        }
        
        // Check optional initial hard stop loss (NOT take profit)
        if (!shouldExit && exitRules.initialStopLossPct && unrealizedPnlPct <= -Math.abs(exitRules.initialStopLossPct)) {
          shouldExit = true;
          exitReason = `Initial stop loss: ${Math.abs(unrealizedPnlPct).toFixed(2)}% >= ${exitRules.initialStopLossPct}%`;
        }
      }

      // MODE: TIME-BASED - Exit after max hold time
      else if (exitRules.mode === "time" && exitRules.maxHoldMinutes && positionAgeMinutes >= exitRules.maxHoldMinutes) {
        shouldExit = true;
        exitReason = `Max hold time: ${positionAgeMinutes.toFixed(1)} minutes >= ${exitRules.maxHoldMinutes} minutes`;
      }

      // Execute exit if conditions met
      if (shouldExit) {
        console.log(`[Tick] 🚪 Auto-exiting position ${position.market} (${position.side}): ${exitReason}`);
        const exitSide = position.side === "long" ? "sell" : "buy";
        const positionValue = entryPrice * size;
        
        const exitResult = await placeMarketOrder({
          sessionMode,
          livePrivateKey: livePrivateKey || undefined,
          account_id: account.id,
          strategy_id: strategy.id,
          session_id: sessionId,
          market: position.market,
          side: exitSide,
          notionalUsd: positionValue, // Close entire position
          slippageBps: 5,
          feeBps: 5,
        });

        if (exitResult.success) {
          console.log(`[Tick] ✅ Auto-exit executed: ${exitReason}`);
        } else {
          console.error(`[Tick] ❌ Auto-exit failed: ${exitResult.error}`);
        }
      }
    }

    // Process each market
    const decisions: any[] = [];
    const tickStartTime = Date.now();
    const tickStartTimestamp = new Date().toISOString();
    console.log(`[Tick] ⏰ Starting tick at ${tickStartTimestamp}`);
    
    // CRITICAL FIX: Set last_tick_at at START of tick, not END
    // This prevents drift where tick execution time causes us to miss cron cycles.
    // By setting it at the start, we ensure the next cron check sees the correct time.
    // Update session last_tick_at at START (will be overridden at end to same value if needed)
    const DEBUG = process.env.DEBUG_CADENCE === "true";
    if (DEBUG) {
      const prevLastTickAt = session.last_tick_at;
      const timeSinceLastTick = prevLastTickAt 
        ? Math.floor((Date.now() - new Date(prevLastTickAt).getTime()) / 1000)
        : null;
      console.log(`[Tick API] Setting last_tick_at at START:`, {
        sessionId,
        cadenceSeconds,
        prevLastTickAt,
        newLastTickAt: tickStartTimestamp,
        timeSinceLastTick,
      });
    }
    // CRITICAL: Update last_tick_at synchronously at START of tick
    // This must complete BEFORE tick processing to ensure next cron reads correct value
    const { error: updateError } = await serviceClient
      .from("strategy_sessions")
      .update({ last_tick_at: tickStartTimestamp })
      .eq("id", sessionId);
    
    if (updateError) {
      console.error(`[Tick API] Failed to update last_tick_at:`, updateError);
      // Continue with tick anyway - we'll log it for debugging
    } else {
      console.log(`[Tick API] ✅ Updated last_tick_at to ${tickStartTimestamp} at START of tick`);
    }
    console.log(`[Tick] Processing ${marketsToProcess.length} markets: ${marketsToProcess.join(", ")}`);
    console.log(`[Tick] ⚠️ NOTE: Each market will trigger a separate AI call. Total AI calls this tick: ${marketsToProcess.length}`);

    for (let i = 0; i < marketsToProcess.length; i++) {
      const market = marketsToProcess[i];
      const marketStartTime = Date.now();
      console.log(`[Tick] Processing market ${i + 1}/${marketsToProcess.length}: ${market}`);
      
      const currentPrice = pricesByMarket[market];
      if (!currentPrice) {
        console.log(`[Tick] Skipping market ${i + 1}/${marketsToProcess.length}: ${market} - price fetch failed`);
        continue; // Skip if price fetch failed
      }

      // Get current positions for this market and all markets
      const allPositions = await getPositions(account.id);
      const marketPosition = allPositions.find((p) => p.market === market);

      // Build AI input payload - COMPILE ALL REQUESTED AI INPUTS
      const aiInputs = filters.aiInputs || {};
      const marketSnapshot: any = {
        market,
        price: currentPrice,
        timestamp: new Date().toISOString(),
      };

      // Fetch candles if enabled
      let candles: any[] = [];
      if (aiInputs.candles?.enabled) {
        try {
          const candleCount = aiInputs.candles.count || 200;
          let candleInterval = aiInputs.candles.timeframe || "5m";
          
          // Handle legacy numeric timeframes (convert to minutes format)
          if (typeof candleInterval === 'number') {
            candleInterval = `${candleInterval}m`;
          }
          
          const fetchedCandles = await getCandles(market, candleInterval, candleCount);
          candles = fetchedCandles.map((c) => ({
            time: c.t,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
            volume: c.v,
          }));
          marketSnapshot.candles = candles; // Include candles in market snapshot
          marketSnapshot.candlesCount = candles.length;
        } catch (error: any) {
          console.error(`[Tick] Failed to fetch candles for ${market}:`, error);
          // Continue without candles - don't fail the tick
        }
      }

      // Fetch orderbook if enabled
      let orderbookSnapshot: any = null;
      if (aiInputs.orderbook?.enabled) {
        try {
          const orderbookTop = await hyperliquidClient.getOrderbookTop(market);
          const depth = aiInputs.orderbook.depth || 20;
          // For now, we only get top of book. Full L2 orderbook would require more API calls
          orderbookSnapshot = {
            bid: orderbookTop.bid,
            ask: orderbookTop.ask,
            mid: orderbookTop.mid,
            spread: orderbookTop.ask - orderbookTop.bid,
            depth: depth,
            note: `Top of book only. Full ${depth}-level orderbook requires additional API calls.`,
          };
          marketSnapshot.orderbook = orderbookSnapshot;
        } catch (error: any) {
          console.error(`[Tick] Failed to fetch orderbook for ${market}:`, error);
          // Continue without orderbook - don't fail the tick
        }
      }

      // Calculate technical indicators from candles if enabled and we have candles
      let indicatorsSnapshot: any = {};
      if (candles.length > 0 && aiInputs.indicators) {
        try {
          // Convert candles back to the format needed for indicator calculations
          const candlesForIndicators = candles.map((c) => ({
            t: c.time,
            T: c.time + 1,
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close,
            v: c.volume,
            n: 0,
          }));

          indicatorsSnapshot = calculateIndicators(candlesForIndicators, {
            rsi: aiInputs.indicators.rsi,
            atr: aiInputs.indicators.atr,
            volatility: aiInputs.indicators.volatility,
            ema: aiInputs.indicators.ema,
          });
        } catch (error: any) {
          console.error(`[Tick] Failed to calculate indicators for ${market}:`, error);
          // Continue without indicators - don't fail the tick
        }
      }

      // ALWAYS include account information (equity, cash, starting equity)
      // This is essential for the AI to make informed trading decisions
      const accountInfo = {
        starting_equity: Number(account.starting_equity),
        current_equity: Number(account.equity),
        cash_balance: Number(account.cash_balance),
        available_cash: Number(account.cash_balance), // Available for new positions
        total_return_pct: ((Number(account.equity) - Number(account.starting_equity)) / Number(account.starting_equity)) * 100,
      };

      // ALWAYS include ALL positions across all markets
      // This is essential for the AI to understand portfolio exposure and make informed decisions
      // The AI needs to know:
      // - What positions are already open
      // - How much capital is deployed
      // - Overall portfolio risk
      const positionsSnapshot = allPositions.map((p) => ({
        market: p.market,
        side: p.side,
        size: Number(p.size),
        avg_entry: Number(p.avg_entry),
        unrealized_pnl: Number(p.unrealized_pnl || 0),
        position_value: Number(p.avg_entry) * Number(p.size) + Number(p.unrealized_pnl || 0),
      }));

      // Call AI model
      let intent: any;
      let confidence = 0;
      let actionSummary = "No action";
      let executed = false;
      let error: string | null = null;
      let riskResult: any = {};

      try {
        // STRICTLY ENFORCE ALL STRATEGY FEATURES - Declare all filter variables first
        const entryExit = filters.entryExit || {};
        const guardrails = filters.guardrails || {};
        const risk = filters.risk || {};
        const entry = entryExit.entry || {};
        
        // MIGRATION LAYER: Derive behaviors from mode if not present
        if (!entry.behaviors) {
          const mode = entry.mode || "signal";
          entry.behaviors = {
            trend: mode === "trend" || mode === "signal",
            breakout: mode === "breakout" || mode === "signal",
            meanReversion: mode === "meanReversion" || mode === "signal",
          };
          console.log(`[Tick] Derived behaviors from entry.mode="${mode}":`, entry.behaviors);
        }

        // Resolve and decrypt API key (checks saved key first, then fallback to strategy's own key)
        console.log(`[Tick] 🔑 Resolving API key for strategy ${strategy.id}:`, {
          has_saved_key_id: !!strategy.saved_api_key_id,
          saved_key_id: strategy.saved_api_key_id,
          has_direct_key: !!strategy.api_key_ciphertext,
        });
        const apiKey = await resolveStrategyApiKey(strategy);
        console.log(`[Tick] ✅ API key resolved successfully`);
        const baseUrl = PROVIDER_BASE_URLS[strategy.model_provider] || "";

        if (!baseUrl) {
          throw new Error(`Unknown provider: ${strategy.model_provider}`);
        }

        // Fetch recent decisions if enabled
        let recentDecisions: any[] = [];
        if (aiInputs.includeRecentDecisions) {
          try {
            const decisionsCount = aiInputs.recentDecisionsCount || 5;
            const { data: decisionsData } = await serviceClient
              .from("session_decisions")
              .select("id, created_at, intent, confidence, action_summary, executed")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: false })
              .limit(decisionsCount);

            if (decisionsData) {
              recentDecisions = decisionsData.map((d) => ({
                timestamp: d.created_at,
                intent: d.intent,
                confidence: d.confidence,
                actionSummary: d.action_summary,
                executed: d.executed,
              }));
            }
          } catch (error: any) {
            console.error(`[Tick] Failed to fetch recent decisions:`, error);
            // Continue without recent decisions - don't fail the tick
          }
        }

        // Build context for AI - COMPILED WITH ALL REQUESTED AI INPUTS
        const context: any = {
          market,
          marketData: marketSnapshot, // Includes price, candles (if enabled), orderbook (if enabled)
          account: accountInfo, // Total equity, cash balance, starting equity
          positions: aiInputs.includePositionState !== false ? positionsSnapshot : [], // ALL positions (unless disabled)
          currentMarketPosition: aiInputs.includePositionState !== false && marketPosition ? {
            market: marketPosition.market,
            side: marketPosition.side,
            size: Number(marketPosition.size),
            avg_entry: Number(marketPosition.avg_entry),
            unrealized_pnl: Number(marketPosition.unrealized_pnl || 0),
          } : null, // Current market's position (if any and if enabled)
          indicators: indicatorsSnapshot, // RSI, ATR, Volatility, EMA (if enabled and calculated)
          recentDecisions: aiInputs.includeRecentDecisions ? recentDecisions : [], // Previous AI decisions (if enabled)
          // Strategy configuration to guide AI
          strategy: {
            entryBehaviors: entry.behaviors || { trend: true, breakout: true, meanReversion: true },
            // Add instructions based on enabled behaviors
            entryInstructions: (() => {
              const behaviors = entry.behaviors || { trend: true, breakout: true, meanReversion: true };
              const enabled = [];
              if (behaviors.trend) enabled.push("trend-following (price moving in clear trend direction)");
              if (behaviors.breakout) enabled.push("breakout (price breaking through key support/resistance levels)");
              if (behaviors.meanReversion) enabled.push("mean reversion (price deviating significantly from average)");
              
              if (enabled.length === 0) {
                return "No entry behaviors enabled. Do not enter any positions.";
              } else if (enabled.length === 3) {
                return "All entry types allowed. Use AI-driven analysis to identify the best entry opportunities.";
              } else {
                return `Only these entry types are allowed: ${enabled.join(", ")}. Focus your analysis on these patterns only.`;
              }
            })(),
          },
        };

        // Call AI
        intent = await openAICompatibleIntentCall({
          baseUrl: normalizeBaseUrl(baseUrl),
          apiKey,
          model: strategy.model_name,
          prompt: strategy.prompt,
          provider: strategy.model_provider,
          context,
        });

        confidence = intent.confidence || 0;

        // AI-DRIVEN EXIT FOR "SIGNAL" MODE: Exit only when AI intent conflicts with current position
        // - "neutral" = do nothing, keep position
        // - "long" when holding short = exit short (buy to close)
        // - "short" when holding long = exit long (sell to close)
        // This must happen BEFORE entry logic, so we exit before considering new entries
        const currentExitRules = entryExit.exit || {};
        if (currentExitRules.mode === "signal" && marketPosition) {
          const positionSide = marketPosition.side; // "long" or "short"
          const aiIntent = intent.bias; // "long", "short", or "neutral"
          
          // Only exit if AI intent conflicts with current position
          const shouldExit = 
            (positionSide === "long" && aiIntent === "short") || // Holding long, AI wants short → exit long
            (positionSide === "short" && aiIntent === "long");   // Holding short, AI wants long → exit short
          
          if (shouldExit) {
            console.log(`[Tick] 🤖 AI-driven exit: AI intent "${aiIntent}" conflicts with ${positionSide} position for ${market}`);
            const exitSide = positionSide === "long" ? "sell" : "buy";
            const positionValue = Number(marketPosition.avg_entry) * Number(marketPosition.size);
            
            const exitResult = await placeMarketOrder({
              sessionMode,
              livePrivateKey: livePrivateKey || undefined,
              account_id: account.id,
              strategy_id: strategy.id,
              session_id: sessionId,
              market: market,
              side: exitSide,
              notionalUsd: positionValue, // Close entire position
              slippageBps: 5,
              feeBps: 5,
            });

            if (exitResult.success) {
              executed = true;
              actionSummary = `AI-driven exit: Closed ${positionSide} position (AI intent: ${aiIntent})`;
              riskResult = { passed: true, executed: true };
              console.log(`[Tick] ✅ AI-driven exit executed for ${market}`);
              
              // IMPORTANT: Preserve the original intent for the decision log
              // But prevent entry logic from running by setting passed to false
              riskResult.passed = false; // Prevent entry logic from running
            } else {
              actionSummary = `AI-driven exit failed: ${exitResult.error || "Unknown error"}`;
              riskResult = { passed: false, reason: actionSummary };
              console.error(`[Tick] ❌ AI-driven exit failed: ${exitResult.error}`);
            }
          } else if (aiIntent === "neutral") {
            // AI says "neutral" - do nothing, keep position
            console.log(`[Tick] 🤖 AI decision is "neutral" for ${market} with ${positionSide} position - keeping position`);
          }
        }

        // STRICTLY ENFORCE ALL STRATEGY FEATURES
        const now = new Date();

        // 1. CONFIDENCE CONTROL - Strictly enforce minimum confidence
        const confidenceControl = entryExit.confidenceControl || {};
        const minConfidence = confidenceControl.minConfidence ?? guardrails.minConfidence ?? 0.65;
        
        if (confidence < minConfidence) {
          actionSummary = `Confidence ${(confidence * 100).toFixed(0)}% below minimum ${(minConfidence * 100).toFixed(0)}%`;
          riskResult = { passed: false, reason: actionSummary };
        }
        // Confidence scaling (if enabled, adjust position size based on confidence)
        // This will be applied later when calculating position size

        // 2. GUARDRAILS - Strictly enforce long/short permissions
        if (riskResult.passed !== false) {
          if (intent.bias === "long" && !guardrails.allowLong) {
            actionSummary = "Long positions not allowed by strategy settings";
            riskResult = { passed: false, reason: actionSummary };
          } else if (intent.bias === "short" && !guardrails.allowShort) {
            actionSummary = "Short positions not allowed by strategy settings";
            riskResult = { passed: false, reason: actionSummary };
          } else if (intent.bias === "neutral") {
            actionSummary = "AI decision: neutral (no trade)";
            riskResult = { passed: false, reason: actionSummary };
          }
        }

        // 2b. ENTRY BEHAVIORS - Enforce allowed entry types (guardrails)
        if (riskResult.passed !== false) {
          const behaviors = entry.behaviors || { trend: true, breakout: true, meanReversion: true };
          
          // Safety check: If all behaviors are disabled, block all entries
          if (!behaviors.trend && !behaviors.breakout && !behaviors.meanReversion) {
            actionSummary = "No entry behaviors enabled - all entries blocked by strategy settings";
            riskResult = { passed: false, reason: actionSummary };
            console.log("[Tick] ⛔ All entry behaviors disabled - blocking entry");
          } else {
            // Classify the AI's intent as trend/breakout/meanReversion based on indicators and reasoning
            let entryType: "trend" | "breakout" | "meanReversion" | "unknown" = "unknown";
            
            // 1. Check indicators for classification
            if (indicatorsSnapshot) {
              // Trend: Strong EMA alignment
              if (indicatorsSnapshot.ema?.fast && indicatorsSnapshot.ema?.slow) {
                const emaFast = indicatorsSnapshot.ema.fast.value;
                const emaSlow = indicatorsSnapshot.ema.slow.value;
                const emaDiff = Math.abs((emaFast - emaSlow) / emaSlow) * 100;
                if (emaDiff > 1.0) { // EMA divergence > 1% = trend
                  entryType = "trend";
                }
              }
              
              // Breakout: High volatility
              if (indicatorsSnapshot.atr && entryType === "unknown") {
                const atrPct = (indicatorsSnapshot.atr.value / currentPrice) * 100;
                if (atrPct > 2.0) { // ATR > 2% = breakout conditions
                  entryType = "breakout";
                }
              }
              
              // Mean Reversion: RSI extremes
              if (indicatorsSnapshot.rsi && entryType === "unknown") {
                const rsi = indicatorsSnapshot.rsi.value;
                if (rsi < 30 || rsi > 70) { // RSI extreme = mean reversion
                  entryType = "meanReversion";
                }
              }
            }
            
            // 2. Use AI reasoning as fallback/confirmation
            const reasoning = (intent.reasoning || "").toLowerCase();
            if (entryType === "unknown") {
              if (reasoning.includes("trend") || reasoning.includes("momentum") || reasoning.includes("uptrend") || reasoning.includes("downtrend")) {
                entryType = "trend";
              } else if (reasoning.includes("breakout") || reasoning.includes("break out") || reasoning.includes("resistance") || reasoning.includes("support")) {
                entryType = "breakout";
              } else if (reasoning.includes("reversion") || reasoning.includes("oversold") || reasoning.includes("overbought") || reasoning.includes("mean")) {
                entryType = "meanReversion";
              }
            }
            
            // 3. Check if the classified entry type is allowed
            if (entryType === "trend" && !behaviors.trend) {
              actionSummary = "Entry type 'Trend' not allowed by strategy settings";
              riskResult = { passed: false, reason: actionSummary };
              console.log("[Tick] ⛔ Trend entry blocked - trend behavior disabled");
            } else if (entryType === "breakout" && !behaviors.breakout) {
              actionSummary = "Entry type 'Breakout' not allowed by strategy settings";
              riskResult = { passed: false, reason: actionSummary };
              console.log("[Tick] ⛔ Breakout entry blocked - breakout behavior disabled");
            } else if (entryType === "meanReversion" && !behaviors.meanReversion) {
              actionSummary = "Entry type 'Mean Reversion' not allowed by strategy settings";
              riskResult = { passed: false, reason: actionSummary };
              console.log("[Tick] ⛔ Mean reversion entry blocked - meanReversion behavior disabled");
            } else {
              console.log(`[Tick] ✅ Entry type '${entryType}' is allowed (Behaviors: Trend=${behaviors.trend}, Breakout=${behaviors.breakout}, MeanRev=${behaviors.meanReversion})`);
            }
          }
        }

        // 3. TRADE CONTROL - Strictly enforce trade frequency and timing limits
        if (riskResult.passed !== false) {
          const tradeControl = entryExit.tradeControl || {};
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

          const { count: tradesLastHour } = await serviceClient
            .from(tables.trades)
            .select("*", { count: "exact", head: true })
            .eq("account_id", account.id)
            .gte("created_at", oneHourAgo.toISOString());

          const { count: tradesLastDay } = await serviceClient
            .from(tables.trades)
            .select("*", { count: "exact", head: true })
            .eq("account_id", account.id)
            .gte("created_at", oneDayAgo.toISOString());

          const tradesLastHourCount = tradesLastHour || 0;
          const tradesLastDayCount = tradesLastDay || 0;
          const maxTradesPerHour = tradeControl.maxTradesPerHour ?? 2;
          const maxTradesPerDay = tradeControl.maxTradesPerDay ?? 10;

          if (tradesLastHourCount >= maxTradesPerHour) {
            actionSummary = `Trade frequency limit: ${tradesLastHourCount}/${maxTradesPerHour} trades in last hour`;
            riskResult = { passed: false, reason: actionSummary };
          } else if (tradesLastDayCount >= maxTradesPerDay) {
            actionSummary = `Trade frequency limit: ${tradesLastDayCount}/${maxTradesPerDay} trades in last day`;
            riskResult = { passed: false, reason: actionSummary };
          }

          // Check cooldown and min hold time
          if (riskResult.passed !== false) {
            const { data: lastTrade } = await serviceClient
              .from(tables.trades)
              .select("created_at, side, action")
              .eq("account_id", account.id)
              .eq("market", market)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (lastTrade) {
              const timeSinceLastTrade = now.getTime() - new Date(lastTrade.created_at).getTime();
              const cooldownMs = (tradeControl.cooldownMinutes ?? 15) * 60 * 1000;

              if (timeSinceLastTrade < cooldownMs) {
                actionSummary = `Cooldown: ${Math.ceil((cooldownMs - timeSinceLastTrade) / 1000 / 60)} minutes remaining`;
                riskResult = { passed: false, reason: actionSummary };
              }
            }
            
            // Min hold time: Check time since position was opened (not last trade)
            if (riskResult.passed !== false && marketPosition) {
              const { data: positionOpenTrade } = await serviceClient
                .from(tables.trades)
                .select("created_at")
                .eq("account_id", account.id)
                .eq("market", market)
                .eq("action", "open")
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              
              if (positionOpenTrade) {
                const timeSincePositionOpened = now.getTime() - new Date(positionOpenTrade.created_at).getTime();
                const minHoldMs = (tradeControl.minHoldMinutes ?? 5) * 60 * 1000;
                
                if (timeSincePositionOpened < minHoldMs) {
                  actionSummary = `Min hold time: ${Math.ceil((minHoldMs - timeSincePositionOpened) / 1000 / 60)} minutes remaining (position opened ${Math.ceil(timeSincePositionOpened / 1000 / 60)} min ago)`;
                  riskResult = { passed: false, reason: actionSummary };
                }
              }
            }

            // Check allowReentrySameDirection
            if (riskResult.passed !== false && marketPosition && lastTrade && !tradeControl.allowReentrySameDirection) {
              const lastTradeSide = lastTrade.side === "buy" ? "long" : "short";
              const desiredSide = intent.bias === "long" ? "long" : "short";
              if (lastTradeSide === desiredSide && lastTrade.action !== "close" && lastTrade.action !== "reduce") {
                actionSummary = "Re-entry in same direction not allowed by strategy settings";
                riskResult = { passed: false, reason: actionSummary };
              }
            }
          }
        }

          // 4. RISK LIMITS - Strictly enforce max position size, leverage, and daily loss
          if (riskResult.passed !== false) {
            const maxPositionUsd = risk.maxPositionUsd ?? 10000;
            const maxLeverage = risk.maxLeverage ?? 2;
            const maxDailyLossPct = risk.maxDailyLossPct ?? 5;

          // Check max daily loss
          const dailyLossPct = ((Number(account.starting_equity) - Number(account.equity)) / Number(account.starting_equity)) * 100;
          if (dailyLossPct >= maxDailyLossPct) {
            actionSummary = `Max daily loss limit reached: ${dailyLossPct.toFixed(2)}% >= ${maxDailyLossPct}%`;
            riskResult = { passed: false, reason: actionSummary };
          }

          // Check total position exposure (leverage check)
          if (riskResult.passed !== false) {
            const totalPositionValue = allPositions.reduce((sum, p) => {
              return sum + (Number(p.avg_entry) * Number(p.size));
            }, 0);
            const currentLeverage = totalPositionValue / Number(account.equity);
            if (currentLeverage >= maxLeverage) {
              actionSummary = `Max leverage limit reached: ${currentLeverage.toFixed(2)}x >= ${maxLeverage}x`;
              riskResult = { passed: false, reason: actionSummary };
            }
          }

          // Calculate position sizing with confidence scaling if enabled
          let positionNotional = Math.min(maxPositionUsd, account.equity * 0.1);
          if (confidenceControl.confidenceScaling && confidence > minConfidence) {
            // Scale position size based on confidence (higher confidence = larger position, up to max)
            const confidenceMultiplier = Math.min(1.0, (confidence - minConfidence) / (1.0 - minConfidence));
            positionNotional = positionNotional * (0.5 + 0.5 * confidenceMultiplier); // Scale from 50% to 100% of max
          }
          positionNotional = Math.min(positionNotional, maxPositionUsd); // Ensure we don't exceed max

          // 5. ENTRY CONFIRMATION - Check entry confirmation requirements
          if (riskResult.passed !== false) {
            const entry = entryExit.entry || {};
            const confirmation = entry.confirmation || {};
            
            // Check minimum signals required (for now, we count this as 1 signal from AI)
            // In a more sophisticated implementation, we'd check multiple indicators/confirmations
            const minSignals = confirmation.minSignals ?? 1;
            if (minSignals > 1) {
              // For MVP, we only have 1 signal (the AI decision), so require higher confidence
              // In production, this would check multiple technical indicators
              const requiredConfidenceForMultipleSignals = minConfidence + (minSignals - 1) * 0.1;
              if (confidence < requiredConfidenceForMultipleSignals) {
                actionSummary = `Entry confirmation: Need ${minSignals} signals, but only have 1 (confidence too low)`;
                riskResult = { passed: false, reason: actionSummary };
              }
            }
            
            // Check volatility condition
            if (riskResult.passed !== false && confirmation.requireVolatilityCondition && confirmation.volatilityMax) {
              // Use ATR or volatility indicator for real volatility measurement
              let currentVolatility = 0;
              
              if (indicatorsSnapshot?.atr) {
                // ATR as percentage of price (most accurate)
                currentVolatility = (indicatorsSnapshot.atr.value / currentPrice) * 100;
              } else if (indicatorsSnapshot?.volatility) {
                // Use calculated volatility indicator
                currentVolatility = indicatorsSnapshot.volatility.value;
              } else {
                // Fallback: Use price change (original MVP implementation)
                currentVolatility = Math.abs((currentPrice - (marketPosition?.avg_entry || currentPrice)) / currentPrice) * 100;
              }
              
              if (currentVolatility > confirmation.volatilityMax) {
                const volatilitySource = indicatorsSnapshot?.atr ? "ATR" : indicatorsSnapshot?.volatility ? "StdDev" : "Price Change";
                actionSummary = `Entry confirmation: Volatility ${currentVolatility.toFixed(2)}% (${volatilitySource}) exceeds max ${confirmation.volatilityMax}%`;
                riskResult = { passed: false, reason: actionSummary };
              }
            }
          }

          // 6. ENTRY TIMING - Check waitForClose and maxSlippage
          if (riskResult.passed !== false) {
            const entryTiming = entryExit.entry?.timing || {};
            
            // Check waitForClose - Verify we're at a candle boundary
            if (entryTiming.waitForClose) {
              const candleTimeframe = aiInputs.candles?.timeframe || "5m";
              
              // Parse timeframe to milliseconds
              const parseTimeframe = (tf: string): number => {
                const match = tf.match(/^(\d+)([mhd])$/);
                if (!match) return 300000; // Default 5m
                const value = parseInt(match[1]);
                const unit = match[2];
                if (unit === "m") return value * 60 * 1000;
                if (unit === "h") return value * 60 * 60 * 1000;
                if (unit === "d") return value * 24 * 60 * 60 * 1000;
                return 300000; // Default 5m
              };
              
              const timeframeMs = parseTimeframe(candleTimeframe);
              const currentTimeMs = new Date().getTime();
              const timeSinceCandleClose = currentTimeMs % timeframeMs;
              const toleranceMs = 5000; // 5 second tolerance
              
              // Allow entry if we're within 5s of candle open/close
              if (timeSinceCandleClose > toleranceMs && timeSinceCandleClose < (timeframeMs - toleranceMs)) {
                const timeUntilClose = (timeframeMs - timeSinceCandleClose) / 1000;
                actionSummary = `Entry timing: Waiting for candle close (${Math.ceil(timeUntilClose)}s remaining)`;
                riskResult = { passed: false, reason: actionSummary };
              } else {
                console.log(`[Tick] Entry timing: At candle boundary (within ${toleranceMs}ms tolerance)`);
              }
            }
            
            // Check maxSlippage - Calculate expected slippage and reject if too high
            // For MVP, we use a simple estimate. In production, this would use orderbook depth
            const estimatedSlippagePct = 0.05; // Assume 0.05% slippage for market orders
            const maxSlippagePct = entryTiming.maxSlippagePct ?? 0.15;
            
            if (estimatedSlippagePct > maxSlippagePct) {
              actionSummary = `Max slippage exceeded: estimated ${(estimatedSlippagePct * 100).toFixed(2)}% > max ${(maxSlippagePct * 100).toFixed(2)}%`;
              riskResult = { passed: false, reason: actionSummary };
            }
          }

          // 7. EXECUTE TRADE if all checks passed
          if (riskResult.passed !== false) {
            const side: "buy" | "sell" = intent.bias === "long" ? "buy" : "sell";

            // Apply entry timing settings (maxSlippage as hard limit)
            const entryTiming = entryExit.entry?.timing || {};
            const slippageBps = entryTiming.maxSlippagePct ? Math.min(entryTiming.maxSlippagePct * 100, 50) : 5; // Cap at 50bps (0.5%)

            // Execute order (real for live, virtual for virtual)
            const orderResult = await placeMarketOrder({
              sessionMode,
              livePrivateKey: livePrivateKey || undefined,
              account_id: account.id,
              strategy_id: strategy.id,
              session_id: sessionId,
              market,
              side,
              notionalUsd: positionNotional,
              slippageBps: slippageBps,
              feeBps: 5, // 0.05% fee
            });

            if (orderResult.success) {
              executed = true;
              actionSummary = `Executed ${intent.bias} order: $${positionNotional.toFixed(2)} @ $${currentPrice.toFixed(2)}`;
              riskResult = { passed: true, executed: true };
            } else {
              actionSummary = `Order failed: ${orderResult.error || "Unknown error"}`;
              riskResult = { passed: false, reason: actionSummary };
            }
          }
        }
      } catch (err: any) {
        error = err.message || "AI call failed";
        console.error(`[Tick] ❌ ERROR in market ${market} processing:`, {
          error: err.message,
          stack: err.stack,
          name: err.name,
        });
        riskResult = { passed: false, reason: error };
      }

      // Build proposed order
      const proposedOrder: any = {
        market,
        bias: intent?.bias || "neutral",
        side: intent?.bias === "long" ? "buy" : intent?.bias === "short" ? "sell" : null,
        notionalUsd: 0,
      };

      if (intent?.bias && intent.bias !== "neutral" && !riskResult.passed) {
        const risk = filters.risk || {};
        const maxPositionUsd = risk.maxPositionUsd || 10000;
        proposedOrder.notionalUsd = Math.min(maxPositionUsd, account.equity * 0.1);
      }

      // Save decision
      const { data: decision } = await serviceClient
        .from("session_decisions")
        .insert({
          session_id: sessionId,
          market_snapshot: marketSnapshot,
          indicators_snapshot: indicatorsSnapshot,
          intent: intent || {},
          confidence,
          action_summary: actionSummary,
          risk_result: riskResult,
          proposed_order: proposedOrder,
          executed,
          error,
        })
        .select()
        .single();

      decisions.push(decision);
      const marketEndTime = Date.now();
      console.log(`[Tick] Completed market ${i + 1}/${marketsToProcess.length}: ${market} (took ${marketEndTime - marketStartTime}ms)`);
    }
    
    const tickEndTime = Date.now();
    console.log(`[Tick] ✅ Completed all ${marketsToProcess.length} markets in ${tickEndTime - tickStartTime}ms`);

    // CRITICAL FIX: Calculate equity from fresh data instead of trusting stale database value
    // The database equity might be stale if markToMarket hasn't run yet or failed
    // So we recalculate equity here using the same formula: cash + sum(unrealizedPnl)
    // IMPORTANT: Reuse pricesByMarket from earlier in the tick (line 398) to avoid fetching prices twice
    // Fetching prices twice can cause equity oscillations if prices change between the two fetches
    const allPositionsNow = await getPositions(account.id);
    
    let totalUnrealizedPnlNow = 0;
    for (const pos of allPositionsNow) {
      const price = pricesByMarket[pos.market];
      if (price) {
        const pnl = pos.side === "long" 
          ? (price - pos.avg_entry) * pos.size
          : (pos.avg_entry - price) * pos.size;
        totalUnrealizedPnlNow += pnl;
      } else {
        // No price available, use stored unrealized_pnl
        totalUnrealizedPnlNow += Number(pos.unrealized_pnl || 0);
      }
    }
    
    // Get fresh cash_balance
    const { data: freshAccount } = await serviceClient
      .from(tables.accounts)
      .select("cash_balance, starting_equity, equity")
      .eq("id", account.id)
      .single();
    
    const freshCash = freshAccount?.cash_balance || 0;
    const calculatedEquity = freshCash + totalUnrealizedPnlNow;
    
    console.log(`[Tick] 💰 Equity snapshot: cash=${freshCash.toFixed(2)} + unrealizedPnl=${totalUnrealizedPnlNow.toFixed(2)} = ${calculatedEquity.toFixed(2)} (DB equity: ${freshAccount?.equity.toFixed(2)})`);

    // Store the CALCULATED equity (not the stale DB value)
    // INVARIANT: Equity snapshots MUST be written for ALL modes (virtual, arena, live)
    if (freshAccount) {
      const snapshotResult = await serviceClient.from("equity_points").insert({
        account_id: account.id,
        session_id: sessionId,
        t: new Date().toISOString(),
        equity: calculatedEquity, // Use calculated, not DB value
      });
      
      if (snapshotResult.error) {
        console.error(`[Tick] ❌ FAILED to write equity snapshot for mode=${sessionMode}:`, snapshotResult.error);
      } else {
        console.log(`[Tick] ✅ ENGINE SNAPSHOT WRITTEN | session=${sessionId} | account_id=${account.id} | mode=${sessionMode} | equity=$${calculatedEquity.toFixed(2)}`);
      }

      // RECONCILIATION CHECK: Verify accounting identity holds
      // totalPnL should equal realizedPnl + unrealizedPnl - feesPaid
      // Arena is virtual-only, so both "virtual" and "arena" use virtual broker
      if (sessionMode === "virtual" || sessionMode === "arena") {
        try {
          // Get all positions and trades for this account
          const allPositions = await getPositions(account.id);
          const { data: allTrades } = await serviceClient
            .from(tables.trades)
            .select("action, realized_pnl, fee")
            .eq("account_id", account.id);

          // Reuse prices from earlier in tick (no need to fetch again)
          // This ensures reconciliation check uses the same prices as equity snapshot

          // Calculate totals using accounting helper
          const totals = calcTotals(
            {
              starting_equity: Number(freshAccount.starting_equity),
              cash_balance: Number(freshAccount.cash_balance),
              equity: calculatedEquity,
            },
            allPositions.map((p) => ({
              id: p.id,
              market: p.market,
              side: p.side,
              size: Number(p.size),
              avg_entry: Number(p.avg_entry),
            })),
            (allTrades || []).map((t: any) => ({
              id: "",
              action: t.action,
              realized_pnl: Number(t.realized_pnl || 0),
              fee: Number(t.fee || 0),
            })),
            pricesByMarket
          );

          // Verify reconciliation
          const isReconciled = verifyReconciliation(totals, 0.01);
          const delta = totals.totalPnl - (totals.realizedPnl + totals.unrealizedPnl - totals.feesPaid);

          if (!isReconciled) {
            console.error(`[Tick] ⚠️ ACCOUNTING MISMATCH DETECTED for session ${sessionId}:`);
            console.error(`[Tick]   Total PnL: ${totals.totalPnl.toFixed(2)}`);
            console.error(`[Tick]   Realized: ${totals.realizedPnl.toFixed(2)}, Unrealized: ${totals.unrealizedPnl.toFixed(2)}, Fees: ${totals.feesPaid.toFixed(2)}`);
            console.error(`[Tick]   Expected: ${(totals.realizedPnl + totals.unrealizedPnl - totals.feesPaid).toFixed(2)}`);
            console.error(`[Tick]   Delta: ${delta.toFixed(2)}`);
            console.error(`[Tick]   Equity: ${totals.equity.toFixed(2)}, Cash: ${freshAccount.cash_balance}, Starting: ${freshAccount.starting_equity}`);
          } else {
            console.log(`[Tick] ✓ Accounting reconciliation verified (delta: ${delta.toFixed(4)})`);
          }
        } catch (reconError: any) {
          // Non-critical, log but don't fail the tick
          console.error("[Tick] Failed to perform reconciliation check:", reconError);
        }
      }
    }

    // Note: last_tick_at was already set at START of tick to prevent drift
    // No need to update again at end since we want the START time for cadence calculation

    // Update arena snapshot if session is in arena
    try {
      const { updateArenaSnapshot } = await import("@/lib/arena/updateArenaSnapshot");
      await updateArenaSnapshot(sessionId);
    } catch (error) {
      // Non-critical, log but don't fail
      console.error("[Tick] Failed to update arena snapshot:", error);
    }

    return NextResponse.json({
      success: true,
      decisions: decisions.map((d) => ({
        confidence: d.confidence,
        action_summary: d.action_summary,
        executed: d.executed,
        error: d.error,
      })),
    });
  } catch (error: any) {
    console.error(`[Tick API] ❌ FATAL ERROR in session ${sessionId}:`, error);
    console.error(`[Tick API] Error stack for ${sessionId}:`, error.stack);
    console.error(`[Tick API] Error details for ${sessionId}:`, {
      message: error.message,
      name: error.name,
      cause: error.cause,
    });
    return NextResponse.json({ 
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    }, { status: 500 });
  }
}
