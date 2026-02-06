import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveStrategyApiKey } from "@/lib/ai/resolveApiKey";
import { openAICompatibleIntentCall, normalizeBaseUrl } from "@/lib/ai/openaiCompatible";

// Provider to base URL mapping (same as in strategies route)
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const strategyId = formData.get("strategy_id") as string;
    const userIdFromClient = formData.get("user_id") as string;

    if (!strategyId) {
      return NextResponse.json({ error: "Strategy ID required" }, { status: 400 });
    }

    if (!userIdFromClient) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Use service role client to verify strategy ownership (bypasses RLS)
    const serviceClient = createServiceRoleClient();
    const { data: strategy, error: strategyError } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", userIdFromClient)
      .single();

    if (strategyError || !strategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Resolve and decrypt API key (checks saved key first, then fallback to strategy's own key)
    let apiKey: string;
    try {
      apiKey = await resolveStrategyApiKey(strategy);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to resolve API key: ${error.message}` },
        { status: 500 }
      );
    }

    // Get base URL for the provider
    const baseUrl = PROVIDER_BASE_URLS[strategy.model_provider] || "";
    if (!baseUrl) {
      return NextResponse.json(
        { error: `Unknown provider: ${strategy.model_provider}. Cannot determine API base URL.` },
        { status: 400 }
      );
    }

    // Call the AI model with the trading prompt
    let aiDecision;
    let tokenUsage;
    let modelUsed;
    try {
      const aiResponse = await openAICompatibleIntentCall({
        baseUrl: normalizeBaseUrl(baseUrl),
        apiKey,
        model: strategy.model_name,
        prompt: strategy.prompt,
        provider: strategy.model_provider, // Pass provider for API format selection
        context: {
          market: "BTC/USD",
          marketData: {
            price: 45000,
            volume: 1000000,
            timestamp: new Date().toISOString(),
          },
          positions: [],
        },
      });
      aiDecision = aiResponse.intent;
      tokenUsage = aiResponse.usage;
      modelUsed = aiResponse.model;
    } catch (error: any) {
      return NextResponse.json(
        { error: `AI model call failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Generate equity curve based on AI decision and prompt
    const equityCurve = generateEquityCurve(strategyId, strategy.prompt, aiDecision);
    const metrics = calculateMetrics(equityCurve, strategyId);

    // Use service role client to insert (bypasses RLS) - reuse the same client
    const { data: run, error: insertError } = await serviceClient
      .from("paper_runs")
      .insert({
        user_id: userIdFromClient,
        strategy_id: strategyId,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        metrics,
        equity_curve: equityCurve,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ run_id: run.id }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateEquityCurve(
  strategyId: string,
  prompt: string,
  aiDecision?: { bias: string; confidence: number; reasoning?: string }
): Array<{ t: number; equity: number }> {
  // Create deterministic seed from strategy ID, prompt, and AI decision
  let seed = 0;
  const combined = strategyId + prompt + (aiDecision?.bias || "") + (aiDecision?.confidence || 0);
  for (let i = 0; i < combined.length; i++) {
    seed = (seed << 5) - seed + combined.charCodeAt(i);
    seed = seed & seed;
  }
  seed = Math.abs(seed);

  const points: Array<{ t: number; equity: number }> = [];
  let equity = 1.0;

  // Simple pseudo-random generator
  let rng = seed;
  const random = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };

  // Use AI decision to bias the equity curve
  // If AI is bullish (long) with high confidence, trend upward
  // If AI is bearish (short) with high confidence, trend downward
  // If neutral, stay flat with small variations
  const bias = aiDecision?.bias || "neutral";
  const confidence = aiDecision?.confidence || 0.5;
  const biasMultiplier = bias === "long" ? 1 : bias === "short" ? -1 : 0;

  for (let t = 0; t < 100; t++) {
    // Base return based on AI decision
    const baseReturn = (random() * 0.03 - 0.015) * (1 + confidence * biasMultiplier);
    equity = equity * (1 + baseReturn);
    points.push({ t, equity });
  }

  return points;
}

function calculateMetrics(
  equityCurve: Array<{ t: number; equity: number }>,
  strategyId: string
) {
  const firstEquity = equityCurve[0].equity;
  const lastEquity = equityCurve[equityCurve.length - 1].equity;
  const totalReturn = (lastEquity - firstEquity) / firstEquity;

  // Calculate max drawdown
  let peak = firstEquity;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    const drawdown = (peak - point.equity) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Generate deterministic trade count
  let seed = 0;
  for (let i = 0; i < strategyId.length; i++) {
    seed = (seed << 5) - seed + strategyId.charCodeAt(i);
    seed = seed & seed;
  }
  const trades = 5 + (Math.abs(seed) % 26); // 5-30 trades

  return {
    total_return: totalReturn,
    max_drawdown: maxDrawdown,
    trades,
  };
}
