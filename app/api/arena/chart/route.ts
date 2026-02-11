import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeReturnSeries } from "@/lib/arena/computeReturn";

/**
 * Arena Chart API
 *
 * Returns time-series data for top arena participants by equity.
 * Both equity and return chart data are computed from the same snapshot
 * series so switching views is always consistent.
 *
 * X-axis uses absolute timestamps (epoch ms). Late joiners' lines start
 * at their actual join date, not at the beginning of the chart.
 *
 * Query params:
 *   ?mode=arena (only arena mode supported now)
 *   ?topN=10|20 (server-enforced limit, default 10)
 *   ?showEnded=true (include ended/left sessions)
 */

interface ChartPoint {
  time: number;
  value: number;
}

interface ParticipantData {
  displayName: string;
  entryId: string;
  sessionId: string;
  userId: string;
  avatarUrl: string | null;
  joinTime: number;
  startingEquity: number;
  data: ChartPoint[]; // always equity values
  latestEquity: number;
  baselineEquity: number; // session starting equity (for Arena, always = startingEquity)
  returnPct: number;
}

// Bucket sizes based on elapsed time range (in ms)
// For "since join" mode, we bucket based on the max elapsed time across participants
function getBucketSizeMs(maxElapsedMs: number): number {
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  // > 90 days: 4-hour buckets
  if (maxElapsedMs > 90 * oneDay) return 4 * oneHour;
  // > 30 days: 2-hour buckets
  if (maxElapsedMs > 30 * oneDay) return 2 * oneHour;
  // > 7 days: 1-hour buckets
  if (maxElapsedMs > 7 * oneDay) return oneHour;
  // > 3 days: 30-min buckets
  if (maxElapsedMs > 3 * oneDay) return 30 * 60 * 1000;
  // > 1 day: 15-min buckets
  if (maxElapsedMs > oneDay) return 15 * 60 * 1000;
  // <= 1 day: 5-min buckets
  return 5 * 60 * 1000;
}

