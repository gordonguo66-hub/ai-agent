import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createFreshServiceClient } from "@/lib/supabase/freshClient";

// Disable Next.js caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { decryptCredential } from "@/lib/crypto/credentials";
import { resolveStrategyApiKey } from "@/lib/ai/resolveApiKey";
import { openAICompatibleIntentCall, normalizeBaseUrl } from "@/lib/ai/openaiCompatible";
import { getMidPrices as getHyperliquidPrices } from "@/lib/hyperliquid/prices";
import { getMidPrices as getCoinbasePrices, getOrderbook as getCoinbaseOrderbook } from "@/lib/coinbase/prices";
import { getCandles as getHyperliquidCandles } from "@/lib/hyperliquid/candles";
import { getCandles as getCoinbaseCandles } from "@/lib/coinbase/candles";
import { placeMarketOrder as placeVirtualOrder, markToMarket, getPositions } from "@/lib/brokers/virtualBroker";
import { calcTotals, verifyReconciliation } from "@/lib/accounting/pnl";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { CoinbaseClient } from "@/lib/coinbase/client";
import { calculateIndicators } from "@/lib/indicators/calculations";
import {
  getOrCreateLiveAccount,
  syncPositionsFromHyperliquid,
  syncPositionsFromCoinbase,
  updateAccountEquity,
  updateCoinbaseAccountEquity,
  recordLiveTrade,
  updatePositionFromTrade,
  reconstructIntxPositionsFromTrades,
  getLivePositions,
} from "@/lib/brokers/liveBroker";
import { placeMarketOrder as placeHyperliquidOrder } from "@/lib/hyperliquid/orderExecution";
import { placeMarketOrder as placeCoinbaseOrder } from "@/lib/coinbase/orderExecution";
import { Venue } from "@/lib/engine/types";
import { fetchCryptoNews } from "@/lib/ai/newsService";
import { agenticIntentCall } from "@/lib/ai/agenticLoop";
import type { ToolContext } from "@/lib/ai/agenticTools";

// Providers that support tool/function calling (for agentic mode)
const TOOL_CALLING_PROVIDERS = new Set([
  "openai", "anthropic", "google", "xai", "deepseek",
  "openrouter", "together", "groq", "qwen", "glm",
]);

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
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
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
 * Unified order execution that routes to either real or virtual broker based on session mode and venue
 */
