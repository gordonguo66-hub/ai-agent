/**
 * Technical Indicator Calculations
 * Calculate RSI, ATR, Volatility, EMA, MACD, Bollinger Bands, Support/Resistance, Volume from candle data
 */

import { Candle } from "@/lib/hyperliquid/candles";

/**
 * Calculate RSI (Relative Strength Index)
 * @param candles - Array of candles (oldest first)
 * @param period - RSI period (default 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) {
    return null; // Not enough data
  }

  // Calculate price changes
  const priceChanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    priceChanges.push(candles[i].c - candles[i - 1].c);
  }

  // Separate gains and losses
  const gains = priceChanges.map((change) => (change > 0 ? change : 0));
  const losses = priceChanges.map((change) => (change < 0 ? -change : 0));

  // Calculate average gain and loss over the period
  // Use simple moving average for initial average
  let avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
  let avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;

  // Use Wilder's smoothing for subsequent values (more accurate RSI)
  for (let i = candles.length - period - 1; i < candles.length - 1; i++) {
    const idx = i - (candles.length - period - 1);
    if (idx > 0) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
  }

  if (avgLoss === 0) {
    return 100; // No losses, RSI is max
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.max(0, Math.min(100, rsi)); // Clamp between 0 and 100
}

/**
 * Calculate ATR (Average True Range)
 * @param candles - Array of candles (oldest first)
 * @param period - ATR period (default 14)
 * @returns ATR value
 */
export function calculateATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) {
    return null; // Not enough data
  }

  // Calculate True Range for each candle
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].c;
    const high = candles[i].h;
    const low = candles[i].l;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    const trueRange = Math.max(tr1, tr2, tr3);
    trueRanges.push(trueRange);
  }

  // Calculate ATR as Simple Moving Average of True Ranges
  const atrPeriods = trueRanges.slice(-period);
  const atr = atrPeriods.reduce((sum, tr) => sum + tr, 0) / period;

  return atr;
}

/**
 * Calculate Volatility (standard deviation of price changes)
 * @param candles - Array of candles (oldest first)
 * @param window - Volatility window (default 50)
 * @returns Volatility value (as percentage)
 */
export function calculateVolatility(candles: Candle[], window: number = 50): number | null {
  if (candles.length < window) {
    return null; // Not enough data
  }

  // Calculate returns (percentage changes)
  const returns: number[] = [];
  const recentCandles = candles.slice(-window);
  
  for (let i = 1; i < recentCandles.length; i++) {
    const prevClose = recentCandles[i - 1].c;
    const currClose = recentCandles[i].c;
    const returnPct = ((currClose - prevClose) / prevClose) * 100;
    returns.push(returnPct);
  }

  if (returns.length === 0) {
    return null;
  }

  // Calculate mean return
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate variance
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;

  // Standard deviation (volatility)
  const volatility = Math.sqrt(variance);

  return Math.abs(volatility); // Return absolute value
}

/**
 * Calculate EMA (Exponential Moving Average)
 * @param candles - Array of candles (oldest first)
 * @param period - EMA period
 * @returns EMA value
 */