// Bucket data points - take last value per bucket
function bucketData(data: ChartPoint[], bucketSizeMs: number): ChartPoint[] {
  if (data.length === 0) return [];
  const buckets = new Map<number, ChartPoint>();
  for (const point of data) {
    const bucketTime = Math.floor(point.time / bucketSizeMs) * bucketSizeMs;
    buckets.set(bucketTime, { time: bucketTime, value: point.value });
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// Compute nice y-axis domain for return % — symmetrical around 0%
function computeReturnYAxis(minValue: number, maxValue: number) {
  // Find the max absolute deviation from 0%
  const maxAbsDeviation = Math.max(Math.abs(minValue), Math.abs(maxValue));

  // Add some padding (20% of the max deviation, minimum 0.5%)
  const padding = Math.max(maxAbsDeviation * 0.2, 0.5);
  const extent = maxAbsDeviation + padding;

  // Find a nice step size
  const desiredTicks = 6;
  const halfTicks = Math.floor(desiredTicks / 2);
  const rawStep = extent / halfTicks;
  const niceSteps = [0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 2.5, 5.0, 10.0, 20.0, 25.0, 50.0];
  const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep);

  // Symmetrical around 0%
  const yExtent = Math.ceil(extent / step) * step;

  return { min: -yExtent, max: yExtent };
}

// Compute nice y-axis domain for equity $ — symmetrical around $100k baseline
function computeEquityYAxis(minValue: number, maxValue: number) {
  const baseline = 100000;

  // Find the max absolute deviation from $100k
  const maxAbsDeviation = Math.max(
    Math.abs(minValue - baseline),
    Math.abs(maxValue - baseline)
  );

  // Add some padding (20% of the max deviation, minimum $500)
  const padding = Math.max(maxAbsDeviation * 0.2, 500);
  const extent = maxAbsDeviation + padding;

  // Find a nice step size
  const desiredTicks = 6;
  const halfTicks = Math.floor(desiredTicks / 2);
  const rawStep = extent / halfTicks;
  const niceSteps = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep / 1000) * 1000;

  // Symmetrical around $100k
  const yExtent = Math.ceil(extent / step) * step;

  return { min: baseline - yExtent, max: baseline + yExtent };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse topN (only allow 10 or 20, default 10)
    const topNParam = parseInt(searchParams.get("topN") || "10", 10);
    const topN = topNParam === 20 ? 20 : 10;

    const showEnded = searchParams.get("showEnded") === "true";

    const serviceClient = createServiceRoleClient();

    // Calculate time range - fetch up to 1 year of data
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const startTime = oneYearAgo;

    // Fetch arena entries
    let query = serviceClient
      .from("arena_entries")
      .select(`
        id,
        user_id,
        display_name,
        opted_in_at,
        session_id,
        arena_status,
        active,
        strategy_sessions!inner(
          id,
          virtual_accounts(id, starting_equity, equity, cash_balance)
        )
      `)
      .eq("mode", "arena");

    // By default show active + stopped; when showEnded is true also include "left"
    if (!showEnded) {
      query = query.in("arena_status", ["active", "ended"]);
    }

    const { data: arenaEntries, error: entriesError } = await query.order("opted_in_at", { ascending: true });

    if (entriesError) {
      console.error("Failed to fetch arena entries:", entriesError);
      return NextResponse.json({ error: "Failed to fetch arena entries", details: entriesError.message }, { status: 500 });
    }

    if (!arenaEntries || arenaEntries.length === 0) {
      return NextResponse.json({
        equityChartData: [],
        returnChartData: [],
        participants: [],
        topN,
        maxElapsedMs: 0,
        message: "No active arena participants"
      });
    }

    // Fetch profiles for avatar URLs
    const userIds = [...new Set(arenaEntries.map((e: any) => e.user_id).filter(Boolean))];
    const userToProfile = new Map<string, { avatar_url: string | null; username: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id, avatar_url, username")
        .in("id", userIds);

      if (profiles) {
        for (const p of profiles) {
          userToProfile.set(p.id, { avatar_url: p.avatar_url, username: p.username });
        }
      }
    }

    // Build participant map
    const participants: ParticipantData[] = [];
    const sessionIds: string[] = [];

    for (const entry of arenaEntries) {
      const session = entry.strategy_sessions as any;
      if (!session) continue;

      const accounts = session.virtual_accounts;
      const account = Array.isArray(accounts) ? accounts[0] : accounts;
      const profile = userToProfile.get(entry.user_id);

      const joinTime = entry.opted_in_at ? new Date(entry.opted_in_at).getTime() : now.getTime();
      const startingEquity = account?.starting_equity ? Number(account.starting_equity) : 100000;
      const currentEquity = account?.equity ? Number(account.equity) : startingEquity;

      sessionIds.push(entry.session_id);

      participants.push({
        displayName: entry.display_name || profile?.username || 'Anonymous',
        entryId: entry.id,
        sessionId: entry.session_id,
        userId: entry.user_id,
        avatarUrl: profile?.avatar_url || null,
        joinTime,
        startingEquity,
        data: [],
        latestEquity: currentEquity,
        baselineEquity: startingEquity,
        returnPct: 0,
      });
    }

    // Fetch equity points (paginated to avoid 1000-row limit)
    const PAGE_SIZE = 1000;
    let equityPoints: { session_id: string; equity: number; t: string }[] = [];
    let eqError: any = null;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let equityQuery = serviceClient
        .from("equity_points")
        .select("session_id, equity, t")
        .in("session_id", sessionIds)
        .order("t", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (startTime) {
        equityQuery = equityQuery.gte("t", startTime.toISOString());
      }

      const { data: page, error: pageError } = await equityQuery;

      if (pageError) {
        eqError = pageError;
        break;
      }

      if (page && page.length > 0) {
        equityPoints.push(...page);
        offset += page.length;
        hasMore = page.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    if (eqError) {
      console.error("Failed to fetch equity points:", eqError);
    } else if (equityPoints) {
      // Group by session
      const sessionToPoints = new Map<string, ChartPoint[]>();

      for (const ep of equityPoints) {
        const sessionId = ep.session_id;
        if (!sessionId) continue;

        if (!sessionToPoints.has(sessionId)) {
          sessionToPoints.set(sessionId, []);
        }

        sessionToPoints.get(sessionId)!.push({
          time: new Date(ep.t).getTime(),
          value: Number(ep.equity),
        });
      }

      // Assign to participants (no view-dependent mutations)
      for (const p of participants) {
        const points = sessionToPoints.get(p.sessionId) || [];
        // Sort ascending by time (should already be, but ensure it)
        points.sort((a, b) => a.time - b.time);
        p.data = points;

        // If no data points in range but join time is within range, add a single baseline point
        if (p.data.length === 0) {
          if (!startTime || p.joinTime >= startTime.getTime()) {
            p.data = [{ time: p.joinTime, value: p.startingEquity }];
          }
        }

        if (p.data.length > 0) {
          p.latestEquity = p.data[p.data.length - 1].value;
        }
      }
    }

    // Compute returnPct for all participants first (needed for sorting)
    for (const p of participants) {
      if (p.data.length > 0) {
        const series = computeReturnSeries(
          p.data.map(d => ({ time: d.time, equity: d.value })),
          p.startingEquity,
        );
        const last = series[series.length - 1];
        p.returnPct = last.returnPct;
      }
      // Arena baseline is always the session's starting equity
      p.baselineEquity = p.startingEquity;
    }

    // Filter out participants with no data
    const participantsWithData = participants.filter(p => p.data.length > 0);

    // Sort by latestEquity descending and take top N (server-enforced)
    participantsWithData.sort((a, b) => b.latestEquity - a.latestEquity);
    const activeParticipants = participantsWithData.slice(0, topN);

    // Keep absolute timestamps so late joiners' lines start later on the x-axis.
    // Inject a baseline point at each participant's actual joinTime if needed.
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const p of activeParticipants) {
      // Ensure baseline point at the participant's actual join time
      if (p.data.length === 0 || p.data[0].time > p.joinTime) {
        p.data.unshift({ time: p.joinTime, value: p.startingEquity });
      }
      if (p.data.length > 0) {
        minTime = Math.min(minTime, p.data[0].time);
        maxTime = Math.max(maxTime, p.data[p.data.length - 1].time);
      }
    }
    const maxElapsedMs = maxTime > minTime ? maxTime - minTime : 0;

    // Apply bucketing based on max elapsed time
    const bucketSize = getBucketSizeMs(maxElapsedMs);
    for (const p of activeParticipants) {
      p.data = bucketData(p.data, bucketSize);

      // After bucketing, ensure exact joinTime baseline point exists.
      // Bucketing may move joinTime to an earlier bucket, causing the line to appear
      // to start late (since we skip times < joinTime in forward-fill).
      // Re-insert exact { time: joinTime, value: startingEquity } if missing or bucketed away.
      const hasExactJoinPoint = p.data.some(d => d.time === p.joinTime);
      if (!hasExactJoinPoint) {
        // Insert at correct sorted position
        const insertIdx = p.data.findIndex(d => d.time > p.joinTime);
        const baselinePoint = { time: p.joinTime, value: p.startingEquity };
        if (insertIdx === -1) {
          p.data.push(baselinePoint);
        } else {
          p.data.splice(insertIdx, 0, baselinePoint);
        }
      }

      if (p.data.length > 0) {
        p.latestEquity = p.data[p.data.length - 1].value;
      }
    }

    // Data quality warning
    let dataQualityWarning: string | null = null;
    if (activeParticipants.length > 0) {
      const allValues: number[] = [];
      for (const p of activeParticipants) {
        for (const d of p.data) {
          allValues.push(d.value);
        }
      }
      if (allValues.length > 1) {
        const uniqueValues = new Set(allValues.map(v => v.toFixed(2)));
        if (uniqueValues.size === 1) {
          dataQualityWarning = "All data points have identical values - chart will appear flat";
        }
      }
    }

    // Collect all unique times for unified x-axis
    // Include each participant's joinTime to ensure their first point is visible at the exact join timestamp
    const allTimes = new Set<number>();
    for (const p of activeParticipants) {
      allTimes.add(p.joinTime); // Ensure joinTime is in the x-axis
      for (const point of p.data) {
        allTimes.add(point.time);
      }
    }
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

    // Build BOTH chart data arrays from the same equity series
    let eqMin = Infinity, eqMax = -Infinity;
    let retMin = Infinity, retMax = -Infinity;

    const equityChartData: Record<string, any>[] = [];
    const returnChartData: Record<string, any>[] = [];

    for (const time of sortedTimes) {
      const eqPoint: Record<string, any> = { time };
      const retPoint: Record<string, any> = { time };

      for (const p of activeParticipants) {
        // Skip times before this participant joined — no line before their join
        if (time < p.joinTime) continue;

        // Find closest equity point at or before this time
        let eqValue: number | null = null;
        for (let i = p.data.length - 1; i >= 0; i--) {
          if (p.data[i].time <= time) {
            eqValue = p.data[i].value;
            break;
          }
        }

        if (eqValue !== null) {
          eqPoint[p.entryId] = eqValue;
          eqMin = Math.min(eqMin, eqValue);
          eqMax = Math.max(eqMax, eqValue);

          // Return is always computed vs the session's starting equity
          const base = p.startingEquity > 0 ? p.startingEquity : 100000;
          const ret = ((eqValue / base) - 1) * 100;
          retPoint[p.entryId] = ret;
          retMin = Math.min(retMin, ret);
          retMax = Math.max(retMax, ret);
        }
      }

      equityChartData.push(eqPoint);
      returnChartData.push(retPoint);
    }

    // Compute y-axis domains for both views
    const equityYAxis = computeEquityYAxis(eqMin, eqMax);
    const returnYAxis = computeReturnYAxis(retMin, retMax);

    return NextResponse.json({
      equityChartData,
      returnChartData,
      participants: activeParticipants.map(p => ({
        displayName: p.displayName,
        entryId: p.entryId,
        userId: p.userId,
        avatarUrl: p.avatarUrl,
        latestEquity: p.latestEquity,
        returnPct: p.returnPct,
        baselineEquity: p.baselineEquity,
        dataPoints: p.data.length,
      })),
      topN,
      maxElapsedMs,
      minTime: Number.isFinite(minTime) ? minTime : 0,
      maxTime: Number.isFinite(maxTime) ? maxTime : 0,
      equityYAxis,
      returnYAxis,
      bucketSizeMinutes: bucketSize / 60000,
      dataQualityWarning,
      totalDataPoints: equityChartData.length,
    });
  } catch (error: any) {
    console.error("Arena chart error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
