/**
 * Agentic Loop: Multi-turn conversation where the AI uses tool calling
 * to gather market data before making a trading decision.
 */

import { Intent } from "@/lib/ai/intentSchema";
import { IntentWithUsage, parseIntentJson, normalizeBaseUrl, AIProviderError } from "@/lib/ai/openaiCompatible";
import { fetchWithRetry } from "@/lib/ai/fetchWithRetry";
import {
  ToolContext,
  getToolsForAnthropic,
  getToolsForOpenAI,
  executeToolCall,
} from "@/lib/ai/agenticTools";

// ─── Types ──────────────────────────────────────────────────────

interface AgenticMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: { id: string; name: string; args: Record<string, any> }[];
  toolCallId?: string;
  toolName?: string;
}

interface NormalizedResponse {
  textContent: string | null;
  toolCalls: { id: string; name: string; args: Record<string, any> }[];
  usage: { inputTokens: number; outputTokens: number };
}

// ─── System Prompt ──────────────────────────────────────────────

const AGENTIC_SYSTEM_PROMPT = `You are a trading decision engine with tools for gathering market data.

PROCESS:
1. You start with basic context: market, price, position, account state.
2. Use tools to gather the data YOU need for your analysis.
3. After gathering enough data, output your final decision as JSON.

AVAILABLE TOOLS:
- get_candles: Fetch historical OHLCV candles. Start here for price analysis.
- calculate_indicators: Compute RSI, EMA, MACD, Bollinger Bands, etc. from fetched candles.
- run_market_analysis: Detect market regime, key levels, multi-timeframe alignment.
- get_orderbook: See current bid/ask depth and liquidity.
- get_news: Check recent crypto headlines and events.
- get_recent_decisions: Review your previous decisions (avoid flip-flopping).
- get_recent_trades: Review your recent trades and PnL.
- get_prices: Check prices of other markets for correlation analysis.
- get_positions: Check current portfolio and account state.

RECOMMENDED WORKFLOW:
1. get_candles (5m, 100-200 candles) for the primary view
2. calculate_indicators (RSI, MACD, EMA at minimum)
3. run_market_analysis for regime detection
4. Optional: get_news for fundamental catalysts
5. Optional: get_recent_decisions to avoid flip-flopping
6. Output your decision

EFFICIENCY:
- Be selective. Don't call every tool if the situation is clear.
- If flat and first data shows clear ranging market, decide "neutral" quickly.
- If in a position, check recent_decisions to remember your entry thesis.

FINAL OUTPUT:
When ready, output ONLY valid JSON (no markdown, no code blocks):
{"market":"...","bias":"...","confidence":0.0,"entry_zone":{"lower":0,"upper":0},"stop_loss":0,"take_profit":0,"risk":0.0,"leverage":1,"reasoning":"..."}

BIAS OPTIONS:
- "long": Enter long (only when NO position open)
- "short": Enter short (only when NO position open)
- "hold": Keep current position (only when position IS open)
- "neutral": Stay flat (only when NO position open)
- "close": Exit position (only when position IS open)

POSITION MANAGEMENT:
- Do NOT exit a position just because of small moves against you — that's normal noise
- Only close if the TREND has genuinely reversed, not a temporary pullback
- If holding a position, check if your original thesis still holds

NEWS RULES:
- News >2 hours old is likely already priced in
- News supplements technicals, never replaces them
- Only override technicals for MAJOR IMMEDIATE events (exchange hacks, regulatory bans)

COST AWARENESS:
- Each trade incurs fees. Factor into risk/reward.
- Very small expected moves may not justify fee cost.`;

// ─── Main Loop ──────────────────────────────────────────────────

