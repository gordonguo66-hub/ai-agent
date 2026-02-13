/**
 * Seed data for the arena leaderboard and chart.
 *
 * Each trader has hand-crafted equity waypoints producing a unique curve shape
 * (staircase, V-shape, W-pattern, mountain, etc.). An Ornstein-Uhlenbeck
 * process adds mean-reverting noise so curves look realistic while staying
 * near their intended path.
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
// Trader profiles with per-trader waypoints
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

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

function generateEquityCurve(config: SeedTraderConfig): ChartPoint[] {
  const now = Date.now();
  const joinTime = now - config.daysAgo * DAY_MS;
  const rand = createSeededRandom(config.id);

  const totalSteps = Math.floor((now - joinTime) / INTERVAL_MS);
  if (totalSteps <= 0) return [{ time: joinTime, value: STARTING_EQUITY }];

  const points: ChartPoint[] = [];
  let equity = STARTING_EQUITY;

  for (let i = 0; i <= totalSteps; i++) {
    const time = joinTime + i * INTERVAL_MS;
    points.push({ time, value: Math.round(equity * 100) / 100 });

    if (i === totalSteps) break;

    // Where the curve "should" be at this point
    const dayOffset = (time - joinTime) / DAY_MS;
    const targetEquity = interpolateWaypoints(config.waypoints, dayOffset);

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
    equity = Math.max(equity, STARTING_EQUITY * 0.5); // floor at -50%
  }

  // Tail-only correction: adjust final ~15% of points to hit waypoint target.
  // Uses a sigmoid so intermediate peaks/troughs are NOT distorted.
  const targetFinal = config.waypoints[config.waypoints.length - 1][1];
  const actualFinal = points[points.length - 1].value;
  if (points.length > 1 && actualFinal > 0) {
    const ratio = targetFinal / actualFinal;
    for (let i = 1; i < points.length; i++) {
      const t = i / (points.length - 1);
      // Sigmoid: ~0 before t=0.85, ramps to ~1 by t=1.0
      const w = 1 / (1 + Math.exp(-25 * (t - 0.9)));
      points[i].value = Math.round(points[i].value * (1 + (ratio - 1) * w) * 100) / 100;
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Cache with TTL: regenerate every 30 minutes so new data points appear
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = INTERVAL_MS; // refresh every 30 min (matches data point interval)

let cachedParticipants: ReturnType<typeof buildSeedParticipants> | null = null;
let cachedParticipantsAt = 0;
let cachedLeaderboard: ReturnType<typeof buildSeedLeaderboard> | null = null;
let cachedLeaderboardAt = 0;

function buildSeedParticipants() {
  const now = Date.now();

  return SEED_TRADERS.map((config) => {
    const joinTime = now - config.daysAgo * DAY_MS;
    const data = generateEquityCurve(config);
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

function buildSeedLeaderboard() {
  const now = Date.now();

  return SEED_TRADERS.map((config) => {
    const joinTime = now - config.daysAgo * DAY_MS;
    const data = generateEquityCurve(config);
    const latestEquity =
      data.length > 0 ? data[data.length - 1].value : STARTING_EQUITY;
    const pnl = latestEquity - STARTING_EQUITY;
    const pnlPct = (pnl / STARTING_EQUITY) * 100;

    const startDate = new Date(joinTime);
    const nowDate = new Date(now);
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
      tradesCount: config.tradesCount,
      winRate: config.winRate,
      maxDrawdownPct: config.maxDrawdownPct,
      optedInAt: new Date(joinTime).toISOString(),
      daysSinceStarted,
      arenaStatus: "active",
      sessionStatus: "running",
      active: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSeedParticipants() {
  const now = Date.now();
  if (!cachedParticipants || now - cachedParticipantsAt > CACHE_TTL_MS) {
    cachedParticipants = buildSeedParticipants();
    cachedParticipantsAt = now;
  }
  return cachedParticipants;
}

export function getSeedLeaderboard() {
  const now = Date.now();
  if (!cachedLeaderboard || now - cachedLeaderboardAt > CACHE_TTL_MS) {
    cachedLeaderboard = buildSeedLeaderboard();
    cachedLeaderboardAt = now;
  }
  return cachedLeaderboard;
}
