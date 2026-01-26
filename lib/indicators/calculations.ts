/**
 * Technical Indicator Calculations
 * Calculate RSI, ATR, Volatility, EMA from candle data
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
 * Calculate all indicators from candles based on configuration
 */
export function calculateIndicators(candles: Candle[], config: {
  rsi?: { enabled: boolean; period?: number };
  atr?: { enabled: boolean; period?: number };
  volatility?: { enabled: boolean; window?: number };
  ema?: { enabled: boolean; fast?: number; slow?: number };
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

  return indicators;
}