async function placeMarketOrder(params: {
  sessionMode: "virtual" | "live" | "arena";
  venue?: Venue;
  livePrivateKey?: string;
  liveApiKey?: string;
  liveApiSecret?: string;
  account_id: string;
  strategy_id: string;
  session_id: string;
  market: string;
  side: "buy" | "sell";
  notionalUsd: number;
  slippageBps: number;
  feeBps: number;
  isExit?: boolean; // Whether this is an exit/close order (for reduce_only and action tracking)
  exitPosition?: { side: "long" | "short"; avgEntry: number }; // Position data for calculating realized PnL on exits
  exitPositionSize?: number; // Exact position size for complete closes (prevents dust)
  leverage?: number; // Leverage to use for Hyperliquid entry orders (default 1x)
}): Promise<{
  success: boolean;
  error?: string;
  trade?: any;
}> {
  const { sessionMode, venue = "hyperliquid", livePrivateKey, liveApiKey, liveApiSecret, isExit, exitPosition, exitPositionSize, leverage = 1, ...orderParams } = params;

  console.log(`[Order Execution] Session mode: ${sessionMode}, Venue: ${venue}`);

  if (sessionMode === "live") {
    // LIVE MODE: Place real order on exchange based on venue
    if (venue === "coinbase") {
      // COINBASE LIVE ORDER
      if (!liveApiKey || !liveApiSecret) {
        return { success: false, error: "Coinbase API credentials required for live trading" };
      }

      console.log(`[Order Execution] 🔴 LIVE MODE: Placing REAL order on Coinbase`);

      // For exits (closing positions), use sellAll (spot) or exactSize (INTX) to ensure complete close
      const isIntxMarket = orderParams.market.includes("-PERP") || orderParams.market.endsWith("-INTX");
      const isSellAll = isExit && orderParams.side === "sell" && !isIntxMarket; // sellAll is for spot only
      const exactSizeForIntx = isExit && isIntxMarket ? exitPositionSize : undefined;

      if (isSellAll) {
        console.log(`[Order Execution] 🔄 Exit order (spot): Using sellAll to close entire position`);
      }
      if (exactSizeForIntx) {
        console.log(`[Order Execution] 🔄 Exit order (INTX): Using exact size ${exactSizeForIntx} to close position`);
      }

      try {
        const result = await placeCoinbaseOrder(
          liveApiKey,
          liveApiSecret,
          orderParams.market, // Already in BTC-USD format or ETH-PERP-INTX for INTX
          orderParams.side,
          orderParams.notionalUsd,
          isSellAll, // sellAll flag for spot complete closes
          exactSizeForIntx // exact size for INTX complete closes
        );

        if (result.success) {
          console.log(`[Order Execution] ✅ Coinbase order placed successfully: ${result.orderId}`);

          // Record the trade in our database
          try {
            const tradeSize = result.fillSize || 0;
            const tradePrice = result.fillPrice || 0;
            const tradeFee = (result.fillValue || orderParams.notionalUsd) * (orderParams.feeBps / 10000);

            // Calculate realized PnL for exit trades
            let realizedPnl = 0;
            if (isExit && exitPosition && tradeSize > 0 && tradePrice > 0) {
              if (exitPosition.side === "long") {
                // Long position: profit = (exit price - entry price) * size
                realizedPnl = (tradePrice - exitPosition.avgEntry) * tradeSize;
              } else {
                // Short position: profit = (entry price - exit price) * size
                realizedPnl = (exitPosition.avgEntry - tradePrice) * tradeSize;
              }
              console.log(`[Order Execution] 💰 Calculated realized PnL: ${exitPosition.side} entry=$${exitPosition.avgEntry.toFixed(2)}, exit=$${tradePrice.toFixed(2)}, size=${tradeSize.toFixed(8)} → PnL=$${realizedPnl.toFixed(4)}`);
            }

            // Determine leverage - INTX perpetuals can use leverage, spot is always 1x
            const isIntxMarket = orderParams.market.includes("-PERP") || orderParams.market.endsWith("-INTX");
            const tradeLeverage = isIntxMarket ? (leverage || 1) : 1;

            await recordLiveTrade(
              orderParams.account_id,
              orderParams.session_id || "",
              {
                market: orderParams.market,
                action: isExit ? "close" : "open",
                side: orderParams.side,
                size: tradeSize,
                price: tradePrice,
                fee: tradeFee,
                realized_pnl: realizedPnl,
                venue_order_id: result.orderId,
                leverage: tradeLeverage,
              }
            );
            console.log(`[Order Execution] ✅ Coinbase trade recorded: ${tradeSize.toFixed(8)} @ $${tradePrice.toFixed(2)}, PnL: $${realizedPnl.toFixed(4)} (${tradeLeverage}x leverage)`);

            // For INTX perpetuals, update position locally since we can't sync from Coinbase API
            // Spot positions are synced via syncPositionsFromCoinbase which reads spot balances
            if (isIntxMarket) {
              await updatePositionFromTrade(
                orderParams.account_id,
                {
                  market: orderParams.market,
                  action: isExit ? "close" : "open",
                  side: orderParams.side,
                  size: tradeSize,
                  price: tradePrice,
                  leverage: tradeLeverage,
                }
              );
            }
          } catch (dbError: any) {
            console.error(`[CRITICAL] Live Coinbase trade executed but DB recording failed. Manual intervention required.`);
            console.error(`[CRITICAL] Trade details:`, JSON.stringify({
              account_id: orderParams.account_id,
              session_id: orderParams.session_id,
              market: orderParams.market,
              side: orderParams.side,
              orderId: result.orderId,
              fillPrice: result.fillPrice,
              fillSize: result.fillSize,
              error: dbError.message,
            }));

            // Pause the session to prevent further trading with corrupted state
            try {
              const pauseClient = createServiceRoleClient();
              await pauseClient
                .from("strategy_sessions")
                .update({
                  status: "paused",
                  error_message: `CRITICAL: Coinbase trade executed (Order: ${result.orderId}) but failed to record in database. Manual review required.`,
                })
                .eq("id", orderParams.session_id);
            } catch (pauseErr) {
              console.error(`[CRITICAL] Also failed to pause session after trade recording failure`);
            }
          }

          return {
            success: true,
            trade: {
              order_id: result.orderId,
              fill_price: result.fillPrice,
              fill_size: result.fillSize,
            },
          };
        } else {
          console.error(`[Order Execution] ❌ Coinbase order failed: ${result.error}`);
          return {
            success: false,
            error: result.error || "Order failed",
          };
        }
      } catch (error: any) {
        console.error(`[Order Execution] ❌ Exception placing Coinbase order:`, error);
        return {
          success: false,
          error: error.message || "Failed to place order",
        };
      }
    } else {
      // HYPERLIQUID LIVE ORDER
      if (!livePrivateKey) {
        return { success: false, error: "Private key required for Hyperliquid live trading" };
      }

      console.log(`[Order Execution] 🔴 LIVE MODE: Placing REAL order on Hyperliquid`);

      try {
        // Remove -PERP suffix if present (SDK uses coin name without suffix)
        const coin = orderParams.market.replace(/-PERP$/i, "");

        const result = await placeHyperliquidOrder(
          livePrivateKey,
          coin,
          orderParams.side,
          orderParams.notionalUsd,
          orderParams.slippageBps / 10000,
          !!isExit,
          leverage // Pass leverage to set on Hyperliquid before placing order
        );

        if (result.success) {
          console.log(`[Order Execution] ✅ Hyperliquid order placed successfully: ${result.orderId}`);

          // Record the trade in our database for tracking
          try {
            const tradeSize = result.fillSize || 0;
            const tradePrice = result.fillPrice || 0;
            const tradeFee = tradeSize * tradePrice * (orderParams.feeBps / 10000);

            // Calculate realized PnL for exit trades
            let realizedPnl = 0;
            if (isExit && exitPosition && tradeSize > 0 && tradePrice > 0) {
              if (exitPosition.side === "long") {
                // Long position: profit = (exit price - entry price) * size
                realizedPnl = (tradePrice - exitPosition.avgEntry) * tradeSize;
              } else {
                // Short position: profit = (entry price - exit price) * size
                realizedPnl = (exitPosition.avgEntry - tradePrice) * tradeSize;
              }
              console.log(`[Order Execution] 💰 Calculated realized PnL: ${exitPosition.side} entry=$${exitPosition.avgEntry.toFixed(2)}, exit=$${tradePrice.toFixed(2)}, size=${tradeSize.toFixed(4)} → PnL=$${realizedPnl.toFixed(4)}`);
            }

            await recordLiveTrade(
              orderParams.account_id,
              orderParams.session_id || "",
              {
                market: orderParams.market,
                action: isExit ? "close" : "open",
                side: orderParams.side,
                size: tradeSize,
                price: tradePrice,
                fee: tradeFee,
                realized_pnl: realizedPnl,
                venue_order_id: result.orderId,
                leverage: leverage, // Record the leverage used for this trade
              }
            );
            console.log(`[Order Execution] ✅ Trade recorded: ${tradeSize.toFixed(4)} ${coin} @ $${tradePrice.toFixed(2)}, PnL: $${realizedPnl.toFixed(4)} (${leverage}x leverage)`);
          } catch (dbError: any) {
            console.error(`[CRITICAL] Live Hyperliquid trade executed but DB recording failed. Manual intervention required.`);
            console.error(`[CRITICAL] Trade details:`, JSON.stringify({
              account_id: orderParams.account_id,
              session_id: orderParams.session_id,
              market: orderParams.market,
              side: orderParams.side,
              coin,
              orderId: result.orderId,
              fillPrice: result.fillPrice,
              fillSize: result.fillSize,
              leverage,
              error: dbError.message,
            }));

            // Pause the session to prevent further trading with corrupted state
            try {
              const pauseClient = createServiceRoleClient();
              await pauseClient
                .from("strategy_sessions")
                .update({
                  status: "paused",
                  error_message: `CRITICAL: Hyperliquid trade executed (Order: ${result.orderId}) but failed to record in database. Manual review required.`,
                })
                .eq("id", orderParams.session_id);
            } catch (pauseErr) {
              console.error(`[CRITICAL] Also failed to pause session after trade recording failure`);
            }
          }

          return {
            success: true,
            trade: {
              order_id: result.orderId,
              fill_price: result.fillPrice,
              fill_size: result.fillSize,
            },
          };
        } else {
          console.error(`[Order Execution] ❌ Hyperliquid order failed: ${result.error}`);
          return {
            success: false,
            error: result.error || "Order failed",
          };
        }
      } catch (error: any) {
        console.error(`[Order Execution] ❌ Exception placing Hyperliquid order:`, error);
        return {
          success: false,
          error: error.message || "Failed to place order",
        };
      }
    }
  } else {
    // VIRTUAL/ARENA MODE: Use virtual broker (simulation)
    // Arena is virtual-only ($100k competition), so it uses the same virtual broker as regular virtual mode
    const modeLabel = sessionMode === "arena" ? "ARENA (virtual)" : "VIRTUAL";
    console.log(`[Order Execution] 🟢 ${modeLabel} MODE: Simulating order (${leverage}x leverage)`);
    return await placeVirtualOrder({ ...orderParams, leverage });
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
    console.log(`[Tick API] Auth: X-Internal-API-Key=${!!internalApiKey}, env secret=${!!cronSecret}`);
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

    // TICK DEDUPLICATION: Use RPC function to bypass PostgREST schema cache issue
    // This guarantees only ONE request can proceed, even with concurrent requests
    // Use session's actual cadence for tick lock instead of fixed 10 seconds
    // This prevents both cron and frontend auto-tick from firing within the same cadence window
    // CRITICAL: Handle array case - Supabase may return strategies as array
    const lockStrategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
    const lockFilters = (lockStrategy as any)?.filters || {};
    const lockCadenceSeconds = lockFilters.cadenceSeconds || session.cadence_seconds || 30;
    const lockCadenceMs = lockCadenceSeconds * 1000;
    // Lock interval: cadence minus 5s tolerance (matching cron's tolerance), minimum 10s
    const MIN_TICK_INTERVAL_MS = Math.max(10000, lockCadenceMs - 5000);

    // Call RPC function for atomic lock acquisition
    const { data: lockAcquired, error: lockError } = await serviceClient
      .rpc('acquire_tick_lock', {
        p_session_id: sessionId,
        p_min_interval_ms: MIN_TICK_INTERVAL_MS
      });

    if (lockError) {
      console.error(`[Tick API] ❌ Lock acquisition error:`, lockError);
      return NextResponse.json({ error: "Failed to acquire tick lock" }, { status: 500 });
    }

    if (!lockAcquired) {
      // Another request won the race - this tick should be skipped
      console.log(`[Tick API] ⏭️ SKIPPED - Another tick is in progress or completed recently`);
      return NextResponse.json({
        skipped: true,
        reason: "tick_lock_failed",
        message: "Another tick is already in progress or completed recently",
        minIntervalMs: MIN_TICK_INTERVAL_MS,
      });
    }

    console.log(`[Tick API] 🔒 Acquired tick lock via RPC`);

    // INVARIANT LOG: Verify tick is processing this session with correct mode and markets
    const sessionMode = session.mode || "virtual";
    const sessionMarkets = session.markets || [];
    console.log(`[Tick API] 🎯 ENGINE START | session=${sessionId} | mode=${sessionMode} | markets=${sessionMarkets.join(',')} | strategy=${session.strategy_id}`);
    
    // CRITICAL ASSERTION: Arena mode must use same evaluation pipeline as virtual
    if (sessionMode === "arena") {
      console.log(`[Tick API] ⚠️ ARENA MODE DETECTED - This MUST use same strategy evaluation as virtual, only broker differs`);
    }

    // CRITICAL: Handle array case - Supabase may return strategies as array
    const strategy = Array.isArray(session.strategies) ? session.strategies[0] : session.strategies;
    const filters = (strategy as any)?.filters || {};
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
      // Verify exchange connection exists for live mode based on venue
      const liveVenue: Venue = (session.venue as Venue) || "hyperliquid";
      const { data: exchangeConnection } = await serviceClient
        .from("exchange_connections")
        .select("id, wallet_address, api_key, intx_enabled")
        .eq("user_id", user.id)
        .eq("venue", liveVenue)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!exchangeConnection) {
        const venueName = liveVenue === "coinbase" ? "Coinbase" : "Hyperliquid";
        return NextResponse.json(
          { error: `No ${venueName} exchange connection found. Please connect your ${venueName} account in Settings.` },
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
    let liveWalletAddress: string | null = null;
    let livePrivateKey: string | null = null;
    let liveApiKey: string | null = null;
    let liveApiSecret: string | null = null;
    let exchangeConnectionId: string | null = null;
    let isIntxEnabled = false; // Coinbase International (INTX) perpetuals access
    const liveVenue: Venue = (session.venue as Venue) || "hyperliquid";

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
      // Live mode: get or create live account based on venue
      console.log(`[Tick] Live mode with venue: ${liveVenue}`);

      // Get exchange connection with encrypted credentials based on venue
      const { data: exchangeConnection } = await serviceClient
        .from("exchange_connections")
        .select("id, venue, wallet_address, key_material_encrypted, api_key, api_secret_encrypted, intx_enabled")
        .eq("user_id", user.id)
        .eq("venue", liveVenue)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!exchangeConnection) {
        const venueName = liveVenue === "coinbase" ? "Coinbase" : "Hyperliquid";
        return NextResponse.json({ error: `${venueName} exchange connection not found` }, { status: 404 });
      }

      exchangeConnectionId = exchangeConnection.id;
      isIntxEnabled = liveVenue === "coinbase" && Boolean(exchangeConnection.intx_enabled);

      if (isIntxEnabled) {
        console.log(`[Tick] 🌐 Coinbase INTX mode enabled - perpetuals/leverage/shorts allowed`);
      }

      // Decrypt credentials based on venue
      try {
        if (liveVenue === "coinbase") {
          liveApiKey = exchangeConnection.api_key;
          liveApiSecret = decryptCredential(exchangeConnection.api_secret_encrypted);
          console.log(`[Tick] 🔐 Decrypted Coinbase API credentials`);
        } else {
          liveWalletAddress = exchangeConnection.wallet_address;
          livePrivateKey = decryptCredential(exchangeConnection.key_material_encrypted);
          console.log(`[Tick] 🔐 Decrypted Hyperliquid private key`);
        }
      } catch (err: any) {
        console.error("[Tick] Failed to decrypt credentials:", err);
        return NextResponse.json({ error: "Failed to decrypt exchange credentials" }, { status: 500 });
      }

      // Validate credentials based on venue
      if (liveVenue === "coinbase") {
        if (!liveApiKey || !liveApiSecret) {
          return NextResponse.json({ error: "Coinbase credentials incomplete" }, { status: 400 });
        }
      } else {
        if (!liveWalletAddress) {
          return NextResponse.json({ error: "Hyperliquid wallet address missing" }, { status: 400 });
        }
      }

      // Get or create live account (tracks equity/positions in DB)
      account = await getOrCreateLiveAccount(user.id, serviceClient, liveVenue);
      accountId = account.id;

      if (!accountId) {
        return NextResponse.json({ error: "Failed to create live account" }, { status: 500 });
      }

      // CRITICAL FIX: If exchange credentials were recreated, the live_account_id in
      // session may point to an orphaned account. Update session to use current account.
      // This happens when users re-add exchange connections (e.g., after fixing encryption key).
      if (session.live_account_id !== account.id) {
        console.log(`[Tick] ⚠️ Session live_account_id mismatch! Session has ${session.live_account_id}, current is ${account.id}. Updating session.`);
        await serviceClient
          .from("strategy_sessions")
          .update({ live_account_id: account.id })
          .eq("id", sessionId);
        console.log(`[Tick] ✅ Updated session ${sessionId} to use live_account_id: ${account.id}`);
      }

      // Sync positions and equity from exchange based on venue
      if (liveVenue === "coinbase") {
        try {
          await syncPositionsFromCoinbase(accountId, liveApiKey!, liveApiSecret!);

          // For INTX perpetuals, also reconstruct positions from trade history
          // This handles positions that weren't tracked due to earlier bugs
          if (isIntxEnabled) {
            await reconstructIntxPositionsFromTrades(accountId);
          }

          const { equity, cashBalance } = await updateCoinbaseAccountEquity(accountId, liveApiKey!, liveApiSecret!);
          accountEquity = equity;
          // For Coinbase spot, cash_balance is the available USD for buying
          account.cash_balance = cashBalance;
          console.log(`[Tick] 💰 Coinbase cash available: $${cashBalance.toFixed(2)}`);
        } catch (syncError: any) {
          console.error(`[Tick] ❌ Failed to sync Coinbase state: ${syncError.message}`);
          // Log the error as a visible decision so the user can see what went wrong
          await serviceClient.from("decisions").insert({
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            market: "SYSTEM",
            intent: "error",
            confidence: 0,
            reasoning: `Coinbase sync failed: ${syncError.message}. Skipping tick to prevent data corruption.`,
            executed: false,
          });
          return NextResponse.json({
            error: `Coinbase sync failed: ${syncError.message}`,
            skipped: true,
          }, { status: 500 });
        }
      } else {
        const walletAddr = liveWalletAddress!;
        await syncPositionsFromHyperliquid(accountId, walletAddr);
        const { equity } = await updateAccountEquity(accountId, walletAddr);
        accountEquity = equity;
      }

      // Update account object with fresh data
      account.equity = accountEquity;

      console.log(`[Tick] Live mode (${liveVenue}) - Account ${accountId} equity: $${accountEquity.toFixed(2)}`);
    }

    // Get markets to process
    const markets = filters.markets || [];
    if (markets.length === 0) {
      return NextResponse.json({ error: "No markets configured in strategy" }, { status: 400 });
    }

    // Get market processing mode from strategy filters (default: "all" for new behavior)
    // "all" = process all markets every tick
    // "round-robin" = process one market per tick, cycling through
    const marketProcessingMode = filters.marketProcessingMode || "all";

    // Get cadence for round-robin calculation and logging
    const strategyFilters = strategy.filters || {};
    // Use ?? instead of || to allow 0 (though 0 cadence doesn't make sense)
    // Priority: strategy.filters > session.cadence_seconds > 30 default
    const cadenceSeconds = strategyFilters.cadenceSeconds ?? session.cadence_seconds ?? 30;

    // Validate cadence is positive
    if (cadenceSeconds <= 0) {
      console.error(`[Tick] ❌ Invalid cadence: ${cadenceSeconds}. Must be positive.`);
      return NextResponse.json({
        error: "Strategy configuration invalid: cadence must be positive"
      }, { status: 400 });
    }

    let marketsToProcess: string[];
    if (marketProcessingMode === "round-robin" && markets.length > 1) {
      // Round-robin: Process only ONE market per tick to reduce AI call frequency
      // Calculate which market to process based on session start time and cadence
      const sessionStartTime = session.started_at
        ? new Date(session.started_at).getTime()
        : new Date(session.created_at).getTime();
      const cadenceMs = cadenceSeconds * 1000;
      const ticksSinceStart = Math.floor((Date.now() - sessionStartTime) / cadenceMs);
      const marketIndex = ticksSinceStart % markets.length;
      marketsToProcess = [markets[marketIndex]];

      console.log(`[Tick] 🔄 Round-robin mode: Processing market ${marketIndex + 1}/${markets.length} (${marketsToProcess[0]})`);
      console.log(`[Tick] 📊 Each market analyzed every ${cadenceSeconds * markets.length}s (1 AI call per tick)`);
    } else {
      // All mode: Process ALL markets every tick
      marketsToProcess = markets;
      console.log(`[Tick] 📊 All-markets mode: Processing ${markets.length} market(s) (${markets.join(', ')})`);
    }

    // Get positions early so we can price ALL open markets for accurate equity
    let allPositionsForExit: any[] = [];
    // Get positions using correct function based on mode
    if (accountId) {
      allPositionsForExit = sessionMode === "live"
        ? await getLivePositions(accountId)
        : await getPositions(accountId);
      console.log(`[Tick] 📊 Loaded ${allPositionsForExit.length} positions for exit checks (${sessionMode} mode)`);
    }

    // Get venue from session (default to hyperliquid for backwards compatibility)
    const sessionVenue: Venue = (session.venue as Venue) || "hyperliquid";
    // Virtual and Arena venues use Hyperliquid for market data (simulated trading)
    const priceVenue: Venue = (sessionVenue === "virtual" || sessionVenue === "arena") ? "hyperliquid" : sessionVenue;
    console.log(`[Tick] 📊 Using venue: ${sessionVenue} (price source: ${priceVenue})`);

    // Fetch real prices from exchange based on venue
    // IMPORTANT: include ALL open position markets so equity reflects full portfolio
    let pricesByMarket: Record<string, number>;
    try {
      const pricingMarkets = new Set<string>(marketsToProcess);
      for (const position of allPositionsForExit) {
        if (position?.market) pricingMarkets.add(position.market);
      }
      const marketsArray = Array.from(pricingMarkets);
      pricesByMarket = priceVenue === "coinbase"
        ? await getCoinbasePrices(marketsArray)
        : await getHyperliquidPrices(marketsArray);
      if (Object.keys(pricesByMarket).length === 0) {
        return NextResponse.json({ error: "Failed to fetch prices for any market" }, { status: 500 });
      }
    } catch (error: any) {
      console.error("Error fetching prices:", error);
      return NextResponse.json({ error: "Failed to fetch market prices" }, { status: 500 });
    }

    // Mark existing positions to market (virtual/arena mode only, not live)
    // Arena is virtual-only, so both "virtual" and "arena" use virtual broker
    if ((sessionMode === "virtual" || sessionMode === "arena") && accountId) {
      await markToMarket(accountId, pricesByMarket);
    }

    // ENFORCE EXIT RULES - Check all positions for exit conditions BEFORE processing new trades
    const entryExit = filters.entryExit || {};
    const exitRules = entryExit.exit || {};
    const tradeControlForExits = entryExit.tradeControl || {};
    const minHoldMinutesForExits = tradeControlForExits.minHoldMinutes ?? 5;
    
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
      
      // Get when position was opened (from MOST RECENT open trade for this position)
      // BUGFIX: Use descending order to get the most recent open trade.
      // ascending: true would return the first-ever open for this market, which is wrong
      // if the position was closed and reopened (makes position appear older, bypassing min hold time).
      const { data: firstTrade } = await serviceClient
        .from(tables.trades)
        .select("created_at")
        .eq("account_id", account.id)
        .eq("market", position.market)
        .eq("action", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const positionAgeMinutes = firstTrade 
        ? (now.getTime() - new Date(firstTrade.created_at).getTime()) / (60 * 1000)
        : 0;

      let shouldExit = false;
      let exitReason = "";
      let isEmergencyExit = false; // Emergency exits bypass min hold time (to protect capital)
      let isTimeBasedExit = false; // Time-based exits bypass min hold time (that's the point)

      // Check exit rules based on exit mode
      
      // MODE: SIGNAL (AI-driven) - Only check optional safety guardrails
      if (exitRules.mode === "signal") {
        // Optional emergency override: max loss protection
        if (exitRules.maxLossProtectionPct && unrealizedPnlPct <= -Math.abs(exitRules.maxLossProtectionPct)) {
          shouldExit = true;
          isEmergencyExit = true; // Emergency: don't let loss grow further
          exitReason = `Max loss protection: ${unrealizedPnlPct.toFixed(2)}% <= -${exitRules.maxLossProtectionPct}% (emergency guardrail)`;
        }
        // Optional emergency override: max profit cap
        else if (exitRules.maxProfitCapPct && unrealizedPnlPct >= exitRules.maxProfitCapPct) {
          shouldExit = true;
          isEmergencyExit = true; // Emergency: lock in max profit
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
        // Get stored peak price or initialize from entry price
        let peakPrice = position.peak_price ? Number(position.peak_price) : entryPrice;

        // Update peak if current price is more favorable
        // For longs: track highest price reached
        // For shorts: track lowest price reached
        let peakUpdated = false;
        if (position.side === "long" && positionPrice > peakPrice) {
          peakPrice = positionPrice;
          peakUpdated = true;
        } else if (position.side === "short" && positionPrice < peakPrice) {
          peakPrice = positionPrice;
          peakUpdated = true;
        }

        // Persist updated peak to database so it survives between ticks
        if (peakUpdated) {
          await serviceClient
            .from(tables.positions)
            .update({ peak_price: peakPrice })
            .eq("id", position.id);
          console.log(`[Tick] Updated peak_price for ${position.market}: $${peakPrice.toFixed(2)}`);
        }

        // Check if current price has dropped by trailingStopPct from peak
        const dropFromPeakPct = position.side === "long"
          ? ((peakPrice - positionPrice) / peakPrice) * 100
          : ((positionPrice - peakPrice) / peakPrice) * 100;

        if (dropFromPeakPct >= exitRules.trailingStopPct) {
          shouldExit = true;
          const extremeLabel = position.side === "long" ? "peak" : "trough";
          exitReason = `Trailing stop: ${dropFromPeakPct.toFixed(2)}% from ${extremeLabel} $${peakPrice.toFixed(2)} >= ${exitRules.trailingStopPct}%`;
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
        isTimeBasedExit = true; // Time-based: min hold doesn't apply
        exitReason = `Max hold time: ${positionAgeMinutes.toFixed(1)} minutes >= ${exitRules.maxHoldMinutes} minutes`;
      }

      // MIN HOLD TIME CHECK: Block exits (except emergency/time-based) if position is too young
      // This prevents chop trading where positions are closed too quickly after opening
      const minHoldMs = minHoldMinutesForExits * 60 * 1000;
      const positionAgeMs = positionAgeMinutes * 60 * 1000;
      
      if (shouldExit && !isEmergencyExit && !isTimeBasedExit && positionAgeMs < minHoldMs) {
        const remainingMinutes = Math.ceil((minHoldMs - positionAgeMs) / 1000 / 60);
        console.log(`[Tick] ⏳ Min hold time blocks exit: ${remainingMinutes} min remaining (position: ${position.market} ${position.side}, age: ${positionAgeMinutes.toFixed(1)} min, min: ${minHoldMinutesForExits} min)`);
        console.log(`[Tick] ⏳ Would have exited for: ${exitReason}`);
        shouldExit = false; // Block the exit
      }

      // Execute exit if conditions met
      if (shouldExit) {
        console.log(`[Tick] 🚪 Auto-exiting position ${position.market} (${position.side}): ${exitReason}`);
        const exitSide = position.side === "long" ? "sell" : "buy";
        // CRITICAL FIX: Use CURRENT price * size so that placeRealOrder (which divides by current price)
        // recovers the correct base size. Using entryPrice * size would under/over-close if price moved.
        const exitNotional = positionPrice * size;

        const exitResult = await placeMarketOrder({
          sessionMode,
          venue: liveVenue,
          livePrivateKey: livePrivateKey || undefined,
          liveApiKey: liveApiKey || undefined,
          liveApiSecret: liveApiSecret || undefined,
          account_id: account.id,
          strategy_id: strategy.id,
          session_id: sessionId,
          market: position.market,
          side: exitSide,
          notionalUsd: exitNotional, // Close entire position at current price
          slippageBps: 50, // 0.5% slippage for exits (must fill to protect capital)
          feeBps: 5,
          isExit: true,
          exitPosition: { side: position.side as "long" | "short", avgEntry: entryPrice },
          exitPositionSize: size, // Exact position size for complete closes
          leverage: position.leverage || 1, // Record position's leverage on exit trade
        });

        if (exitResult.success) {
          console.log(`[Tick] ✅ Auto-exit executed: ${exitReason}`);

          // Log auto-exit as a decision so it appears in the decision history
          const exitActionSummary = `Closed ${position.side}: ${exitReason} (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`;
          await serviceClient
            .from("session_decisions")
            .insert({
              session_id: sessionId,
              market_snapshot: { price: positionPrice },
              indicators_snapshot: {},
              intent: { bias: "close", positionSide: position.side, reasoning: exitReason },
              confidence: 1.0, // System-triggered exits are 100% confidence
              action_summary: exitActionSummary,
              risk_result: { passed: true, executed: true },
              proposed_order: {
                market: position.market,
                side: exitSide,
                notionalUsd: exitNotional,
              },
              executed: true,
              error: null,
            });
          console.log(`[Tick] 📝 Logged auto-exit decision: ${exitActionSummary}`);
        } else {
          console.error(`[Tick] ❌ Auto-exit failed: ${exitResult.error}`);

          // Log failed auto-exit attempt
          await serviceClient
            .from("session_decisions")
            .insert({
              session_id: sessionId,
              market_snapshot: { price: positionPrice },
              indicators_snapshot: {},
              intent: { bias: "close", positionSide: position.side, reasoning: exitReason },
              confidence: 1.0,
              action_summary: `Auto-exit failed: ${exitResult.error}`,
              risk_result: { passed: true, executed: false, reason: exitResult.error },
              proposed_order: {
                market: position.market,
                side: exitSide,
                notionalUsd: exitNotional,
              },
              executed: false,
              error: exitResult.error,
            });
        }
      }
    }

    // Process each market
    const decisions: any[] = [];
    const tickStartTime = Date.now();
    const tickStartTimestamp = new Date().toISOString();
    console.log(`[Tick] ⏰ Starting tick at ${tickStartTimestamp}`);
    
    // NOTE: last_tick_at was already set atomically during lock acquisition at the start of the tick
    // This ensures no race conditions and prevents duplicate ticks
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
      // CRITICAL: Use correct position function based on mode
      const allPositions = sessionMode === "live"
        ? await getLivePositions(account.id)
        : await getPositions(account.id);
      const marketPosition = allPositions.find((p) => p.market === market);
      
      console.log(`[Tick] 📊 Loaded ${allPositions.length} positions for ${sessionMode} mode, market ${market} position: ${marketPosition ? `${marketPosition.side} ${marketPosition.size}` : 'NONE'}`);

      // Build AI input payload - COMPILE ALL REQUESTED AI INPUTS
      const aiInputs = filters.aiInputs || {};
      const useAgentic = !!filters.agenticMode && TOOL_CALLING_PROVIDERS.has(strategy.model_provider);
      const marketSnapshot: any = {
        market,
        price: currentPrice,
        timestamp: new Date().toISOString(),
        ...(useAgentic && { agenticMode: true }),
      };

      // Prominent tick banner so it stands out in logs
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`[Tick] 🔔 TICK: ${sessionId.slice(0,8)} | ${market} | $${currentPrice.toLocaleString()}`);
      if (useAgentic) {
        console.log(`[Tick] 🤖 MODE: AGENTIC (max ${filters.agenticConfig?.maxToolCalls || 10} tool calls)`);
      } else {
        console.log(`[Tick] 📋 MODE: PASSIVE`);
      }
      console.log(`${'═'.repeat(60)}`);

      // Fetch candles if enabled (skipped in agentic mode - AI fetches its own data)
      let candles: any[] = [];
      if (!useAgentic && aiInputs.candles?.enabled) {
        try {
          const candleCount = aiInputs.candles.count || 200;
          let candleInterval = aiInputs.candles.timeframe || "5m";
          
          // Handle legacy numeric timeframes (convert to minutes format)
          if (typeof candleInterval === 'number') {
            candleInterval = `${candleInterval}m`;
          }

          // Use venue-specific candle fetching (priceVenue maps virtual/arena to hyperliquid)
          const fetchedCandles = priceVenue === "coinbase"
            ? await getCoinbaseCandles(market, candleInterval, candleCount)
            : await getHyperliquidCandles(market, candleInterval, candleCount);
          candles = fetchedCandles.map((c: any) => ({
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

      // Fetch orderbook if enabled (venue-aware) (skipped in agentic mode)
      let orderbookSnapshot: any = null;
      if (!useAgentic && aiInputs.orderbook?.enabled) {
        try {
          const depth = aiInputs.orderbook.depth || 20;
          // Use venue-specific orderbook fetching (priceVenue maps virtual/arena to hyperliquid)
          const orderbook = priceVenue === "coinbase"
            ? await getCoinbaseOrderbook(market, depth)
            : await hyperliquidClient.getOrderbook(market, depth);
          orderbookSnapshot = {
            bid: orderbook.bid,
            ask: orderbook.ask,
            mid: orderbook.mid,
            spread: orderbook.ask - orderbook.bid,
            depth: orderbook.bids.length,
            bids: orderbook.bids,
            asks: orderbook.asks,
          };
          marketSnapshot.orderbook = orderbookSnapshot;
        } catch (error: any) {
          console.error(`[Tick] Failed to fetch orderbook for ${market}:`, error);
          // Continue without orderbook - don't fail the tick
        }
      }

      // Calculate technical indicators from candles if enabled and we have candles (skipped in agentic mode)
      let indicatorsSnapshot: any = {};
      let candlesForIndicators: any[] = [];
      if (!useAgentic && candles.length > 0 && aiInputs.indicators) {
        try {
          // Convert candles back to the format needed for indicator calculations
          candlesForIndicators = candles.map((c) => ({
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
            macd: aiInputs.indicators.macd,
            bollingerBands: aiInputs.indicators.bollingerBands,
            supportResistance: aiInputs.indicators.supportResistance,
            volume: aiInputs.indicators.volume,
          });
        } catch (error: any) {
          console.error(`[Tick] Failed to calculate indicators for ${market}:`, error);
          // Continue without indicators - don't fail the tick
        }
      }

      // Fetch higher-timeframe candles and run market analysis (skipped in agentic mode)
      let marketAnalysis: any = null;
      if (!useAgentic && candlesForIndicators.length > 0) {
        try {
          const { runMarketAnalysis } = await import("@/lib/ai/marketAnalysis");

          // Fetch higher-timeframe candles for multi-timeframe analysis
          const primaryInterval = aiInputs.candles?.timeframe || "5m";
          const htfMap: Record<string, string> = { "1m": "15m", "5m": "1h", "15m": "4h", "1h": "1d" };
          const htfInterval = htfMap[primaryInterval] || "1h";

          let htfIndicators: any = null;
          try {
            const htfCandles = priceVenue === "coinbase"
              ? await getCoinbaseCandles(market, htfInterval, 50)
              : await getHyperliquidCandles(market, htfInterval, 50);

            if (htfCandles.length > 0) {
              const htfCandlesFormatted = htfCandles.map((c: any) => ({
                t: c.t, T: c.t + 1, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, n: 0,
              }));
              htfIndicators = calculateIndicators(htfCandlesFormatted, {
                rsi: { enabled: true, period: 14 },
                ema: { enabled: true, fast: 12, slow: 26 },
                macd: { enabled: true },
              });
            }
          } catch (htfError: any) {
            console.error(`[Tick] Failed to fetch HTF candles for ${market}:`, htfError.message);
            // Continue without HTF data
          }

          marketAnalysis = runMarketAnalysis({
            market,
            currentPrice,
            candles: candlesForIndicators,
            indicators: indicatorsSnapshot,
            htfIndicators: htfIndicators || undefined,
            primaryTimeframe: primaryInterval,
            htfTimeframe: htfInterval,
          });

          console.log(`[Tick] 📊 Market Analysis for ${market}: ${marketAnalysis.regime.trend} (strength: ${marketAnalysis.regime.trendStrength}, regime: ${marketAnalysis.regime.regime})`);
        } catch (analysisError: any) {
          console.error(`[Tick] Failed to run market analysis for ${market}:`, analysisError.message);
          // Continue without market analysis
        }
      }

      // Fetch news if enabled (skipped in agentic mode - AI fetches via tools)
      let newsContext: string | null = null;
      if (!useAgentic && aiInputs.news?.enabled) {
        try {
          const newsResult = await fetchCryptoNews(market, aiInputs.news.maxArticles || 5);
          if (newsResult) {
            newsContext = newsResult.formattedContext;
            console.log(`[Tick] 📰 News fetched for ${market}: ${newsResult.articles.length} articles`);
          }
        } catch (error: any) {
          console.error(`[Tick] Failed to fetch news for ${market}:`, error.message);
          // Continue without news - don't fail the tick
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

        // Resolve API key (always uses Corebound platform keys)
        console.log(`[Tick] 🔑 Resolving platform key for strategy ${strategy.id}, provider: ${strategy.model_provider}`);
        const resolvedKey = await resolveStrategyApiKey({
          id: strategy.id,
          model_provider: strategy.model_provider,
        });
        const apiKey = resolvedKey.apiKey;
        console.log(`[Tick] ✅ Platform key resolved for ${strategy.model_provider}`);

        // Use platform base URL if available, otherwise fall back to provider mapping
        const baseUrl = resolvedKey.baseUrl || PROVIDER_BASE_URLS[strategy.model_provider] || "";

        if (!baseUrl) {
          throw new Error(`Unknown provider: ${strategy.model_provider}`);
        }

        // Fetch recent decisions if enabled (skipped in agentic mode - AI fetches via tools)
        let recentDecisions: any[] = [];
        if (!useAgentic && aiInputs.includeRecentDecisions !== false) {
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

        // Fetch recent trades if enabled (skipped in agentic mode - AI fetches via tools)
        let recentTrades: any[] = [];
        if (!useAgentic && aiInputs.includeRecentTrades !== false) {
          try {
            const tradesCount = aiInputs.recentTradesCount || 10;
            const { data: tradesData } = await serviceClient
              .from(tables.trades)
              .select("id, created_at, market, side, action, price, size, realized_pnl")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: false })
              .limit(tradesCount);

            if (tradesData) {
              recentTrades = tradesData.map((t) => ({
                timestamp: t.created_at,
                market: t.market,
                side: t.side,
                action: t.action,
                price: Number(t.price),
                size: Number(t.size),
                realizedPnl: t.realized_pnl ? Number(t.realized_pnl) : null,
              }));
            }
          } catch (error: any) {
            console.error(`[Tick] Failed to fetch recent trades:`, error);
            // Continue without recent trades - don't fail the tick
          }
        }

        // Build context for AI - COMPILED WITH ALL REQUESTED AI INPUTS
        const contextPositions = aiInputs.includePositionState !== false ? positionsSnapshot : [];
        const contextCurrentPosition = aiInputs.includePositionState !== false && marketPosition ? {
          market: marketPosition.market,
          side: marketPosition.side,
          size: Number(marketPosition.size),
          avg_entry: Number(marketPosition.avg_entry),
          unrealized_pnl: Number(marketPosition.unrealized_pnl || 0),
        } : null;
        
        console.log(`[Tick] 📊 AI Context - Positions: ${contextPositions.length} total, Current ${market} position: ${contextCurrentPosition ? `${contextCurrentPosition.side} ${contextCurrentPosition.size}` : 'NONE'}`);
        if (contextPositions.length > 0) {
          console.log(`[Tick] 📊 All positions being sent to AI:`, contextPositions);
        }
        
        // Determine if trading perpetuals (leverage/shorts) or spot (no leverage)
        const isPerpsMarket = market.includes("-PERP") || market.endsWith("-INTX") ||
          sessionVenue === "hyperliquid" || sessionMode === "virtual" || sessionMode === "arena" ||
          (sessionVenue === "coinbase" && isIntxEnabled);
        const marketType = isPerpsMarket ? "perpetual" : "spot";
        const maxLeverage = isPerpsMarket ? (risk.maxLeverage || 1) : 1;
        const canShort = isPerpsMarket && guardrails.allowShort !== false;

        console.log(`[Tick] 📊 Market type: ${marketType}, Max leverage: ${maxLeverage}x, Shorts allowed: ${canShort}`);

        const context: any = {
          market,
          marketData: marketSnapshot, // Includes price, candles (if enabled), orderbook (if enabled)
          account: accountInfo, // Total equity, cash balance, starting equity
          positions: contextPositions, // ALL positions (unless disabled)
          currentMarketPosition: contextCurrentPosition, // Current market's position (if any and if enabled)
          indicators: indicatorsSnapshot, // RSI, ATR, Volatility, EMA, MACD, Bollinger, S/R, Volume (if enabled)
          marketAnalysis, // Pre-processed market regime, key levels, MTF alignment, summary (always included alongside raw data)
          newsContext, // Recent crypto news headlines (if enabled)
          recentDecisions: aiInputs.includeRecentDecisions !== false ? recentDecisions : [], // Previous AI decisions (default enabled)
          recentTrades: aiInputs.includeRecentTrades !== false ? recentTrades : [], // Previous trade executions (default enabled)
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
            // Trading constraints - what the AI is allowed to do
            marketType, // 'perpetual' (leverage/shorts available) or 'spot' (1x only, longs only)
            maxLeverage, // Max leverage allowed (1 = no leverage, 2 = 2x, etc.)
            allowLong: guardrails.allowLong !== false,
            allowShort: canShort,
          },
        };

        // Call AI — agentic mode (tool calling) or passive mode (single prompt)
        let aiResponse: any;
        if (useAgentic) {
          // AGENTIC PATH: AI decides what data to fetch via tool calls
          const toolContext: ToolContext = {
            priceVenue: priceVenue as "hyperliquid" | "coinbase",
            sessionId,
            serviceClient,
            tables,
            market,
            currentPrice,
            allPositions,
            marketPosition,
            account: {
              equity: Number(account.equity),
              cash_balance: Number(account.cash_balance),
              starting_equity: Number(account.starting_equity),
            },
          };

          const entryInstructions = (() => {
            const behaviors = entry.behaviors || { trend: true, breakout: true, meanReversion: true };
            const enabled = [];
            if (behaviors.trend) enabled.push("trend-following");
            if (behaviors.breakout) enabled.push("breakout");
            if (behaviors.meanReversion) enabled.push("mean reversion");
            if (enabled.length === 0) return "No entry behaviors enabled. Do not enter any positions.";
            if (enabled.length === 3) return "All entry types allowed.";
            return `Only these entry types: ${enabled.join(", ")}.`;
          })();

          console.log(`[Tick] 🤖 Calling agenticIntentCall for ${market}...`);
          aiResponse = await agenticIntentCall({
            baseUrl: normalizeBaseUrl(baseUrl),
            apiKey,
            model: strategy.model_name,
            prompt: strategy.prompt,
            provider: strategy.model_provider,
            toolContext,
            agenticConfig: filters.agenticConfig || {},
            market,
            currentPrice,
            marketPosition: contextCurrentPosition,
            account: {
              equity: accountInfo.current_equity,
              cash_balance: accountInfo.cash_balance,
              starting_equity: accountInfo.starting_equity,
              total_return_pct: accountInfo.total_return_pct,
            },
            allPositions: contextPositions,
            strategyConstraints: {
              marketType: marketType as "perpetual" | "spot",
              maxLeverage,
              allowLong: guardrails.allowLong !== false,
              allowShort: canShort,
              entryInstructions,
            },
          });
          console.log(`[Tick] 🤖 Agentic response: bias=${aiResponse.intent.bias}, confidence=${aiResponse.intent.confidence}, tokens=${aiResponse.usage.totalTokens}`);
        } else {
          // PASSIVE PATH: Pre-fetched data sent in single prompt (existing flow)
          aiResponse = await openAICompatibleIntentCall({
            baseUrl: normalizeBaseUrl(baseUrl),
            apiKey,
            model: strategy.model_name,
            prompt: strategy.prompt,
            provider: strategy.model_provider,
            context,
          });
        }

        intent = aiResponse.intent;
        confidence = intent.confidence || 0;

        // Check if user is admin (skip billing for platform owner)
        const adminUserIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
        const isAdmin = adminUserIds.includes(user.id);

        if (isAdmin) {
          console.log(`[Tick ${sessionId}] Admin user - skipping billing`);
        } else {
          // Deduct from balance based on actual API usage with tiered markup
          try {
            const { calculateCost, calculateChargedCents, getMarkupForTier } = await import("@/lib/pricing/apiCosts");

            // Get user's subscription tier for tiered markup (use fresh client to avoid caching issues)
            const freshClient = createFreshServiceClient();
            const { data: userSub } = await freshClient
              .from("user_subscriptions")
              .select("plan_id, status")
              .eq("user_id", user.id)
              .single();

            // Determine tier: active subscription = plan_id, otherwise on_demand
            const tier = (userSub?.status === "active" && userSub?.plan_id) ? userSub.plan_id : "on_demand";
            const markup = getMarkupForTier(tier);

            const actualCostUsd = calculateCost(
              aiResponse.model,
              aiResponse.usage.inputTokens,
              aiResponse.usage.outputTokens
            );
            const chargedCents = calculateChargedCents(actualCostUsd, tier);

            // Deduct balance directly via RPC (not HTTP) to avoid auth issues with cron-triggered ticks
            const deductClient = createFreshServiceClient();
            const { data: deductResult, error: deductError } = await deductClient.rpc('decrement_user_balance', {
              p_user_id: user.id,
              p_amount_cents: chargedCents,
              p_description: `AI decision (${aiResponse.model})`,
              p_metadata: {
                session_id: sessionId,
                model: aiResponse.model,
                input_tokens: aiResponse.usage.inputTokens,
                output_tokens: aiResponse.usage.outputTokens,
                total_tokens: aiResponse.usage.totalTokens,
                actual_cost_usd: actualCostUsd,
                actual_cost_cents: Math.round(actualCostUsd * 100),
                charged_cents: chargedCents,
                markup_percent: markup * 100,
                tier: tier,
                bias: intent.bias,
              },
            });

            if (deductError) {
              console.error(`[Tick ${sessionId}] Balance deduction RPC error:`, deductError.message);
            } else if (deductResult && typeof deductResult === 'object') {
              if (deductResult.error === 'insufficient_balance' || deductResult.error === 'no_balance') {
                // Insufficient balance - pause session
                console.error(`[Tick ${sessionId}] Insufficient balance, pausing session`);
                await serviceClient
                  .from("strategy_sessions")
                  .update({
                    status: "paused",
                    error_message: "Insufficient balance to continue trading. Please add funds to resume."
                  })
                  .eq("id", sessionId);

                return NextResponse.json(
                  { error: "Insufficient balance to continue trading" },
                  { status: 402 }
                );
              }
              if (deductResult.success) {
                console.log(`[Tick ${sessionId}] Balance deducted:`, {
                  tier: tier,
                  markup: `${(markup * 100).toFixed(0)}%`,
                  chargedCents: chargedCents,
                  chargedUsd: (chargedCents / 100).toFixed(4),
                  newBalanceCents: deductResult.new_balance_cents,
                  model: aiResponse.model,
                  tokens: aiResponse.usage.totalTokens,
                  actualCostUsd: actualCostUsd.toFixed(6),
                });
              }
            }
          } catch (billingError: any) {
            // BUGFIX: Billing must work in production. Pause session on billing failure
            // to prevent unbilled AI usage. Without this, users trade for free if billing breaks.
            console.error(`[Tick ${sessionId}] Balance deduction failed - pausing session:`, billingError.message);
            await serviceClient
              .from("strategy_sessions")
              .update({
                status: "paused",
                error_message: "Billing system error. Session paused to prevent unbilled usage. Please try again or contact support.",
              })
              .eq("id", sessionId);
            return NextResponse.json({ error: "Billing system error" }, { status: 500 });
          }
        }

        // AI-DRIVEN EXIT FOR "SIGNAL" MODE
        // Exit triggers:
        // - "close" = explicitly close position (profit taking, risk reduction, etc.)
        // - "long" when holding short = exit short (direction reversal)
        // - "short" when holding long = exit long (direction reversal)
        // - "neutral" = do nothing, keep position open
        // This must happen BEFORE entry logic, so we exit before considering new entries
        const currentExitRules = entryExit.exit || {};
        if (currentExitRules.mode === "signal" && marketPosition) {
          const positionSide = marketPosition.side; // "long" or "short"
          const aiIntent = intent.bias; // "long", "short", "neutral", or "close"
          
          // Calculate unrealized PnL for logging
          const entryPrice = Number(marketPosition.avg_entry);
          const posSize = Number(marketPosition.size);
          const unrealizedPnl = positionSide === "long" 
            ? (currentPrice - entryPrice) * posSize
            : (entryPrice - currentPrice) * posSize;
          const unrealizedPnlPct = entryPrice > 0 ? (unrealizedPnl / (entryPrice * posSize)) * 100 : 0;
          
          // Exit conditions:
          // 1. AI says "close" - explicit exit request (profit taking, risk management)
          // 2. AI says opposite direction - reversal signal
          const isExplicitClose = aiIntent === "close";
          const isDirectionReversal = 
            (positionSide === "long" && aiIntent === "short") ||
            (positionSide === "short" && aiIntent === "long");
          
          let shouldExitAI = isExplicitClose || isDirectionReversal;
          
          // MIN HOLD TIME CHECK FOR AI-DRIVEN EXITS
          // This prevents chop trading where AI closes positions too quickly after opening
          if (shouldExitAI) {
            const tradeControlForAI = entryExit.tradeControl || {};
            const minHoldMinutesAI = tradeControlForAI.minHoldMinutes ?? 5;
            const minHoldMsAI = minHoldMinutesAI * 60 * 1000;
            const nowForAIExit = new Date(); // Local timestamp for this check
            
            // Get when position was opened (MOST RECENT open trade)
            // BUGFIX: Use descending to get most recent open, not first-ever open for this market
            const { data: positionOpenTradeAI } = await serviceClient
              .from(tables.trades)
              .select("created_at")
              .eq("account_id", account.id)
              .eq("market", market)
              .eq("action", "open")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (positionOpenTradeAI) {
              const timeSinceOpenAI = nowForAIExit.getTime() - new Date(positionOpenTradeAI.created_at).getTime();
              
              if (timeSinceOpenAI < minHoldMsAI) {
                const remainingMinutesAI = Math.ceil((minHoldMsAI - timeSinceOpenAI) / 1000 / 60);
                console.log(`[Tick] ⏳ Min hold time blocks AI exit: ${remainingMinutesAI} min remaining`);
                console.log(`[Tick] ⏳ AI wanted to: ${isExplicitClose ? 'close' : 'reverse'} (position age: ${(timeSinceOpenAI / 60000).toFixed(1)} min, min hold: ${minHoldMinutesAI} min)`);
                
                // Block the exit but record what AI wanted to do
                shouldExitAI = false;
                actionSummary = `Min hold time: AI wanted to ${isExplicitClose ? 'close' : 'reverse'} but ${remainingMinutesAI} min remaining`;
                riskResult = { passed: false, reason: actionSummary };
              }
            }
          }
          
          if (shouldExitAI) {
            const exitReason = isExplicitClose 
              ? `AI requested close (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`
              : `AI reversal signal: ${aiIntent} (was ${positionSide})`;
            
            console.log(`[Tick] 🤖 AI-driven exit: ${exitReason} for ${market}`);
            console.log(`[Tick] 📊 Position details: ${positionSide} ${posSize} @ $${entryPrice.toFixed(2)}, Current: $${currentPrice.toFixed(2)}, Unrealized: $${unrealizedPnl.toFixed(2)} (${unrealizedPnlPct.toFixed(2)}%)`);
            
            const exitSide = positionSide === "long" ? "sell" : "buy";
            
            // For LIVE mode: Use a large notional to ensure we close the full position
            // Hyperliquid will cap the order at the actual position size
            // For VIRTUAL mode: Calculate exact notional
            const exitNotional = sessionMode === "live"
              ? posSize * currentPrice * 1.01  // Add 1% buffer to ensure full close
              : currentPrice * posSize;
            
            console.log(`[Tick] 🚪 Exit order: ${sessionMode} mode, position=${posSize}, notional=$${exitNotional.toFixed(2)}`);
            
            const exitResult = await placeMarketOrder({
              sessionMode,
              venue: liveVenue,
              livePrivateKey: livePrivateKey || undefined,
              liveApiKey: liveApiKey || undefined,
              liveApiSecret: liveApiSecret || undefined,
              account_id: account.id,
              strategy_id: strategy.id,
              session_id: sessionId,
              market: market,
              side: exitSide,
              notionalUsd: exitNotional, // Close entire position
              slippageBps: 50, // 0.5% slippage for exits (must fill to protect capital)
              feeBps: 5,
              isExit: true,
              exitPosition: { side: positionSide as "long" | "short", avgEntry: entryPrice },
              exitPositionSize: posSize, // Exact position size for complete closes
              leverage: marketPosition?.leverage || 1, // Record position's leverage on exit trade
            });

            if (exitResult.success) {
              executed = true;
              actionSummary = isExplicitClose
                ? `AI closed ${positionSide} position to ${unrealizedPnl >= 0 ? 'lock in profit' : 'cut loss'} (${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`
                : `AI reversal: Closed ${positionSide} position (new bias: ${aiIntent})`;
              riskResult = { passed: true, executed: true };
              console.log(`[Tick] ✅ AI-driven exit executed for ${market}: ${actionSummary}`);

              // IMPORTANT: Preserve the original intent for the decision log
              // But prevent entry logic from running by setting passed to false
              riskResult.passed = false; // Prevent entry logic from running

              // Add positionSide to intent so dashboard shows "Closed Long" or "Closed Short"
              intent.positionSide = positionSide;
              intent.bias = "close"; // Override to "close" for consistent badge display
            } else {
              actionSummary = `AI-driven exit failed: ${exitResult.error || "Unknown error"}`;
              riskResult = { passed: false, reason: actionSummary };
              console.error(`[Tick] ❌ AI-driven exit failed: ${exitResult.error}`);
            }
          } else if (aiIntent === "hold") {
            // AI explicitly chose to hold the position
            actionSummary = `Hold: keeping ${positionSide} position (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] 🤖 AI decision: hold ${positionSide} on ${market} (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`);
          } else if (aiIntent === "neutral") {
            // AI says "neutral" while in a position - treat as hold
            actionSummary = `Hold: AI neutral, keeping ${positionSide} position (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] 🤖 AI decision: neutral with ${positionSide} position on ${market} - holding (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`);
          } else if (aiIntent === positionSide) {
            // AI confirms current position direction - hold
            actionSummary = `Hold: AI confirms ${positionSide} position (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] 🤖 AI confirms ${positionSide} on ${market} - holding (P&L: ${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)`);
          }
        }
        
        // Handle "close" when no position exists - treat as "neutral"
        if (currentExitRules.mode === "signal" && !marketPosition && intent.bias === "close") {
          console.log(`[Tick] ⚠️ AI said "close" but no position exists on ${market} - treating as neutral`);
          // Don't modify intent.bias here as it's used for logging, just skip entry
          actionSummary = "AI said 'close' but no position to close";
          riskResult = { passed: false, reason: actionSummary };
        }
        
        // Handle "close" when exit mode is NOT "signal" - AI recommends exit but we're using automated exit rules
        // This prevents the confusing "stacking disabled" message when AI says "close"
        if (currentExitRules.mode !== "signal" && marketPosition && intent.bias === "close") {
          const positionSideForClose = marketPosition.side;
          const entryPriceForClose = Number(marketPosition.avg_entry);
          const posSizeForClose = Number(marketPosition.size);
          const unrealizedPnlForClose = positionSideForClose === "long" 
            ? (currentPrice - entryPriceForClose) * posSizeForClose
            : (entryPriceForClose - currentPrice) * posSizeForClose;
          const unrealizedPnlPctForClose = entryPriceForClose > 0 ? (unrealizedPnlForClose / (entryPriceForClose * posSizeForClose)) * 100 : 0;
          
          // Map exit mode to user-friendly description
          const trailingLabel = positionSideForClose === "long" ? "peak" : "trough";
          const exitModeDescription =
            currentExitRules.mode === "trailing" ? `trailing stop (${currentExitRules.trailingStopPct ?? 2}% from ${trailingLabel})` :
            currentExitRules.mode === "tp_sl" ? `TP/SL rules` :
            currentExitRules.mode === "time" ? `time-based exit` :
            currentExitRules.mode || "automated rules";
          
          console.log(`[Tick] 💡 AI recommends closing ${positionSideForClose} position (P&L: ${unrealizedPnlPctForClose >= 0 ? '+' : ''}${unrealizedPnlPctForClose.toFixed(2)}%) but exit mode is "${currentExitRules.mode}" - waiting for ${exitModeDescription} to trigger`);
          actionSummary = `AI recommends closing (P&L: ${unrealizedPnlPctForClose >= 0 ? '+' : ''}${unrealizedPnlPctForClose.toFixed(2)}%) but using ${exitModeDescription}`;
          riskResult = { passed: false, reason: actionSummary };
        }

        // STRICTLY ENFORCE ALL STRATEGY FEATURES
        const now = new Date();

        // 0. POSITION STACKING CHECK: Block entries if already in position, UNLESS stacking is allowed
        // - If allowReentrySameDirection=true: Allow adding to position in SAME direction only
        // - If allowReentrySameDirection=false: Block ALL entries when position exists
        // PRODUCTION SAFETY: This prevents uncontrolled position growth
        const allowReentrySameDirection = entryExit.tradeControl?.allowReentrySameDirection ?? false;
        
        if (marketPosition && riskResult.passed !== false) {
          const positionValue = Number(marketPosition.avg_entry) * Number(marketPosition.size);
          const desiredSide = intent.bias === "long" ? "long" : "short";
          const existingSide = marketPosition.side;
          
          if (allowReentrySameDirection && desiredSide === existingSide) {
            // Stacking allowed AND same direction - let it through (other limits like maxPositionUsd will still apply)
            console.log(`[Tick] ✅ STACKING ALLOWED: Adding to ${existingSide} position on ${market} (allowReentrySameDirection=true)`);
          } else if (allowReentrySameDirection && desiredSide !== existingSide) {
            // Stacking allowed but OPPOSITE direction - this would flip position, block it
            actionSummary = `Cannot enter ${desiredSide} while in ${existingSide} position - would flip position`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] ⛔ BLOCKED: Cannot flip from ${existingSide} to ${desiredSide} (close position first)`);
          } else {
            // Stacking NOT allowed - block any entry when position exists
            actionSummary = `Already in ${existingSide} position on ${market} ($${positionValue.toFixed(2)}) - stacking disabled`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] ⛔ BLOCKED: Already have ${existingSide} position (allowReentrySameDirection=false)`);
          }
        }

        // 1. CONFIDENCE CONTROL - Strictly enforce minimum confidence
        const confidenceControl = entryExit.confidenceControl || {};

        // PRIORITY: Use confidenceControl first (modern), guardrails second (legacy)
        // Add explicit logging to show which source is used
        const minConfidence = confidenceControl.minConfidence ?? guardrails.minConfidence ?? 0.65;

        // Log warning if both sources exist with different values
        if (confidenceControl.minConfidence !== undefined &&
            guardrails.minConfidence !== undefined &&
            confidenceControl.minConfidence !== guardrails.minConfidence) {
          console.warn(`[Tick] ⚠️ minConfidence set in both places: confidenceControl=${confidenceControl.minConfidence}, guardrails=${guardrails.minConfidence}. Using confidenceControl.`);
        }

        if (riskResult.passed !== false && confidence < minConfidence) {
          actionSummary = `Confidence ${(confidence * 100).toFixed(0)}% below minimum ${(minConfidence * 100).toFixed(0)}%`;
          riskResult = { passed: false, reason: actionSummary };
        }
        // Confidence scaling (if enabled, adjust position size based on confidence)
        // This will be applied later when calculating position size

        // 2. GUARDRAILS - Strictly enforce long/short permissions and non-entry biases
        if (riskResult.passed !== false) {
          if (intent.bias === "long" && !guardrails.allowLong) {
            actionSummary = "Long positions not allowed by strategy settings";
            riskResult = { passed: false, reason: actionSummary };
          } else if (intent.bias === "short" && !guardrails.allowShort) {
            actionSummary = "Short positions not allowed by strategy settings";
            riskResult = { passed: false, reason: actionSummary };
          } else if (intent.bias === "hold") {
            actionSummary = "AI decision: hold (no position to hold)";
            riskResult = { passed: false, reason: actionSummary };
          } else if (intent.bias === "neutral") {
            actionSummary = "AI decision: neutral (no trade)";
            riskResult = { passed: false, reason: actionSummary };
          } else if (intent.bias === "close") {
            // "close" bias means exit only, not enter - this is already handled above
            // If we reach here, either there was no position to close or exit already happened
            actionSummary = "AI decision: close (exit only, no new entry)";
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

          // Fetch last trade for this market (used by multiple checks below)
          const { data: lastTrade } = await serviceClient
            .from(tables.trades)
            .select("created_at, side, action")
            .eq("account_id", account.id)
            .eq("market", market)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // CRITICAL FIX: Filter by session_id, not just account_id.
          // Multiple sessions on the same account should have independent trade limits.
          const { count: tradesLastHour } = await serviceClient
            .from(tables.trades)
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId)
            .gte("created_at", oneHourAgo.toISOString());

          const { count: tradesLastDay } = await serviceClient
            .from(tables.trades)
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId)
            .gte("created_at", oneDayAgo.toISOString());

          const tradesLastHourCount = tradesLastHour || 0;
          const tradesLastDayCount = tradesLastDay || 0;
          const maxTradesPerHour = tradeControl.maxTradesPerHour ?? 2;
          const maxTradesPerDay = tradeControl.maxTradesPerDay ?? 10;

          // STRICT ENFORCEMENT: Block if count >= limit (not > limit)
          // This ensures limit is never exceeded, preventing user confusion
          if (tradesLastHourCount >= maxTradesPerHour) {
            actionSummary = `Trade frequency limit reached: ${tradesLastHourCount}/${maxTradesPerHour} trades in last hour`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] ⛔ Trade frequency limit: ${tradesLastHourCount} >= ${maxTradesPerHour} (hourly)`);
          } else if (tradesLastDayCount >= maxTradesPerDay) {
            actionSummary = `Trade frequency limit reached: ${tradesLastDayCount}/${maxTradesPerDay} trades in last day`;
            riskResult = { passed: false, reason: actionSummary };
            console.log(`[Tick] ⛔ Trade frequency limit: ${tradesLastDayCount} >= ${maxTradesPerDay} (daily)`);
          }

          // Check cooldown
          if (riskResult.passed !== false && lastTrade) {
            const timeSinceLastTrade = now.getTime() - new Date(lastTrade.created_at).getTime();
            const cooldownMs = (tradeControl.cooldownMinutes ?? 15) * 60 * 1000;

            if (timeSinceLastTrade < cooldownMs) {
              actionSummary = `Cooldown: ${Math.ceil((cooldownMs - timeSinceLastTrade) / 1000 / 60)} minutes remaining`;
              riskResult = { passed: false, reason: actionSummary };
            }
          }
          
          // Check min hold time for STACKING: Only applies when there's an existing position AND stacking is enabled
          // This prevents adding to position too quickly after opening (stacking during volatile initial period)
          // NOTE: Min hold time for EXITS is checked separately in the exit logic sections above
          if (riskResult.passed !== false && marketPosition && allowReentrySameDirection) {
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
                actionSummary = `Min hold time (stacking): ${Math.ceil((minHoldMs - timeSincePositionOpened) / 1000 / 60)} min remaining before adding to position`;
                riskResult = { passed: false, reason: actionSummary };
              }
            }
          }

          // NOTE: allowReentrySameDirection is about STACKING (adding to existing position)
          // This is now handled at the top of the entry logic (section 0. POSITION STACKING CHECK)
          // If there's an existing position and stacking is disabled, entry is blocked there.
          // If there's no position, the user is free to enter any direction - that's not "re-entry"
          // in the stacking sense, it's a fresh entry.
          console.log(`[Tick] 🔍 Position state: marketPosition=${!!marketPosition}, lastTrade=${!!lastTrade}, allowStacking=${tradeControl.allowReentrySameDirection}`);
          if (marketPosition) {
            console.log(`[Tick] 🔍 Existing position on ${market}: ${marketPosition.side} ${marketPosition.size}`);
          }
          if (lastTrade) {
            console.log(`[Tick] 🔍 Last trade on ${market}: ${lastTrade.action} ${lastTrade.side} at ${lastTrade.created_at}`);
          }
        }

          // AI's per-trade leverage choice (computed early to inform position sizing)
          // AI outputs leverage directly (1 to maxLeverage), cap at user's maxLeverage setting
          const aiLeverage = intent.leverage ?? 1;
          const actualLeverage = Math.max(1, Math.min(Math.round(aiLeverage), maxLeverage));

          // 4. RISK LIMITS - Strictly enforce max position size, leverage, and daily loss
          if (riskResult.passed !== false) {
            const maxPositionUsd = risk.maxPositionUsd ?? 10000;
            const maxLeverage = risk.maxLeverage ?? 2;
            const maxDailyLossPct = risk.maxDailyLossPct ?? 5;

          // Check max daily loss
          // CRITICAL FIX: Use today's starting equity (first equity point after midnight UTC),
          // not the account's lifetime starting_equity. The old code was broken for any account
          // that grew over time - the daily loss % would be meaningless.
          let dailyStartEquity = Number(account.equity); // Fallback: no loss yet today
          try {
            const todayMidnightUTC = new Date();
            todayMidnightUTC.setUTCHours(0, 0, 0, 0);
            const { data: todayFirstPoint } = await serviceClient
              .from("equity_points")
              .select("equity")
              .eq("account_id", account.id)
              .gte("t", todayMidnightUTC.toISOString())
              .order("t", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (todayFirstPoint) {
              dailyStartEquity = Number(todayFirstPoint.equity);
            } else {
              // No equity points today yet - use account's current equity (no loss today)
              dailyStartEquity = Number(account.equity);
            }
          } catch (err: any) {
            console.error("[Tick] Failed to fetch daily start equity:", err.message);
            // Fallback to lifetime starting equity (better than nothing)
            dailyStartEquity = Number(account.starting_equity);
          }

          const dailyLossPct = dailyStartEquity > 0
            ? ((dailyStartEquity - Number(account.equity)) / dailyStartEquity) * 100
            : 0;
          if (dailyLossPct >= maxDailyLossPct) {
            actionSummary = `Max daily loss limit reached: ${dailyLossPct.toFixed(2)}% >= ${maxDailyLossPct}% (today's start: $${dailyStartEquity.toFixed(2)}, current: $${Number(account.equity).toFixed(2)})`;
            riskResult = { passed: false, reason: actionSummary };
          }

          // Calculate position sizing FIRST so we can check limits properly
          // FIXED: Position sizing now respects maxLeverage setting instead of hardcoded 10% cap
          // The user's maxPositionUsd and maxLeverage settings work together:
          // - maxPositionUsd caps individual position size
          // - maxLeverage caps total portfolio exposure (checked later)
          // Coinbase INTX minimum is ~$8-15 (varies by coin)
          // Coinbase Spot minimum is $1, Hyperliquid minimum is $10
          const MIN_ORDER_USD = sessionVenue === "coinbase" ? (isIntxEnabled ? 10 : 1) : 10;
          
          // Calculate max position based on leverage allowance
          // Example: $10k equity with 2x maxLeverage = up to $20k total exposure
          // But we also need to consider existing positions
          const totalCurrentExposure = allPositions.reduce((sum, p) => {
            return sum + (Number(p.avg_entry) * Number(p.size));
          }, 0);
          // AI's leverage choice determines target exposure; maxLeverage is the hard ceiling
          const aiTargetExposure = Number(account.equity) * actualLeverage * 0.99; // AI's target
          const maxExposureAllowed = Number(account.equity) * maxLeverage * 0.99; // Hard ceiling
          const effectiveExposureCeiling = Math.min(aiTargetExposure, maxExposureAllowed);
          const remainingLeverageRoom = Math.max(0, effectiveExposureCeiling - totalCurrentExposure);
          
          // Position size is the minimum of: user's maxPositionUsd OR remaining leverage room
          let positionNotional = Math.min(maxPositionUsd, remainingLeverageRoom);

          // COINBASE SPOT: For buys, also limit by available cash (no leverage on spot)
          // Cash is the USD/USDC/USDT balance available for new buys
          // NOTE: INTX users have margin, so this cash limit doesn't apply
          if (sessionVenue === "coinbase" && !isIntxEnabled && intent.bias === "long") {
            const availableCash = Number(account.cash_balance || 0);
            const cashSafetyMargin = availableCash * 0.99; // 1% buffer for fees/rounding
            if (positionNotional > cashSafetyMargin) {
              console.log(`[Tick] 💰 Coinbase Spot: Limiting buy from $${positionNotional.toFixed(2)} to $${cashSafetyMargin.toFixed(2)} (available cash: $${availableCash.toFixed(2)})`);
              positionNotional = cashSafetyMargin;
            }
          }

          console.log(`[Tick] 📊 Position sizing: equity=$${Number(account.equity).toFixed(2)}, aiLeverage=${actualLeverage}x, maxLeverage=${maxLeverage}x, aiTarget=$${aiTargetExposure.toFixed(2)}, maxExposure=$${maxExposureAllowed.toFixed(2)}, effectiveCeiling=$${effectiveExposureCeiling.toFixed(2)}, currentExposure=$${totalCurrentExposure.toFixed(2)}, remainingRoom=$${remainingLeverageRoom.toFixed(2)}, maxPositionUsd=$${maxPositionUsd}${sessionVenue === "coinbase" ? `, cash=$${Number(account.cash_balance || 0).toFixed(2)}` : ""}, result=$${positionNotional.toFixed(2)}`);
          
          if (confidenceControl.confidenceScaling && confidence > minConfidence) {
            // Scale position size based on confidence (higher confidence = larger position, up to max)
            const confidenceMultiplier = Math.min(1.0, (confidence - minConfidence) / (1.0 - minConfidence));
            positionNotional = positionNotional * (0.5 + 0.5 * confidenceMultiplier); // Scale from 50% to 100% of max
          }
          positionNotional = Math.min(positionNotional, maxPositionUsd); // Ensure we don't exceed max
          
          // Ensure minimum order size ($1 for Coinbase, $10 for Hyperliquid)
          // But for Coinbase Spot buys, don't force minimum if insufficient cash
          // NOTE: INTX users have margin, so they don't have this cash restriction
          if (positionNotional < MIN_ORDER_USD) {
            if (sessionVenue === "coinbase" && !isIntxEnabled && intent.bias === "long") {
              const availableCash = Number(account.cash_balance || 0);
              if (availableCash < MIN_ORDER_USD) {
                actionSummary = `Insufficient cash: $${availableCash.toFixed(2)} available, minimum order is $${MIN_ORDER_USD}`;
                riskResult = { passed: false, reason: actionSummary };
                console.log(`[Tick] ⛔ BLOCKED: Not enough cash for minimum Coinbase Spot order`);
              } else {
                positionNotional = MIN_ORDER_USD;
              }
            } else {
              positionNotional = MIN_ORDER_USD;
            }
          }

          // PRODUCTION SAFETY: Check if this trade would cause total position to exceed maxPositionUsd
          // This prevents position sizing from exceeding user's configured max
          if (riskResult.passed !== false) {
            const existingPositionValue = marketPosition 
              ? Number(marketPosition.avg_entry) * Number(marketPosition.size)
              : 0;
            const totalPositionAfterTrade = existingPositionValue + positionNotional;
            
            if (totalPositionAfterTrade > maxPositionUsd) {
              // Try to reduce order size to fit within max
              const allowedAdditional = Math.max(0, maxPositionUsd - existingPositionValue);
              if (allowedAdditional < MIN_ORDER_USD) {
                actionSummary = `Position would exceed max: existing $${existingPositionValue.toFixed(2)} + new $${positionNotional.toFixed(2)} = $${totalPositionAfterTrade.toFixed(2)} > max $${maxPositionUsd}`;
                riskResult = { passed: false, reason: actionSummary };
                console.log(`[Tick] ⛔ BLOCKED: Total position would exceed maxPositionUsd`);
              } else {
                // Reduce order size to stay within max
                console.log(`[Tick] ⚠️ Reducing order size from $${positionNotional.toFixed(2)} to $${allowedAdditional.toFixed(2)} to stay within maxPositionUsd`);
                positionNotional = allowedAdditional;
              }
            }
          }

          // PRODUCTION SAFETY: Check PROJECTED leverage (after this trade), not just current
          // This prevents taking trades that would cause excessive leverage
          if (riskResult.passed !== false) {
            const totalCurrentPositionValue = allPositions.reduce((sum, p) => {
              return sum + (Number(p.avg_entry) * Number(p.size));
            }, 0);
            const projectedPositionValue = totalCurrentPositionValue + positionNotional;
            const projectedLeverage = Number(account.equity) > 0 
              ? projectedPositionValue / Number(account.equity)
              : Infinity;
            
            if (projectedLeverage >= maxLeverage) {
              // Try to reduce order size to stay within leverage limit
              const maxAllowedExposure = maxLeverage * Number(account.equity) * 0.99; // 1% safety margin
              const allowedAdditional = Math.max(0, maxAllowedExposure - totalCurrentPositionValue);
              
              if (allowedAdditional < MIN_ORDER_USD) {
                actionSummary = `Projected leverage ${projectedLeverage.toFixed(2)}x would exceed max ${maxLeverage}x (current exposure: $${totalCurrentPositionValue.toFixed(2)}, proposed: $${positionNotional.toFixed(2)})`;
                riskResult = { passed: false, reason: actionSummary };
                console.log(`[Tick] ⛔ BLOCKED: Projected leverage would exceed maxLeverage`);
              } else {
                // Reduce order size to stay within leverage limit
                console.log(`[Tick] ⚠️ Reducing order size from $${positionNotional.toFixed(2)} to $${allowedAdditional.toFixed(2)} to stay within maxLeverage`);
                positionNotional = Math.min(positionNotional, allowedAdditional);
              }
            }
          }

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
            if (riskResult.passed !== false && confirmation.requireVolatilityCondition && (confirmation.volatilityMin || confirmation.volatilityMax)) {
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
              
              const volatilitySource = indicatorsSnapshot?.atr ? "ATR" : indicatorsSnapshot?.volatility ? "StdDev" : "Price Change";
              if (confirmation.volatilityMin && currentVolatility < confirmation.volatilityMin) {
                actionSummary = `Entry confirmation: Volatility ${currentVolatility.toFixed(2)}% (${volatilitySource}) below min ${confirmation.volatilityMin}%`;
                riskResult = { passed: false, reason: actionSummary };
              } else if (confirmation.volatilityMax && currentVolatility > confirmation.volatilityMax) {
                actionSummary = `Entry confirmation: Volatility ${currentVolatility.toFixed(2)}% (${volatilitySource}) exceeds max ${confirmation.volatilityMax}%`;
                riskResult = { passed: false, reason: actionSummary };
              }
            }
          }

          // 6. ENTRY TIMING - Check maxSlippage (waitForClose is deprecated)
          if (riskResult.passed !== false) {
            const entryTiming = entryExit.entry?.timing || {};
            if (entryTiming.waitForClose) {
              console.warn("[Tick] waitForClose is deprecated and ignored.");
            }
            
            // Check maxSlippage - Calculate expected slippage and reject if too high
            // For MVP, we use a simple estimate based on typical crypto market conditions
            const estimatedSlippagePct = 0.0005; // Assume 0.05% slippage for market orders (5bps)
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
            // CRITICAL FIX: Default of 5bps (0.05%) was too tight for crypto IOC orders, causing
            // many entries to fail. Increased default to 30bps (0.3%) which balances fill rate vs cost.
            const entryTiming = entryExit.entry?.timing || {};
            const slippageBps = entryTiming.maxSlippagePct ? Math.min(entryTiming.maxSlippagePct * 100, 100) : 30; // Default 30bps, cap at 100bps (1%)

            // actualLeverage and aiLeverage already computed earlier (before position sizing)

            console.log(`[Tick] 💰 Placing order: ${side} ${market} for $${positionNotional.toFixed(2)} (confidence: ${confidence.toFixed(2)}, leverage: ${actualLeverage}x, AI requested: ${aiLeverage}x, max allowed: ${maxLeverage}x)`);

            // Execute order (real for live, virtual for virtual)
            const orderResult = await placeMarketOrder({
              sessionMode,
              venue: liveVenue,
              livePrivateKey: livePrivateKey || undefined,
              liveApiKey: liveApiKey || undefined,
              liveApiSecret: liveApiSecret || undefined,
              account_id: account.id,
              strategy_id: strategy.id,
              session_id: sessionId,
              market,
              side,
              notionalUsd: positionNotional,
              slippageBps: slippageBps,
              feeBps: 5, // 0.05% fee
              isExit: false,
              leverage: actualLeverage, // AI decides leverage (scaled by maxLeverage cap)
            });

            if (orderResult.success) {
              executed = true;
              actionSummary = `Opened ${intent.bias}: $${positionNotional.toFixed(2)} at $${currentPrice.toFixed(2)}`;
              riskResult = { passed: true, executed: true };
              const tradeId = (orderResult as any).trade_id || orderResult.trade?.order_id || 'N/A';
              const realizedPnl = (orderResult as any).realized_pnl || 0;
              console.log(`[Tick] ✅ Order executed successfully. Trade ID: ${tradeId}, Realized PnL: ${realizedPnl}`);
            } else {
              actionSummary = `Order failed: ${orderResult.error || "Unknown error"}`;
              riskResult = { passed: false, reason: actionSummary };
              console.error(`[Tick] ❌ Order execution failed:`, orderResult.error);
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

      if (intent?.bias && intent.bias !== "neutral" && intent.bias !== "hold" && !riskResult.passed) {
        const risk = filters.risk || {};

        // Use strategy settings WITHOUT hardcoded defaults - validate they exist
        const maxPositionUsd = risk.maxPositionUsd;
        const maxLeverageForProposed = risk.maxLeverage;

        // Validate risk limits are properly configured
        if (!maxPositionUsd || maxPositionUsd <= 0) {
          console.error(`[Tick] ❌ Strategy has invalid maxPositionUsd: ${maxPositionUsd}. Cannot size position. Failing risk check.`);
          riskResult = {
            passed: false,
            failedChecks: [{
              check: "risk_configuration",
              reason: "Strategy missing valid Max Position (USD) in risk settings"
            }]
          };
          proposedOrder.notionalUsd = 0;
        } else if (!maxLeverageForProposed || maxLeverageForProposed <= 0) {
          console.error(`[Tick] ❌ Strategy has invalid maxLeverage: ${maxLeverageForProposed}. Cannot size position. Failing risk check.`);
          riskResult = {
            passed: false,
            failedChecks: [{
              check: "risk_configuration",
              reason: "Strategy missing valid Max Leverage in risk settings"
            }]
          };
          proposedOrder.notionalUsd = 0;
        } else {
          // Risk limits are valid - proceed with position sizing
          const maxExposureForProposed = Number(account.equity) * maxLeverageForProposed * 0.99;
          const currentExposureForProposed = allPositions.reduce((sum, p) => sum + (Number(p.avg_entry) * Number(p.size)), 0);
          const remainingRoomForProposed = Math.max(0, maxExposureForProposed - currentExposureForProposed);
          proposedOrder.notionalUsd = Math.min(maxPositionUsd, remainingRoomForProposed);
        }
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
      console.log(`[Tick] ✅ ${market}: ${intent?.bias || 'neutral'} (confidence: ${confidence.toFixed(2)}) — ${actionSummary} [${marketEndTime - marketStartTime}ms]`);
    }
    
    const tickEndTime = Date.now();
    console.log(`[Tick] ✅ Completed all ${marketsToProcess.length} markets in ${tickEndTime - tickStartTime}ms`);

    // CRITICAL FIX: Calculate equity from fresh data instead of trusting stale database value
    // The database equity might be stale if markToMarket hasn't run yet or failed
    // So we recalculate equity here using the same formula: cash + sum(unrealizedPnl)
    // IMPORTANT: Reuse pricesByMarket from earlier in the tick (line 398) to avoid fetching prices twice
    // Fetching prices twice can cause equity oscillations if prices change between the two fetches
    // CRITICAL: Use correct position function based on mode
    const allPositionsNow = sessionMode === "live"
      ? await getLivePositions(account.id)
      : await getPositions(account.id);
    
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
    const dbEquity = freshAccount?.equity || 0;
    
    // For LIVE mode, use the equity synced from Hyperliquid (source of truth)
    // For VIRTUAL/ARENA mode, calculate from cash + unrealized PnL
    const calculatedEquity = sessionMode === "live" 
      ? dbEquity  // Live: Use synced value from Hyperliquid
      : freshCash + totalUnrealizedPnlNow;  // Virtual: Calculate from cash + unrealized
    
    console.log(`[Tick] 💰 Equity snapshot (${sessionMode}): ${sessionMode === 'live' ? `DB equity=${dbEquity.toFixed(2)}` : `cash=${freshCash.toFixed(2)} + unrealizedPnl=${totalUnrealizedPnlNow.toFixed(2)}`} = ${calculatedEquity.toFixed(2)}`);

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
      error: "Internal server error",
    }, { status: 500 });
  }
}
