/**
 * Market Analysis Layer
 *
 * Pre-processes raw candle data and indicators into structured market insights
 * that are added alongside raw data in the AI context.
 *
 * This runs BEFORE the AI call and provides:
 * - Market regime detection (trending/ranging/volatile)
 * - Key support/resistance level analysis
 * - Multi-timeframe alignment signals
 * - Human-readable market summary
 *
 * Uses whichever indicators are available (graceful degradation if some disabled).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MarketRegime {
  trend: "strong_uptrend" | "uptrend" | "neutral" | "downtrend" | "strong_downtrend";
  trendStrength: number; // 0-100
  regime: "trending" | "ranging" | "volatile";
  confidence: number; // 0-1
}

export interface KeyLevels {
  nearestSupport: number;
  nearestResistance: number;
  distanceToSupportPct: number;
  distanceToResistancePct: number;
  pricePosition: "near_support" | "near_resistance" | "mid_range" | "above_resistance" | "below_support";
}

export interface MultiTimeframeSignal {
  primaryTimeframe: string;
  higherTimeframe: string;
  htfTrend: "up" | "down" | "neutral";
  htfRSI?: number;
  alignment: "aligned_bullish" | "aligned_bearish" | "conflicting" | "neutral";
}

export interface MarketAnalysis {
  regime: MarketRegime;
  keyLevels: KeyLevels | null;
  multiTimeframe: MultiTimeframeSignal | null;
  summary: string;
}

// ============================================================================
// MARKET REGIME DETECTION
// ============================================================================

/**
 * Detects the current market regime from candles and available indicators.
 * Uses whichever indicators are present - gracefully handles missing ones.
 */
export function detectMarketRegime(
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[],
  indicators: Record<string, any>
): MarketRegime {
  if (candles.length < 20) {
    return { trend: "neutral", trendStrength: 0, regime: "ranging", confidence: 0.3 };
  }

  let bullishSignals = 0;
  let bearishSignals = 0;
  let totalSignals = 0;
  let volatilityLevel: "low" | "normal" | "high" = "normal";

  // 1. Price structure analysis (always available - uses candles directly)
  const recentCandles = candles.slice(-20);
  let higherHighs = 0;
  let lowerLows = 0;
  let higherLows = 0;
  let lowerHighs = 0;

  for (let i = 1; i < recentCandles.length; i++) {
    if (recentCandles[i].h > recentCandles[i - 1].h) higherHighs++;
    if (recentCandles[i].l < recentCandles[i - 1].l) lowerLows++;
    if (recentCandles[i].l > recentCandles[i - 1].l) higherLows++;
    if (recentCandles[i].h < recentCandles[i - 1].h) lowerHighs++;
  }

  const total = recentCandles.length - 1;
  const hhRatio = higherHighs / total;
  const llRatio = lowerLows / total;
  const hlRatio = higherLows / total;
  const lhRatio = lowerHighs / total;

  // Uptrend structure: higher highs + higher lows
  if (hhRatio > 0.55 && hlRatio > 0.55) {
    bullishSignals += 2;
  } else if (hhRatio > 0.45 && hlRatio > 0.45) {
    bullishSignals += 1;
  }

  // Downtrend structure: lower lows + lower highs
  if (llRatio > 0.55 && lhRatio > 0.55) {
    bearishSignals += 2;
  } else if (llRatio > 0.45 && lhRatio > 0.45) {
    bearishSignals += 1;
  }

  totalSignals += 2;

  // 2. Price vs opening range
  const firstClose = recentCandles[0].c;
  const lastClose = recentCandles[recentCandles.length - 1].c;
  const priceChangePct = ((lastClose - firstClose) / firstClose) * 100;

  if (priceChangePct > 1.0) bullishSignals += 2;
  else if (priceChangePct > 0.3) bullishSignals += 1;
  else if (priceChangePct < -1.0) bearishSignals += 2;
  else if (priceChangePct < -0.3) bearishSignals += 1;
  totalSignals += 2;

  // 3. EMA alignment (if available)
  if (indicators.ema?.fast && indicators.ema?.slow) {
    const emaFast = indicators.ema.fast.value;
    const emaSlow = indicators.ema.slow.value;
    const currentPrice = lastClose;

    if (currentPrice > emaFast && emaFast > emaSlow) {
      bullishSignals += 2; // Strong bullish: price > fast EMA > slow EMA
    } else if (emaFast > emaSlow) {
      bullishSignals += 1; // Mild bullish: fast > slow
    } else if (currentPrice < emaFast && emaFast < emaSlow) {
      bearishSignals += 2; // Strong bearish: price < fast EMA < slow EMA
    } else if (emaFast < emaSlow) {
      bearishSignals += 1; // Mild bearish: fast < slow
    }
    totalSignals += 2;
  }

  // 4. MACD (if available)
  if (indicators.macd) {
    const { histogram, macdLine } = indicators.macd;
    if (histogram > 0 && macdLine > 0) {
      bullishSignals += 2;
    } else if (histogram > 0) {
      bullishSignals += 1;
    } else if (histogram < 0 && macdLine < 0) {
      bearishSignals += 2;
    } else if (histogram < 0) {
      bearishSignals += 1;
    }
    totalSignals += 2;
  }

  // 5. RSI (if available)
  if (indicators.rsi) {
    const rsi = indicators.rsi.value;
    if (rsi > 60) bullishSignals += 1;
    else if (rsi < 40) bearishSignals += 1;
    totalSignals += 1;
  }

  // 6. Bollinger Bands bandwidth for volatility assessment (if available)
  if (indicators.bollingerBands) {
    const { bandwidth, percentB } = indicators.bollingerBands;
    if (bandwidth < 1.5) volatilityLevel = "low"; // Squeeze
    else if (bandwidth > 4.0) volatilityLevel = "high"; // Expansion

    if (percentB > 0.8) bullishSignals += 1;
    else if (percentB < 0.2) bearishSignals += 1;
    totalSignals += 1;
  }

  // Calculate trend strength and direction
  const netScore = totalSignals > 0 ? (bullishSignals - bearishSignals) / totalSignals : 0;
  const trendStrength = Math.min(100, Math.round(Math.abs(netScore) * 100));
  const confidence = Math.min(1, totalSignals / 10); // More signals = more confident

  let trend: MarketRegime["trend"];
  if (netScore > 0.6) trend = "strong_uptrend";
  else if (netScore > 0.2) trend = "uptrend";
  else if (netScore < -0.6) trend = "strong_downtrend";
  else if (netScore < -0.2) trend = "downtrend";
  else trend = "neutral";

  let regime: MarketRegime["regime"];
  if (volatilityLevel === "high" && trendStrength < 30) {
    regime = "volatile";
  } else if (trendStrength < 25 || volatilityLevel === "low") {
    regime = "ranging";
  } else {
    regime = "trending";
  }

  return { trend, trendStrength, regime, confidence };
}

