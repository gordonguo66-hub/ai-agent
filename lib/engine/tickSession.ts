/**
 * Unified Engine Tick (VIRTUAL + LIVE)
 *
 * Identical strategy logic, only broker differs:
 * - VIRTUAL: real market data, simulated execution, $100k sim account
 * - LIVE: real Hyperliquid execution (server-only)
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { intentToOrder } from "@/lib/engine/intentToOrder";
import { runRiskChecks, StrategyFilters } from "@/lib/engine/risk";
import { Broker, BrokerContext, MarketData, SessionMode } from "@/lib/engine/types";
// Note: VirtualBroker is not exported as a class from virtualBroker.ts
// This file may be unused - the tick endpoint uses functions directly
import { HyperliquidBroker } from "@/lib/brokers/hyperliquidBroker";
import { realModelCall } from "@/lib/ai/realModelCall";
import { decryptCredential } from "@/lib/crypto/credentials";

type SessionRow = {
  id: string;
  user_id: string;
  strategy_id: string;
  mode: SessionMode;
  status: "running" | "stopped";
  market: string;
  cadence_seconds: number;
  sim_account_id: string | null;
};

type StrategyRow = {
  id: string;
  user_id: string;
  model_provider: string;
  model_name: string;
  prompt: string;
  filters: StrategyFilters;
  ai_connection_id?: string | null;
};

export async function tickSession(sessionId: string): Promise<{
  success: boolean;
  decisionId?: string;
  orderId?: string;
  error?: string;
}> {
  const service = createServiceRoleClient();

  // 1) Load session + strategy
  const { data: session, error: sessionErr } = await service
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) return { success: false, error: "Session not found" };
  const s = session as unknown as SessionRow;

  // Kill switch: only tick when running
  if (s.status !== "running") return { success: false, error: `Session is ${s.status} (kill switch)` };

  const { data: strategy, error: stratErr } = await service
    .from("strategies")
    .select("*")
    .eq("id", s.strategy_id)
    .single();
  if (stratErr || !strategy) return { success: false, error: "Strategy not found" };
  const st = strategy as unknown as StrategyRow;

  // Load AI connection (required)
  const aiConnId = st.ai_connection_id;
  if (!aiConnId) {
    return { success: false, error: "No AI connection linked to strategy. Go to Settings → AI and link one." };
  }
  const { data: aiConn, error: aiErr } = await service
    .from("ai_connections")
    .select("id, provider, base_url, default_model, api_key_encrypted")
    .eq("id", aiConnId)
    .single();
  if (aiErr || !aiConn) return { success: false, error: "AI connection not found" };
  if ((aiConn as any).provider !== st.model_provider) {
    return { success: false, error: "AI connection provider does not match strategy provider" };
  }
  const apiKey = decryptCredential((aiConn as any).api_key_encrypted);

  // 2) Fetch market data from Hyperliquid public endpoints (server-side)
  const [ob, mark] = await Promise.all([
    hyperliquidClient.getOrderbookTop(s.market),
    hyperliquidClient.getMarkPrice(s.market),
  ]);
  const marketData: MarketData = {
    market: s.market,
    bid: ob.bid,
    ask: ob.ask,
    mid: ob.mid,
    mark: mark.price,
    timestamp: Date.now(),
  };

  const broker = getBrokerForSession(s);
  const ctx: BrokerContext = {
    userId: s.user_id,
    sessionId: s.id,
    mode: s.mode,
    marketData,
  };

  // 3) Load account state (mode-specific) for risk checks
  const account = await broker.getAccountState(ctx);

  // 4) Generate structured AI intent (REAL model call)
  let positions: any = {};
  if (s.mode === "virtual" && s.sim_account_id) {
    const { data: simPos, error: simErr } = await service
      .from("sim_positions")
      .select("*")
      .eq("account_id", s.sim_account_id);
    if (simErr) return { success: false, error: simErr.message };
    positions = { sim_positions: simPos || [] };
  } else {
    const { data: exConn } = await service
      .from("exchange_connections")
      .select("wallet_address")
      .eq("user_id", s.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!exConn?.wallet_address) {
      return { success: false, error: "No exchange connection found for live session" };
    }
    positions = await hyperliquidClient.getAccountState(exConn.wallet_address);
  }

  const intentResult = await realModelCall({
    provider: st.model_provider,
    baseUrl: (aiConn as any).base_url,
    apiKey,
    model: st.model_name || (aiConn as any).default_model || "deepseek-chat",
    prompt: st.prompt,
    context: {
      market: s.market,
      marketData,
      positions,
    },
  });
  const intent = intentResult.intent;

  // 5) Proposed order (shared logic)
  const clientOrderIdBase = `sess-${s.id}`;
  const proposed = intentToOrder({
    intent,
    market: s.market,
    midPrice: marketData.mid,
    filters: st.filters || {},
    clientOrderId: clientOrderIdBase, // final id uses decision id below
  });

  // 6) Risk checks (shared)
  let startingBalanceUsd: number | undefined;
  if (s.mode === "virtual" && s.sim_account_id) {
    const { data: acct } = await service
      .from("sim_accounts")
      .select("starting_balance")
      .eq("id", s.sim_account_id)
      .single();
    startingBalanceUsd = acct ? Number(acct.starting_balance) : undefined;
  }

  const risk = runRiskChecks({
    proposed: { ...proposed, clientOrderId: "tmp" },
    account,
    filters: st.filters || {},
    midPrice: marketData.mid,
    startingBalanceUsd,
  });

  // 7) Write decision
  const { data: decision, error: decErr } = await service
    .from("decisions")
    .insert({
      session_id: s.id,
      intent,
      risk_result: risk,
      proposed_order: proposed,
      executed: false,
      error: risk.passed ? null : (risk.reason || "Risk failed"),
    })
    .select()
    .single();
  if (decErr || !decision) return { success: false, error: decErr?.message || "Failed to insert decision" };

  const decisionId = decision.id as string;
  const clientOrderId = `${clientOrderIdBase}-dec-${decisionId}`;

  // Idempotency: if an order already exists for this decision, don't place again.
  const { data: existingOrder } = await service
    .from("orders")
    .select("id, status")
    .eq("decision_id", decisionId)
    .maybeSingle();
  if (existingOrder) {
    await service.from("sessions").update({ last_tick_at: new Date().toISOString() }).eq("id", s.id);
    return { success: true, decisionId, orderId: existingOrder.id };
  }

  const willExecute = risk.passed && proposed.size > 0;

  // Virtual needs per-tick revaluation even if no order.
  if (!willExecute && broker.onTick) await broker.onTick(ctx);

  // 8) Execute (or skip) via broker.placeOrder()
  const exec = willExecute
    ? await broker.placeOrder(ctx, { ...proposed, clientOrderId })
    : { status: "skipped" as const, venueResponse: { reason: risk.reason || "Skipped" } };

  const { data: orderRow, error: orderErr } = await service
    .from("orders")
    .insert({
      session_id: s.id,
      decision_id: decisionId,
      mode: s.mode,
      client_order_id: clientOrderId,
      market: proposed.market,
      side: proposed.side,
      size: proposed.size,
      status: exec.status === "sent" ? "sent" : exec.status === "filled" ? "filled" : exec.status === "failed" ? "failed" : "skipped",
      venue_response: exec.venueResponse,
    })
    .select()
    .single();

  if (orderErr || !orderRow) return { success: false, decisionId, error: orderErr?.message || "Failed to insert order" };

  // 9) Mark decision executed if appropriate, update session timestamp
  if (exec.status === "sent" || exec.status === "filled") {
    await service.from("decisions").update({ executed: true }).eq("id", decisionId);
  }

  await service.from("sessions").update({ last_tick_at: new Date().toISOString() }).eq("id", s.id);

  return { success: true, decisionId, orderId: orderRow.id };
}

function getBrokerForSession(s: SessionRow): Broker {
  if (s.mode === "virtual") {
    if (!s.sim_account_id) throw new Error("Virtual session missing sim_account_id");
    // VirtualBroker class doesn't exist - this file may be unused
    // The actual tick logic is in app/api/sessions/[id]/tick/route.ts
    throw new Error("VirtualBroker class not available - use tick endpoint directly");
  }
  return new HyperliquidBroker();
}

