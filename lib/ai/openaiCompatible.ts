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
    strategy?: {
      entryBehaviors?: { trend?: boolean; breakout?: boolean; meanReversion?: boolean };
      entryInstructions?: string;
      marketType?: "perpetual" | "spot"; // perpetual = leverage/shorts, spot = 1x longs only
      maxLeverage?: number; // Max leverage allowed (1 = no leverage)
      allowLong?: boolean;
      allowShort?: boolean;
    };
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
    "{ market: string, bias: 'long'|'short'|'hold'|'neutral'|'close', confidence: number (0..1), entry_zone:{lower:number, upper:number}, stop_loss:number, take_profit:number, risk:number (0..1), leverage:number (1..maxLeverage), reasoning:string }",
    "",
    "LEVERAGE:",
    "- Check strategy.marketType: 'perpetual' allows leverage, 'spot' is always 1x",
    "- Check strategy.maxLeverage for the maximum allowed (e.g., if maxLeverage=5, you can use 1x to 5x)",
    "- Output the actual leverage you want to use (e.g., 1, 2, 3, 5), NOT a multiplier",
    "- Use HIGHER leverage (closer to maxLeverage) when: strong conviction, clear trend, good risk/reward",
    "- Use LOWER leverage (1x-2x) when: uncertain conditions, testing a thesis, higher risk",
    "- For spot trading (marketType='spot'), always output leverage: 1",
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
    "⚠️ ENTRY LOGIC - WHEN TO OPEN POSITIONS:",
    "Only enter HIGH CONVICTION setups. Every entry requires a clear THESIS you'll validate later.",
    "",
    "✅ ENTER (long/short) when ALL of these align:",
    "1. Clear trend direction established (not choppy/ranging)",
    "   - Price showing consistent higher highs/lows (uptrend) or lower highs/lows (downtrend)",
    "   - Trend should be >30 minutes old, not a 5-minute spike",
    "2. Multiple indicators confirm (need 2-3 of these):",
    "   - RSI: In trend zone (>55 for long, <45 for short) with momentum",
    "   - Volume: Increasing on trend moves, decreasing on pullbacks",
    "   - Price action: Breaking through levels with follow-through",
    "3. Good entry timing (not chasing):",
    "   - Entering on pullback/consolidation within trend (not at extremes)",
    "   - Risk/reward favorable (room to run, logical stop placement)",
    "4. Document ENTRY THESIS in your reasoning:",
    "   - 'LONG: Strong uptrend + RSI 65 with momentum + volume surge on breakout'",
    "   - This thesis will be checked later - only exit if INVALIDATED",
    "",
    "❌ DO NOT ENTER on weak signals:",
    "- Single indicator alone (e.g., just RSI overbought)",
    "- Choppy/ranging market (no clear trend structure)",
    "- Price at extreme high/low (bad risk/reward, likely reversal)",
    "- Marginal setup (low conviction, unclear direction)",
    "- Conflicting signals (RSI says long, volume says short)",
    "- FOMO or 'need to be in position' feeling",
    "- After 3+ consecutive losses (take a break, reassess)",
    "",
    "ENTRY CONVICTION SCALE:",
    "- High conviction (0.7-1.0): 3+ indicators align, clear trend, good timing",
    "- Medium conviction (0.5-0.7): 2 indicators, trend present but not strong",
    "- Low conviction (<0.5): Choose 'neutral' instead - DO NOT enter weak setups",
    "",
    "⚠️ UNDERSTANDING 'SIGNAL' EXIT MODE (CRITICAL):",
    "When you're in a position, your ONLY job is to predict if the TREND will continue or REVERSE.",
    "- You are NOT managing take-profit or stop-loss levels (that's a separate exit mode)",
    "- You are NOT managing time-based exits (that's a separate exit mode)",
    "- You ARE predicting: will this trend continue, or is it genuinely reversing?",
    "",
    "NOISE vs. TREND REVERSAL:",
    "1. NOISE (HOLD): Temporary price fluctuations within an intact trend",
    "   - Price moves <0.5% in 5-15 minutes without breaking trend structure = NOISE",
    "   - RSI retraces within trend zone (uptrend: stays >50, downtrend: stays <50) without divergence = NOISE",
    "   - Single candle against trend without follow-through = NOISE",
    "   - Trend structure intact (uptrend: higher lows, downtrend: lower highs) = NOISE",
    "   - Being <1% underwater after 15-30 minutes with thesis unchanged = NORMAL NOISE",
    "",
    "2. TREND REVERSAL (CLOSE): Fundamental change in market structure",
    "   - Price breaks >1% through key level with strong momentum",
    "   - Multiple timeframes showing reversal (not just 1-min chart)",
    "   - Volume spike + price reversal (real buying/selling pressure)",
    "   - RSI crosses 50 with price breaking trend structure (uptrend→downtrend or vice versa)",
    "   - Major divergence (price makes new high/low but RSI doesn't confirm)",
    "",
    "YOUR CONVICTION:",
    "1. When you opened this position, you had a REASON (check your recent decisions)",
    "2. Has that reason FUNDAMENTALLY changed? Or just temporary noise?",
    "3. If you opened SHORT because 'bearish momentum + RSI overbought', ask:",
    "   - Is momentum still bearish? (yes = HOLD)",
    "   - Did RSI reverse to oversold with bullish momentum? (yes = CLOSE)",
    "   - Or did price just wiggle 0.3-0.5% for 15 minutes? (just noise = HOLD)",
    "",
    "TIME CONTEXT:",
    "1. Trends develop over 30-120 minutes, not 5-15 minutes",
    "2. If you opened 15 minutes ago and price moved against you slightly, that's EXPECTED noise",
    "3. Check: 'How long has this been open?' If <30 min, ask: 'Is this TRULY a reversal, or noise?'",
    "4. Being slightly underwater early in a trade is NORMAL - don't panic",
    "",
    "THE TEST:",
    "Before saying 'close', ask yourself:",
    "- If I close now and the trend continues as I predicted, would I regret it?",
    "- Am I closing because of real trend reversal, or because I'm nervous about noise?",
    "- Would a skilled trader see this as a reversal, or just a pullback in the trend?",
    "",
    "WHEN TO USE 'close' IN SIGNAL MODE:",
    "✅ CLOSE when you predict TREND REVERSAL:",
    "1. Market structure changed: trend line broken, new trend forming opposite direction",
    "2. Momentum shifted: indicators (RSI, MACD, volume) show sustained reversal",
    "3. Multiple timeframes confirm: not just 1-min noise, but 5min/15min also reversing",
    "4. Your entry thesis is INVALIDATED: the reason you entered is no longer true",
    "",
    "❌ DO NOT CLOSE just because:",
    "- Price moved 0.3-0.5% against you in 5-15 minutes without breaking structure (NOISE)",
    "- You're <1% underwater with trend structure intact (normal fluctuation)",
    "- Single red/green candle against your position (noise)",
    "- RSI retraced modestly but stayed in trend zone (not a reversal)",
    "- You're nervous but trend structure is intact (trust your thesis)",
    "- It's been 'a while' but trend hasn't reversed (hold as long as trend continues)",
    "",
    "REMEMBER:",
    "- A SHORT position expects price to go DOWN over time (with noise along the way)",
    "- A LONG position expects price to go UP over time (with noise along the way)",
    "- Temporary moves AGAINST your position are NORMAL - don't exit unless trend reverses",
    "- You can hold for hours or days if the trend continues - there's no time limit",
    "",
    "NOTE: 'close' and 'hold' are ONLY for when a position exists. If no position exists, use 'long', 'short', or 'neutral'.",
    "NOTE: Saying 'short' while holding a long (or vice versa) will also close the position, but 'close' is clearer when exiting.",
  ].join("\n");

  // Build position context string with TIME awareness for clearer AI understanding
  const currentPosition = args.context.currentMarketPosition;
  let positionContext: string;

  if (currentPosition) {
    // Calculate time since entry if we have recent trades
    let timeSinceEntry: string | null = null;
    if (args.context.recentTrades && args.context.recentTrades.length > 0) {
      // Find the most recent "open" trade for this market
      const openTrade = args.context.recentTrades.find(
        t => t.market === args.context.market && t.action === "open"
      );

      if (openTrade) {
        const entryTime = new Date(openTrade.timestamp).getTime();
        const now = Date.now();
        const minutesSinceEntry = Math.floor((now - entryTime) / 60000);

        if (minutesSinceEntry < 60) {
          timeSinceEntry = `${minutesSinceEntry} minutes ago`;
        } else if (minutesSinceEntry < 1440) {
          const hours = Math.floor(minutesSinceEntry / 60);
          const mins = minutesSinceEntry % 60;
          timeSinceEntry = `${hours}h ${mins}m ago`;
        } else {
          const days = Math.floor(minutesSinceEntry / 1440);
          timeSinceEntry = `${days} days ago`;
        }
      }
    }

    const unrealizedPnl = currentPosition.unrealized_pnl?.toFixed(2) || '0';
    const pnlPct = currentPosition.avg_entry && currentPosition.unrealized_pnl
      ? ((currentPosition.unrealized_pnl / (currentPosition.avg_entry * currentPosition.size)) * 100).toFixed(2)
      : '0';

    positionContext = timeSinceEntry
      ? `CURRENT POSITION: ${currentPosition.side.toUpperCase()} ${currentPosition.size} units @ $${currentPosition.avg_entry?.toFixed(2) || 'N/A'} entry (opened ${timeSinceEntry}), Unrealized PnL: $${unrealizedPnl} (${pnlPct}%)`
      : `CURRENT POSITION: ${currentPosition.side.toUpperCase()} ${currentPosition.size} units @ $${currentPosition.avg_entry?.toFixed(2) || 'N/A'} entry, Unrealized PnL: $${unrealizedPnl} (${pnlPct}%)`;
  } else {
    positionContext = "CURRENT POSITION: None (flat)";
  }

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

  // Build recent decisions context with TIME awareness
  const recentDecisions = args.context.recentDecisions;
  const recentDecisionsContext = recentDecisions && recentDecisions.length > 0
    ? `RECENT DECISIONS (learn from these - look for patterns, avoid flip-flops):\n${recentDecisions.map((d, i) => {
        const timestamp = new Date(d.timestamp).toLocaleString();
        const minsAgo = Math.floor((Date.now() - new Date(d.timestamp).getTime()) / 60000);
        const timeAgoStr = minsAgo < 60 ? `${minsAgo}min ago` : `${Math.floor(minsAgo/60)}h ${minsAgo%60}m ago`;

        return `${i + 1}. [${timestamp}] (${timeAgoStr}) Bias: ${d.bias}, Confidence: ${(d.confidence * 100).toFixed(0)}%${d.reasoning ? `, Reason: ${d.reasoning}` : ''} → ${d.actionSummary}`;
      }).join('\n')}\n\n⚠️ ANALYZE: Did you flip-flop recently? Did trend actually reverse, or just noise?`
    : null;

  // Build recent trades context with HOLD TIME analysis
  const recentTrades = args.context.recentTrades;
  const recentTradesContext = recentTrades && recentTrades.length > 0
    ? `RECENT TRADES (actual executions - see how long positions lasted):\n${recentTrades.map((t, i) => {
        const timestamp = new Date(t.timestamp).toLocaleString();
        const minsAgo = Math.floor((Date.now() - new Date(t.timestamp).getTime()) / 60000);
        const timeAgoStr = minsAgo < 60 ? `${minsAgo}min ago` : `${Math.floor(minsAgo/60)}h ago`;

        const pnlStr = t.realizedPnl !== null
          ? ` → PnL: ${t.realizedPnl >= 0 ? '+' : ''}$${t.realizedPnl.toFixed(2)}`
          : '';

        // For "close" actions, try to calculate hold time
        let holdTimeStr = '';
        if (t.action === 'close' && i < recentTrades.length - 1) {
          const openTrade = recentTrades.slice(i + 1).find(
            prev => prev.market === t.market && prev.action === 'open'
          );
          if (openTrade) {
            const holdMinutes = Math.floor((new Date(t.timestamp).getTime() - new Date(openTrade.timestamp).getTime()) / 60000);
            if (holdMinutes < 30) {
              holdTimeStr = ` [⚠️ QUICK EXIT after ${holdMinutes} min]`;
            } else if (holdMinutes < 60) {
              holdTimeStr = ` [held ${holdMinutes} min]`;
            } else {
              holdTimeStr = ` [held ${Math.floor(holdMinutes/60)}h ${holdMinutes%60}m]`;
            }
          }
        }

        return `${i + 1}. [${timestamp}] (${timeAgoStr}) ${t.action.toUpperCase()} ${t.side} ${t.market} @ $${t.price.toFixed(2)}${pnlStr}${holdTimeStr}`;
      }).join('\n')}\n\n⚠️ NOTICE: Exits <30min often due to noise, not real reversals.`
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

  // Add trading constraints (market type, leverage, allowed directions)
  const strategy = args.context.strategy;
  if (strategy) {
    const constraints: string[] = [];

    if (strategy.marketType === "perpetual") {
      constraints.push(`Market Type: PERPETUAL (leverage and short-selling available)`);
      constraints.push(`Max Leverage: ${strategy.maxLeverage || 1}x (you can use any leverage from 1x to ${strategy.maxLeverage || 1}x)`);
    } else {
      constraints.push(`Market Type: SPOT (no leverage, longs only)`);
      constraints.push(`Leverage: 1x only (spot market)`);
    }

    if (strategy.allowLong === false) {
      constraints.push(`⚠️ LONG positions are DISABLED - do not go long`);
    }
    if (strategy.allowShort === false) {
      constraints.push(`⚠️ SHORT positions are DISABLED - do not go short`);
    }

    if (constraints.length > 0) {
      userParts.push(`TRADING CONSTRAINTS:\n${constraints.join('\n')}`);
    }
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

  // Parse leverage - default to 1 if not specified or invalid
  let leverage = Number(obj.leverage);
  if (!Number.isFinite(leverage) || leverage < 1) {
    leverage = 1;
  }

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
    leverage,
    reasoning: String(obj.reasoning || ""),
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