// ============================================================================
// KEY LEVELS ANALYSIS
// ============================================================================

/**
 * Analyzes key price levels relative to current price.
 * Only useful if supportResistance indicator is available.
 */
export function analyzeKeyLevels(
  currentPrice: number,
  supportResistance: {
    nearestSupport: number;
    nearestResistance: number;
    supports: number[];
    resistances: number[];
  } | null
): KeyLevels | null {
  if (!supportResistance || currentPrice <= 0) return null;

  const { nearestSupport, nearestResistance } = supportResistance;

  const distanceToSupportPct = ((currentPrice - nearestSupport) / currentPrice) * 100;
  const distanceToResistancePct = ((nearestResistance - currentPrice) / currentPrice) * 100;

  let pricePosition: KeyLevels["pricePosition"];
  if (distanceToSupportPct < 0.3) pricePosition = "near_support";
  else if (distanceToResistancePct < 0.3) pricePosition = "near_resistance";
  else if (currentPrice > nearestResistance) pricePosition = "above_resistance";
  else if (currentPrice < nearestSupport) pricePosition = "below_support";
  else pricePosition = "mid_range";

  return {
    nearestSupport,
    nearestResistance,
    distanceToSupportPct,
    distanceToResistancePct,
    pricePosition,
  };
}

// ============================================================================
// MULTI-TIMEFRAME ANALYSIS
// ============================================================================

/**
 * Compares primary and higher-timeframe indicators to determine alignment.
 */
