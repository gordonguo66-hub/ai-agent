"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { AuthGuard } from "@/components/auth-guard";
import { getBearerToken } from "@/lib/api/clientAuth";
import { useRouter } from "next/navigation";
import { useTimezone } from "@/components/timezone-provider";
import { formatDateCompact } from "@/lib/utils/dateFormat";
import Link from "next/link";

// Deterministic color generator based on user_id
function getUserColor(userId: string): string {
  // Use a hash of the userId to generate a consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Generate HSL color with good saturation and lightness for visibility
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 16) % 15); // 45-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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
function ChartAvatarDotInner({ cx, cy, participant }: { cx: number; cy: number; participant: any }) {
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
  
  return (
    <div className="flex items-center justify-center w-full h-full">
      <Link href={`/u/${participant.userId}`}>
        <div
          className="rounded-full overflow-hidden border-2 transition-all duration-200"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            borderColor: isHovered ? 'hsl(var(--primary))' : 'white',
            width: size,
            height: size,
            boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
            cursor: 'pointer',
          }}
        >
          <UserAvatar 
            displayName={participant.displayName} 
            avatarUrl={participant.avatarUrl}
            size={size}
          />
        </div>
      </Link>
    </div>
  );
}

function ChartAvatarDot(props: any) {
  const { cx, cy, participant, rank, chartView } = props;
  
  if (!participant) return null;
  
  const size = 48; // Max size for foreignObject (to accommodate hover enlargement)
  const emoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  
  // Get the value to display
  const value = chartView === "return" 
    ? `${participant.returnPct >= 0 ? '+' : ''}${participant.returnPct.toFixed(1)}%`
    : `$${(participant.latestValue / 1000).toFixed(0)}k`;
  
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
        <ChartAvatarDotInner cx={cx} cy={cy} participant={participant} />
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
          <div className="bg-background/95 backdrop-blur-sm border border-border rounded-md px-2 py-1 shadow-lg whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{emoji}</span>
              <span className="font-medium text-xs">{participant.displayName}</span>
              <span className="font-mono text-xs">{value}</span>
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function ArenaContent() {
  const router = useRouter();
  const { timezone } = useTimezone();
  const [virtualLeaderboard, setVirtualLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartParticipants, setChartParticipants] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [chartHours, setChartHours] = useState<number | "all">(72);
  const [chartView, setChartView] = useState<"equity" | "return">("return");
  const [chartYAxisDomain, setChartYAxisDomain] = useState<{ min: number; max: number } | null>(null);
  const [chartWarning, setChartWarning] = useState<string | null>(null);
  const [topN, setTopN] = useState<number | "me">(10);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showEndedSessions, setShowEndedSessions] = useState(false);
  
  // Refs to prevent unnecessary re-renders
  const chartRef = useRef<any>(null);

  // Load current user ID
  useEffect(() => {
    const loadUserId = async () => {
      try {
        const bearer = await getBearerToken();
        if (bearer) {
          // Extract user ID from JWT (base64 decode the payload)
          const parts = bearer.replace('Bearer ', '').split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            setCurrentUserId(payload.sub || null);
          }
        }
      } catch (error) {
        console.error("Failed to get user ID:", error);
      }
    };
    loadUserId();
  }, []);

  const loadChartData = useCallback(async () => {
    setLoadingChart(true);
    setChartWarning(null);
    try {
      const bearer = await getBearerToken();
      const viewParam = `&view=${chartView}`;
      const showEndedParam = showEndedSessions ? `&showEnded=true` : '';
      const response = await fetch(`/api/arena/chart?mode=arena&hours=${chartHours}${viewParam}${showEndedParam}`, {
        headers: bearer ? { Authorization: bearer } : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setChartData(data.chartData || []);
        setChartParticipants(data.participants || []);
        setChartYAxisDomain(data.yAxisDomain || null);
        if (data.dataQualityWarning) {
          setChartWarning(data.dataQualityWarning);
        }
      }
    } catch (error) {
      console.error("Failed to load chart data:", error);
    } finally {
      setLoadingChart(false);
    }
  }, [chartHours, chartView, showEndedSessions]);

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
    loadLeaderboards();
    loadChartData();
    const interval = setInterval(() => {
      loadLeaderboards();
      loadChartData();
    }, 15000); // Refresh every 15s (less aggressive)
    return () => clearInterval(interval);
  }, [loadLeaderboards, loadChartData]);

  // Compute displayed participants based on topN selection
  const displayedParticipants = useMemo(() => {
    if (!chartParticipants || chartParticipants.length === 0) return [];
    
    // Sort by return % descending
    const sorted = [...chartParticipants].sort((a, b) => b.returnPct - a.returnPct);
    
    if (topN === "me") {
      // Show only current user
      const me = sorted.find(p => p.userId === currentUserId);
      return me ? [me] : [];
    }
    
    // Get top N
    let result = sorted.slice(0, topN);
    
    // Always include current user if they're participating but not in top N
    if (currentUserId) {
      const meIndex = sorted.findIndex(p => p.userId === currentUserId);
      if (meIndex >= topN) {
        result.push(sorted[meIndex]);
      }
    }
    
    return result;
  }, [chartParticipants, topN, currentUserId]);

  // Generate colors for displayed participants
  const participantColors = useMemo(() => {
    const colors: Record<string, string> = {};
    displayedParticipants.forEach(p => {
      colors[p.entryId] = getUserColor(p.userId || p.entryId);
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
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Arena Leaderboard</h1>
                <Badge variant="secondary" className="mt-2">Virtual $100k Competition</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={async () => {
                    try {
                      const bearer = await getBearerToken();
                      const response = await fetch("/api/arena/refresh-snapshots", {
                        method: "POST",
                        headers: bearer ? { Authorization: bearer } : undefined,
                      });
                      if (response.ok) {
                        const data = await response.json();
                        alert(`Refreshed ${data.succeeded || 0} snapshots`);
                        loadLeaderboards();
                        loadChartData();
                      } else {
                        alert("Failed to refresh snapshots");
                      }
                    } catch (error) {
                      console.error("Failed to refresh snapshots:", error);
                      alert("Failed to refresh snapshots");
                    }
                  }}
                  variant="outline"
                  size="sm"
                >
                  Refresh Snapshots
                </Button>
                <Button 
                  onClick={() => {
                    loadLeaderboards();
                    loadChartData();
                  }}
                  variant="outline"
                  size="sm"
                >
                  Refresh Now
                </Button>
                <Button 
                  onClick={() => router.push("/dashboard")}
                  variant="default"
                  size="sm"
                >
                  Start in Arena →
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground text-base mb-4">
              Compete with other traders using real market data. Everyone starts with $100,000 virtual capital.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>To join:</strong> Go to your strategy page and click <strong>"Start in Arena"</strong> to begin competing with a fresh $100k account.
            </div>
          </div>

          {/* Performance Chart */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle>
                    {chartView === "return" ? "Return %" : "Total Account Value"}
                  </CardTitle>
                  <CardDescription>
                    Performance over time for arena participants
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Top N Selector */}
                  <select
                    value={topN}
                    onChange={(e) => setTopN(e.target.value === "me" ? "me" : parseInt(e.target.value))}
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="me">Me Only</option>
                  </select>
                  
                  {/* View toggle */}
                  <div className="flex items-center rounded-md border border-input overflow-hidden">
                    <button
                      onClick={() => setChartView("return")}
                      className={`px-3 py-1.5 text-sm ${
                        chartView === "return"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      Return %
                    </button>
                    <button
                      onClick={() => setChartView("equity")}
                      className={`px-3 py-1.5 text-sm border-l ${
                        chartView === "equity"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      Equity $
                    </button>
                  </div>
                  
                  {/* Time range */}
                  <select
                    value={chartHours}
                    onChange={(e) => setChartHours(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="24">24H</option>
                    <option value="48">48H</option>
                    <option value="72">72H</option>
                    <option value="168">7D</option>
                    <option value="all">All Time</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingChart ? (
                <div className="h-[400px] flex items-center justify-center">
                  <p className="text-muted-foreground">Loading chart...</p>
                </div>
              ) : chartData.length === 0 || displayedParticipants.length === 0 ? (
                <div className="h-[400px] flex flex-col items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="text-4xl mb-2">📊</div>
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
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-2 text-xs text-yellow-800 dark:text-yellow-200">
                      {chartWarning}
                    </div>
                  )}
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart 
                        ref={chartRef}
                        data={chartData} 
                        margin={{ top: 5, right: 180, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="time"
                          type="number"
                          scale="time"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(value) => {
                            if (!value) return "";
                            const date = new Date(value);
                            if (isNaN(date.getTime())) return "";
                            const dataTimes = chartData.map(d => d.time).filter(t => t != null);
                            if (dataTimes.length === 0) return "";
                            const minTime = Math.min(...dataTimes);
                            const maxTime = Math.max(...dataTimes);
                            const hoursRange = (maxTime - minTime) / (1000 * 60 * 60);
                            const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
                            const dateOpts: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric" };
                            if (timezone) {
                              timeOpts.timeZone = timezone;
                              dateOpts.timeZone = timezone;
                            }
                            if (hoursRange < 24) {
                              return date.toLocaleTimeString("en-US", timeOpts);
                            } else if (hoursRange < 168) {
                              return date.toLocaleDateString("en-US", dateOpts) + " " + date.toLocaleTimeString("en-US", { ...timeOpts, minute: undefined });
                            } else {
                              return date.toLocaleDateString("en-US", dateOpts);
                            }
                          }}
                          tickCount={6}
                          minTickGap={50}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          domain={chartYAxisDomain ? [chartYAxisDomain.min, chartYAxisDomain.max] : ["auto", "auto"]}
                          tickFormatter={(value) => {
                            if (chartView === "equity") {
                              if (Math.abs(value) >= 1000) {
                                return `$${(value / 1000).toFixed(0)}k`;
                              }
                              return `$${value.toFixed(0)}`;
                            } else {
                              return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
                            }
                          }}
                          tick={{ fontSize: 11 }}
                          width={65}
                        />
                        <Tooltip
                          labelFormatter={(value) => formatDateCompact(new Date(value), timezone)}
                          formatter={(value: any, name: string) => {
                            const participantIndex = displayedParticipants.findIndex(p => p.entryId === name);
                            const participant = displayedParticipants[participantIndex];
                            const displayName = participant?.displayName || name;
                            const rank = participantIndex + 1;
                            const isTop3 = rank <= 3;
                            const emoji = rank === 1 ? "🥇 " : rank === 2 ? "🥈 " : rank === 3 ? "🥉 " : "";
                            
                            const formattedValue = chartView === "equity" 
                              ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
                            
                            const label = isTop3 ? `${emoji}${displayName} (#${rank})` : `${displayName} (#${rank})`;
                            return [formattedValue, label];
                          }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                        />
                        {chartView === "return" && (
                          <ReferenceLine
                            y={0}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="3 3"
                            strokeOpacity={0.5}
                          />
                        )}
                        {displayedParticipants.map((participant, index) => {
                          const color = participantColors[participant.entryId];
                          const isMe = participant.userId === currentUserId;
                          const isTop3 = index < 3;
                          const rank = index + 1;
                          
                          // Find the latest data point for this participant
                          const latestDataPoint = chartData
                            .slice()
                            .reverse()
                            .find((d: any) => d[participant.entryId] != null);
                          
                          return (
                            <Line
                              key={participant.entryId}
                              type="monotone"
                              dataKey={participant.entryId}
                              stroke={color}
                              strokeWidth={isMe ? 3 : isTop3 ? 2.5 : 2}
                              name={participant.entryId}
                              dot={isTop3 ? ((props: any) => {
                                // Only show avatar on the last point for top 3
                                if (props.payload !== latestDataPoint) return <></>;
                                return <ChartAvatarDot {...props} participant={participant} rank={rank} chartView={chartView} />;
                              }) : false}
                              activeDot={{ r: isMe ? 6 : 4 }}
                              connectNulls={false}
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Virtual Arena Leaderboard</CardTitle>
                  <CardDescription>
                    Rankings based on equity. Everyone starts with $100,000.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showEndedSessions}
                      onChange={(e) => setShowEndedSessions(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Show ended sessions
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead>Trader</TableHead>
                        <TableHead className="text-right">Equity</TableHead>
                        <TableHead className="text-right">PnL</TableHead>
                        <TableHead className="text-right">Return</TableHead>
                        <TableHead className="text-right">Trades</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">Max DD</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {virtualLeaderboard.map((entry) => {
                        const emoji = getRankEmoji(entry.rank);
                        const isMe = entry.userId === currentUserId;
                        const isEnded = entry.arenaStatus === 'left' || entry.arenaStatus === 'ended';
                        return (
                          <TableRow
                            key={entry.entryId || entry.displayName}
                            className={`
                              ${entry.rank <= 3 ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}
                              ${isMe ? "bg-blue-50/50 dark:bg-blue-900/10 border-l-2 border-l-blue-500" : ""}
                              ${isEnded ? "opacity-60" : ""}
                            `}
                          >
                            <TableCell className="font-semibold">
                              {emoji ? `${emoji} ${entry.rank}` : entry.rank}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <UserAvatar 
                                  displayName={entry.displayName} 
                                  avatarUrl={entry.avatarUrl}
                                  size={28}
                                />
                                <span className={`font-medium ${isMe ? "text-blue-600 dark:text-blue-400" : ""}`}>
                                  {entry.displayName}
                                  {isMe && <span className="ml-1 text-xs">(You)</span>}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(entry.equity)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono font-semibold ${
                                entry.pnl >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {entry.pnl >= 0 ? "+" : ""}
                              {formatCurrency(entry.pnl)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono ${
                                entry.pnlPct >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {formatPercent(entry.pnlPct)}
                            </TableCell>
                            <TableCell className="text-right">{entry.tradesCount}</TableCell>
                            <TableCell className="text-right">{formatPercent(entry.winRate)}</TableCell>
                            <TableCell className="text-right text-red-600 dark:text-red-400">
                              {entry.maxDrawdownPct != null ? `-${entry.maxDrawdownPct.toFixed(2)}%` : "N/A"}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {entry.daysSinceStarted ?? 0}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isEnded ? "outline" : "default"} className="text-xs">
                                {isEnded ? (entry.arenaStatus === 'left' ? 'Left' : 'Ended') : 'Active'}
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
  return (
    <AuthGuard>
      <ArenaContent />
    </AuthGuard>
  );
}
