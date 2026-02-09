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
   * Leverage to use for the trade (1 to maxLeverage).
   * - 1 = no leverage (spot-equivalent)
   * - 2 = 2x leverage
   * - etc. up to the user's configured maxLeverage
   * Only applies to perpetual markets. Spot markets always use 1x.
   * Defaults to 1 if not specified.
   */
  leverage?: number; // 1 to maxLeverage
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
    leverage: { type: "number", minimum: 1, description: "Leverage to use (1 to maxLeverage). 1 = no leverage, higher = more risk/reward" },
    reasoning: { type: "string" },
  },
};
