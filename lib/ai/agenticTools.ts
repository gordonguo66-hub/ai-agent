/**
 * Agentic Tools: Tool definitions and execution handlers for agentic mode.
 * Each tool wraps existing data-fetching infrastructure.
 */

import { getCandles as getHyperliquidCandles } from "@/lib/hyperliquid/candles";
import { getCandles as getCoinbaseCandles } from "@/lib/coinbase/candles";
import { getMidPrices as getHyperliquidPrices } from "@/lib/hyperliquid/prices";
import { getMidPrices as getCoinbasePrices } from "@/lib/coinbase/prices";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { getOrderbook as getCoinbaseOrderbook } from "@/lib/coinbase/prices";
import { calculateIndicators } from "@/lib/indicators/calculations";
import { runMarketAnalysis } from "@/lib/ai/marketAnalysis";
import { fetchCryptoNews } from "@/lib/ai/newsService";

export interface ToolContext {
  priceVenue: "hyperliquid" | "coinbase";
  sessionId: string;
  serviceClient: any;
  tables: { trades: string };
  market: string;
  currentPrice: number;
  allPositions: any[];
  marketPosition: any | null;
  account: { equity: number; cash_balance: number; starting_equity: number };
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

// ─── Tool Definitions ──────────────────────────────────────────

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_candles",
    description:
      "Fetch historical price candles (OHLCV) for the current market. Use this to analyze price patterns and trends. Start with 5m or 15m candles for a broad view. Call multiple times with different intervals for multi-timeframe analysis.",
    parameters: {
      type: "object",
      properties: {
        interval: {
          type: "string",
          enum: ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d"],
          description: "Candle timeframe",
        },
        count: {
          type: "number",
          description: "Number of candles to fetch (default 100, max 300)",
        },
      },
      required: ["interval"],
    },
  },
  {
    name: "get_orderbook",
    description:
      "Fetch the current order book showing bid/ask levels with sizes. Use to assess liquidity, spread, and order flow.",
    parameters: {
      type: "object",
      properties: {
        depth: {
          type: "number",
          description: "Number of levels on each side (default 10, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_prices",
    description:
      "Fetch current mid prices for one or more markets. Use to check correlated assets or update your price view.",
    parameters: {
      type: "object",
      properties: {
        markets: {
          type: "array",
          items: { type: "string" },
          description: "Markets to fetch prices for (max 5). Defaults to current market if omitted.",
        },
      },
      required: [],
    },
  },
  {
    name: "calculate_indicators",
    description:
      "Calculate technical indicators from previously fetched candles. You MUST call get_candles first. Specify which indicators you want.",
    parameters: {
      type: "object",
      properties: {
        interval: {
          type: "string",
          description: "The candle interval to use (must match a previous get_candles call)",
        },
        indicators: {
          type: "object",
          description: "Which indicators to calculate",
          properties: {
            rsi: { type: "object", properties: { period: { type: "number" } } },
            atr: { type: "object", properties: { period: { type: "number" } } },
            volatility: { type: "object", properties: { window: { type: "number" } } },
            ema: { type: "object", properties: { fast: { type: "number" }, slow: { type: "number" } } },
            macd: {
              type: "object",
              properties: {
                fastPeriod: { type: "number" },
                slowPeriod: { type: "number" },
                signalPeriod: { type: "number" },
              },
            },
            bollingerBands: {
              type: "object",
              properties: { period: { type: "number" }, stdDev: { type: "number" } },
            },
            supportResistance: { type: "object", properties: { lookback: { type: "number" } } },
            volume: { type: "object", properties: { lookback: { type: "number" } } },
          },
        },
      },
      required: ["interval", "indicators"],
    },
  },
  {
    name: "run_market_analysis",
    description:
      "Run market analysis engine: detect regime (trending/ranging/volatile), key support/resistance levels, and multi-timeframe alignment. Requires candles to have been fetched first.",
    parameters: {
      type: "object",
      properties: {
        primaryInterval: {
          type: "string",
          description: "Primary candle interval (default '5m')",
        },
        htfInterval: {
          type: "string",
          description: "Higher timeframe interval for multi-TF analysis. Auto-selected if omitted.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_news",
    description:
      "Fetch recent crypto news headlines for the current market. Use to check for fundamental catalysts or breaking events.",
    parameters: {
      type: "object",
      properties: {
        maxArticles: {
          type: "number",
          description: "Maximum articles to fetch (default 5, max 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recent_decisions",
    description:
      "Retrieve your recent trading decisions for this session. Use to check for flip-flopping and maintain consistency.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of recent decisions (default 5, max 15)" },
      },
      required: [],
    },
  },
  {
    name: "get_recent_trades",
    description:
      "Retrieve recent trade executions for this session. See fill prices, PnL, and hold times.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of recent trades (default 10, max 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_positions",
    description:
      "Get current portfolio positions across all markets, account equity, and cash balance.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─── Format Adapters ────────────────────────────────────────────

export function getToolsForAnthropic() {
  return TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export function getToolsForOpenAI() {
  return TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ─── Timeframe Mapping ──────────────────────────────────────────

const HTF_MAP: Record<string, string> = {
  "1m": "15m",
  "3m": "15m",
  "5m": "1h",
  "15m": "4h",
  "30m": "4h",
  "1h": "1d",
  "2h": "1d",
  "4h": "1d",
};

// ─── Tool Execution ─────────────────────────────────────────────

export async function executeToolCall(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext,
  candleCache: Map<string, any[]>
): Promise<string> {
  try {
    switch (name) {
      case "get_candles": {
        const interval = args.interval || "5m";
        const count = Math.min(args.count || 100, 300);
        const candles =
          ctx.priceVenue === "coinbase"
            ? await getCoinbaseCandles(ctx.market, interval, count)
            : await getHyperliquidCandles(ctx.market, interval, count);
        const mapped = candles.map((c: any) => ({
          time: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v,
        }));
        // Cache raw candles for indicator/analysis tools
        candleCache.set(interval, candles);
        return JSON.stringify({
          market: ctx.market, interval, count: mapped.length, candles: mapped,
        });
      }

      case "get_orderbook": {
        const depth = Math.min(args.depth || 10, 50);
        const orderbook =
          ctx.priceVenue === "coinbase"
            ? await getCoinbaseOrderbook(ctx.market, depth)
            : await hyperliquidClient.getOrderbook(ctx.market, depth);
        return JSON.stringify({
          market: ctx.market,
          bid: orderbook.bid,
          ask: orderbook.ask,
          mid: orderbook.mid,
          spread: orderbook.ask - orderbook.bid,
          depth: orderbook.bids.length,
          bids: orderbook.bids.slice(0, depth),
          asks: orderbook.asks.slice(0, depth),
        });
      }

      case "get_prices": {
        const markets = (args.markets || [ctx.market]).slice(0, 5);
        const prices =
          ctx.priceVenue === "coinbase"
            ? await getCoinbasePrices(markets)
            : await getHyperliquidPrices(markets);
        return JSON.stringify(prices);
      }

      case "calculate_indicators": {
        const interval = args.interval || "5m";
        const candles = candleCache.get(interval);
        if (!candles || candles.length === 0) {
          return JSON.stringify({
            error: `No candles cached for interval '${interval}'. Call get_candles with this interval first.`,
          });
        }
        const indicatorConfig: Record<string, any> = {};
        const requested = args.indicators || {};
        for (const key of Object.keys(requested)) {
          indicatorConfig[key] = { enabled: true, ...requested[key] };
        }
        const result = calculateIndicators(candles, indicatorConfig);
        return JSON.stringify({ interval, indicators: result });
      }

      case "run_market_analysis": {
        const primaryInterval = args.primaryInterval || "5m";
        const htfInterval = args.htfInterval || HTF_MAP[primaryInterval] || "1h";

        const primaryCandles = candleCache.get(primaryInterval);
        if (!primaryCandles || primaryCandles.length === 0) {
          return JSON.stringify({
            error: `No candles cached for '${primaryInterval}'. Call get_candles first.`,
          });
        }

        // Get or fetch HTF candles
        let htfCandles = candleCache.get(htfInterval);
        if (!htfCandles || htfCandles.length === 0) {
          htfCandles =
            ctx.priceVenue === "coinbase"
              ? await getCoinbaseCandles(ctx.market, htfInterval, 100)
              : await getHyperliquidCandles(ctx.market, htfInterval, 100);
          candleCache.set(htfInterval, htfCandles);
        }

        // Calculate indicators for both timeframes
        const allIndicators = { rsi: { enabled: true }, ema: { enabled: true }, macd: { enabled: true } };
        const primaryIndicators = calculateIndicators(primaryCandles, allIndicators);
        const htfIndicators = calculateIndicators(htfCandles, allIndicators);

        const analysis = runMarketAnalysis({
          market: ctx.market,
          currentPrice: ctx.currentPrice,
          candles: primaryCandles,
          indicators: primaryIndicators,
          htfIndicators,
          primaryTimeframe: primaryInterval,
          htfTimeframe: htfInterval,
        });
        return JSON.stringify(analysis);
      }

      case "get_news": {
        const maxArticles = Math.min(args.maxArticles || 5, 10);
        const result = await fetchCryptoNews(ctx.market, maxArticles);
        if (!result) {
          return JSON.stringify({ articles: [], message: "No news available" });
        }
        return result.formattedContext;
      }

      case "get_recent_decisions": {
        const count = Math.min(args.count || 5, 15);
        const { data } = await ctx.serviceClient
          .from("session_decisions")
          .select("created_at, intent, confidence, action_summary, executed")
          .eq("session_id", ctx.sessionId)
          .order("created_at", { ascending: false })
          .limit(count);
        if (!data || data.length === 0) {
          return JSON.stringify({ decisions: [], message: "No previous decisions" });
        }
        const decisions = data.map((d: any) => ({
          timestamp: d.created_at,
          bias: d.intent?.bias,
          confidence: d.confidence,
          reasoning: d.intent?.reasoning,
          actionSummary: d.action_summary,
          executed: d.executed,
        }));
        return JSON.stringify({ decisions });
      }

      case "get_recent_trades": {
        const count = Math.min(args.count || 10, 20);
        const { data } = await ctx.serviceClient
          .from(ctx.tables.trades)
          .select("created_at, market, side, action, price, size, realized_pnl")
          .eq("session_id", ctx.sessionId)
          .order("created_at", { ascending: false })
          .limit(count);
        if (!data || data.length === 0) {
          return JSON.stringify({ trades: [], message: "No previous trades" });
        }
        const trades = data.map((t: any) => ({
          timestamp: t.created_at,
          market: t.market,
          side: t.side,
          action: t.action,
          price: t.price,
          size: t.size,
          realizedPnl: t.realized_pnl,
        }));
        return JSON.stringify({ trades });
      }

      case "get_positions": {
        return JSON.stringify({
          account: {
            equity: ctx.account.equity,
            cash_balance: ctx.account.cash_balance,
            starting_equity: ctx.account.starting_equity,
            total_return_pct:
              ((ctx.account.equity - ctx.account.starting_equity) /
                ctx.account.starting_equity) *
              100,
          },
          currentMarketPosition: ctx.marketPosition
            ? {
                market: ctx.market,
                side: ctx.marketPosition.side,
                size: Number(ctx.marketPosition.size),
                avg_entry: Number(ctx.marketPosition.avg_entry),
                unrealized_pnl: Number(ctx.marketPosition.unrealized_pnl || 0),
              }
            : null,
          allPositions: ctx.allPositions.map((p: any) => ({
            market: p.market,
            side: p.side,
            size: Number(p.size),
            avg_entry: Number(p.avg_entry),
            unrealized_pnl: Number(p.unrealized_pnl || 0),
          })),
          positionCount: ctx.allPositions.length,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error: any) {
    console.error(`[Agentic Tool] ${name} failed:`, error.message);
    return JSON.stringify({ error: `Tool ${name} failed: ${error.message}` });
  }
}
