export interface Intent {
  market: string;
  /**
   * Trading bias/decision:
   * - "long": Bullish - enter a new long position
   * - "short": Bearish - enter a new short position
   * - "hold": Keep current position open as-is (only when a position exists)
   * - "neutral": No trade - stay flat (only when no position exists)
   * - "close": Exit current position - used to lock in profits, cut losses, or reduce risk
   *            regardless of directional view. Only applicable when a position exists.
   */
  bias: "long" | "short" | "hold" | "neutral" | "close";
  confidence: number; // 0-1
  entry_zone: {
    lower: number;
    upper: number;
  };
  stop_loss: number;
  take_profit: number;
  risk: number; // 0-1
  /**
   * Leverage multiplier (0.1-1.0) representing how much of maxLeverage to use.
   * Higher values = more leverage = more risk/reward.
   * - 1.0 = use full maxLeverage (e.g., if maxLeverage=5x, use 5x)
   * - 0.5 = use half maxLeverage (e.g., if maxLeverage=5x, use 2.5x → rounds to 3x)
   * - 0.2 = use 20% of maxLeverage (e.g., if maxLeverage=5x, use 1x)
   * Only applies to entry orders. Defaults to 0.5 if not specified.
   */
  leverage?: number; // 0.1-1.0, optional
  reasoning: string;
}

export const intentSchema = {
  type: "object",
  required: [
    "market",
    "bias",
    "confidence",
    "entry_zone",
    "stop_loss",
    "take_profit",
    "risk",
    "reasoning",
  ],
  properties: {
    market: { type: "string" },
    bias: { type: "string", enum: ["long", "short", "hold", "neutral", "close"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    entry_zone: {
      type: "object",
      properties: {
        lower: { type: "number" },
        upper: { type: "number" },
      },
      required: ["lower", "upper"],
    },
    stop_loss: { type: "number" },
    take_profit: { type: "number" },
    risk: { type: "number", minimum: 0, maximum: 1 },
    leverage: { type: "number", minimum: 0.1, maximum: 1, description: "Leverage multiplier (0.1-1.0) - how much of maxLeverage to use based on conviction" },
    reasoning: { type: "string" },
  },
};
