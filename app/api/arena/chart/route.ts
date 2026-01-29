import { NextRequest, NextResponse } from "next/server";
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
  startingEquity: number;
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
    const hours = hoursParam === "all" ? "all" : parseInt(hoursParam);
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

      const startingEquity = account?.starting_equity ? Number(account.starting_equity) : 100000;
      const currentEquity = account?.equity ? Number(account.equity) : startingEquity;

      sessionIds.push(entry.session_id);

      participants.push({
        displayName: entry.display_name || profile?.username || 'Anonymous',
        entryId: entry.id,
        sessionId: entry.session_id,
        userId: entry.user_id,
        avatarUrl: profile?.avatar_url || null,
        startingEquity,
        data: [],
        latestValue: currentEquity,
        returnPct: ((currentEquity - startingEquity) / startingEquity) * 100,
      });
    }

    // Fetch equity points for all sessions
    let equityQuery = serviceClient
      .from("equity_points")
      .select("session_id, equity, t")
      .in("session_id", sessionIds)
      .order("t", { ascending: true });

    if (startTime) {
      equityQuery = equityQuery.gte("t", startTime.toISOString());
    }

    const { data: equityPoints, error: eqError } = await equityQuery;

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

        if (points.length > 0) {
          p.latestValue = points[points.length - 1].value;
          p.returnPct = ((p.latestValue - p.startingEquity) / p.startingEquity) * 100;
        }
      }
    }

    // Apply bucketing to reduce data density
    const bucketSize = getBucketSizeMs(hours);
    for (const p of participants) {
      p.data = bucketData(p.data, bucketSize);
    }

    // Filter out participants with no data points
    const activeParticipants = participants.filter(p => p.data.length > 0);

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
            point[p.entryId] = ((value - p.startingEquity) / p.startingEquity) * 100;
          } else {
            point[p.entryId] = value;
          }
        }
      }

      return point;
    });

    // Calculate stats for y-axis domain hints
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
      // For return %, use small padding (percentages are small numbers)
      padding = Math.max(range * 0.1, 0.5);
      yMin = minValue === Infinity ? -1 : minValue - padding;
      yMax = maxValue === -Infinity ? 1 : maxValue + padding;
      
      // Always ensure 0 is visible on the Y-axis
      if (yMin > 0) yMin = -0.5;
      if (yMax < 0) yMax = 0.5;
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
      
      // Round to nice numbers for equity
      yMin = Math.floor(yMin / 100) * 100;
      yMax = Math.ceil(yMax / 100) * 100;
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
