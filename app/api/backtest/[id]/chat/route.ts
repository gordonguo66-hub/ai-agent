import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildAnalysisContext } from "@/lib/backtest/buildAnalysisContext";
import { getPlatformApiKey, getPlatformProviderBaseUrl } from "@/lib/ai/platformApiKey";
import { normalizeModelName } from "@/lib/ai/normalizeModel";
import { calculateCost, calculateChargedCents, getMarkupForTier } from "@/lib/pricing/apiCosts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache analysis context per backtest to avoid re-fetching candles on every message
const contextCache = new Map<string, { context: any; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backtestId = params.id;
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Build or retrieve cached context
    let analysisContext;
    const cached = contextCache.get(backtestId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      analysisContext = cached.context;
    } else {
      analysisContext = await buildAnalysisContext(backtestId, user.id);
      contextCache.set(backtestId, { context: analysisContext, timestamp: Date.now() });
    }

    // Load chat history
    const { data: history } = await supabase
      .from("backtest_chat_messages")
      .select("role, content")
      .eq("backtest_id", backtestId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build messages array for AI
    const messages: { role: string; content: string }[] = [
      { role: "system", content: analysisContext.systemPrompt },
    ];

    // Add chat history
    for (const msg of (history || [])) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current user message
    messages.push({ role: "user", content: message.trim() });

    // Get API key and base URL
    const provider = analysisContext.modelProvider;
    const apiKey = getPlatformApiKey(provider);
    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${provider}` },
        { status: 500 }
      );
    }

    const baseUrl = getPlatformProviderBaseUrl(provider);
    const normalizedModel = normalizeModelName(provider, analysisContext.model);

    // Check user balance
    const { data: userSub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .single();

    const tier = (userSub?.status === "active" && userSub?.plan_id) ? userSub.plan_id : "on_demand";

    const { data: balance } = await supabase
      .from("user_balance")
      .select("balance_cents, subscription_budget_cents")
      .eq("user_id", user.id)
      .single();

    const available = (balance?.balance_cents || 0) + (balance?.subscription_budget_cents || 0);
    if (available <= 0) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
    }

    // Make AI call
    let aiResponse: { content: string; inputTokens: number; outputTokens: number };

    if (provider === "anthropic") {
      // Anthropic uses a different API format
      const res = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: normalizedModel,
          max_tokens: 2000,
          system: analysisContext.systemPrompt,
          messages: messages.filter(m => m.role !== "system").map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("[BacktestChat] Anthropic error:", err);
        return NextResponse.json({ error: "AI call failed" }, { status: 500 });
      }

      const data = await res.json();
      aiResponse = {
        content: data.content?.[0]?.text || "",
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      };
    } else {
      // OpenAI-compatible format (OpenAI, xAI, DeepSeek, Google, Qwen)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: normalizedModel,
          messages,
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("[BacktestChat] AI error:", err);
        return NextResponse.json({ error: "AI call failed" }, { status: 500 });
      }

      const data = await res.json();
      aiResponse = {
        content: data.choices?.[0]?.message?.content || "",
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };
    }

    // Bill the user
    const actualCostUsd = calculateCost(normalizedModel, aiResponse.inputTokens, aiResponse.outputTokens);
    const ondemandMarkup = getMarkupForTier("on_demand");
    const subscriptionMarkup = getMarkupForTier(tier);
    const ondemandChargeCents = Math.max(1, Math.round(actualCostUsd * (1 + ondemandMarkup) * 100));
    const subscriptionChargeCents = Math.max(1, Math.round(actualCostUsd * (1 + subscriptionMarkup) * 100));
    const effectiveSubMarkup = ondemandChargeCents > 0 ? (subscriptionChargeCents / ondemandChargeCents) - 1 : 0;

    const { data: deductResult } = await supabase.rpc("decrement_user_balance_v2", {
      p_user_id: user.id,
      p_base_cost_cents: ondemandChargeCents,
      p_ondemand_markup: 0,
      p_subscription_markup: effectiveSubMarkup,
      p_description: `Backtest analysis chat (${normalizedModel})`,
      p_metadata: {
        backtest_id: backtestId,
        model: normalizedModel,
        input_tokens: aiResponse.inputTokens,
        output_tokens: aiResponse.outputTokens,
      },
    });

    const costCents = deductResult?.amount_deducted_cents || ondemandChargeCents;

    // Save messages to DB
    await supabase.from("backtest_chat_messages").insert([
      {
        backtest_id: backtestId,
        user_id: user.id,
        role: "user",
        content: message.trim(),
        tokens_used: 0,
        cost_cents: 0,
      },
      {
        backtest_id: backtestId,
        user_id: user.id,
        role: "assistant",
        content: aiResponse.content,
        tokens_used: aiResponse.inputTokens + aiResponse.outputTokens,
        cost_cents: costCents,
      },
    ]);

    return NextResponse.json({
      message: aiResponse.content,
      usage: {
        inputTokens: aiResponse.inputTokens,
        outputTokens: aiResponse.outputTokens,
        costCents,
      },
    });
  } catch (err: any) {
    console.error("[BacktestChat] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — Load chat history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: messages } = await supabase
      .from("backtest_chat_messages")
      .select("id, role, content, tokens_used, cost_cents, created_at")
      .eq("backtest_id", params.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ messages: messages || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
