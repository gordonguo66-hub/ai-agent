import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Arena Chart API
 *
 * Returns time-series data for all arena participants.
 * Uses equity_points table for data (more granular than arena_snapshots).
 *
 * Query params:
 *   ?mode=arena (only arena mode supported now)
 *   ?hours=24|48|72|168|all
 *   ?view=equity|return
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
  baselineEquity: number;
  baselineTime: number;
  data: ChartPoint[];
  latestValue: number;
  returnPct: number;
}

// Bucket sizes based on time range
function getBucketSizeMs(hours: number | "all"): number {
  if (hours === "all" || hours > 168) return 60 * 60 * 1000; // 1 hour buckets for > 7d
  if (hours > 72) return 30 * 60 * 1000; // 30 min buckets for 72h-7d
  if (hours > 24) return 15 * 60 * 1000; // 15 min buckets for 24h-72h
  return 5 * 60 * 1000; // 5 min buckets for < 24h
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hoursParam = searchParams.get("hours") || "72";
    let hours: number | "all" = hoursParam === "all" ? "all" : parseInt(hoursParam, 10);
    if (hours !== "all") {
      if (!Number.isFinite(hours) || hours <= 0) {
        hours = 72;
      }
    }
    const view = searchParams.get("view") || "return";
    const showEnded = searchParams.get("showEnded") === "true";

    const serviceClient = createServiceRoleClient();

    // Calculate time range
    const now = new Date();
    const startTime = hours === "all"
      ? null
      : new Date(now.getTime() - (hours as number) * 60 * 60 * 1000);

    // Build query for arena entries
    // Note: We fetch profiles separately since there may not be a direct FK relationship
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

    // Filter by status unless showEnded is true
    if (!showEnded) {
      query = query.eq("active", true).eq("arena_status", "active");
    }

    const { data: arenaEntries, error: entriesError } = await query.order("opted_in_at", { ascending: true });

    if (entriesError) {
      console.error("Failed to fetch arena entries:", entriesError);
      return NextResponse.json({ error: "Failed to fetch arena entries", details: entriesError.message }, { status: 500 });
    }

    if (!arenaEntries || arenaEntries.length === 0) {
      return NextResponse.json({
        chartData: [],
        participants: [],
        hours,
        view,
        message: "No active arena participants"
      });
    }

    // Fetch profiles separately for avatar URLs
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
        baselineEquity: startingEquity,
        baselineTime: joinTime,
        data: [],
        latestValue: currentEquity,
        returnPct: ((currentEquity - startingEquity) / startingEquity) * 100,
      });
    }

    // Fetch equity points for all sessions (paginated to avoid default 1000-row limit)
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

      // Assign to participants
      for (const p of participants) {
        const points = sessionToPoints.get(p.sessionId) || [];
        p.data = points;

        // Ensure the series starts at 0% for the selected time window
        // If the first recorded equity point is within a short window of join time, snap it to starting equity.
        const joinWindowMs = 10 * 60 * 1000; // 10 minutes
        if (p.data.length > 0) {
          const first = p.data[0];
          if (Math.abs(first.time - p.joinTime) <= joinWindowMs) {
            first.value = p.startingEquity;
          } else if (first.time > p.joinTime) {
            // If we're missing early points, prepend a baseline at join time (only if within range).
            if (!startTime || p.joinTime >= startTime.getTime()) {
              p.data.unshift({ time: p.joinTime, value: p.startingEquity });
            }
          }
        } else {
          // No points at all - still show baseline (within requested time range)
          if (!startTime || p.joinTime >= startTime.getTime()) {
            p.data = [{ time: p.joinTime, value: p.startingEquity }];
          }
        }

        if (p.data.length > 0) {
          p.latestValue = p.data[p.data.length - 1].value;
        }
      }
    }

    // Capture baseline before bucketing (first point in range)
    if (view === "return") {
      for (const p of participants) {
        const firstVal = p.data[0]?.value;
        const baseline = Number.isFinite(firstVal) && Number(firstVal) > 0 ? Number(firstVal) : p.startingEquity;
        p.baselineEquity = baseline;
      }
    }

    // Apply bucketing to reduce data density
    const bucketSize = getBucketSizeMs(hours);
    for (const p of participants) {
      p.data = bucketData(p.data, bucketSize);
      // Force first bucket to baseline for return view so the line starts at 0.0%
      if (view === "return" && p.data.length > 0) {
        p.data[0].value = p.baselineEquity;
        p.baselineTime = p.data[0].time;
      }
    }

    // Filter out participants with no data points
    const activeParticipants = participants.filter(p => p.data.length > 0);

    // IMPORTANT: Normalize return series to the selected time window:
    // The first point in the returned range is always 0.0%.
    // This matches the UI expectation that the Return % line "starts at 0".
    if (view === "return") {
      for (const p of activeParticipants) {
        // ReturnPct used for ranking/labels should match the displayed time window
        p.returnPct = ((p.latestValue - p.baselineEquity) / p.baselineEquity) * 100;
      }
    } else {
      // Equity view: keep returnPct as total return since starting equity (for ranking)
      for (const p of activeParticipants) {
        p.baselineEquity = p.startingEquity;
        p.returnPct = ((p.latestValue - p.startingEquity) / p.startingEquity) * 100;
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
    const allTimes = new Set<number>();
    for (const p of activeParticipants) {
      for (const point of p.data) {
        allTimes.add(point.time);
      }
    }
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

    // Build chart data array
    const chartData = sortedTimes.map(time => {
      const point: Record<string, any> = { time };

      for (const p of activeParticipants) {
        // Find the closest point at or before this time
        let value: number | null = null;
        for (let i = p.data.length - 1; i >= 0; i--) {
          if (p.data[i].time <= time) {
            value = p.data[i].value;
            break;
          }
        }

        if (value !== null) {
          if (view === "return") {
            const base = p.baselineEquity && p.baselineEquity > 0 ? p.baselineEquity : p.startingEquity;
            point[p.entryId] = ((value - base) / base) * 100;
          } else {
            point[p.entryId] = value;
          }
        }
      }

      return point;
    });

    // CRITICAL: Force each participant's FIRST point to be exactly 0.0% in Return view
    // IMPORTANT: Do this BEFORE calculating yAxis domain so minValue sees the zeros
    if (view === "return" && chartData.length > 0) {
      for (const p of activeParticipants) {
        for (let i = 0; i < chartData.length; i++) {
          if (chartData[i][p.entryId] !== undefined && chartData[i][p.entryId] !== null) {
            chartData[i][p.entryId] = 0;
            break; // Only set the first point
          }
        }
      }
    }

    // Calculate stats for y-axis domain hints (AFTER forcing first points to 0)
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (const point of chartData) {
      for (const p of activeParticipants) {
        const val = point[p.entryId];
        if (val !== undefined && val !== null) {
          minValue = Math.min(minValue, val);
          maxValue = Math.max(maxValue, val);
        }
      }
    }

    const range = maxValue - minValue;
    
    // Calculate appropriate padding based on view type
    let padding: number;
    let yMin: number;
    let yMax: number;
    
    if (view === "return") {
      // For return %, use generous padding like equity chart (zoomed out, smooth)
      const minPadding = 0.5; // At least 0.5% padding
      padding = Math.max(range * 3, minPadding); // Large padding (3x range, like equity)
      
      // If all data is >= 0, don't show negative Y-axis space
      if (minValue >= 0) {
        yMin = 0;
        yMax = maxValue + padding;
      } 
      // If all data is <= 0, don't show positive Y-axis space
      else if (maxValue <= 0) {
        yMin = minValue - padding;
        yMax = 0;
      }
      // Mixed (both positive and negative returns)
      else {
        yMin = minValue - padding * 0.3; // Minimal padding below
        yMax = maxValue + padding * 0.3; // Minimal padding above
      }
      
      // Round to nice tick intervals that include 0 as a tick
      // With 6 ticks, we want 0 to be one of them
      const desiredTicks = 6;
      const rawStep = (yMax - yMin) / (desiredTicks - 1);
      // Round step to nice values: 0.05, 0.1, 0.2, 0.25, 0.5, 1.0, etc.
      const niceSteps = [0.05, 0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 5.0];
      const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep * 10) / 10;
      
      // Adjust domain so 0 is a tick: expand outward in steps from 0
      yMin = -Math.ceil(Math.abs(yMin) / step) * step;
      yMax = Math.ceil(yMax / step) * step;
      
    } else {
      // For equity, always include $100k starting point
      const avgValue = (minValue + maxValue) / 2;
      const minPadding = avgValue * 0.01; // 1% of avg value
      padding = Math.max(range * 0.15, minPadding, 500); // At least $500 padding
      
      yMin = minValue === Infinity ? 99000 : minValue - padding;
      yMax = maxValue === -Infinity ? 101000 : maxValue + padding;
      
      // Always ensure $100k is visible on the Y-axis
      if (yMin > 100000) yMin = 99500;
      if (yMax < 100000) yMax = 100500;
      
      // Round to nice tick intervals that include 100k as a tick
      const desiredTicks = 6;
      const rawStep = (yMax - yMin) / (desiredTicks - 1);
      // Round step to nice values for currency: 500, 1000, 2000, 5000, 10000, etc.
      const niceSteps = [200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
      const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep / 1000) * 1000;
      
      // Adjust domain so 100000 is a tick
      const stepsBelow = Math.ceil((100000 - yMin) / step);
      const stepsAbove = Math.ceil((yMax - 100000) / step);
      yMin = 100000 - (stepsBelow * step);
      yMax = 100000 + (stepsAbove * step);
    }

    return NextResponse.json({
      chartData,
      participants: activeParticipants.map(p => ({
        displayName: p.displayName,
        entryId: p.entryId,
        userId: p.userId,
        avatarUrl: p.avatarUrl,
        latestValue: p.latestValue,
        returnPct: p.returnPct,
        dataPoints: p.data.length,
      })),
      hours,
      view,
      yAxisDomain: {
        min: yMin,
        max: yMax,
      },
      bucketSizeMinutes: bucketSize / 60000,
      dataQualityWarning,
      totalDataPoints: chartData.length,
    });
  } catch (error: any) {
    console.error("Arena chart error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
