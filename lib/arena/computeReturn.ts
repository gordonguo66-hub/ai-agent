/**
 * Pure function: compute return % series from sorted equity snapshots.
 *
 * @param snapshots – array of { time, equity } sorted ascending by time.
 * @param baseline  – the reference equity to compute returns against.
 *                    For Arena this is the session's starting equity (typically 100,000).
 *                    If omitted or <= 0, falls back to the first snapshot's equity.
 * @returns array of { time, equity, returnPct } where
 *          returnPct = (equity / baseline - 1) * 100.
 */
export interface EquitySnapshot {
  time: number;
  equity: number;
}

export interface EquityWithReturn {
  time: number;
  equity: number;
  returnPct: number;
}

export function computeReturnSeries(
  snapshots: EquitySnapshot[],
  baseline?: number,
): EquityWithReturn[] {
  if (snapshots.length === 0) return [];

  const base = (baseline && baseline > 0) ? baseline : snapshots[0].equity;
  if (base <= 0) {
    return snapshots.map((s) => ({ time: s.time, equity: s.equity, returnPct: 0 }));
  }

  return snapshots.map((s) => ({
    time: s.time,
    equity: s.equity,
    returnPct: ((s.equity / base) - 1) * 100,
  }));
}
