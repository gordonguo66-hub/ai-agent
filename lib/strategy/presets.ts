export type PresetMode = "conservative" | "balanced" | "aggressive";
export type SetupMode = "quick" | "full";

export interface PresetConfig {
  label: string;
  description: string;
  tagline: string;
  color: "emerald" | "blue" | "orange";
  prompt: string;
  cadenceSeconds: number;
  aiInputs: {
    candles: { enabled: boolean; count: number; timeframe: string };
    orderbook: { enabled: boolean; depth: number };
    indicators: {
      rsi: { enabled: boolean; period: number };
      atr: { enabled: boolean; period: number };
      volatility: { enabled: boolean; window: number };
      ema: { enabled: boolean; fast: number; slow: number };
    };
    includePositionState: boolean;
    includeRecentDecisions: boolean;
    recentDecisionsCount: number;
    includeRecentTrades: boolean;
    recentTradesCount: number;
  };
  entryExit: {
    entry: {
      mode: "signal";
      behaviors: { trend: boolean; breakout: boolean; meanReversion: boolean };
      confirmation: {
        minSignals: number;
        requireVolatilityCondition: boolean;
        volatilityMin: number | null;
        volatilityMax: number | null;
      };
      timing: { waitForClose: boolean; maxSlippagePct: number };
    };
    exit: {
      mode: "signal";
      maxLossProtectionPct: number | null;
      maxProfitCapPct: number | null;
      takeProfitPct: number;
      stopLossPct: number;
      trailingStopPct: number | null;
      initialStopLossPct: number | null;
      maxHoldMinutes: number | null;
    };
    tradeControl: {
      maxTradesPerHour: number;
      maxTradesPerDay: number;
      cooldownMinutes: number;
      minHoldMinutes: number;
      allowReentrySameDirection: boolean;
    };
    confidenceControl: {
      minConfidence: number;
      confidenceScaling: boolean;
    };
  };
  guardrails: { allowLong: boolean; allowShort: boolean };
  risk: { maxDailyLossPct: number; maxPositionUsd: number; maxLeverage: number };
}

