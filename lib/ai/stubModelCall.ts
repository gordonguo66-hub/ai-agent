import { Intent } from "./intentSchema";

/**
 * Stub model call that returns a deterministic Intent based on the strategy prompt.
 * In production, this would call the actual model API.
 */
export async function stubModelCall(
  prompt: string,
  modelProvider: string,
  modelName: string
): Promise<Intent> {
  // Create a simple hash from the prompt for deterministic behavior
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use hash to generate deterministic values
  const seed = Math.abs(hash);
  const random = (max: number) => (seed % max) / max;

  const biases: ("long" | "short" | "neutral")[] = ["long", "short", "neutral"];
  const bias = biases[seed % 3];

  return {
    market: "BTC/USD",
    bias,
    confidence: 0.5 + random(0.5),
    entry_zone: {
      lower: 40000 + random(5000),
      upper: 45000 + random(5000),
    },
    stop_loss: 38000 + random(2000),
    take_profit: 50000 + random(10000),
    risk: 0.1 + random(0.2),
    reasoning: `Stub decision based on prompt analysis. Model: ${modelProvider}/${modelName}`,
  };
}
