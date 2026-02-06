import { Intent } from "@/lib/ai/intentSchema";

/**
 * Response interface that includes both the Intent and token usage information
 */
export interface IntentWithUsage {
  intent: Intent;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string; // Actual model used for the call
}

export function normalizeBaseUrl(baseUrl: string) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Missing base_url");
  return trimmed;
}

export async function validateOpenAICompatibleKey(args: {
  baseUrl: string;
  apiKey: string;
}): Promise<void> {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const res = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
    },
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Key validation failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

export async function openAICompatibleIntentCall(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  context: {
    market: string;
    marketData: any;
    positions: any;
    currentMarketPosition?: {
      side: string;
      size: number;
      avg_entry?: number;
      unrealized_pnl?: number;
    } | null;
    indicators?: {
      rsi?: { value: number; period: number };
      atr?: { value: number; period: number };
      volatility?: { value: number; window: number };
      ema?: {
        fast?: { value: number; period: number };
        slow?: { value: number; period: number };
      };
    };
    recentDecisions?: {
      timestamp: string;
      bias: string;
      confidence: number;
      reasoning?: string;
      actionSummary: string;
    }[];
    recentTrades?: {
      timestamp: string;
      market: string;
      side: string;
      action: string;
      price: number;
      size: number;
      realizedPnl: number | null;
    }[];
  };
  provider?: string; // Optional provider hint for API format selection
}): Promise<IntentWithUsage> {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const model = args.model?.trim();
  if (!model) throw new Error("Missing model");

  const system = [
    "You are a trading decision engine that manages both entries AND exits.",
    "",
    "Return ONLY valid JSON (no markdown) matching this interface:",
    "{ market: string, bias: 'long'|'short'|'hold'|'neutral'|'close', confidence: number (0..1), entry_zone:{lower:number, upper:number}, stop_loss:number, take_profit:number, risk:number (0..1), leverage:number (0.1..1), reasoning:string }",
    "",
    "LEVERAGE (0.1-1.0):",
    "- This is a MULTIPLIER of the user's maxLeverage setting (e.g., if maxLeverage=5x and you output 0.5, actual leverage=2.5x→3x)",
    "- Use HIGHER leverage (0.7-1.0) when: strong conviction, clear trend, good risk/reward, high confidence",
    "- Use MODERATE leverage (0.4-0.6) when: decent setup but some uncertainty, normal conditions",
    "- Use LOWER leverage (0.1-0.3) when: uncertain conditions, counter-trend trade, testing a thesis",
    "- Default to 0.5 if unsure. Only use 1.0 for your highest conviction trades.",
    "",
    "BIAS OPTIONS:",
    "- 'long': Bullish - ENTER a new long position (use only when NO position is open)",
    "- 'short': Bearish - ENTER a new short position (use only when NO position is open)",
    "- 'hold': KEEP current position open as-is (use only when a position IS open and you want to hold it)",
    "- 'neutral': Stay flat, do nothing (use only when NO position is open)",
    "- 'close': EXIT current position - use this to lock in profits, cut losses, or reduce risk (use only when a position IS open)",
    "",
    "DECISION RULES BASED ON POSITION STATE:",
    "- If you HAVE an open position: choose 'hold', 'close', or the OPPOSITE direction to reverse",
    "- If you have NO open position: choose 'long', 'short', or 'neutral'",
    "",
    "WHEN TO USE 'hold':",
    "1. Position is moving in your favor and the trend is intact - let it run",
    "2. Market is consolidating but your thesis hasn't changed",
    "3. Not enough evidence to justify closing or reversing",
    "",
    "WHEN TO USE 'close' (IMPORTANT FOR POSITION MANAGEMENT):",
    "1. PROFIT TAKING: Position is profitable and you see signs of reversal (overbought RSI, momentum slowing, resistance levels)",
    "2. RISK REDUCTION: Market conditions becoming uncertain or volatile, better to flatten and wait",
    "3. CAPITAL EFFICIENCY: Position has been open a while with minimal movement, capital could be better deployed",
    "4. STOP LOSS: Position is losing and conditions suggest further losses ahead",
    "5. TECHNICAL SIGNALS: Your analysis suggests the move is exhausted even if you're still directionally biased",
    "",
    "NOTE: 'close' and 'hold' are ONLY for when a position exists. If no position exists, use 'long', 'short', or 'neutral'.",
    "NOTE: Saying 'short' while holding a long (or vice versa) will also close the position, but 'close' is clearer for profit-taking.",
  ].join("\n");

  // Build position context string for clearer AI understanding
  const currentPosition = args.context.currentMarketPosition;
  const positionContext = currentPosition 
    ? `CURRENT POSITION: ${currentPosition.side.toUpperCase()} ${currentPosition.size} units @ $${currentPosition.avg_entry?.toFixed(2) || 'N/A'} entry, Unrealized PnL: $${currentPosition.unrealized_pnl?.toFixed(2) || '0'}`
    : "CURRENT POSITION: None (flat)";

  // Build indicators context if available
  const indicators = args.context.indicators;
  let indicatorsContext: string | null = null;
  if (indicators && Object.keys(indicators).length > 0) {
    const indicatorParts: string[] = [];
    if (indicators.rsi) {
      indicatorParts.push(`RSI(${indicators.rsi.period}): ${indicators.rsi.value.toFixed(1)}`);
    }
    if (indicators.atr) {
      indicatorParts.push(`ATR(${indicators.atr.period}): ${indicators.atr.value.toFixed(4)}`);
    }
    if (indicators.volatility) {
      indicatorParts.push(`Volatility(${indicators.volatility.window}): ${indicators.volatility.value.toFixed(2)}%`);
    }
    if (indicators.ema) {
      if (indicators.ema.fast) {
        indicatorParts.push(`EMA(${indicators.ema.fast.period}): ${indicators.ema.fast.value.toFixed(2)}`);
      }
      if (indicators.ema.slow) {
        indicatorParts.push(`EMA(${indicators.ema.slow.period}): ${indicators.ema.slow.value.toFixed(2)}`);
      }
    }
    if (indicatorParts.length > 0) {
      indicatorsContext = `TECHNICAL INDICATORS:\n${indicatorParts.join('\n')}`;
    }
  }

  // Build recent decisions context if available
  const recentDecisions = args.context.recentDecisions;
  const recentDecisionsContext = recentDecisions && recentDecisions.length > 0
    ? `RECENT DECISIONS (your last ${recentDecisions.length} decisions for context - use this to maintain consistency and learn from past choices):\n${recentDecisions.map((d, i) =>
        `${i + 1}. [${d.timestamp}] Bias: ${d.bias}, Confidence: ${(d.confidence * 100).toFixed(0)}%${d.reasoning ? `, Reason: ${d.reasoning}` : ''} → ${d.actionSummary}`
      ).join('\n')}`
    : null;

  // Build recent trades context if available
  const recentTrades = args.context.recentTrades;
  const recentTradesContext = recentTrades && recentTrades.length > 0
    ? `RECENT TRADES (last ${recentTrades.length} executed trades - learn from actual outcomes):\n${recentTrades.map((t, i) => {
        const pnlStr = t.realizedPnl !== null
          ? ` → PnL: ${t.realizedPnl >= 0 ? '+' : ''}$${t.realizedPnl.toFixed(2)}`
          : '';
        return `${i + 1}. [${t.timestamp}] ${t.action.toUpperCase()} ${t.side} ${t.market} @ $${t.price.toFixed(2)} (size: ${t.size.toFixed(6)})${pnlStr}`;
      }).join('\n')}`
    : null;

  const userParts = [
    `Strategy prompt:\n${args.prompt}`,
    `Market: ${args.context.market}`,
    positionContext,
    `Market data snapshot (JSON):\n${JSON.stringify(args.context.marketData)}`,
    `All positions snapshot (JSON):\n${JSON.stringify(args.context.positions)}`,
  ];

  // Add indicators if available
  if (indicatorsContext) {
    userParts.push(indicatorsContext);
  }

  // Add recent decisions if available
  if (recentDecisionsContext) {
    userParts.push(recentDecisionsContext);
  }

  // Add recent trades if available
  if (recentTradesContext) {
    userParts.push(recentTradesContext);
  }

  userParts.push(
    "",
    currentPosition
      ? "You have an open position. Choose: 'hold' to keep it, 'close' to exit, or the opposite direction to reverse."
      : "No open position. Choose: 'long' or 'short' to enter, or 'neutral' to stay flat.",
    "",
    "Respond with JSON only."
  );

  const user = userParts.join("\n\n");

  // Check if this is Anthropic (uses different API format)
  const isAnthropic = args.provider === "anthropic" || baseUrl.includes("anthropic.com");

  let res: Response;
  let data: any;

  if (isAnthropic) {
    // Anthropic API format
    res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: system,
        messages: [
          { role: "user", content: user },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic API call failed (${res.status}): ${t.slice(0, 300)}`);
    }

    data = await res.json();
    const content: string | undefined = data?.content?.[0]?.text;
    if (!content) throw new Error("Anthropic model returned no content");

    // Extract token usage from Anthropic response
    const usage = {
      inputTokens: data?.usage?.input_tokens || 0,
      outputTokens: data?.usage?.output_tokens || 0,
      totalTokens: (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0),
    };

    return {
      intent: parseIntentJson(content),
      usage,
      model,
    };
  } else {
    // OpenAI-compatible API format (OpenAI, Google, xAI, DeepSeek, etc.)
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Model call failed (${res.status}): ${t.slice(0, 300)}`);
    }

    data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model returned no content");

    // Extract token usage from OpenAI-compatible response
    const usage = {
      inputTokens: data?.usage?.prompt_tokens || 0,
      outputTokens: data?.usage?.completion_tokens || 0,
      totalTokens: data?.usage?.total_tokens || 0,
    };

    return {
      intent: parseIntentJson(content),
      usage,
      model,
    };
  }
}

function parseIntentJson(raw: string): Intent {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("Model did not return JSON object");
  const jsonStr = trimmed.slice(start, end + 1);
  const obj = JSON.parse(jsonStr);

  const bias = obj.bias;
  if (!["long", "short", "hold", "neutral", "close"].includes(bias)) throw new Error("Invalid bias: must be 'long', 'short', 'hold', 'neutral', or 'close'");

  return {
    market: String(obj.market || "BTC-PERP"),
    bias,
    confidence: clamp01(Number(obj.confidence)),
    entry_zone: {
      lower: Number(obj.entry_zone?.lower ?? 0),
      upper: Number(obj.entry_zone?.upper ?? 0),
    },
    stop_loss: Number(obj.stop_loss ?? 0),
    take_profit: Number(obj.take_profit ?? 0),
    risk: clamp01(Number(obj.risk)),
    reasoning: String(obj.reasoning || ""),
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

