/**
 * Session Runner - Executes one tick of a trading session
 * 
 * This performs:
 * 1. Fetch market data + account state from Hyperliquid
 * 2. Generate AI intent
 * 3. Convert intent to proposed order
 * 4. Run risk checks
 * 5. Write decision
 * 6. Execute order (dry: skip, live: place)
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { stubModelCall } from "@/lib/ai/stubModelCall";
import { Intent } from "@/lib/ai/intentSchema";

interface Strategy {
  id: string;
  user_id: string;
  name: string;
  model_provider: string;
  model_name: string;
  api_key_ciphertext: string;
  prompt: string;
  filters: {
    max_position_usd?: number;
    max_leverage?: number;
    max_daily_loss_pct?: number;
  };
}

interface ExchangeConnection {
  id: string;
  user_id: string;
  wallet_address: string;
  key_material_encrypted: string;
}

interface TradeSession {
  id: string;
  user_id: string;
  strategy_id: string;
  exchange_connection_id: string;
  mode: "dry" | "live";
  status: "running" | "stopped";
  market: string;
  cadence_seconds: number;
}

interface RiskResult {
  passed: boolean;
  reason?: string;
  checks: {
    max_position?: { passed: boolean; reason?: string };
    max_leverage?: { passed: boolean; reason?: string };
    max_daily_loss?: { passed: boolean; reason?: string };
  };
}

interface ProposedOrder {
  market: string;
  side: "buy" | "sell";
  size: number;
  reason: string;
}

const MAX_ORDER_SIZE_USD_DEFAULT = 100; // Safety default

export async function tickSession(sessionId: string): Promise<{
  success: boolean;
  decisionId?: string;
  orderId?: string;
  error?: string;
}> {
  const serviceClient = createServiceRoleClient();

  try {
    // 1. Load session + strategy + exchange_connection
    const { data: session, error: sessionError } = await serviceClient
      .from("trade_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: "Session not found" };
    }

    const sessionData = session as unknown as TradeSession;

    // Safety check: only run if status is "running" (kill switch)
    if (sessionData.status !== "running") {
      return { success: false, error: `Session is ${sessionData.status}, not running. Kill switch active.` };
    }

    // Load strategy
    const { data: strategy, error: strategyError } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", sessionData.strategy_id)
      .single();

    if (strategyError || !strategy) {
      return { success: false, error: "Strategy not found" };
    }

    const strategyData = strategy as unknown as Strategy;

    // Load exchange connection
    const { data: connection, error: connectionError } = await serviceClient
      .from("exchange_connections")
      .select("*")
      .eq("id", sessionData.exchange_connection_id)
      .single();

    if (connectionError || !connection) {
      return { success: false, error: "Exchange connection not found" };
    }

    const connectionData = connection as unknown as ExchangeConnection;

    // Verify ownership
    if (sessionData.user_id !== strategyData.user_id || sessionData.user_id !== connectionData.user_id) {
      return { success: false, error: "Ownership mismatch" };
    }

    // 2. Fetch market data + account state from Hyperliquid
    const [marketPrice, orderbook, accountState] = await Promise.all([
      hyperliquidClient.getMarkPrice(sessionData.market),
      hyperliquidClient.getOrderbookTop(sessionData.market),
      hyperliquidClient.getAccountState(connectionData.wallet_address),
    ]);

    const marketSnapshot = {
      markPrice: marketPrice.price,
      bid: orderbook.bid,
      ask: orderbook.ask,
      mid: orderbook.mid,
      timestamp: marketPrice.timestamp,
    };

    const positionsSnapshot = {
      positions: accountState.positions,
      marginSummary: accountState.marginSummary,
      timestamp: Date.now(),
    };

    // 3. Generate AI intent
    // TODO: Replace with real LLM call when ready
    const intent = await stubModelCall(
      strategyData.prompt,
      strategyData.model_provider,
      strategyData.model_name
    );

    // Map intent market to session market (intent might say "BTC/USD", session uses "BTC-PERP")
    // For MVP, assume they match or use session market
    const targetMarket = sessionData.market;

    // 4. Convert intent → proposed market order
    const proposedOrder = intentToProposedOrder(intent, targetMarket, marketSnapshot.mid);

    // 5. Run risk checks
    const riskResult = runRiskChecks(
      proposedOrder,
      accountState,
      strategyData.filters,
      marketSnapshot.mid
    );

    // 6. Write decision
    const { data: decision, error: decisionError } = await serviceClient
      .from("decisions")
      .insert({
        session_id: sessionId,
        market_snapshot: marketSnapshot,
        positions_snapshot: positionsSnapshot,
        intent: intent,
        risk_result: riskResult,
        proposed_orders: [proposedOrder],
        executed: false,
        error: riskResult.passed ? null : riskResult.reason,
      })
      .select()
      .single();

    if (decisionError || !decision) {
      return { success: false, error: `Failed to create decision: ${decisionError?.message}` };
    }

    let orderId: string | undefined;

    // 7. Execute order based on mode
    if (sessionData.mode === "dry") {
      // Dry mode: write order with status='skipped'
      const { data: order, error: orderError } = await serviceClient
        .from("orders")
        .insert({
          session_id: sessionId,
          decision_id: decision.id,
          mode: "dry",
          client_order_id: `dry-${decision.id}`,
          market: proposedOrder.market,
          side: proposedOrder.side,
          size: proposedOrder.size,
          status: "skipped",
          venue_response: {},
        })
        .select()
        .single();

      if (!orderError && order) {
        orderId = order.id;
      }
    } else if (sessionData.mode === "live") {
      // CRITICAL SAFETY: Double-check session is still running before placing order
      const { data: sessionCheck } = await serviceClient
        .from("trade_sessions")
        .select("status")
        .eq("id", sessionId)
        .single();
      
      if (sessionCheck?.status !== "running") {
        // Kill switch activated - do not place order
        const { data: skippedOrder } = await serviceClient
          .from("orders")
          .insert({
            session_id: sessionId,
            decision_id: decision.id,
            mode: "live",
            client_order_id: `live-${decision.id}-killed`,
            market: proposedOrder.market,
            side: proposedOrder.side,
            size: proposedOrder.size,
            status: "skipped",
            venue_response: { reason: "Session stopped before order placement (kill switch)" },
          })
          .select()
          .single();

        return {
          success: false,
          decisionId: decision.id,
          orderId: skippedOrder?.id,
          error: "Session stopped before order placement (kill switch)",
        };
      }

      // Live mode: place order if risk checks passed
      if (!riskResult.passed) {
        // Risk check failed - write order as skipped
        const { data: order, error: orderError } = await serviceClient
          .from("orders")
          .insert({
            session_id: sessionId,
            decision_id: decision.id,
            mode: "live",
            client_order_id: `live-${decision.id}`,
            market: proposedOrder.market,
            side: proposedOrder.side,
            size: proposedOrder.size,
            status: "skipped",
            venue_response: { reason: riskResult.reason || "Risk check failed" },
          })
          .select()
          .single();

        if (!orderError && order) {
          orderId = order.id;
        }
      } else {
        // Risk check passed - place real order
        try {
          // Decrypt key material (for MVP, assume plaintext)
          const privateKey = connectionData.key_material_encrypted; // TODO: decrypt

          // Safety: enforce max order size (mandatory cap)
          const maxOrderSize = strategyData.filters.max_position_usd || MAX_ORDER_SIZE_USD_DEFAULT;
          const orderSizeUsd = proposedOrder.size * marketSnapshot.mid;
          if (orderSizeUsd > maxOrderSize) {
            throw new Error(`Order size ${orderSizeUsd.toFixed(2)} USD exceeds max ${maxOrderSize} USD`);
          }

          // Safety: ensure only one order per tick (idempotency check)
          const { data: existingOrder } = await serviceClient
            .from("orders")
            .select("id")
            .eq("decision_id", decision.id)
            .single();

          if (existingOrder) {
            throw new Error("Order already exists for this decision (idempotency check)");
          }

          // Place order
          const orderResponse = await hyperliquidClient.placeMarketOrder(
            connectionData.wallet_address,
            privateKey,
            proposedOrder.market,
            proposedOrder.side,
            proposedOrder.size
          );

          // Write order with status='sent' or 'failed'
          const orderStatus = orderResponse.status === "ok" ? "sent" : "failed";
          const { data: order, error: orderError } = await serviceClient
            .from("orders")
            .insert({
              session_id: sessionId,
              decision_id: decision.id,
              mode: "live",
              client_order_id: `live-${decision.id}-${Date.now()}`,
              market: proposedOrder.market,
              side: proposedOrder.side,
              size: proposedOrder.size,
              status: orderStatus,
              venue_response: orderResponse,
            })
            .select()
            .single();

          if (!orderError && order) {
            orderId = order.id;
            // Update decision.executed if order was sent
            if (orderStatus === "sent") {
              await serviceClient
                .from("decisions")
                .update({ executed: true })
                .eq("id", decision.id);
            }
          }
        } catch (orderError: any) {
          // Order placement failed - write order as failed
          const { data: order, error: insertError } = await serviceClient
            .from("orders")
            .insert({
              session_id: sessionId,
              decision_id: decision.id,
              mode: "live",
              client_order_id: `live-${decision.id}-${Date.now()}`,
              market: proposedOrder.market,
              side: proposedOrder.side,
              size: proposedOrder.size,
              status: "failed",
              venue_response: { error: orderError.message },
            })
            .select()
            .single();

          if (!insertError && order) {
            orderId = order.id;
          }

          return {
            success: false,
            decisionId: decision.id,
            orderId,
            error: `Order placement failed: ${orderError.message}`,
          };
        }
      }
    }

    // 8. Update session.last_tick_at
    await serviceClient
      .from("trade_sessions")
      .update({ last_tick_at: new Date().toISOString() })
      .eq("id", sessionId);

    return {
      success: true,
      decisionId: decision.id,
      orderId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error in tickSession",
    };
  }
}

/**
 * Convert AI intent to proposed market order
 */
