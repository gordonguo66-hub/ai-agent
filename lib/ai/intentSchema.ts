export interface Intent {
  market: string;
  bias: "long" | "short" | "neutral";
  confidence: number; // 0-1
  entry_zone: {
    lower: number;
    upper: number;
  };
  stop_loss: number;
  take_profit: number;
  risk: number; // 0-1
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
    bias: { type: "string", enum: ["long", "short", "neutral"] },
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
    reasoning: { type: "string" },
  },
};
