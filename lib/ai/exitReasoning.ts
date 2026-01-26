/**
 * Builds comprehensive exit reasoning for AI-driven exits.
 * This ensures decision logs include full explanations consistent with entry decisions.
 */

export interface ExitContext {
  positionSide: "long" | "short";
  aiIntent: "long" | "short" | "neutral";
  aiReasoning: string;
  confidence: number;
  market: string;
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  unrealizedPnl: number;
  indicators?: {
    rsi?: { value: number; period: number };
    atr?: { value: number; period: number };
    volatility?: { value: number };
    ema?: { fast?: { value: number; period: number }; slow?: { value: number; period: number } };
  };
}

/**
 * Generates a detailed reasoning explanation for AI-driven exits.
 * Combines the AI's market analysis with exit-specific context.
 */
export function buildExitReasoning(ctx: ExitContext): string {
  const paragraphs: string[] = [];

  // Paragraph 1: Exit trigger explanation
  const oppositeAction = ctx.positionSide === "long" ? "bearish/short" : "bullish/long";
  const conflictExplanation = ctx.aiIntent === "neutral"
    ? `AI analysis shifted to neutral stance while holding ${ctx.positionSide} position`
    : `AI signal flipped to ${ctx.aiIntent} while holding ${ctx.positionSide} position`;

  const pnlPct = ctx.entryPrice > 0
    ? ((ctx.unrealizedPnl / (ctx.entryPrice * ctx.positionSize)) * 100).toFixed(2)
    : "0";
  const pnlDescription = ctx.unrealizedPnl >= 0
    ? `+${pnlPct}% profit`
    : `${pnlPct}% loss`;

  paragraphs.push(
    `Exit triggered: ${conflictExplanation}. ` +
    `Closing ${ctx.positionSide} position of ${ctx.positionSize.toFixed(4)} ${ctx.market} ` +
    `at $${ctx.currentPrice.toFixed(2)} (entry: $${ctx.entryPrice.toFixed(2)}, ${pnlDescription}). ` +
    `AI confidence: ${(ctx.confidence * 100).toFixed(0)}%.`
  );

  // Paragraph 2: AI's market analysis (from original reasoning)
  if (ctx.aiReasoning && ctx.aiReasoning.trim().length > 0) {
    paragraphs.push(`Market analysis: ${ctx.aiReasoning}`);
  }

  // Paragraph 3: Indicator-based supporting evidence
  const indicatorNotes: string[] = [];

  if (ctx.indicators?.rsi?.value !== undefined) {
    const rsi = ctx.indicators.rsi.value;
    if (rsi > 70) {
      indicatorNotes.push(`RSI(${ctx.indicators.rsi.period}) at ${rsi.toFixed(1)} indicates overbought conditions`);
    } else if (rsi < 30) {
      indicatorNotes.push(`RSI(${ctx.indicators.rsi.period}) at ${rsi.toFixed(1)} indicates oversold conditions`);
    } else {
      indicatorNotes.push(`RSI(${ctx.indicators.rsi.period}) at ${rsi.toFixed(1)}`);
    }
  }

  if (ctx.indicators?.ema?.fast && ctx.indicators?.ema?.slow) {
    const fast = ctx.indicators.ema.fast.value;
    const slow = ctx.indicators.ema.slow.value;
    const trend = fast > slow ? "bullish" : "bearish";
    const crossStrength = Math.abs(((fast - slow) / slow) * 100).toFixed(2);
    indicatorNotes.push(`EMA trend is ${trend} (${ctx.indicators.ema.fast.period}/${ctx.indicators.ema.slow.period} spread: ${crossStrength}%)`);
  }

  if (ctx.indicators?.atr?.value !== undefined && ctx.currentPrice > 0) {
    const atrPct = ((ctx.indicators.atr.value / ctx.currentPrice) * 100).toFixed(2);
    indicatorNotes.push(`ATR(${ctx.indicators.atr.period}) at ${atrPct}% of price`);
  }

  if (ctx.indicators?.volatility?.value !== undefined) {
    indicatorNotes.push(`Volatility: ${(ctx.indicators.volatility.value * 100).toFixed(2)}%`);
  }

  if (indicatorNotes.length > 0) {
    paragraphs.push(`Technical context: ${indicatorNotes.join(". ")}.`);
  }

  return paragraphs.join("\n\n");
}

/**
 * Determines the appropriate intent bias for an exit decision.
 * For exits, the intent reflects WHY we're exiting, not what we're doing.
 */
export function determineExitIntentBias(
  positionSide: "long" | "short",
  aiIntent: "long" | "short" | "neutral"
): "long" | "short" | "neutral" {
  // The exit intent should reflect the AI's current view, which triggered the exit
  return aiIntent;
}