export async function agenticIntentCall(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  provider: string;
  toolContext: ToolContext;
  agenticConfig?: { maxToolCalls?: number; maxTimeMs?: number };
  market: string;
  currentPrice: number;
  marketPosition: any | null;
  account: { equity: number; cash_balance: number; starting_equity: number; total_return_pct: number };
  allPositions: any[];
  strategyConstraints: {
    marketType: "perpetual" | "spot";
    maxLeverage: number;
    allowLong: boolean;
    allowShort: boolean;
    entryInstructions: string;
  };
}): Promise<IntentWithUsage> {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const isAnthropic =
    args.provider === "anthropic" || baseUrl.includes("anthropic.com");
  const tools = isAnthropic ? getToolsForAnthropic() : getToolsForOpenAI();

  const maxToolCalls = args.agenticConfig?.maxToolCalls ?? 10;
  const maxTimeMs = args.agenticConfig?.maxTimeMs ?? 30000;
  const startTime = Date.now();

  // Build initial user message with minimal context
  const initialMessage = buildInitialMessage(args);
  const messages: AgenticMessage[] = [{ role: "user", content: initialMessage }];
  const candleCache = new Map<string, any[]>();

  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let toolCallCount = 0;

  // Main loop
  for (let iteration = 0; iteration < maxToolCalls + 3; iteration++) {
    // Time check
    if (Date.now() - startTime > maxTimeMs) {
      console.log(`[Agentic] Time limit reached (${maxTimeMs}ms), forcing decision`);
      break;
    }

    // Only include tools if we haven't exhausted the budget
    const includeTools = toolCallCount < maxToolCalls;

    // Make API call
    let response: NormalizedResponse;
    try {
      response = isAnthropic
        ? await callAnthropic(baseUrl, args.apiKey, args.model, AGENTIC_SYSTEM_PROMPT, messages, includeTools ? tools : undefined)
        : await callOpenAI(baseUrl, args.apiKey, args.model, AGENTIC_SYSTEM_PROMPT, messages, includeTools ? tools : undefined);
    } catch (error: any) {
      if (error instanceof AIProviderError) {
        throw error; // Let tick route handle API failures uniformly
      }
      console.error(`[Agentic] Non-API error:`, error.message);
      return neutralIntent(args.market, totalUsage, args.model);
    }

    // Accumulate usage
    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;
    totalUsage.totalTokens += response.usage.inputTokens + response.usage.outputTokens;

    // No tool calls → AI produced a text response
    if (response.toolCalls.length === 0) {
      if (response.textContent) {
        try {
          const intent = parseIntentJson(response.textContent);
          intent.market = args.market;
          console.log(`[Agentic] ✅ Complete: ${toolCallCount} tool calls, ${totalUsage.totalTokens} tokens, decision: ${intent.bias} (${intent.confidence})`);
          return { intent, usage: totalUsage, model: args.model };
        } catch {
          // JSON parse failed — ask AI to retry if we have budget
          if (toolCallCount < maxToolCalls && iteration < maxToolCalls + 1) {
            messages.push({ role: "assistant", content: response.textContent });
            messages.push({
              role: "user",
              content: "Your response was not valid JSON. Output ONLY the JSON decision object with bias, confidence, reasoning, etc.",
            });
            continue;
          }
          console.error(`[Agentic] Failed to parse intent JSON, returning neutral`);
          return neutralIntent(args.market, totalUsage, args.model);
        }
      }
      return neutralIntent(args.market, totalUsage, args.model);
    }

    // Tool calls — execute them
    messages.push({
      role: "assistant",
      content: response.textContent || "",
      toolCalls: response.toolCalls,
    });

    for (const tc of response.toolCalls) {
      toolCallCount++;
      console.log(`[Agentic] Tool call #${toolCallCount}: ${tc.name}(${JSON.stringify(tc.args).slice(0, 100)})`);

      const result = await executeToolCall(tc.name, tc.args, args.toolContext, candleCache);

      messages.push({
        role: "tool",
        content: result,
        toolCallId: tc.id,
        toolName: tc.name,
      });
    }
    // Continue loop — AI will see results and either call more tools or decide
  }

  // Loop exhausted — force a final decision
  console.log(`[Agentic] Loop exhausted after ${toolCallCount} tool calls, forcing decision`);
  messages.push({
    role: "user",
    content:
      "You have used all available tool calls. Based on what you've gathered so far, output your final trading decision as JSON NOW.",
  });

  try {
    const finalResponse = isAnthropic
      ? await callAnthropic(baseUrl, args.apiKey, args.model, AGENTIC_SYSTEM_PROMPT, messages, undefined)
      : await callOpenAI(baseUrl, args.apiKey, args.model, AGENTIC_SYSTEM_PROMPT, messages, undefined);

    totalUsage.inputTokens += finalResponse.usage.inputTokens;
    totalUsage.outputTokens += finalResponse.usage.outputTokens;
    totalUsage.totalTokens += finalResponse.usage.inputTokens + finalResponse.usage.outputTokens;

    if (finalResponse.textContent) {
      try {
        const intent = parseIntentJson(finalResponse.textContent);
        intent.market = args.market;
        return { intent, usage: totalUsage, model: args.model };
      } catch {
        // Still can't parse
      }
    }
  } catch (error: any) {
    if (error instanceof AIProviderError) throw error;
    console.error(`[Agentic] Final call failed:`, error.message);
  }

  return neutralIntent(args.market, totalUsage, args.model);
}

// ─── Initial Message Builder ────────────────────────────────────