export function analyzeMultiTimeframe(
  primaryIndicators: Record<string, any>,
  htfIndicators: Record<string, any>,
  primaryTimeframe: string,
  htfTimeframe: string
): MultiTimeframeSignal {
  let htfTrend: MultiTimeframeSignal["htfTrend"] = "neutral";
  let htfRSI: number | undefined;

  // Determine HTF trend from available indicators
  let htfBullish = 0;
  let htfBearish = 0;

  if (htfIndicators.ema?.fast && htfIndicators.ema?.slow) {
    if (htfIndicators.ema.fast.value > htfIndicators.ema.slow.value) htfBullish++;
    else htfBearish++;
  }

  if (htfIndicators.macd) {
    if (htfIndicators.macd.histogram > 0) htfBullish++;
    else if (htfIndicators.macd.histogram < 0) htfBearish++;
  }

  if (htfIndicators.rsi) {
    const rsiVal = htfIndicators.rsi.value;
    htfRSI = rsiVal;
    if (rsiVal > 55) htfBullish++;
    else if (rsiVal < 45) htfBearish++;
  }

  if (htfBullish > htfBearish) htfTrend = "up";
  else if (htfBearish > htfBullish) htfTrend = "down";

  // Determine primary trend
  let primaryBullish = 0;
  let primaryBearish = 0;

  if (primaryIndicators.ema?.fast && primaryIndicators.ema?.slow) {
    if (primaryIndicators.ema.fast.value > primaryIndicators.ema.slow.value) primaryBullish++;
    else primaryBearish++;
  }

  if (primaryIndicators.macd) {
    if (primaryIndicators.macd.histogram > 0) primaryBullish++;
    else if (primaryIndicators.macd.histogram < 0) primaryBearish++;
  }

  if (primaryIndicators.rsi) {
    if (primaryIndicators.rsi.value > 55) primaryBullish++;
    else if (primaryIndicators.rsi.value < 45) primaryBearish++;
  }

  const primaryTrend = primaryBullish > primaryBearish ? "up" : primaryBearish > primaryBullish ? "down" : "neutral";

  // Determine alignment
  let alignment: MultiTimeframeSignal["alignment"];
  if (htfTrend === "up" && primaryTrend === "up") alignment = "aligned_bullish";
  else if (htfTrend === "down" && primaryTrend === "down") alignment = "aligned_bearish";
  else if (htfTrend === "neutral" || primaryTrend === "neutral") alignment = "neutral";
  else alignment = "conflicting";

  return {
    primaryTimeframe,
    higherTimeframe: htfTimeframe,
    htfTrend,
    htfRSI,
    alignment,
  };
}

// ============================================================================
// MARKET SUMMARY GENERATOR
// ============================================================================

/**
 * Generates a human-readable market analysis summary from available data.
 * This is added ALONGSIDE raw candle data, not replacing it.
 * Uses only indicators that are actually available.
 */