export function calculateEMA(candles: Candle[], period: number): number | null {
  if (candles.length < period) {
    return null; // Not enough data
  }

  // Start with SMA for first EMA value
  const smaPeriod = candles.slice(-period);
  let ema = smaPeriod.reduce((sum, candle) => sum + candle.c, 0) / period;

  // Calculate smoothing factor
  const multiplier = 2 / (period + 1);

  // Calculate EMA for remaining candles
  for (let i = candles.length - period + 1; i < candles.length; i++) {
    const currentPrice = candles[i].c;
    ema = (currentPrice - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate EMA from an array of numbers (not candles)
 * Used internally by MACD calculation
 */
export function calculateEMAFromArray(values: number[], period: number): number | null {
  if (values.length < period) return null;

  // Start with SMA for first EMA value
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

  const multiplier = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param candles - Array of candles (oldest first)
 * @param fastPeriod - Fast EMA period (default 12)
 * @param slowPeriod - Slow EMA period (default 26)
 * @param signalPeriod - Signal EMA period (default 9)
 * @returns MACD line, signal line, and histogram
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macdLine: number; signalLine: number; histogram: number } | null {
  if (candles.length < slowPeriod + signalPeriod) return null;

  const closes = candles.map((c) => c.c);

  // Calculate MACD line values for enough history to compute the signal EMA
  const macdValues: number[] = [];
  for (let i = slowPeriod; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    const fastEMA = calculateEMAFromArray(slice, fastPeriod);
    const slowEMA = calculateEMAFromArray(slice, slowPeriod);
    if (fastEMA !== null && slowEMA !== null) {
      macdValues.push(fastEMA - slowEMA);
    }
  }

  if (macdValues.length < signalPeriod) return null;

  const signalLine = calculateEMAFromArray(macdValues, signalPeriod);
  if (signalLine === null) return null;

  const macdLine = macdValues[macdValues.length - 1];
  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}

/**
 * Calculate Bollinger Bands
 * @param candles - Array of candles (oldest first)
 * @param period - SMA period (default 20)
 * @param stdDevMultiplier - Standard deviation multiplier (default 2)
 * @returns Upper band, middle (SMA), lower band, bandwidth%, and %B
 */
export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number; bandwidth: number; percentB: number } | null {
  if (candles.length < period) return null;

  const recentCandles = candles.slice(-period);
  const closes = recentCandles.map((c) => c.c);

  // Middle band = SMA
  const middle = closes.reduce((sum, c) => sum + c, 0) / period;

  // Standard deviation
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;

  // Bandwidth = (upper - lower) / middle * 100
  const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;

  // %B = (close - lower) / (upper - lower)
  const currentClose = candles[candles.length - 1].c;
  const bandWidth = upper - lower;
  const percentB = bandWidth > 0 ? (currentClose - lower) / bandWidth : 0.5;

  return { upper, middle, lower, bandwidth, percentB };
}

/**
 * Calculate Support and Resistance levels from swing highs/lows
 * @param candles - Array of candles (oldest first)
 * @param lookback - Number of candles to analyze (default 50)
 * @returns Support/resistance levels with nearest to current price
 */
export function calculateSupportResistance(
  candles: Candle[],
  lookback: number = 50
): {
  supports: number[];
  resistances: number[];
  nearestSupport: number;
  nearestResistance: number;
} | null {
  const recent = candles.slice(-lookback);
  if (recent.length < 5) return null;

  const currentPrice = recent[recent.length - 1].c;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  // Detect swing highs and lows using 3-candle window
  for (let i = 1; i < recent.length - 1; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const next = recent[i + 1];

    // Swing high: current high is higher than both neighbors
    if (curr.h > prev.h && curr.h > next.h) {
      swingHighs.push(curr.h);
    }
    // Swing low: current low is lower than both neighbors
    if (curr.l < prev.l && curr.l < next.l) {
      swingLows.push(curr.l);
    }
  }

  if (swingHighs.length === 0 && swingLows.length === 0) return null;

  // Cluster nearby levels within 0.5% of each other
  const clusterLevels = (levels: number[]): number[] => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: { sum: number; count: number }[] = [];

    for (const level of sorted) {
      const existingCluster = clusters.find(
        (c) => Math.abs(c.sum / c.count - level) / (c.sum / c.count) < 0.005
      );
      if (existingCluster) {
        existingCluster.sum += level;
        existingCluster.count += 1;
      } else {
        clusters.push({ sum: level, count: 1 });
      }
    }

    // Return cluster averages, sorted by touch count (most tested first)
    return clusters
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c) => c.sum / c.count);
  };

  const resistances = clusterLevels(swingHighs).filter((l) => l > currentPrice);
  const supports = clusterLevels(swingLows).filter((l) => l < currentPrice);

  const nearestResistance = resistances.length > 0
    ? resistances.reduce((nearest, l) => (l < nearest ? l : nearest), Infinity)
    : currentPrice * 1.02; // Default 2% above if no resistance found
  const nearestSupport = supports.length > 0
    ? supports.reduce((nearest, l) => (l > nearest ? l : nearest), 0)
    : currentPrice * 0.98; // Default 2% below if no support found

  return { supports, resistances, nearestSupport, nearestResistance };
}

/**
 * Calculate Volume Profile / Analysis
 * @param candles - Array of candles (oldest first)
 * @param lookback - Number of candles to analyze (default 50)
 * @returns Average volume, current volume ratio, and volume trend
 */