function buildInitialMessage(args: {
  prompt: string;
  market: string;
  currentPrice: number;
  marketPosition: any | null;
  account: { equity: number; cash_balance: number; starting_equity: number; total_return_pct: number };
  allPositions: any[];
  strategyConstraints: {
    marketType: "perpetual" | "spot";
    maxLeverage: number;
    allowLong: boolean;
    allowShort: boolean;
    entryInstructions: string;
  };
}): string {
  const parts: string[] = [
    `STRATEGY PROMPT:\n${args.prompt}`,
    `MARKET: ${args.market}\nCURRENT PRICE: $${args.currentPrice.toFixed(2)}\nTIMESTAMP: ${new Date().toISOString()}`,
  ];

  if (args.marketPosition) {
    const mp = args.marketPosition;
    const pnlPct =
      mp.avg_entry && mp.size
        ? ((Number(mp.unrealized_pnl || 0) / (Number(mp.avg_entry) * Number(mp.size))) * 100).toFixed(2)
        : "0";
    parts.push(
      `CURRENT POSITION: ${mp.side?.toUpperCase()} ${mp.size} @ $${Number(mp.avg_entry || 0).toFixed(2)}, ` +
        `Unrealized PnL: $${Number(mp.unrealized_pnl || 0).toFixed(2)} (${pnlPct}%)`
    );
  } else {
    parts.push("CURRENT POSITION: None (flat)");
  }

  parts.push(
    `ACCOUNT: Equity $${args.account.equity.toFixed(2)}, Cash $${args.account.cash_balance.toFixed(2)}, Return ${args.account.total_return_pct.toFixed(2)}%`
  );

  if (args.allPositions.length > 0) {
    const summary = args.allPositions
      .map((p) => `${p.market}: ${p.side} ${p.size} @ $${Number(p.avg_entry || 0).toFixed(2)}`)
      .join(", ");
    parts.push(`ALL POSITIONS: ${summary}`);
  }

  const sc = args.strategyConstraints;
  const constraints = [
    `Market: ${sc.marketType}`,
    `Max Leverage: ${sc.maxLeverage}x`,
    sc.allowLong === false ? "LONG DISABLED" : null,
    sc.allowShort === false ? "SHORT DISABLED" : null,
  ]
    .filter(Boolean)
    .join(", ");
  parts.push(`CONSTRAINTS: ${constraints}`);
  parts.push(`ENTRY TYPES: ${sc.entryInstructions}`);
  parts.push("Use tools to gather data, then output your trading decision as JSON.");

  return parts.join("\n\n");
}

// ─── Neutral Intent ─────────────────────────────────────────────

function neutralIntent(
  market: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  model: string
): IntentWithUsage {
  return {
    intent: {
      market,
      bias: "neutral",
      confidence: 0,
      entry_zone: { lower: 0, upper: 0 },
      stop_loss: 0,
      take_profit: 0,
      risk: 0,
      leverage: 1,
      reasoning: "Agentic loop did not produce a valid decision",
    },
    usage,
    model,
  };
}

// ─── Provider API Calls ─────────────────────────────────────────

async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: AgenticMessage[],
  tools?: any[]
): Promise<NormalizedResponse> {
  const anthropicMessages = messagesToAnthropic(messages);

  const body: any = {
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
    temperature: 0.2,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetchWithRetry(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AIProviderError(res.status, "anthropic", text);
  }

  const data = await res.json();

  // Extract text and tool calls
  let textContent: string | null = null;
  const toolCalls: { id: string; name: string; args: Record<string, any> }[] = [];

  for (const block of data.content || []) {
    if (block.type === "text") {
      textContent = (textContent || "") + block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        args: block.input || {},
      });
    }
  }

  return {
    textContent,
    toolCalls,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: AgenticMessage[],
  tools?: any[]
): Promise<NormalizedResponse> {
  const openaiMessages = messagesToOpenAI(messages, systemPrompt);

  // OpenAI reasoning models (o1, o3, etc.) don't support custom temperature
  const isReasoningModel = /^(o[0-9])/.test(model);

  const body: any = {
    model,
    messages: openaiMessages,
    stream: false,
    ...(isReasoningModel ? {} : { temperature: 0.2 }),
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AIProviderError(res.status, "openai", text);
  }

  const data = await res.json();
  const choice = data.choices?.[0]?.message;

  const textContent = choice?.content || null;
  const toolCalls: { id: string; name: string; args: Record<string, any> }[] = [];

  if (choice?.tool_calls) {
    for (const tc of choice.tool_calls) {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        // If args can't be parsed, use empty object
      }
      toolCalls.push({
        id: tc.id,
        name: tc.function?.name || "",
        args: parsedArgs,
      });
    }
  }

  return {
    textContent,
    toolCalls,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

// ─── Message Format Converters ──────────────────────────────────

function messagesToAnthropic(messages: AgenticMessage[]): any[] {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const content: any[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args,
          });
        }
      }
      result.push({ role: "assistant", content });
    } else if (msg.role === "tool") {
      // Anthropic: tool results go as user messages with tool_result content blocks
      // Check if the last message is already a user with tool_result blocks — merge
      const lastMsg = result[result.length - 1];
      const toolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };
      if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
        lastMsg.content.push(toolResultBlock);
      } else {
        result.push({ role: "user", content: [toolResultBlock] });
      }
    }
  }

  return result;
}

function messagesToOpenAI(messages: AgenticMessage[], systemPrompt: string): any[] {
  const result: any[] = [{ role: "system", content: systemPrompt }];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const m: any = { role: "assistant", content: msg.content || null };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        m.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        }));
      }
      result.push(m);
    } else if (msg.role === "tool") {
      result.push({
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    }
  }

  return result;
}