function intentToProposedOrder(
  intent: Intent,
  market: string,
  currentPrice: number
): ProposedOrder {
  // If neutral, don't place order
  if (intent.bias === "neutral") {
    return {
      market,
      side: "buy", // placeholder
      size: 0,
      reason: "AI intent is neutral - no action",
    };
  }

  // Calculate position size based on risk
  // For MVP: use a simple size calculation
  // risk is 0-1, so we'll use it as a percentage of a base size
  const baseSize = 0.001; // 0.001 BTC base
  const size = baseSize * intent.risk * intent.confidence;

  return {
    market,
    side: intent.bias === "long" ? "buy" : "sell",
    size,
    reason: intent.reasoning || `AI decision: ${intent.bias} with ${(intent.confidence * 100).toFixed(1)}% confidence`,
  };
}

/**
 * Run risk checks on proposed order
 */
function runRiskChecks(
  proposedOrder: ProposedOrder,
  accountState: any,
  filters: Strategy["filters"],
  currentPrice: number
): RiskResult {
  const checks: RiskResult["checks"] = {};
  let passed = true;
  let reason: string | undefined;

  // Check 1: Max position USD
  if (filters.max_position_usd) {
    const orderSizeUsd = proposedOrder.size * currentPrice;
    const maxPosition = filters.max_position_usd;
    
    if (orderSizeUsd > maxPosition) {
      checks.max_position = {
        passed: false,
        reason: `Order size ${orderSizeUsd.toFixed(2)} USD exceeds max ${maxPosition} USD`,
      };
      passed = false;
      reason = checks.max_position.reason;
    } else {
      checks.max_position = { passed: true };
    }
  }

  // Check 2: Max leverage
  if (filters.max_leverage && accountState.marginSummary) {
    // Calculate current leverage from positions
    const totalNtlPos = parseFloat(accountState.marginSummary.totalNtlPos || "0");
    const accountValue = parseFloat(accountState.marginSummary.accountValue || "1");
    const currentLeverage = Math.abs(totalNtlPos / accountValue);

    if (currentLeverage >= filters.max_leverage) {
      checks.max_leverage = {
        passed: false,
        reason: `Current leverage ${currentLeverage.toFixed(2)}x exceeds max ${filters.max_leverage}x`,
      };
      passed = false;
      reason = checks.max_leverage.reason;
    } else {
      checks.max_leverage = { passed: true };
    }
  }

  // Check 3: Max daily loss (simplified - check account value change)
  // For MVP, we'll skip this or implement a simple check
  // TODO: Track daily PnL properly
  if (filters.max_daily_loss_pct) {
    checks.max_daily_loss = { passed: true }; // Placeholder
  }

  return {
    passed,
    reason,
    checks,
  };
}