export function calculateVolumeProfile(
  candles: Candle[],
  lookback: number = 50
): { avgVolume: number; currentVolumeRatio: number; volumeTrend: "increasing" | "decreasing" | "neutral" } | null {
  const recent = candles.slice(-lookback);
  if (recent.length < 10) return null;

  const volumes = recent.map((c) => c.v);
  const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;

  if (avgVolume === 0) return null;

  // Current volume ratio (last candle vs average)
  const currentVolume = volumes[volumes.length - 1];
  const currentVolumeRatio = currentVolume / avgVolume;

  // Volume trend: compare average of last 10 vs previous 10
  const recentHalf = volumes.slice(-10);
  const olderHalf = volumes.slice(-20, -10);

  if (olderHalf.length < 5) {
    return { avgVolume, currentVolumeRatio, volumeTrend: "neutral" };
  }

  const recentAvg = recentHalf.reduce((s, v) => s + v, 0) / recentHalf.length;
  const olderAvg = olderHalf.reduce((s, v) => s + v, 0) / olderHalf.length;

  let volumeTrend: "increasing" | "decreasing" | "neutral";
  if (olderAvg === 0) {
    volumeTrend = "neutral";
  } else {
    const changeRatio = recentAvg / olderAvg;
    if (changeRatio > 1.15) volumeTrend = "increasing";
    else if (changeRatio < 0.85) volumeTrend = "decreasing";
    else volumeTrend = "neutral";
  }

  return { avgVolume, currentVolumeRatio, volumeTrend };
}

/**
 * Calculate all indicators from candles based on configuration
 */
export function calculateIndicators(candles: Candle[], config: {
  rsi?: { enabled: boolean; period?: number };
  atr?: { enabled: boolean; period?: number };
  volatility?: { enabled: boolean; window?: number };
  ema?: { enabled: boolean; fast?: number; slow?: number };
  macd?: { enabled: boolean; fastPeriod?: number; slowPeriod?: number; signalPeriod?: number };
  bollingerBands?: { enabled: boolean; period?: number; stdDev?: number };
  supportResistance?: { enabled: boolean; lookback?: number };
  volume?: { enabled: boolean; lookback?: number };
}): Record<string, any> {
  const indicators: Record<string, any> = {};

  if (config.rsi?.enabled) {
    const rsi = calculateRSI(candles, config.rsi.period || 14);
    if (rsi !== null) {
      indicators.rsi = {
        value: rsi,
        period: config.rsi.period || 14,
      };
    }
  }

  if (config.atr?.enabled) {
    const atr = calculateATR(candles, config.atr.period || 14);
    if (atr !== null) {
      indicators.atr = {
        value: atr,
        period: config.atr.period || 14,
      };
    }
  }

  if (config.volatility?.enabled) {
    const volatility = calculateVolatility(candles, config.volatility.window || 50);
    if (volatility !== null) {
      indicators.volatility = {
        value: volatility,
        window: config.volatility.window || 50,
      };
    }
  }

  if (config.ema?.enabled) {
    if (config.ema.fast) {
      const emaFast = calculateEMA(candles, config.ema.fast);
      if (emaFast !== null) {
        indicators.ema = indicators.ema || {};
        indicators.ema.fast = {
          value: emaFast,
          period: config.ema.fast,
        };
      }
    }
    if (config.ema.slow) {
      const emaSlow = calculateEMA(candles, config.ema.slow);
      if (emaSlow !== null) {
        indicators.ema = indicators.ema || {};
        indicators.ema.slow = {
          value: emaSlow,
          period: config.ema.slow,
        };
      }
    }
  }

  if (config.macd?.enabled) {
    const macd = calculateMACD(
      candles,
      config.macd.fastPeriod || 12,
      config.macd.slowPeriod || 26,
      config.macd.signalPeriod || 9
    );
    if (macd !== null) {
      indicators.macd = macd;
    }
  }

  if (config.bollingerBands?.enabled) {
    const bb = calculateBollingerBands(
      candles,
      config.bollingerBands.period || 20,
      config.bollingerBands.stdDev || 2
    );
    if (bb !== null) {
      indicators.bollingerBands = bb;
    }
  }

  if (config.supportResistance?.enabled) {
    const sr = calculateSupportResistance(candles, config.supportResistance.lookback || 50);
    if (sr !== null) {
      indicators.supportResistance = sr;
    }
  }

  if (config.volume?.enabled) {
    const vol = calculateVolumeProfile(candles, config.volume.lookback || 50);
    if (vol !== null) {
      indicators.volume = vol;
    }
  }

  return indicators;
}