export const STRATEGY_PRESETS: Record<PresetMode, PresetConfig> = {
  conservative: {
    label: "Conservative",
    description: "Capital preservation with high-conviction entries only. Lower frequency, tighter risk limits, and trend-only trading.",
    tagline: "Capital Preservation",
    color: "emerald",
    prompt: `You are a conservative trading agent focused on capital preservation.
Only enter positions when you have very high conviction based on clear trend signals.
Prefer fewer, higher-quality trades over frequent entries.
Always prioritize protecting capital over maximizing gains.
Wait for strong confirmation before entering - avoid uncertain setups.
Focus on established trends rather than catching reversals or breakouts.`,
    cadenceSeconds: 300,
    aiInputs: {
      candles: { enabled: true, count: 200, timeframe: "15m" },
      orderbook: { enabled: false, depth: 20 },
      indicators: {
        rsi: { enabled: true, period: 14 },
        atr: { enabled: false, period: 14 },
        volatility: { enabled: true, window: 50 },
        ema: { enabled: false, fast: 12, slow: 26 },
      },
      includePositionState: true,
      includeRecentDecisions: true,
      recentDecisionsCount: 5,
      includeRecentTrades: true,
      recentTradesCount: 10,
    },
    entryExit: {
      entry: {
        mode: "signal",
        behaviors: { trend: true, breakout: false, meanReversion: false },
        confirmation: {
          minSignals: 3,
          requireVolatilityCondition: false,
          volatilityMin: 0.5,
          volatilityMax: null,
        },
        timing: { waitForClose: false, maxSlippagePct: 0.003 },
      },
      exit: {
        mode: "signal",
        maxLossProtectionPct: null,
        maxProfitCapPct: null,
        takeProfitPct: 3.0,
        stopLossPct: 1.5,
        trailingStopPct: null,
        initialStopLossPct: null,
        maxHoldMinutes: null,
      },
      tradeControl: {
        maxTradesPerHour: 1,
        maxTradesPerDay: 5,
        cooldownMinutes: 30,
        minHoldMinutes: 10,
        allowReentrySameDirection: false,
      },
      confidenceControl: {
        minConfidence: 0.75,
        confidenceScaling: true,
      },
    },
    guardrails: { allowLong: true, allowShort: false },
    risk: { maxDailyLossPct: 3, maxPositionUsd: 500, maxLeverage: 2 },
  },
  balanced: {
    label: "Balanced",
    description: "Moderate risk/reward with a mix of trading strategies. Good starting point for most traders.",
    tagline: "Balanced Growth",
    color: "blue",
    prompt: `You are a balanced trading agent that uses a mix of strategies.
Analyze trends, breakouts, and mean-reversion opportunities equally.
Take trades when there is reasonable conviction backed by multiple signals.
Balance risk and reward - aim for consistent performance rather than home runs.
Manage positions actively and respect risk limits strictly.`,
    cadenceSeconds: 120,
    aiInputs: {
      candles: { enabled: true, count: 200, timeframe: "5m" },
      orderbook: { enabled: false, depth: 20 },
      indicators: {
        rsi: { enabled: true, period: 14 },
        atr: { enabled: false, period: 14 },
        volatility: { enabled: true, window: 50 },
        ema: { enabled: true, fast: 12, slow: 26 },
      },
      includePositionState: true,
      includeRecentDecisions: true,
      recentDecisionsCount: 5,
      includeRecentTrades: true,
      recentTradesCount: 10,
    },
    entryExit: {
      entry: {
        mode: "signal",
        behaviors: { trend: true, breakout: true, meanReversion: true },
        confirmation: {
          minSignals: 2,
          requireVolatilityCondition: false,
          volatilityMin: 0.3,
          volatilityMax: null,
        },
        timing: { waitForClose: false, maxSlippagePct: 0.005 },
      },
      exit: {
        mode: "signal",
        maxLossProtectionPct: 10,
        maxProfitCapPct: null,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        trailingStopPct: null,
        initialStopLossPct: null,
        maxHoldMinutes: null,
      },
      tradeControl: {
        maxTradesPerHour: 2,
        maxTradesPerDay: 10,
        cooldownMinutes: 15,
        minHoldMinutes: 5,
        allowReentrySameDirection: false,
      },
      confidenceControl: {
        minConfidence: 0.70,
        confidenceScaling: true,
      },
    },
    guardrails: { allowLong: true, allowShort: true },
    risk: { maxDailyLossPct: 5, maxPositionUsd: 1000, maxLeverage: 5 },
  },
  aggressive: {
    label: "Aggressive",
    description: "Maximum opportunities with higher risk tolerance. Active trading with momentum focus and all strategies enabled.",
    tagline: "Maximum Opportunity",
    color: "orange",
    prompt: `You are an aggressive trading agent focused on maximizing opportunities.
Actively monitor momentum and take trades frequently when signals align.
Use all available strategies - trends, breakouts, and mean-reversion.
Be willing to take trades with lower conviction if the risk/reward is favorable.
Trade actively but still respect your risk limits.
Look for momentum shifts and act quickly on breakout signals.`,
    cadenceSeconds: 60,
    aiInputs: {
      candles: { enabled: true, count: 200, timeframe: "5m" },
      orderbook: { enabled: true, depth: 20 },
      indicators: {
        rsi: { enabled: true, period: 14 },
        atr: { enabled: true, period: 14 },
        volatility: { enabled: true, window: 50 },
        ema: { enabled: true, fast: 12, slow: 26 },
      },
      includePositionState: true,
      includeRecentDecisions: true,
      recentDecisionsCount: 5,
      includeRecentTrades: true,
      recentTradesCount: 10,
    },
    entryExit: {
      entry: {
        mode: "signal",
        behaviors: { trend: true, breakout: true, meanReversion: true },
        confirmation: {
          minSignals: 1,
          requireVolatilityCondition: false,
          volatilityMin: 0.3,
          volatilityMax: null,
        },
        timing: { waitForClose: false, maxSlippagePct: 0.005 },
      },
      exit: {
        mode: "signal",
        maxLossProtectionPct: null,
        maxProfitCapPct: null,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        trailingStopPct: null,
        initialStopLossPct: null,
        maxHoldMinutes: null,
      },
      tradeControl: {
        maxTradesPerHour: 5,
        maxTradesPerDay: 20,
        cooldownMinutes: 5,
        minHoldMinutes: 2,
        allowReentrySameDirection: true,
      },
      confidenceControl: {
        minConfidence: 0.65,
        confidenceScaling: true,
      },
    },
    guardrails: { allowLong: true, allowShort: true },
    risk: { maxDailyLossPct: 10, maxPositionUsd: 2000, maxLeverage: 10 },
  },
};
