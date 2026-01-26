import { Intent } from "@/lib/ai/intentSchema";

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
  context: { market: string; marketData: any; positions: any };
  provider?: string; // Optional provider hint for API format selection
}): Promise<Intent> {
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const model = args.model?.trim();
  if (!model) throw new Error("Missing model");

  const system = [
    "You are a trading decision engine.",
    "Return ONLY valid JSON (no markdown) that matches this TypeScript interface:",
    "{ market: string, bias: 'long'|'short'|'neutral', confidence: number (0..1), entry_zone:{lower:number, upper:number}, stop_loss:number, take_profit:number, risk:number (0..1), reasoning:string }",
    "Bias neutral means no trade.",
  ].join("\n");

  const user = [
    `Strategy prompt:\n${args.prompt}`,
    `Market: ${args.context.market}`,
    `Market data snapshot (JSON):\n${JSON.stringify(args.context.marketData)}`,
    `Positions snapshot (JSON):\n${JSON.stringify(args.context.positions)}`,
    "Respond with JSON only.",
  ].join("\n\n");

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
    return parseIntentJson(content);
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
    return parseIntentJson(content);
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
  if (!["long", "short", "neutral"].includes(bias)) throw new Error("Invalid bias");

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

