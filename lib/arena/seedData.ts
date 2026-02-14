/**
 * Seed data for the arena leaderboard and chart.
 *
 * Each trader has hand-crafted equity waypoints producing a unique curve shape
 * (staircase, V-shape, W-pattern, mountain, etc.). An Ornstein-Uhlenbeck
 * process adds mean-reverting noise so curves look realistic while staying
 * near their intended path.
 *
 * After the initial waypoint period, equity targets evolve daily based on
 * real BTC market data from Binance. 8 traders gain and 2 lose each day,
 * with magnitudes proportional to actual market volatility.
 *
 * Toggle with env var NEXT_PUBLIC_ARENA_SEED_DATA (defaults to "true").
 * Set to "false" to disable when real users populate the arena.
 */

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export function isSeedEnabled(): boolean {
  const val = process.env.NEXT_PUBLIC_ARENA_SEED_DATA;
  if (val === undefined || val === "") return true;
  return val !== "false";
}

// ---------------------------------------------------------------------------
// Seeded PRNG (deterministic per trader so charts don't jump on refresh)
// ---------------------------------------------------------------------------

function createSeededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  // xorshift32
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

// Box–Muller for normally distributed noise
function gaussianNoise(rand: () => number): number {
  const u1 = rand() || 0.0001;
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Date anchoring — daysAgo values were designed relative to this date.
// Each real day after this, traders gain one more day of history with
// market-driven equity changes.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const REFERENCE_DATE = new Date("2026-02-14T00:00:00Z").getTime();

function daysSinceReference(): number {
  return Math.max(0, Math.floor((Date.now() - REFERENCE_DATE) / DAY_MS));
}

function getActualDaysAgo(config: SeedTraderConfig): number {
  return config.daysAgo + daysSinceReference();
}

function todayUTCDateKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Trader profiles with per-trader waypoints
// ---------------------------------------------------------------------------

interface SeedTraderConfig {
  id: string;
  displayName: string;
  avatarStyle: string | null;
  avatarUrl?: string;
  daysAgo: number;
  volatility: number;
  waypoints: [number, number][]; // [dayOffset, equity]
  tradesCount: number;
  winRate: number;
  maxDrawdownPct: number;
}

const TRUMP_AVATAR = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/200px-Donald_Trump_official_portrait.jpg";


const SEED_TRADERS: SeedTraderConfig[] = [
  {
    // #1 on leaderboard — joined early, peaked ~88%, gave back, ends 45%
    id: "seed-trader-1", displayName: "marcus1999", avatarStyle: null,
    avatarUrl: "/avatars/seed/IMG_6382.jpg",
    daysAgo: 28, volatility: 0.012, tradesCount: 42, winRate: 62, maxDrawdownPct: 11.0,
    waypoints: [[0, 100000], [8, 97000], [11, 93000], [13, 140000], [17, 158000], [22, 148000], [28, 145000]],
  },
  {
    // OUTLIER: peaked then CATASTROPHIC -52% crash, slow grind back → 19%
    id: "seed-trader-2", displayName: "nateqt", avatarStyle: null,
    avatarUrl: "/avatars/seed/IMG_6380.jpg",
    daysAgo: 24, volatility: 0.018, tradesCount: 34, winRate: 58, maxDrawdownPct: 62.0,
    waypoints: [[0, 100000], [4, 108000], [8, 120000], [10, 125000], [12, 55000], [16, 48000], [20, 85000], [24, 119000]],
  },
  {
    // Contrarian — bled during chop, spiked during crash, gave back → 33%
    id: "seed-trader-3", displayName: "0xDrake", avatarStyle: null,
    avatarUrl: "/avatars/seed/drake.jpg",
    daysAgo: 22, volatility: 0.010, tradesCount: 87, winRate: 65, maxDrawdownPct: 15.0,
    waypoints: [[0, 100000], [6, 96000], [8, 91000], [11, 87000], [13, 135000], [19, 143000], [22, 133000]],
  },
  {
    // Joined mid-range but LOW return — steady boring grinder → 14%
    id: "seed-trader-4", displayName: "StacyK", avatarStyle: null,
    avatarUrl: "/avatars/seed/stacyk.jpg",
    daysAgo: 19, volatility: 0.008, tradesCount: 88, winRate: 55, maxDrawdownPct: 4.0,
    waypoints: [[0, 100000], [4, 102000], [8, 105000], [12, 108000], [16, 111000], [19, 114000]],
  },
  {
    // OUTLIER: almost blown out immediately (-50%), incredible comeback → 25%
    id: "seed-trader-5", displayName: "JayCapital", avatarStyle: null,
    avatarUrl: "/avatars/seed/jaycapital.jpg",
    daysAgo: 17, volatility: 0.016, tradesCount: 136, winRate: 57, maxDrawdownPct: 50.0,
    waypoints: [[0, 100000], [2, 88000], [5, 55000], [8, 50000], [12, 80000], [15, 110000], [17, 125000]],
  },
  {
    // Late bloomer — bled for a week, then found the strategy → SURGED to 40% (#2!)
    id: "seed-trader-6", displayName: "dvrgnt", avatarStyle: null,
    avatarUrl: "/avatars/seed/IMG_6383.jpg",
    daysAgo: 15, volatility: 0.012, tradesCount: 98, winRate: 71, maxDrawdownPct: 16.0,
    waypoints: [[0, 100000], [3, 93000], [6, 85000], [9, 100000], [12, 125000], [15, 140000]],
  },
  {
    // W pattern — up, crashed, recovered hard → 30%
    id: "seed-trader-7", displayName: "kris_88", avatarStyle: null,
    avatarUrl: "/avatars/seed/IMG_6384.jpg",
    daysAgo: 12, volatility: 0.014, tradesCount: 67, winRate: 60, maxDrawdownPct: 22.0,
    waypoints: [[0, 100000], [3, 118000], [6, 94000], [9, 108000], [12, 130000]],
  },
  {
    // Mountain → valley → up — moderate return → 17%
    id: "seed-trader-8", displayName: "ameliav", avatarStyle: null,
    avatarUrl: "/avatars/seed/ameliav.jpg",
    daysAgo: 10, volatility: 0.012, tradesCount: 102, winRate: 64, maxDrawdownPct: 18.0,
    waypoints: [[0, 100000], [3, 112000], [6, 92000], [8, 108000], [10, 117000]],
  },
  {
    // Only 7 days but on a HOT STREAK — caught big moves → 36% (#3!)
    // Trump photo as profile pic
    id: "seed-trader-9", displayName: "BJTexas", avatarUrl: TRUMP_AVATAR, avatarStyle: null,
    daysAgo: 7, volatility: 0.015, tradesCount: 89, winRate: 52, maxDrawdownPct: 5.0,
    waypoints: [[0, 100000], [2, 110000], [4, 124000], [6, 132000], [7, 136000]],
  },
  {
    // Newest, short history — simple climb → 12%
    // Never set a profile pic
    id: "seed-trader-10", displayName: "Raven504", avatarStyle: null,
    avatarUrl: "/avatars/seed/raven504.jpg",
    daysAgo: 4, volatility: 0.010, tradesCount: 45, winRate: 51, maxDrawdownPct: 3.0,
    waypoints: [[0, 100000], [2, 105000], [4, 112000]],
  },
];

// ---------------------------------------------------------------------------
// Avatar URL helper
// ---------------------------------------------------------------------------

function getAvatarUrl(config: SeedTraderConfig): string | null {
  if (config.avatarUrl) return config.avatarUrl;
  if (!config.avatarStyle) return null;
  return `https://api.dicebear.com/9.x/${config.avatarStyle}/svg?seed=${encodeURIComponent(config.displayName)}`;
}

// ---------------------------------------------------------------------------
// BTC market data fetcher (Binance public API)
// ---------------------------------------------------------------------------

let cachedMarketChanges: number[] | null = null;
let cachedMarketDay = "";

async function getMarketChanges(): Promise<number[]> {
  const days = daysSinceReference();
  if (days <= 0) return [];

  const today = todayUTCDateKey();
  if (cachedMarketChanges && cachedMarketDay === today) {
    return cachedMarketChanges;
  }

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${REFERENCE_DATE}&limit=${days + 1}`
    );
    const klines = await res.json();
    const closes: number[] = klines.map((k: unknown[]) => parseFloat(k[4] as string));

    // Close-to-close changes, exclude today's in-progress candle
    const changes: number[] = [];
    for (let i = 1; i < closes.length - 1; i++) {
      changes.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    // Include today's partial candle only if we have at least 2 closes
    if (closes.length >= 2) {
      const lastIdx = closes.length - 1;
      changes.push((closes[lastIdx] - closes[lastIdx - 1]) / closes[lastIdx - 1]);
    }

    cachedMarketChanges = changes;
    cachedMarketDay = today;
    return changes;
  } catch {
    // Fallback: deterministic small random changes
    const changes = Array.from({ length: days }, (_, i) => {
      const r = createSeededRandom(`fallback-market-${i}`);
      return (r() - 0.5) * 0.04; // ±2%
    });
    cachedMarketChanges = changes;
    cachedMarketDay = today;
    return changes;
  }
}

// ---------------------------------------------------------------------------
// Loser selection: deterministically pick exactly 2 losers per day
// ---------------------------------------------------------------------------

function selectLosers(dayIndex: number): Set<number> {
  const rand = createSeededRandom(`losers-day-${dayIndex}`);
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < 2; i++) {
    const j = i + Math.floor(rand() * (10 - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set([indices[0], indices[1]]);
}

// ---------------------------------------------------------------------------
// Market-driven waypoint extension
// ---------------------------------------------------------------------------

function getMarketDrivenWaypoints(
  config: SeedTraderConfig,
  traderIndex: number,
  marketChanges: number[]
): [number, number][] {
  const waypoints: [number, number][] = [...config.waypoints];
  if (marketChanges.length === 0) return waypoints;

  const lastDay = waypoints[waypoints.length - 1][0];
  let equity = waypoints[waypoints.length - 1][1];

  for (let i = 0; i < marketChanges.length; i++) {
    const day = lastDay + i + 1;
    const absChange = Math.abs(marketChanges[i]);
    const isFlat = absChange < 0.005; // <0.5% = flat market
    const losers = selectLosers(i);
    const isLoser = losers.has(traderIndex);
    const rand = createSeededRandom(`${config.id}-market-day-${i}`);

    let dailyChange: number;
    if (isFlat) {
      // Flat market: tiny noise only
      dailyChange = gaussianNoise(rand) * 0.005;
    } else if (isLoser) {
      // Loser: moves against the majority
      const beta = 0.3 + rand() * 1.7;
      const noise = gaussianNoise(rand) * 0.01;
      dailyChange = -(absChange * beta * (0.3 + rand() * 0.5) + Math.abs(noise));
    } else {
      // Winner: profits from market volatility
      const beta = 0.3 + rand() * 1.7;
      const noise = gaussianNoise(rand) * 0.01;
      dailyChange = absChange * beta + noise;
    }

    equity *= 1 + dailyChange;
    equity = Math.max(equity, STARTING_EQUITY * 0.3); // floor at -70%
    equity = Math.min(equity, STARTING_EQUITY * 5);   // ceiling at +400%
    waypoints.push([day, Math.round(equity)]);
  }

  return waypoints;
}

// ---------------------------------------------------------------------------
// Stats evolution
// ---------------------------------------------------------------------------

function getEvolvedStats(
  config: SeedTraderConfig,
  actualDaysAgo: number
): { tradesCount: number; winRate: number } {
  const extraDays = actualDaysAgo - config.daysAgo;
  if (extraDays <= 0) {
    return { tradesCount: config.tradesCount, winRate: config.winRate };
  }

  let trades = config.tradesCount;
  let winRate = config.winRate;

  for (let d = 1; d <= extraDays; d++) {
    const rand = createSeededRandom(`${config.id}-stats-${d}`);
    trades += Math.floor(rand() * 5) + 2; // +2-6 trades/day
    winRate += (rand() - 0.5) * 2;        // ±1% drift
    winRate = Math.max(40, Math.min(80, winRate));
  }

  return {
    tradesCount: trades,
    winRate: Math.round(winRate * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Max drawdown from equity curve
// ---------------------------------------------------------------------------

function computeMaxDrawdownFromCurve(
  points: ChartPoint[],
  originalMaxDD: number
): number {
  if (points.length < 2) return originalMaxDD;

  let peak = points[0].value;
  let maxDD = 0;

  for (const point of points) {
    if (point.value > peak) peak = point.value;
    const drawdown = ((peak - point.value) / peak) * 100;
    if (drawdown > maxDD) maxDD = drawdown;
  }

  return Math.round(Math.max(maxDD, originalMaxDD) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Waypoint interpolation
// ---------------------------------------------------------------------------

function interpolateWaypoints(waypoints: [number, number][], dayOffset: number): number {
  if (dayOffset <= waypoints[0][0]) return waypoints[0][1];
  if (dayOffset >= waypoints[waypoints.length - 1][0]) return waypoints[waypoints.length - 1][1];
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (dayOffset >= waypoints[i][0] && dayOffset < waypoints[i + 1][0]) {
      const t = (dayOffset - waypoints[i][0]) / (waypoints[i + 1][0] - waypoints[i][0]);
      return waypoints[i][1] + t * (waypoints[i + 1][1] - waypoints[i][1]);
    }
  }
  return waypoints[waypoints.length - 1][1];
}

// ---------------------------------------------------------------------------
// Equity curve generator (Ornstein-Uhlenbeck around waypoint path)
// ---------------------------------------------------------------------------

interface ChartPoint {
  time: number;
  value: number;
}

const STARTING_EQUITY = 100000;
const INTERVAL_MS = 30 * 60 * 1000; // 30-minute data points
const REVERSION_STRENGTH = 0.018; // per-step mean reversion (half-life ≈ 0.8 days)

function generateEquityCurve(
  config: SeedTraderConfig,
  extendedWaypoints: [number, number][],
  actualDaysAgo: number
): ChartPoint[] {
  // Generate curve up to start of current UTC day (daily-only updates)
  const todayStart = new Date(todayUTCDateKey() + "T00:00:00Z").getTime();
  const joinTime = todayStart - actualDaysAgo * DAY_MS;
  const rand = createSeededRandom(config.id);

  const totalSteps = Math.floor((todayStart - joinTime) / INTERVAL_MS);
  if (totalSteps <= 0) return [{ time: joinTime, value: STARTING_EQUITY }];

  const points: ChartPoint[] = [];
  let equity = STARTING_EQUITY;

  for (let i = 0; i <= totalSteps; i++) {
    const time = joinTime + i * INTERVAL_MS;
    points.push({ time, value: Math.round(equity * 100) / 100 });

    if (i === totalSteps) break;

    // Where the curve "should" be at this point (uses extended waypoints)
    const dayOffset = (time - joinTime) / DAY_MS;
    const targetEquity = interpolateWaypoints(extendedWaypoints, dayOffset);

    // Mean reversion toward waypoint path
    const deviationPct = (equity - targetEquity) / targetEquity;
    const reversion = -deviationPct * REVERSION_STRENGTH;

    // Continuous noise
    const noise = gaussianNoise(rand) * config.volatility;

    // Occasional jump moves (~6% chance) for sudden spikes/dips
    let jump = 0;
    if (rand() < 0.06) {
      jump = gaussianNoise(rand) * config.volatility * 5;
    }

    equity *= 1 + reversion + noise + jump;
    equity = Math.max(equity, STARTING_EQUITY * 0.3); // floor at -70%
  }

  // Tail-only correction: adjust final ~15% of points within the ORIGINAL
  // waypoint period to hit the original target. Extension days are not
  // corrected — the O-U process naturally tracks extended waypoints.
  const originalLastDay = config.waypoints[config.waypoints.length - 1][0];
  const originalLastStep = Math.min(
    Math.floor((originalLastDay * DAY_MS) / INTERVAL_MS),
    points.length - 1
  );

  if (originalLastStep > 1) {
    const targetFinal = config.waypoints[config.waypoints.length - 1][1];
    const actualAtEnd = points[originalLastStep].value;
    if (actualAtEnd > 0) {
      const ratio = targetFinal / actualAtEnd;
      for (let i = 1; i <= originalLastStep; i++) {
        const t = i / originalLastStep;
        const w = 1 / (1 + Math.exp(-25 * (t - 0.9)));
        points[i].value = Math.round(points[i].value * (1 + (ratio - 1) * w) * 100) / 100;
      }
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Cache — date-based so data is stable within a single day
// ---------------------------------------------------------------------------

let cachedParticipants: ReturnType<typeof buildSeedParticipants> | null = null;
let cachedParticipantsDay = "";
let cachedLeaderboard: ReturnType<typeof buildSeedLeaderboard> | null = null;
let cachedLeaderboardDay = "";

function buildSeedParticipants(marketChanges: number[]) {
  return SEED_TRADERS.map((config, traderIndex) => {
    const actualDaysAgo = getActualDaysAgo(config);
    const extendedWaypoints = getMarketDrivenWaypoints(config, traderIndex, marketChanges);
    const todayStart = new Date(todayUTCDateKey() + "T00:00:00Z").getTime();
    const joinTime = todayStart - actualDaysAgo * DAY_MS;
    const data = generateEquityCurve(config, extendedWaypoints, actualDaysAgo);
    const latestEquity =
      data.length > 0 ? data[data.length - 1].value : STARTING_EQUITY;
    const returnPct = ((latestEquity / STARTING_EQUITY) - 1) * 100;

    return {
      displayName: config.displayName,
      entryId: config.id,
      sessionId: `seed-session-${config.id}`,
      userId: `seed-user-${config.id}`,
      avatarUrl: getAvatarUrl(config),
      joinTime,
      startingEquity: STARTING_EQUITY,
      data,
      latestEquity,
      baselineEquity: STARTING_EQUITY,
      returnPct,
    };
  });
}

function buildSeedLeaderboard(marketChanges: number[]) {
  return SEED_TRADERS.map((config, traderIndex) => {
    const actualDaysAgo = getActualDaysAgo(config);
    const extendedWaypoints = getMarketDrivenWaypoints(config, traderIndex, marketChanges);
    const todayStart = new Date(todayUTCDateKey() + "T00:00:00Z").getTime();
    const joinTime = todayStart - actualDaysAgo * DAY_MS;
    const data = generateEquityCurve(config, extendedWaypoints, actualDaysAgo);
    const latestEquity =
      data.length > 0 ? data[data.length - 1].value : STARTING_EQUITY;
    const pnl = latestEquity - STARTING_EQUITY;
    const pnlPct = (pnl / STARTING_EQUITY) * 100;

    // Evolved stats
    const evolvedStats = getEvolvedStats(config, actualDaysAgo);
    const maxDrawdownPct = computeMaxDrawdownFromCurve(data, config.maxDrawdownPct);

    const startDate = new Date(joinTime);
    const nowDate = new Date();
    const startMidnight = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );
    const nowMidnight = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate()
    );
    const daysSinceStarted = Math.max(
      0,
      Math.floor(
        (nowMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    return {
      rank: 0,
      entryId: config.id,
      userId: `seed-user-${config.id}`,
      displayName: config.displayName,
      avatarUrl: getAvatarUrl(config),
      equity: latestEquity,
      startingEquity: STARTING_EQUITY,
      pnl,
      pnlPct,
      tradesCount: evolvedStats.tradesCount,
      winRate: evolvedStats.winRate,
      maxDrawdownPct,
      optedInAt: new Date(joinTime).toISOString(),
      daysSinceStarted,
      arenaStatus: "active",
      sessionStatus: "running",
      active: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API (async — fetches market data internally)
// ---------------------------------------------------------------------------

export async function getSeedParticipants() {
  const today = todayUTCDateKey();
  if (cachedParticipants && cachedParticipantsDay === today) {
    return cachedParticipants;
  }
  const marketChanges = await getMarketChanges();
  cachedParticipants = buildSeedParticipants(marketChanges);
  cachedParticipantsDay = today;
  return cachedParticipants;
}

export async function getSeedLeaderboard() {
  const today = todayUTCDateKey();
  if (cachedLeaderboard && cachedLeaderboardDay === today) {
    return cachedLeaderboard;
  }
  const marketChanges = await getMarketChanges();
  cachedLeaderboard = buildSeedLeaderboard(marketChanges);
  cachedLeaderboardDay = today;
  return cachedLeaderboard;
}