export function generateMarketSummary(
  market: string,
  currentPrice: number,
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[],
  indicators: Record<string, any>,
  regime: MarketRegime,
  keyLevels: KeyLevels | null,
  mtf: MultiTimeframeSignal | null
): string {
  const parts: string[] = [];

  // Header
  parts.push(`MARKET ANALYSIS (${market}):`);

  // Price context
  if (candles.length >= 2) {
    const recentCandles = candles.slice(-50);
    const high = Math.max(...recentCandles.map((c) => c.h));
    const low = Math.min(...recentCandles.map((c) => c.l));
    parts.push(`- Price: $${currentPrice.toFixed(2)} | Recent Range: $${low.toFixed(2)} - $${high.toFixed(2)}`);
  }

  // Regime
  const regimeLabel = regime.trend.replace(/_/g, " ").toUpperCase();
  parts.push(`- Regime: ${regimeLabel} (strength: ${regime.trendStrength}/100, ${regime.regime})`);

  // MACD
  if (indicators.macd) {
    const { macdLine, signalLine, histogram } = indicators.macd;
    const direction = histogram > 0 ? "bullish" : "bearish";
    // Determine if strengthening or weakening by comparing to recent
    const momentum = Math.abs(histogram) > Math.abs(macdLine) * 0.5 ? "strong" : "moderate";
    parts.push(`- MACD: Histogram ${histogram > 0 ? "+" : ""}${histogram.toFixed(4)} (${direction}, ${momentum})`);
  }

  // RSI
  if (indicators.rsi) {
    const rsi = indicators.rsi.value;
    let rsiLabel = "neutral";
    if (rsi > 70) rsiLabel = "overbought";
    else if (rsi > 60) rsiLabel = "bullish";
    else if (rsi > 55) rsiLabel = "mildly bullish";
    else if (rsi < 30) rsiLabel = "oversold";
    else if (rsi < 40) rsiLabel = "bearish";
    else if (rsi < 45) rsiLabel = "mildly bearish";
    parts.push(`- RSI(${indicators.rsi.period}): ${rsi.toFixed(1)} (${rsiLabel})`);
  }

  // Bollinger Bands
  if (indicators.bollingerBands) {
    const { upper, lower, bandwidth, percentB } = indicators.bollingerBands;
    let bbPosition = "middle";
    if (percentB > 0.8) bbPosition = "near upper band (overbought zone)";
    else if (percentB < 0.2) bbPosition = "near lower band (oversold zone)";
    else if (percentB > 0.6) bbPosition = "upper half";
    else if (percentB < 0.4) bbPosition = "lower half";

    let squeeze = "";
    if (bandwidth < 1.5) squeeze = " [SQUEEZE - low volatility, breakout potential]";
    else if (bandwidth > 4.0) squeeze = " [EXPANDED - high volatility]";

    parts.push(`- Bollinger: Price at ${(percentB * 100).toFixed(0)}% (${bbPosition}), BW: ${bandwidth.toFixed(2)}%${squeeze}`);
  }

  // EMA
  if (indicators.ema?.fast && indicators.ema?.slow) {
    const fast = indicators.ema.fast.value;
    const slow = indicators.ema.slow.value;
    const cross = fast > slow ? "bullish" : "bearish";
    const separation = Math.abs(((fast - slow) / slow) * 100);
    parts.push(`- EMA(${indicators.ema.fast.period}/${indicators.ema.slow.period}): ${cross} cross (${separation.toFixed(2)}% separation)`);
  }

  // Support/Resistance
  if (keyLevels) {
    parts.push(
      `- Support: $${keyLevels.nearestSupport.toFixed(2)} (${keyLevels.distanceToSupportPct.toFixed(1)}% below) | Resistance: $${keyLevels.nearestResistance.toFixed(2)} (${keyLevels.distanceToResistancePct.toFixed(1)}% above)`
    );
    parts.push(`- Price Position: ${keyLevels.pricePosition.replace(/_/g, " ")}`);
  }

  // Volume
  if (indicators.volume) {
    const { currentVolumeRatio, volumeTrend } = indicators.volume;
    parts.push(`- Volume: ${currentVolumeRatio.toFixed(2)}x average (${volumeTrend})`);
  }

  // ATR / Volatility
  if (indicators.atr) {
    parts.push(`- ATR(${indicators.atr.period}): ${indicators.atr.value.toFixed(4)}`);
  }
  if (indicators.volatility) {
    parts.push(`- Volatility: ${indicators.volatility.value.toFixed(2)}%`);
  }

  // Multi-timeframe
  if (mtf) {
    const alignLabel = mtf.alignment.replace(/_/g, " ");
    parts.push(
      `- Higher TF (${mtf.higherTimeframe}): ${mtf.htfTrend} trend${mtf.htfRSI ? `, RSI ${mtf.htfRSI.toFixed(1)}` : ""} | Alignment: ${alignLabel}`
    );
  }

  return parts.join("\n");
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Runs the full market analysis pipeline.
 * Call this in the tick handler after computing indicators.
 */
export function runMarketAnalysis(args: {
  market: string;
  currentPrice: number;
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  indicators: Record<string, any>;
  htfIndicators?: Record<string, any>;
  primaryTimeframe?: string;
  htfTimeframe?: string;
}): MarketAnalysis {
  const { market, currentPrice, candles, indicators, htfIndicators, primaryTimeframe, htfTimeframe } = args;

  // 1. Detect market regime
  const regime = detectMarketRegime(candles, indicators);

  // 2. Analyze key levels (only if S/R data available)
  const keyLevels = indicators.supportResistance
    ? analyzeKeyLevels(currentPrice, indicators.supportResistance)
    : null;

  // 3. Multi-timeframe analysis (only if HTF data provided)
  const multiTimeframe =
    htfIndicators && primaryTimeframe && htfTimeframe
      ? analyzeMultiTimeframe(indicators, htfIndicators, primaryTimeframe, htfTimeframe)
      : null;

  // 4. Generate summary
  const summary = generateMarketSummary(market, currentPrice, candles, indicators, regime, keyLevels, multiTimeframe);

  return { regime, keyLevels, multiTimeframe, summary };
}
