/**
 * Safe Number Utilities
 *
 * Utilities for safely handling numeric conversions to prevent
 * NaN propagation in financial calculations.
 */

/**
 * Safely convert a value to a number with a default fallback
 *
 * This function handles null, undefined, NaN, and Infinity values
 * by returning a safe default value instead.
 *
 * @param value - The value to convert to a number
 * @param defaultValue - The fallback value if conversion fails (default: 0)
 * @returns A finite number
 *
 * @example
 * safeNumber(null) // => 0
 * safeNumber("123.45") // => 123.45
 * safeNumber(undefined, 100) // => 100
 * safeNumber(NaN) // => 0
 */
export function safeNumber(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return defaultValue;
  }

  return num;
}

/**
 * Require a value to be a finite number, throwing if invalid
 *
 * Use this for values that must be valid numbers (e.g., from database queries
 * where we expect data to be present and valid).
 *
 * @param value - The value to validate
 * @param name - The name of the value (for error messages)
 * @returns The validated number
 * @throws Error if the value is not a finite number
 *
 * @example
 * requireFiniteNumber(account.equity, 'equity') // => 1000.50 or throws
 */
export function requireFiniteNumber(value: unknown, name: string): number {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    throw new Error(`${name} must be a finite number, got: ${value} (type: ${typeof value})`);
  }

  return num;
}

/**
 * Safely convert a value to a positive number
 *
 * Returns the default value if the result would be negative, NaN, or Infinity.
 *
 * @param value - The value to convert
 * @param defaultValue - The fallback value (default: 0)
 * @returns A non-negative finite number
 *
 * @example
 * safePositiveNumber(-100) // => 0
 * safePositiveNumber("50") // => 50
 */
export function safePositiveNumber(value: unknown, defaultValue: number = 0): number {
  const num = safeNumber(value, defaultValue);
  return num >= 0 ? num : defaultValue;
}

/**
 * Safely divide two numbers, returning a default value for division by zero
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @param defaultValue - Value to return if denominator is zero (default: 0)
 * @returns The division result or defaultValue
 *
 * @example
 * safeDivide(100, 0) // => 0
 * safeDivide(100, 5) // => 20
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  defaultValue: number = 0
): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return defaultValue;
  }

  if (denominator === 0) {
    return defaultValue;
  }

  const result = numerator / denominator;
  return Number.isFinite(result) ? result : defaultValue;
}

/**
 * Round a number to a specified number of decimal places
 *
 * Uses banker's rounding (round half to even) for financial precision.
 *
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 2)
 * @returns The rounded number
 *
 * @example
 * roundTo(123.456, 2) // => 123.46
 * roundTo(123.445, 2) // => 123.44 (banker's rounding)
 */
export function roundTo(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const multiplier = Math.pow(10, decimals);
  const shifted = value * multiplier;

  // Banker's rounding: round half to even
  const rounded = Math.round(shifted);

  // Handle exact halves - round to even
  if (Math.abs(shifted - rounded) === 0.5) {
    const floor = Math.floor(shifted);
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier;
  }

  return rounded / multiplier;
}

/**
 * Clamp a number between minimum and maximum values
 *
 * @param value - The number to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped value
 *
 * @example
 * clamp(150, 0, 100) // => 100
 * clamp(-50, 0, 100) // => 0
 * clamp(50, 0, 100) // => 50
 */
export function clamp(value: number, min: number, max: number): number {
  const num = safeNumber(value, min);
  return Math.max(min, Math.min(max, num));
}

/**
 * Check if a value is a valid finite number
 *
 * @param value - The value to check
 * @returns true if the value is a finite number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Assert that a calculation result is valid, throwing if NaN or Infinity
 *
 * Use this after critical financial calculations to catch errors early.
 *
 * @param value - The calculated value
 * @param operation - Description of the operation (for error messages)
 * @returns The validated value
 * @throws Error if the value is NaN or Infinity
 *
 * @example
 * const pnl = (exitPrice - entryPrice) * size;
 * assertValidResult(pnl, 'PnL calculation');
 */
export function assertValidResult(value: number, operation: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid result from ${operation}: ${value}`);
  }
  return value;
}
