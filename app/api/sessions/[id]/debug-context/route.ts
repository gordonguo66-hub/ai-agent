import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { getPositions } from "@/lib/brokers/virtualBroker";
import { getMidPrices } from "@/lib/hyperliquid/prices";
import { getCandles } from "@/lib/hyperliquid/candles";
import { calculateIndicators } from "@/lib/indicators/calculations";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { decryptCredential } from "@/lib/crypto/credentials";

/**
 * Debug endpoint to show what context is actually being sent to the AI
 * This helps verify that strategy settings (AI inputs) are being compiled correctly
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    
    // Authenticate user (same as other API routes)
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    // Load session with strategy and account
    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .select(`
        *,
        strategies(*),
        virtual_accounts(*)
      `)
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
    const accountData = session.virtual_accounts;
    const account = Array.isArray(accountData) ? accountData[0] : accountData;

    if (!strategy || !account) {
      return NextResponse.json({ error: "Strategy or account not found" }, { status: 404 });
    }

    if (!account.id) {
      return NextResponse.json({ error: "Account ID not found" }, { status: 404 });
    }

    // Get markets
    const filters = strategy.filters || {};
    const markets = filters.markets || [];

    if (markets.length === 0) {
      return NextResponse.json({ 
        error: "No markets configured",
        sessionMarkets: [],
        context: null,
        aiInputs: filters.aiInputs || {},
      });
    }

    // Get market from query parameter or default to first market
    const { searchParams } = new URL(request.url);
    const requestedMarket = searchParams.get("market");
    const market = requestedMarket && markets.includes(requestedMarket) 
      ? requestedMarket 
      : markets[0];
    
    console.log(`[Debug Context] Session markets: [${markets.join(", ")}]`);
    console.log(`[Debug Context] Requested market: ${requestedMarket || "(none - using default)"}`);
    console.log(`[Debug Context] Showing context for: ${market}`);

    // Fetch current price
    const pricesByMarket = await getMidPrices([market]);
    const currentPrice = pricesByMarket[market] || 0;

    // Get positions
    const allPositions = await getPositions(account.id);

    // Build the same context that would be sent to AI
    const aiInputs = filters.aiInputs || {};
    
    const marketSnapshot: any = {
      market,
      price: currentPrice,
      timestamp: new Date().toISOString(),
    };

    // Fetch candles if enabled
    let candles: any[] = [];
    let fetchedCandlesRaw: any[] = [];
    if (aiInputs.candles?.enabled) {
      try {
        const candleCount = aiInputs.candles.count || 200;
        const candleInterval = aiInputs.candles.timeframe || "5m";
        const fetchedCandles = await getCandles(market, candleInterval, candleCount);
        if (Array.isArray(fetchedCandles)) {
          fetchedCandlesRaw = fetchedCandles;
          candles = fetchedCandles.map((c) => ({
            time: c.t,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
            volume: c.v,
          }));
          marketSnapshot.candles = candles;
          marketSnapshot.candlesCount = candles.length;
        }
      } catch (error: any) {
        console.error(`[Debug] Failed to fetch candles:`, error);
        // Continue without candles - don't fail the debug view
      }
    }

    // Fetch orderbook if enabled
    let orderbookSnapshot: any = null;
    if (aiInputs.orderbook?.enabled) {
      try {
        const orderbookTop = await hyperliquidClient.getOrderbookTop(market);
        orderbookSnapshot = {
          bid: orderbookTop.bid,
          ask: orderbookTop.ask,
          mid: orderbookTop.mid,
          spread: orderbookTop.ask - orderbookTop.bid,
        };
        marketSnapshot.orderbook = orderbookSnapshot;
      } catch (error: any) {
        console.error(`[Debug] Failed to fetch orderbook:`, error);
      }
    }

    // Calculate technical indicators from candles if enabled and we have candles
    let indicatorsSnapshot: any = {};
    if (fetchedCandlesRaw && fetchedCandlesRaw.length > 0 && aiInputs.indicators) {
      try {
        // Use the raw fetched candles directly (they're already in the right format)
        indicatorsSnapshot = calculateIndicators(fetchedCandlesRaw, {
          rsi: aiInputs.indicators.rsi,
          atr: aiInputs.indicators.atr,
          volatility: aiInputs.indicators.volatility,
          ema: aiInputs.indicators.ema,
        });
      } catch (error: any) {
        console.error(`[Debug] Failed to calculate indicators:`, error);
        // Continue without indicators - don't fail the debug view
      }
    }

    // Account info
    const accountInfo = {
      starting_equity: Number(account.starting_equity),
      current_equity: Number(account.equity),
      cash_balance: Number(account.cash_balance),
      available_cash: Number(account.cash_balance),
      total_return_pct: ((Number(account.equity) - Number(account.starting_equity)) / Number(account.starting_equity)) * 100,
    };

    // Positions snapshot
    const positionsSnapshot = allPositions.map((p) => ({
      market: p.market,
      side: p.side,
      size: Number(p.size),
      avg_entry: Number(p.avg_entry),
      unrealized_pnl: Number(p.unrealized_pnl || 0),
      position_value: Number(p.avg_entry) * Number(p.size) + Number(p.unrealized_pnl || 0),
    }));

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
        console.error(`[Debug] Failed to fetch recent decisions:`, error);
      }
    }

    const entryExit = filters.entryExit || {};
    const entry = entryExit.entry || {};

    // Build the actual context that would be sent to AI
    const context = {
      market,
      marketData: marketSnapshot,
      account: accountInfo,
      positions: positionsSnapshot,
        currentMarketPosition: aiInputs.includePositionState !== false && allPositions.find((p) => p.market === market) ? {
          market: allPositions.find((p) => p.market === market)!.market,
          side: allPositions.find((p) => p.market === market)!.side,
          size: Number(allPositions.find((p) => p.market === market)!.size),
          avg_entry: Number(allPositions.find((p) => p.market === market)!.avg_entry),
          unrealized_pnl: Number(allPositions.find((p) => p.market === market)!.unrealized_pnl || 0),
        } : null,
        indicators: indicatorsSnapshot,
        recentDecisions: aiInputs.includeRecentDecisions ? recentDecisions : [],
      strategy: {
        entryMode: entry.mode || "signal",
        entryInstructions: entry.mode === "trend" 
          ? "Focus on trend-following signals. Enter when price is moving in a clear trend direction."
          : entry.mode === "meanReversion"
          ? "Focus on mean reversion opportunities. Enter when price deviates significantly from its average."
          : entry.mode === "breakout"
          ? "Focus on breakout patterns. Enter when price breaks through key support/resistance levels."
          : "Use AI-driven signal analysis to identify entry opportunities.",
      },
      // AI Inputs configuration (what user set)
      aiInputsConfig: {
        candles: aiInputs.candles || { enabled: false },
        orderbook: aiInputs.orderbook || { enabled: false },
        indicators: aiInputs.indicators || {},
        includePositionState: aiInputs.includePositionState !== false,
        includeRecentDecisions: aiInputs.includeRecentDecisions || false,
        recentDecisionsCount: aiInputs.recentDecisionsCount || 5,
      },
    };

    // Build the prompt that would be sent
    const systemPrompt = [
      "You are a trading decision engine.",
      "Return ONLY valid JSON (no markdown) that matches this TypeScript interface:",
      "{ market: string, bias: 'long'|'short'|'neutral', confidence: number (0..1), entry_zone:{lower:number, upper:number}, stop_loss:number, take_profit:number, risk:number (0..1), reasoning:string }",
      "Bias neutral means no trade.",
    ].join("\n");

    const userPrompt = [
      `Strategy prompt:\n${strategy.prompt}`,
      `Market: ${context.market}`,
      `Market data snapshot (JSON):\n${JSON.stringify(context.marketData, null, 2)}`,
      `Positions snapshot (JSON):\n${JSON.stringify(context.positions, null, 2)}`,
      `Indicators (JSON):\n${JSON.stringify(context.indicators, null, 2)}`,
      `Account info (JSON):\n${JSON.stringify(context.account, null, 2)}`,
      `Strategy config (JSON):\n${JSON.stringify(context.strategy, null, 2)}`,
      "Respond with JSON only.",
    ].join("\n\n");

    return NextResponse.json({
      sessionId,
      strategyName: strategy.name,
      sessionMarkets: markets, // All markets configured for this session
      selectedMarket: market, // The market being shown (from ?market= or default)
      market, // Keep for backward compatibility
      aiInputsConfigured: aiInputs,
      contextSentToAI: context,
      fullPrompt: {
        system: systemPrompt,
        user: userPrompt,
      },
      note: requestedMarket && !markets.includes(requestedMarket)
        ? `⚠️ Requested market '${requestedMarket}' not found in session. Showing '${market}' instead. Available markets: ${markets.join(", ")}`
        : "This shows what would be sent to the AI for a single market. The AI processes one market per tick in round-robin fashion.",
    });
  } catch (error: any) {
    console.error("Debug context error:", error);
    console.error("Error stack:", error.stack);
    // Return detailed error for debugging
    return NextResponse.json(
      { 
        error: error.message || "Internal server error",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
