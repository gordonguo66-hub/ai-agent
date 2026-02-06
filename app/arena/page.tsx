"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { getBearerToken } from "@/lib/api/clientAuth";
import { useRouter } from "next/navigation";
import { TrendingUp, Trophy } from "lucide-react";
import { useAuthGate } from "@/components/auth-gate-provider";

// Curated palette of 20 visually distinct colors for dark backgrounds
// Assigned by rank index to guarantee uniqueness within displayed set
const CHART_COLORS = [
  "#22c55e", // green (rank 1)
  "#3b82f6", // blue (rank 2)
  "#ef4444", // red (rank 3)
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#a855f7", // purple
  "#14b8a6", // teal
  "#eab308", // yellow
  "#6366f1", // indigo
  "#84cc16", // lime
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
  "#10b981", // emerald
  "#fb923c", // orange-light
  "#a78bfa", // violet-light
  "#2dd4bf", // teal-light
];

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  // Use Math.round to match toFixed() behavior at the chosen precision
  return Math.round(n * factor) / factor;
}

function normalizeRoundedZero(n: number, decimals: number): number {
  const rounded = roundTo(n, decimals);
  // Prevent "-0" after rounding (e.g. -0.04 -> -0.0 at 1dp)
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatReturnPct(value: number, decimals: number): string {
  const v = normalizeRoundedZero(value, decimals);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

// Avatar component with fallback to initials
function UserAvatar({ displayName, avatarUrl, size = 24 }: { displayName: string; avatarUrl?: string | null; size?: number }) {
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
  
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback to initials if image fails to load
          e.currentTarget.style.display = 'none';
          const parent = e.currentTarget.parentElement;
          if (parent) {
            const fallback = document.createElement('div');
            fallback.className = 'rounded-full flex items-center justify-center bg-muted text-muted-foreground font-medium';
            fallback.style.width = `${size}px`;
            fallback.style.height = `${size}px`;
            fallback.style.fontSize = `${size * 0.4}px`;
            fallback.textContent = initials;
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }
  
  return (
    <div
      className="rounded-full flex items-center justify-center bg-muted text-muted-foreground font-medium"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

// Custom Dot component for showing user avatars on chart lines (wrapped in a component with state)
function ChartAvatarDotInner({ cx, cy, participant, isRefreshing, onProfileClick }: { cx: number; cy: number; participant: any; isRefreshing?: boolean; onProfileClick?: (userId: string) => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const size = isHovered ? 40 : 28;
  
  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setIsHovered(true);
    }, 500); // Enlarge after 0.5 second (faster response)
    setHoverTimeout(timeout);
  };
  
  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setIsHovered(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onProfileClick) {
      onProfileClick(participant.userId);
    }
  };
  
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div
        onClick={handleClick}
        className={`rounded-full overflow-hidden border-2 transition-all duration-200 ${isRefreshing ? 'avatar-shine' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          borderColor: isHovered ? 'hsl(var(--primary))' : 'white',
          width: size,
          height: size,
          boxShadow: isHovered 
            ? '0 4px 12px rgba(0,0,0,0.3)' 
            : isRefreshing 
              ? '0 0 12px rgba(59, 130, 246, 0.6), 0 2px 4px rgba(0,0,0,0.2)' 
              : '0 2px 4px rgba(0,0,0,0.2)',
          cursor: 'pointer',
        }}
      >
        <UserAvatar 
          displayName={participant.displayName} 
          avatarUrl={participant.avatarUrl}
          size={size}
        />
      </div>
    </div>
  );
}

function ChartAvatarDot(props: any) {
  const { cx, cy, participant, rank, chartView, isRefreshing, latestValueForDisplay, onProfileClick } = props;
  
  if (!participant) return null;
  
  const size = 48; // Max size for foreignObject (to accommodate hover enlargement)
  const emoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  
  // Get the value to display
  const value = chartView === "return"
    ? formatReturnPct(Number(participant.returnPct ?? 0), 1)
    : Number.isFinite(latestValueForDisplay)
      ? `$${(latestValueForDisplay / 1000).toFixed(0)}k`
      : Number.isFinite(participant.latestEquity)
        ? `$${(participant.latestEquity / 1000).toFixed(0)}k`
        : "N/A";
  
  return (
    <g>
      {/* Avatar */}
      <foreignObject
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        style={{ overflow: 'visible', pointerEvents: 'all' }}
      >
        <ChartAvatarDotInner cx={cx} cy={cy} participant={participant} isRefreshing={isRefreshing} onProfileClick={onProfileClick} />
      </foreignObject>
      
      {/* Label next to avatar */}
      <foreignObject
        x={cx + 20}
        y={cy - 15}
        width={160}
        height={30}
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        <div className="flex justify-start items-center h-full">
          <div className="whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              {emoji && <span className="text-sm">{emoji}</span>}
              <span className="font-medium text-xs text-white">{participant.displayName}</span>
            </div>
          </div>
    </div>
      </foreignObject>
    </g>
  );
}

function ArenaContent() {
  const router = useRouter();
  const { gatedNavigate, user } = useAuthGate();
  const [virtualLeaderboard, setVirtualLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [equityChartData, setEquityChartData] = useState<any[]>([]);
  const [returnChartData, setReturnChartData] = useState<any[]>([]);
  const [chartParticipants, setChartParticipants] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartView, setChartView] = useState<"equity" | "return">("return");
  const [equityYAxis, setEquityYAxis] = useState<{ min: number; max: number } | null>(null);
  const [returnYAxis, setReturnYAxis] = useState<{ min: number; max: number } | null>(null);
  const [chartWarning, setChartWarning] = useState<string | null>(null);
  const [topN, setTopN] = useState<number>(10);
  const [maxElapsedMs, setMaxElapsedMs] = useState<number>(0);
  const [chartMinTime, setChartMinTime] = useState<number>(0);
  const [chartMaxTime, setChartMaxTime] = useState<number>(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showEndedSessions, setShowEndedSessions] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  // Refs to prevent unnecessary re-renders
  const chartRef = useRef<any>(null);
  const isInitialLoad = useRef(true);
  const chartRequestId = useRef(0);
  const pendingLineRef = useRef<string | null>(null);

  // Handler for gated profile navigation
  const handleProfileClick = useCallback((userId: string) => {
    gatedNavigate(`/u/${userId}`, {
      title: "Sign in to view profiles",
      description: "Create an account or sign in to view trader profiles, follow users, and connect with the community.",
    });
  }, [gatedNavigate]);

  // Load current user ID from auth context
  useEffect(() => {
    if (user?.id) {
      setCurrentUserId(user.id);
    } else {
      setCurrentUserId(null);
    }
  }, [user?.id]);

  const loadChartData = useCallback(async (options?: { allowEmpty?: boolean }) => {
    const requestId = ++chartRequestId.current;
    const allowEmpty = options?.allowEmpty ?? isInitialLoad.current;
    // Only show loading spinner on initial load, not on auto-refresh
    if (isInitialLoad.current) {
      setLoadingChart(true);
    } else {
      // Show shine animation on refresh
      setIsRefreshing(true);
    }
    setChartWarning(null);
    try {
      const bearer = await getBearerToken();
      const showEndedParam = showEndedSessions ? `&showEnded=true` : '';
      const timestamp = Date.now();
      const response = await fetch(`/api/arena/chart?mode=arena&topN=${topN}${showEndedParam}&t=${timestamp}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        if (requestId !== chartRequestId.current) {
          return;
        }
        const nextEquityData = data.equityChartData || [];
        const nextReturnData = data.returnChartData || [];
        const nextParticipants = data.participants || [];
        const hasNewData = (Array.isArray(nextEquityData) && nextEquityData.length > 0) ||
                           (Array.isArray(nextReturnData) && nextReturnData.length > 0);
        const hasNewParticipants = Array.isArray(nextParticipants) && nextParticipants.length > 0;

        setEquityChartData((prev) => (hasNewData || allowEmpty ? nextEquityData : prev));
        setReturnChartData((prev) => (hasNewData || allowEmpty ? nextReturnData : prev));
        setChartParticipants((prev) => (hasNewParticipants || allowEmpty ? nextParticipants : prev));
        setEquityYAxis(data.equityYAxis || null);
        setReturnYAxis(data.returnYAxis || null);
        setMaxElapsedMs(data.maxElapsedMs || 0);
        setChartMinTime(data.minTime || 0);
        setChartMaxTime(data.maxTime || 0);
        if (data.dataQualityWarning) {
          setChartWarning(data.dataQualityWarning);
        }
      }
    } catch (error) {
      console.error("Failed to load chart data:", error);
    } finally {
      setLoadingChart(false);
      isInitialLoad.current = false;
      // Keep shine animation for a moment after data loads
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, [topN, showEndedSessions]);

  const loadLeaderboards = useCallback(async () => {
    try {
      const bearer = await getBearerToken();
      const timestamp = Date.now();
      const showEndedParam = showEndedSessions ? `&showEnded=true` : '';

      const virtualRes = await fetch(`/api/arena/virtual?t=${timestamp}${showEndedParam}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
        cache: "no-store",
      });
      if (virtualRes.ok) {
        const virtualData = await virtualRes.json();
        setVirtualLeaderboard(virtualData.leaderboard || []);
      }
    } catch (error) {
      console.error("Failed to load leaderboards:", error);
    } finally {
      setLoading(false);
    }
  }, [showEndedSessions]);

  useEffect(() => {
    isInitialLoad.current = true;
    loadLeaderboards();
    loadChartData({ allowEmpty: true });
  }, [loadLeaderboards, loadChartData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadLeaderboards();
      loadChartData();
    }, 15000); // Refresh every 15s (less aggressive)
    return () => clearInterval(interval);
  }, [loadLeaderboards, loadChartData]);

  const sortedParticipants = useMemo(() => {
    if (!chartParticipants || chartParticipants.length === 0) return [];
    return [...chartParticipants].sort((a, b) => {
      if (chartView === "equity") {
        const aVal = Number.isFinite(a.latestEquity) ? a.latestEquity : -Infinity;
        const bVal = Number.isFinite(b.latestEquity) ? b.latestEquity : -Infinity;
        if (bVal !== aVal) return bVal - aVal;
        return String(a.entryId).localeCompare(String(b.entryId));
      }
      if (b.returnPct !== a.returnPct) return b.returnPct - a.returnPct;
      return String(a.entryId).localeCompare(String(b.entryId));
    });
  }, [chartParticipants, chartView]);

  const rankByEntryId = useMemo(() => {
    const map = new Map<string, number>();
    sortedParticipants.forEach((p, index) => {
      map.set(p.entryId, index + 1);
    });
    return map;
  }, [sortedParticipants]);

  // Pick the active dataset based on current view
  const chartData = chartView === "equity" ? equityChartData : returnChartData;
  const chartYAxisDomain = chartView === "equity" ? equityYAxis : returnYAxis;

  // Total time range in hours (for X-axis formatting decisions)
  const chartRangeHours = useMemo(() => {
    if (chartMaxTime > chartMinTime) {
      return (chartMaxTime - chartMinTime) / (1000 * 60 * 60);
    }
    return maxElapsedMs / (1000 * 60 * 60);
  }, [chartMinTime, chartMaxTime, maxElapsedMs]);

  // Displayed participants - server already enforces topN by equity
  // Just use sortedParticipants directly (sorted by current view metric)
  const displayedParticipants = useMemo(() => {
    return sortedParticipants;
  }, [sortedParticipants]);

  // Map entryId -> participant for tooltip lookups
  // Use chartParticipants (all from API) to ensure all entryIds in chart data can be resolved
  const participantByEntryId = useMemo(() => {
    const map = new Map<string, any>();
    chartParticipants.forEach((p) => {
      map.set(p.entryId, p);
    });
    return map;
  }, [chartParticipants]);

  // Assign colors based on participant ID hash, with collision handling for uniqueness
  const participantColors = useMemo(() => {
    const colors: Record<string, string> = {};
    const usedIndices = new Set<number>();

    displayedParticipants.forEach((p) => {
      // Hash the userId/entryId to get a preferred color index
      const id = p.userId || p.entryId;
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash = hash & hash;
      }
      let colorIndex = Math.abs(hash) % CHART_COLORS.length;

      // If preferred color is taken, find next available
      while (usedIndices.has(colorIndex)) {
        colorIndex = (colorIndex + 1) % CHART_COLORS.length;
      }

      usedIndices.add(colorIndex);
      colors[p.entryId] = CHART_COLORS[colorIndex];
    });

    return colors;
  }, [displayedParticipants]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null || value === undefined) return "N/A";
    return formatReturnPct(value, 2);
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  // Handle chart mouse move - update active point index for selected line
  const handleChartMouseMove = useCallback((state: any) => {
    if (!state || !state.activePayload || state.activePayload.length === 0) {
      return;
    }

    const activeIndex = state.activeTooltipIndex;
    setActivePointIndex(activeIndex);

    // Track the closest line for potential click selection
    const payload = state.activePayload;
    let closestLine: string | null = null;
    let closestDistance = Infinity;

    // Convert mouse Y position (pixels) to data value for proper comparison
    const chartHeight = 340;
    const yDomain = chartYAxisDomain || { min: 0, max: 100 };
    const mouseYRatio = Math.max(0, Math.min(1, (state.chartY || 0) / chartHeight));
    const mouseDataY = yDomain.max - mouseYRatio * (yDomain.max - yDomain.min);

    for (const item of payload) {
      if (item.value != null && item.dataKey !== 'time') {
        const distance = Math.abs(item.value - mouseDataY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLine = item.dataKey;
        }
      }
    }
    pendingLineRef.current = closestLine;
  }, [chartYAxisDomain]);

  // Handle chart click - select the closest line
  const handleChartClick = useCallback((state: any) => {
    if (!state || !state.activePayload || state.activePayload.length === 0) {
      // Clicked on empty area - deselect
      setHoveredLine(null);
      return;
    }

    // Find closest line to click position
    const payload = state.activePayload;
    let closestLine: string | null = null;
    let closestDistance = Infinity;

    // Convert mouse Y position (pixels) to data value for proper comparison
    // Chart height is ~400px, but actual plot area is smaller due to margins (~340px usable)
    const chartHeight = 340;
    const yDomain = chartYAxisDomain || { min: 0, max: 100 };
    const mouseYRatio = Math.max(0, Math.min(1, (state.chartY || 0) / chartHeight));
    // Y axis is inverted: top of chart = max value, bottom = min value
    const mouseDataY = yDomain.max - mouseYRatio * (yDomain.max - yDomain.min);

    for (const item of payload) {
      if (item.value != null && item.dataKey !== 'time') {
        // Compare in data coordinates
        const distance = Math.abs(item.value - mouseDataY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLine = item.dataKey;
        }
      }
    }

    // Toggle selection: if clicking the same line, deselect; otherwise select the new line
    if (closestLine === hoveredLine) {
      setHoveredLine(null);
    } else {
      setHoveredLine(closestLine);
    }
  }, [hoveredLine, chartYAxisDomain]);

  // Handle chart mouse leave - clear active point but keep selection
  const handleChartMouseLeave = useCallback(() => {
    pendingLineRef.current = null;
    setActivePointIndex(null);
    // Don't clear hoveredLine - keep selection until user clicks elsewhere
  }, []);

  // Get the active point data for the selected line
  const activePointData = useMemo(() => {
    if (!hoveredLine || activePointIndex === null || !chartData[activePointIndex]) {
      return null;
    }
    const point = chartData[activePointIndex];
    const value = point[hoveredLine];
    if (value == null) return null;

    const participant = participantByEntryId.get(hoveredLine);
    return {
      time: point.time,
      value,
      participant,
      rank: rankByEntryId.get(hoveredLine) || 0,
    };
  }, [hoveredLine, activePointIndex, chartData, participantByEntryId, rankByEntryId]);

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                  Arena Leaderboard
                </h1>
                <Badge className="mt-2 bg-blue-900/50 text-white border-blue-800">
                  Virtual $100k Competition
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => router.push("/dashboard")}
                  size="sm"
                  className="bg-blue-900 hover:bg-blue-800 text-white border border-blue-700 transition-all"
                >
                  Start in Arena →
                </Button>
              </div>
            </div>
            <p className="text-gray-300 text-base mb-4">
              Compete with other traders using real market data. Everyone starts with $100,000 virtual capital.
            </p>
            <div className="bg-blue-950/30 border border-blue-900 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    <strong className="text-white">To join:</strong> Go to your strategy page and click <strong className="text-white">"Start in Arena"</strong> to begin competing with a fresh $100k account.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Chart */}
          <Card className="mb-8">
            <CardHeader className="border-b border-blue-900/50 bg-[#0A0E1A]">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <TrendingUp className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold text-white leading-tight">
                      {chartView === "return" ? "Arena Performance - Return %" : "Arena Performance - Account Value"}
                    </CardTitle>
                    <CardDescription className="text-gray-300 mt-2">
                      {chartView === "return"
                        ? "Percentage return comparison across top competitors"
                        : "Account equity evolution for top participants"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* View toggle */}
                  <div className="flex items-center rounded-lg border border-blue-900 overflow-hidden bg-blue-950/30">
                    <button
                      onClick={() => setChartView("return")}
                      className={`px-3 py-1.5 text-sm font-medium transition-all ${
                        chartView === "return"
                          ? "bg-blue-900 text-white border-blue-700"
                          : "bg-transparent text-gray-300 hover:text-white"
                      }`}
                    >
                      Return %
                    </button>
                    <button
                      onClick={() => setChartView("equity")}
                      className={`px-3 py-1.5 text-sm font-medium border-l border-blue-900 transition-all ${
                        chartView === "equity"
                          ? "bg-blue-900 text-white border-blue-700"
                          : "bg-transparent text-gray-300 hover:text-white"
                      }`}
                    >
                      Equity $
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="bg-[#0A0E1A]">
              {loadingChart ? (
                <div className="h-[400px] flex items-center justify-center">
                  <p className="text-muted-foreground">Loading chart...</p>
                </div>
              ) : chartData.length === 0 || displayedParticipants.length === 0 ? (
                <div className="h-[400px] flex flex-col items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-lg bg-green-600 flex items-center justify-center mx-auto mb-2">
                      <TrendingUp className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-lg font-medium text-muted-foreground">No equity snapshots for selected range</p>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Participants need to have active sessions running. Equity is recorded each time the strategy engine runs.
                    </p>
                    <Button onClick={() => router.push("/dashboard")} variant="default" size="sm">
                      Start in Arena
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {chartWarning && (
                    <div className="bg-yellow-900/20 border border-yellow-800 rounded-md p-2 text-xs text-yellow-200">
                      {chartWarning}
                    </div>
                  )}
                  <div className="relative px-2 py-4">
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart
                        ref={chartRef}
                        data={chartData}
                        margin={{ top: 5, right: 140, left: 20, bottom: 5 }}
                        onMouseMove={handleChartMouseMove}
                        onMouseLeave={handleChartMouseLeave}
                        onClick={handleChartClick}
                        style={{ cursor: 'pointer' }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(59, 130, 246, 0.1)" opacity={0.5} />
                        <XAxis
                          dataKey="time"
                          type="number"
                          scale="linear"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(value) => {
                            if (!Number.isFinite(value) || value < 0) return "";
                            // value is absolute timestamp (epoch ms) — format as calendar date/time
                            const date = new Date(value);

                            // For very short ranges (< 24h), show time only
                            if (chartRangeHours <= 24) {
                              return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
                            }
                            // For medium ranges (< 7 days), show date + time
                            if (chartRangeHours <= 168) {
                              return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
                                     date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
                            }
                            // For longer ranges, show just date
                            // Include year if range crosses years
                            const minYear = chartMinTime > 0 ? new Date(chartMinTime).getFullYear() : date.getFullYear();
                            const maxYear = chartMaxTime > 0 ? new Date(chartMaxTime).getFullYear() : date.getFullYear();
                            if (minYear !== maxYear) {
                              return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                            }
                            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                          }}
                          tickCount={8}
                          minTickGap={40}
                          tick={{ fontSize: 14, fill: '#9CA3AF' }}
                          stroke="#374151"
                        />
                        <YAxis
                          domain={chartYAxisDomain ? [chartYAxisDomain.min, chartYAxisDomain.max] as any : ["auto", "auto"] as any}
                          ticks={(() => {
                            if (!chartYAxisDomain) return undefined;
                            const { min, max } = chartYAxisDomain;
                            const count = 6;
                            const step = (max - min) / (count - 1);
                            if (step <= 0) return [min];
                            const t: number[] = [];
                            for (let i = 0; i < count; i++) {
                              t.push(min + step * i);
                            }
                            return t;
                          })()}
                          tickFormatter={(value) => {
                            if (!Number.isFinite(value)) return "";
                            if (chartView === "equity") {
                              const range = chartYAxisDomain
                                ? chartYAxisDomain.max - chartYAxisDomain.min
                                : 0;
                              if (range > 0 && range < 20000) {
                                return `$${Math.round(value).toLocaleString("en-US")}`;
                              }
                              if (Math.abs(value) >= 1000) {
                                return `$${(value / 1000).toFixed(0)}k`;
                              }
                              return `$${value.toFixed(0)}`;
                            } else {
                              return formatReturnPct(Number(value), 1);
                            }
                          }}
                          tick={{ fontSize: 14, fill: '#9CA3AF' }}
                          stroke="#374151"
                          width={95}
                        />
                        {hoveredLine && (
                          <Tooltip
                            cursor={{
                              stroke: 'rgba(148, 163, 184, 0.3)',
                              strokeWidth: 1,
                              strokeDasharray: '4 4',
                            }}
                            content={({ payload, label }) => {
                              // Find the data for the hovered line only
                              const hoveredEntry = payload?.find((p: any) => p.dataKey === hoveredLine);
                              if (!hoveredEntry || hoveredEntry.value == null) return null;

                              const participant = participantByEntryId.get(hoveredLine);
                              const displayName = participant?.displayName || hoveredLine;
                              const rank = rankByEntryId.get(hoveredLine) || 0;
                              const isTop3 = rank > 0 && rank <= 3;
                              const emoji = rank === 1 ? "🥇 " : rank === 2 ? "🥈 " : rank === 3 ? "🥉 " : "";
                              const color = participantColors[hoveredLine] || '#3b82f6';

                              // Format the timestamp
                              const date = new Date(label);
                              const formattedDate = date.toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              });

                              // Format the value
                              const formattedValue = chartView === "equity"
                                ? `$${Number(hoveredEntry.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : formatReturnPct(Number(hoveredEntry.value), 2);

                              const nameLabel = rank > 0
                                ? (isTop3 ? `${emoji}${displayName} (#${rank})` : `${displayName} (#${rank})`)
                                : displayName;

                              return (
                                <div
                                  style={{
                                    backgroundColor: "rgb(15, 20, 25, 0.98)",
                                    border: `1px solid ${color}40`,
                                    borderRadius: "8px",
                                    fontSize: "13px",
                                    boxShadow: `0 0 20px ${color}30`,
                                    backdropFilter: "blur(10px)",
                                    color: "#E5E7EB",
                                    padding: "8px 12px",
                                  }}
                                >
                                  <div style={{ color: "#F3F4F6", fontWeight: 600, marginBottom: "4px" }}>
                                    {formattedDate}
                                  </div>
                                  <div style={{ color, fontWeight: 500 }}>
                                    {nameLabel}: {formattedValue}
                                  </div>
                                </div>
                              );
                            }}
                          />
                        )}
                        {/* Baseline reference line: 0% for return, $100k for equity */}
                        {chartView === "return" ? (
                          <ReferenceLine
                            y={0}
                            stroke="rgb(148, 163, 184)"
                            strokeDasharray="4 4"
                            strokeOpacity={0.5}
                            strokeWidth={1.5}
                            label={{
                              value: "0%",
                              position: "left",
                              fill: "rgb(148, 163, 184)",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          />
                        ) : (
                          <ReferenceLine
                            y={100000}
                            stroke="rgb(148, 163, 184)"
                            strokeDasharray="4 4"
                            strokeOpacity={0.5}
                            strokeWidth={1.5}
                            label={{
                              value: "$100k",
                              position: "left",
                              fill: "rgb(148, 163, 184)",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          />
                        )}
                        {displayedParticipants.map((participant) => {
                          const color = participantColors[participant.entryId];
                          const isMe = participant.userId === currentUserId;
                          const rank = rankByEntryId.get(participant.entryId) || 0;
                          const isTop3 = rank > 0 && rank <= 3;

                          // Find the latest data point for this participant
                          const latestDataPoint = chartData
                            .slice()
                            .reverse()
                            .find((d: any) => d[participant.entryId] != null);
                          const latestValueForDisplay = latestDataPoint?.[participant.entryId];

                          const isHovered = hoveredLine === participant.entryId;
                          const isOtherHovered = hoveredLine !== null && !isHovered;

                          return (
                            <Line
                              key={participant.entryId}
                              type="linear"
                              dataKey={participant.entryId}
                              stroke={color}
                              strokeWidth={isHovered ? 4 : isMe ? 3 : isTop3 ? 2.5 : 2}
                              strokeOpacity={isOtherHovered ? 0.15 : 1}
                              name={participant.entryId}
                              dot={((props: any) => {
                                const { cx, cy, index: dotIndex, payload, ...rest } = props;
                                const hasValue = payload?.[participant.entryId] != null;

                                // Show glowing dot on selected line at active point
                                if (isHovered && activePointIndex === dotIndex && hasValue) {
                                  return (
                                    <g key={`${participant.entryId}-${dotIndex}-active`}>
                                      {/* Glow effect */}
                                      <circle cx={cx} cy={cy} r={12} fill={color} opacity={0.2} />
                                      <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.3} />
                                      {/* Main dot */}
                                      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />
                                    </g>
                                  );
                                }

                                // Show avatar on last point for top 3
                                if (isTop3 && payload === latestDataPoint && hasValue) {
                                  return (
                                    <ChartAvatarDot
                                      key={`${participant.entryId}-${dotIndex}`}
                                      cx={cx}
                                      cy={cy}
                                      participant={participant}
                                      rank={rank}
                                      chartView={chartView}
                                      isRefreshing={isRefreshing}
                                      latestValueForDisplay={latestValueForDisplay}
                                      onProfileClick={handleProfileClick}
                                    />
                                  );
                                }

                                // No dot for other points
                                return <circle key={`${participant.entryId}-${dotIndex}-hidden`} cx={cx} cy={cy} r={0} fill="transparent" />;
                              })}
                              activeDot={false}
                              connectNulls={false}
                              isAnimationActive={false}
                              style={{
                                filter: isHovered ? `drop-shadow(0 0 6px ${color})` : undefined,
                                transition: 'all 0.2s ease-out',
                              }}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card className="trading-card border-blue-900/50">
            <CardHeader className="border-b border-blue-900/50 bg-[#0A0E1A]">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <Trophy className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold text-white leading-tight">
                      Virtual Arena Leaderboard
                    </CardTitle>
                    <CardDescription className="text-gray-300 mt-2">
                      Rankings based on equity. Everyone starts with $100,000
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="bg-[#0A0E1A]">
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading leaderboard...</p>
                </div>
              ) : virtualLeaderboard.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground mb-2 text-lg">No participants yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Be the first to join the Virtual Arena.
                  </p>
                  <Button onClick={() => router.push("/dashboard")} variant="default">
                    Start in Arena
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-blue-900/50 hover:bg-transparent">
                        <TableHead className="w-16 text-gray-300 font-semibold">Rank</TableHead>
                        <TableHead className="text-gray-300 font-semibold">Trader</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Equity</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">PnL</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Return</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Trades</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Win Rate</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Max DD</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Days</TableHead>
                        <TableHead className="text-right text-gray-300 font-semibold">Joined</TableHead>
                        <TableHead className="w-20 text-gray-300 font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {virtualLeaderboard.map((entry) => {
                        const emoji = getRankEmoji(entry.rank);
                        const isMe = entry.userId === currentUserId;
                        const isActive = entry.sessionStatus === 'running';
                        return (
                          <TableRow
                            key={entry.entryId || entry.displayName}
                            className={`
                              border-b border-blue-900/30 transition-all cursor-pointer
                              hover:bg-slate-700/50
                              ${entry.rank <= 3 ? "bg-yellow-900/20 border-l-4 border-l-yellow-700" : ""}
                              ${isMe ? "bg-blue-900/30 border-l-4 border-l-blue-800" : ""}
                              ${!isActive ? "opacity-50" : ""}
                            `}
                          >
                            <TableCell className="font-bold text-white">
                              <span className="text-lg">{emoji ? `${emoji} ` : ""}</span>
                              <span>{entry.rank}</span>
                            </TableCell>
                            <TableCell>
                              <div 
                                onClick={() => handleProfileClick(entry.userId)} 
                                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                              >
                                <UserAvatar
                                  displayName={entry.displayName}
                                  avatarUrl={entry.avatarUrl}
                                  size={32}
                                />
                                <span className={`font-semibold ${isMe ? "text-white" : "text-gray-200"}`}>
                                  {entry.displayName}
                                  {isMe && <span className="ml-1 text-xs text-gray-400">(You)</span>}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-white font-semibold">
                              {formatCurrency(entry.equity)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-bold ${
                                entry.pnl >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {entry.pnl >= 0 ? "+" : ""}
                              {formatCurrency(entry.pnl)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-bold ${
                                entry.pnlPct >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {formatPercent(entry.pnlPct)}
                            </TableCell>
                            <TableCell className="text-right text-gray-200">{entry.tradesCount}</TableCell>
                            <TableCell className="text-right text-gray-200">
                              {entry.winRate != null ? `${entry.winRate.toFixed(2)}%` : "N/A"}
                            </TableCell>
                            <TableCell className="text-right text-rose-400 font-semibold">
                              {entry.maxDrawdownPct != null ? `-${entry.maxDrawdownPct.toFixed(2)}%` : "N/A"}
                            </TableCell>
                            <TableCell className="text-right text-gray-300">
                              {entry.daysSinceStarted ?? 0}
                            </TableCell>
                            <TableCell className="text-right text-gray-400 text-sm">
                              {entry.optedInAt
                                ? new Date(entry.optedInAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  !isActive 
                                    ? "bg-gray-700/30 text-gray-400 border-gray-700" 
                                    : "bg-emerald-900/50 text-emerald-300 border-emerald-800"
                                }
                              >
                                {isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ArenaPage() {
  return <ArenaContent />;
}
