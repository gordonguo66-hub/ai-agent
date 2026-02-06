"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimezone } from "@/components/timezone-provider";
import { ChevronDown } from "lucide-react";

interface EquityPoint {
  time: number; // timestamp in ms
  equity: number;
}

interface EquityCurveChartProps {
  equityPoints: EquityPoint[];
  currentEquity: number | null;
  startingEquity: number;
  sessionStartedAt: string | null;
  onTimeRangeChange?: (start: number, end: number) => void; // Callback to refetch data with new range
  timeRange?: TimeRange; // Controlled time range from parent
  onTimeRangeSelect?: (range: TimeRange) => void; // Callback when user selects a new range
}

type TimeRange = "all" | "today" | "24h" | "72h" | "week" | "month" | "custom";
type ChartMode = "equity" | "pnl";

export function EquityCurveChart({
  equityPoints,
  currentEquity,
  startingEquity,
  sessionStartedAt,
  onTimeRangeChange,
  timeRange: controlledTimeRange,
  onTimeRangeSelect,
}: EquityCurveChartProps) {
  const { timezone } = useTimezone();
  // Use controlled time range if provided, otherwise use internal state
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>("all");
  const timeRange = controlledTimeRange ?? internalTimeRange;
  
  const [chartMode, setChartMode] = useState<ChartMode>("equity");
  const [isLoadingNewRange, setIsLoadingNewRange] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const isInitialMount = React.useRef(true);
  const lastRequestedRangeRef = React.useRef<{ start: number; end: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Handle time range selection
  const handleTimeRangeSelect = (range: TimeRange) => {
    console.log(`[EquityCurveChart] 🎯 User selected time range: "${range}"`);
    if (onTimeRangeSelect) {
      onTimeRangeSelect(range);
    } else {
      setInternalTimeRange(range);
    }
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // DEV-ONLY: Log data points for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[EquityCurve] Rendering with ${equityPoints.length} points, range: ${timeRange}`);
    if (equityPoints.length > 0) {
      const minTime = Math.min(...equityPoints.map(p => p.time));
      const maxTime = Math.max(...equityPoints.map(p => p.time));
      const minEquity = Math.min(...equityPoints.map(p => p.equity));
      const maxEquity = Math.max(...equityPoints.map(p => p.equity));
      console.log(`[EquityCurve] Time range: ${new Date(minTime).toISOString()} → ${new Date(maxTime).toISOString()}`);
      console.log(`[EquityCurve] Equity range: $${minEquity.toFixed(2)} → $${maxEquity.toFixed(2)}`);
    }
  }

  // Calculate time range boundaries
  const timeRangeBounds = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000).getTime();
    const monthStart = new Date(now - 30 * 24 * 60 * 60 * 1000).getTime();
    const sessionStart = sessionStartedAt ? new Date(sessionStartedAt).getTime() : null;

    switch (timeRange) {
      case "today":
        return { start: todayStart, end: now };
      case "24h":
        return { start: now - 24 * 60 * 60 * 1000, end: now };
      case "72h":
        return { start: now - 72 * 60 * 60 * 1000, end: now };
      case "week":
        return { start: weekStart, end: now };
      case "month":
        return { start: monthStart, end: now };
      case "all":
      default:
        return { start: sessionStart || now - 7 * 24 * 60 * 60 * 1000, end: now };
    }
  }, [timeRange, sessionStartedAt]);

  // Notify parent when timerange changes (for server-side filtering)
  // CRITICAL: For "All Time", DON'T apply any filter - let server fetch everything
  React.useEffect(() => {
    console.log(`[EquityCurve useEffect] Triggered:`, {
      isInitialMount: isInitialMount.current,
      timeRange,
      hasCallback: !!onTimeRangeChange,
      bounds: timeRange === "all" ? "NO FILTER (All Time)" : {
        start: new Date(timeRangeBounds.start).toISOString(),
        end: new Date(timeRangeBounds.end).toISOString(),
      },
    });
    
    // Skip callback on initial mount to prevent duplicate data fetch
    if (isInitialMount.current) {
      console.log(`[EquityCurve useEffect] ⏭️  Skipping - initial mount`);
      isInitialMount.current = false;
      return;
    }

    if (onTimeRangeChange) {
      // For "All Time", pass null/null to tell parent to fetch EVERYTHING without filter
      if (timeRange === "all") {
        console.log(`[EquityCurve useEffect] ✅ Calling onTimeRangeChange for "all" (NO FILTER)`);
        setIsLoadingNewRange(true);
        lastRequestedRangeRef.current = null;
        onTimeRangeChange(0, 0); // Pass 0,0 to signal "no filter"
      } else {
        console.log(`[EquityCurve useEffect] ✅ Calling onTimeRangeChange for "${timeRange}"`);
        // Set loading state immediately when requesting new data
        setIsLoadingNewRange(true);
        lastRequestedRangeRef.current = { start: timeRangeBounds.start, end: timeRangeBounds.end };
        onTimeRangeChange(timeRangeBounds.start, timeRangeBounds.end);
      }
    } else {
      console.log(`[EquityCurve useEffect] ⚠️  No onTimeRangeChange callback provided`);
    }
  }, [timeRangeBounds.start, timeRangeBounds.end, onTimeRangeChange, timeRange]);
  
  // Detect when new data arrives and clear loading state
  React.useEffect(() => {
    if (isLoadingNewRange && equityPoints.length > 0) {
      // For "All Time" (lastRequestedRangeRef is null) or any range change,
      // if we have data, assume it's the new data and clear loading
      console.log(`[EquityCurve] New data arrived (${equityPoints.length} points), clearing loading state`);
      setIsLoadingNewRange(false);
    }
  }, [equityPoints, isLoadingNewRange]);

  // Filter and prepare data points
  const chartData = useMemo(() => {
    // CRITICAL: If loading new range, return empty array to prevent showing stale data
    if (isLoadingNewRange) {
      console.log(`[EquityCurve] Loading new range, returning empty data to prevent stale chart`);
      return [];
    }
    
    // RUNTIME GUARD: Detect if filtered data is identical across range changes
    const totalPoints = equityPoints.length;

    // Start with stored equity points - NO client-side filtering
    // Trust that parent component sends correct data for the selected range
    let points: EquityPoint[] = [...equityPoints];

    // DEV-ONLY: Warn if no filtering occurred (all ranges return same count)
    if (process.env.NODE_ENV === "development") {
      const filteredCount = points.length;
      console.log(`[EquityCurve] Using ${filteredCount} points for range "${timeRange}" (no client-side filtering)`);
    }

    // Add current equity as latest point if available
    if (currentEquity !== null) {
      const now = Date.now();
      const lastPoint = points[points.length - 1];
      
      // Only add if different enough or if no points exist
      if (!lastPoint || Math.abs(lastPoint.equity - currentEquity) > 0.01 || (now - lastPoint.time) > 5000) {
        points.push({
          time: now,
          equity: currentEquity,
        });
      } else {
        // Update last point to current equity
        points[points.length - 1] = {
          time: now,
          equity: currentEquity,
        };
      }
    }

    // IMPORTANT: Do NOT filter "outliers" aggressively.
    // Equity can move >5% legitimately (drawdowns, volatility, leverage).
    // The previous 5% filter could drop real points and make the curve look "stuck",
    // then suddenly jump when a point matches current equity.
    //
    // We only remove obviously invalid values here.
    const filteredPoints: EquityPoint[] = points.filter(
      (p) => Number.isFinite(p.time) && Number.isFinite(p.equity)
    );

    // Resample for long time ranges to improve performance
    let finalPoints = filteredPoints;
    const rangeHours = (timeRangeBounds.end - timeRangeBounds.start) / (1000 * 60 * 60);
    
    if (rangeHours > 168 && filteredPoints.length > 500) {
      // For ranges > 1 week with > 500 points, resample to 500 points
      const step = Math.ceil(filteredPoints.length / 500);
      finalPoints = filteredPoints.filter((_, idx) => idx % step === 0 || idx === filteredPoints.length - 1);
    } else if (rangeHours > 72 && filteredPoints.length > 300) {
      // For ranges > 3 days with > 300 points, resample to 300 points
      const step = Math.ceil(filteredPoints.length / 300);
      finalPoints = filteredPoints.filter((_, idx) => idx % step === 0 || idx === filteredPoints.length - 1);
    }

    // Transform data based on chart mode
    return finalPoints.map((point, index) => ({
      time: point.time,
      index: index, // For connected (no-gap) mode
      equity: point.equity,
      pnl: point.equity - startingEquity,
      value: chartMode === "equity" ? point.equity : point.equity - startingEquity,
    }));
  }, [equityPoints, currentEquity, timeRangeBounds, startingEquity, chartMode]);

  // Format X-axis labels based on time range (timezone-aware)
  const formatXAxisLabel = (timestamp: number) => {
    const date = new Date(timestamp);
    const rangeHours = (timeRangeBounds.end - timeRangeBounds.start) / (1000 * 60 * 60);

    const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
    const dateOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (timezone) {
      timeOptions.timeZone = timezone;
      dateOptions.timeZone = timezone;
    }

    if (rangeHours <= 24) {
      // Short range: show time only (HH:mm)
      return date.toLocaleTimeString("en-US", timeOptions);
    } else if (rangeHours <= 168) {
      // Up to a week: show day and time (MMM DD, HH:mm)
      return date.toLocaleDateString("en-US", dateOptions) + " " +
             date.toLocaleTimeString("en-US", timeOptions);
    } else {
      // Longer: show date only (MMM DD)
      return date.toLocaleDateString("en-US", dateOptions);
    }
  };

  // Format large numbers with K/M suffix
  const formatYAxisValue = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    } else if (absValue >= 10_000) {
      return `$${(value / 1_000).toFixed(0)}K`;
    } else if (absValue >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    } else {
      return `$${value.toFixed(0)}`;
    }
  };

  // Calculate Y-axis domain
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return ["auto", "auto"];
    
    const values = chartData.map((d) => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    const padding = Math.max(range * 0.1, chartMode === "equity" ? 100 : 50);
    
    return [minValue - padding, maxValue + padding];
  }, [chartData, chartMode]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    // Use the actual timestamp from the data point, not the label (which is now index)
    const date = new Date(data.time);

    // Format with user's timezone preference
    const dateOptions: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    if (timezone) {
      dateOptions.timeZone = timezone;
    }

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-sm font-semibold mb-2">
          {date.toLocaleString("en-US", dateOptions)}
        </p>
        <div className="space-y-1">
          <p className="text-sm">
            <span className="text-gray-600 dark:text-gray-400">Equity:</span>{" "}
            <span className="font-semibold">${data.equity.toFixed(2)}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-600 dark:text-gray-400">PnL:</span>{" "}
            <span className={`font-semibold ${data.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}
            </span>
          </p>
        </div>
      </div>
    );
  };

  if (chartData.length === 0) {
    // Show loading state if we're fetching new data
    const message = isLoadingNewRange
      ? "Loading data for selected time range..."
      : equityPoints.length > 0
      ? `No data in selected time range (${timeRange}). Try selecting a different range.`
      : "No data available yet. Start the session and it will automatically generate equity snapshots.";

    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
          <CardDescription>PnL since session start</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            {message}
          </p>
          
          {/* Time Range Selector - show even when no data so user can switch */}
          <div className="flex flex-wrap items-center gap-4 mt-4 justify-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Time Range:</label>
              <div className="relative" ref={dropdownRef}>
                <div
                  className="flex h-10 w-[180px] cursor-pointer items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropdownOpen(!isDropdownOpen);
                  }}
                >
                  <span>
                    {timeRange === "all" && "All Time"}
                    {timeRange === "today" && "Today"}
                    {timeRange === "24h" && "Last 24 Hours"}
                    {timeRange === "72h" && "Last 72 Hours"}
                    {timeRange === "week" && "This Week"}
                    {timeRange === "month" && "This Month"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </div>
                {isDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                    {[
                      { value: "all", label: "All Time" },
                      { value: "today", label: "Today" },
                      { value: "24h", label: "Last 24 Hours" },
                      { value: "72h", label: "Last 72 Hours" },
                      { value: "week", label: "This Week" },
                      { value: "month", label: "This Month" },
                    ].map((option) => (
                      <div
                        key={option.value}
                        className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                          timeRange === option.value ? "bg-accent" : ""
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleTimeRangeSelect(option.value as TimeRange);
                        }}
                      >
                        {option.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle>Equity Curve</CardTitle>
            <CardDescription>
              {chartMode === "equity" ? "Total equity over time" : "Profit and Loss relative to starting equity"}
            </CardDescription>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          {/* Time Range Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Time Range:</label>
            <div className="relative" ref={dropdownRef}>
              <div
                className="flex h-10 w-[180px] cursor-pointer items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
              >
                <span>
                  {timeRange === "all" && "All Time"}
                  {timeRange === "today" && "Today"}
                  {timeRange === "24h" && "Last 24 Hours"}
                  {timeRange === "72h" && "Last 72 Hours"}
                  {timeRange === "week" && "This Week"}
                  {timeRange === "month" && "This Month"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </div>
              {isDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                  {[
                    { value: "all", label: "All Time" },
                    { value: "today", label: "Today" },
                    { value: "24h", label: "Last 24 Hours" },
                    { value: "72h", label: "Last 72 Hours" },
                    { value: "week", label: "This Week" },
                    { value: "month", label: "This Month" },
                  ].map((option) => (
                    <div
                      key={option.value}
                      className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                        timeRange === option.value ? "bg-accent" : ""
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTimeRangeSelect(option.value as TimeRange);
                      }}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chart Mode Toggle */}
          <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
            <TabsList>
              <TabsTrigger value="equity">Equity</TabsTrigger>
              <TabsTrigger value="pnl">PnL</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
              <XAxis
                dataKey="index"
                type="number"
                scale="linear"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) => {
                  // Show the actual time from the data point at this index
                  const idx = Math.round(value);
                  const point = chartData[idx];
                  if (point && point.time) {
                    const date = new Date(point.time);
                    // Use timezone-aware formatting with 24-hour format
                    const options: Intl.DateTimeFormatOptions = {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    };
                    if (timezone) {
                      options.timeZone = timezone;
                    }
                    return date.toLocaleTimeString("en-US", options);
                  }
                  return "";
                }}
                angle={-45}
                textAnchor="end"
                height={60}
                minTickGap={30}
              />
              <YAxis
                domain={yAxisDomain}
                tickFormatter={(v) => formatYAxisValue(Number(v))}
                width={70}
                label={{
                  value: chartMode === "equity" ? "Equity (USD)" : "PnL (USD)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartMode === "equity" ? "#8884d8" : "#10b981"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
