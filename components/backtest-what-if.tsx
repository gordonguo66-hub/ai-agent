"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { getBearerToken } from "@/lib/api/clientAuth";
import {
  runWhatIfReplay,
  type WhatIfParams,
  type EntryTrade,
  type CandlePoint,
  type WhatIfResult,
} from "@/lib/backtest/whatIfReplay";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Loader2, SlidersHorizontal } from "lucide-react";

interface BacktestWhatIfProps {
  backtestId: string;
  backtest: any;
  originalEquityPoints: { time: number; equity: number }[];
  originalSummary: any;
}

interface OriginalExitConfig {
  mode: string;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
  maxHoldMinutes?: number | null;
}

interface WhatIfData {
  entry_trades: EntryTrade[];
  candles: Record<string, CandlePoint[]>;
  constants: {
    feeBps: number;
    slippageBps: number;
    resolutionMs: number;
    startDateMs: number;
    endDateMs: number;
  };
}

export function BacktestWhatIf({
  backtestId,
  backtest,
  originalEquityPoints,
  originalSummary,
}: BacktestWhatIfProps) {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [whatIfData, setWhatIfData] = useState<WhatIfData | null>(null);
  const [originalExit, setOriginalExit] = useState<OriginalExitConfig | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Parameter state — will be initialized from original exit config
  const [slEnabled, setSlEnabled] = useState(true);
  const [tpEnabled, setTpEnabled] = useState(true);
  const [trailingEnabled, setTrailingEnabled] = useState(false);
  const [timeEnabled, setTimeEnabled] = useState(false);

  const [stopLossPct, setStopLossPct] = useState(3);
  const [takeProfitPct, setTakeProfitPct] = useState(6);
  const [trailingStopPct, setTrailingStopPct] = useState(2);
  const [maxHoldHours, setMaxHoldHours] = useState(48);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) {
        setDataError("Not authenticated");
        return;
      }
      const res = await fetch(`/api/backtest/${backtestId}/whatif`, {
        headers: { Authorization: bearer },
      });
      if (!res.ok) {
        const data = await res.json();
        setDataError(data.error || "Failed to load data");
        return;
      }
      const data = await res.json();
      setWhatIfData({
        entry_trades: data.entry_trades,
        candles: data.candles,
        constants: data.constants,
      });

      // Initialize sliders from original exit config — only enable params active in the original mode
      const exit = data.original_exit_config;
      if (exit && !initialized) {
        const mode = exit.mode || "tp_sl";
        // Build originalExit with only the values that were ACTIVE
        const activeExit: OriginalExitConfig = { mode };

        // Reset all to defaults first
        setSlEnabled(false); setStopLossPct(3);
        setTpEnabled(false); setTakeProfitPct(6);
        setTrailingEnabled(false); setTrailingStopPct(2);
        setTimeEnabled(false); setMaxHoldHours(48);

        // Then enable only what was active in the original mode
        if (mode === "tp_sl") {
          if (exit.stopLossPct != null) { setSlEnabled(true); setStopLossPct(exit.stopLossPct); activeExit.stopLossPct = exit.stopLossPct; }
          if (exit.takeProfitPct != null) { setTpEnabled(true); setTakeProfitPct(exit.takeProfitPct); activeExit.takeProfitPct = exit.takeProfitPct; }
        } else if (mode === "trailing") {
          if (exit.trailingStopPct != null) { setTrailingEnabled(true); setTrailingStopPct(exit.trailingStopPct); activeExit.trailingStopPct = exit.trailingStopPct; }
          if (exit.initialStopLossPct != null) { setSlEnabled(true); setStopLossPct(exit.initialStopLossPct); activeExit.stopLossPct = exit.initialStopLossPct; }
        } else if (mode === "time") {
          if (exit.maxHoldMinutes != null) { setTimeEnabled(true); setMaxHoldHours(exit.maxHoldMinutes / 60); activeExit.maxHoldMinutes = exit.maxHoldMinutes; }
        }
        // signal mode: everything stays disabled (AI handles exits)

        setOriginalExit(activeExit);
        setInitialized(true);
      }

      setDataLoaded(true);
    } catch (err: any) {
      setDataError(err.message || "Failed to load data");
    } finally {
      setDataLoading(false);
    }
  }, [backtestId, initialized]);

  // Auto-load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run replay whenever params change
  const params: WhatIfParams = useMemo(
    () => ({
      stopLossPct: slEnabled ? stopLossPct : null,
      takeProfitPct: tpEnabled ? takeProfitPct : null,
      trailingStopPct: trailingEnabled ? trailingStopPct : null,
      maxHoldMinutes: timeEnabled ? maxHoldHours * 60 : null,
    }),
    [slEnabled, tpEnabled, trailingEnabled, timeEnabled, stopLossPct, takeProfitPct, trailingStopPct, maxHoldHours]
  );

  const startingEquity = Number(backtest.starting_equity) || 100000;

  const result: WhatIfResult | null = useMemo(() => {
    if (!whatIfData) return null;
    return runWhatIfReplay(
      whatIfData.entry_trades,
      whatIfData.candles,
      params,
      startingEquity,
      whatIfData.constants.feeBps,
      whatIfData.constants.slippageBps,
      whatIfData.constants.startDateMs,
      whatIfData.constants.endDateMs,
      whatIfData.constants.resolutionMs,
    );
  }, [whatIfData, params, startingEquity]);

  // Build combined chart data
  const chartData = useMemo(() => {
    if (!result) return [];

    // Create a map of time -> equity for what-if
    const whatIfMap = new Map<number, number>();
    for (const ep of result.equityPoints) {
      whatIfMap.set(ep.time, ep.equity);
    }

    // Merge original + what-if by time
    const allTimes = new Set<number>();
    originalEquityPoints.forEach((ep) => allTimes.add(ep.time));
    result.equityPoints.forEach((ep) => allTimes.add(ep.time));

    const originalMap = new Map<number, number>();
    originalEquityPoints.forEach((ep) => originalMap.set(ep.time, ep.equity));

    const merged = Array.from(allTimes)
      .sort((a, b) => a - b)
      .map((time) => ({
        time,
        original: originalMap.get(time) ?? undefined,
        whatIf: whatIfMap.get(time) ?? undefined,
      }));

    return merged;
  }, [originalEquityPoints, result]);

  if (!dataLoaded) {
    return (
      <Card className="mb-6 bg-white border-gray-200 shadow-sm">
        <CardContent className="py-8">
          <div className="text-center">
            {dataError ? (
              <>
                <p className="text-sm text-red-600 mb-3">{dataError}</p>
                <Button onClick={loadData} variant="outline" size="sm" className="border-gray-300 text-gray-700 hover:bg-gray-50">Retry</Button>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-[#0A1628]" />
                Loading What-If Analysis...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const m = result?.metrics;
  const o = originalSummary || {};

  return (
    <Card className="mb-6 bg-white border-gray-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-gray-900 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-[#0A1628]" />
          What-If Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Parameter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ParamSlider
            label="Stop Loss"
            enabled={slEnabled}
            onToggle={setSlEnabled}
            value={stopLossPct}
            onChange={setStopLossPct}
            min={0.5}
            max={20}
            step={0.25}
            suffix="%"
            originalValue={originalExit?.stopLossPct}
          />
          <ParamSlider
            label="Take Profit"
            enabled={tpEnabled}
            onToggle={setTpEnabled}
            value={takeProfitPct}
            onChange={setTakeProfitPct}
            min={0.5}
            max={30}
            step={0.25}
            suffix="%"
            originalValue={originalExit?.takeProfitPct}
          />
          <ParamSlider
            label="Trailing Stop"
            enabled={trailingEnabled}
            onToggle={setTrailingEnabled}
            value={trailingStopPct}
            onChange={setTrailingStopPct}
            min={0.5}
            max={15}
            step={0.25}
            suffix="%"
            originalValue={originalExit?.trailingStopPct}
          />
          <ParamSlider
            label="Max Hold Time"
            enabled={timeEnabled}
            onToggle={setTimeEnabled}
            value={maxHoldHours}
            onChange={setMaxHoldHours}
            min={1}
            max={168}
            step={1}
            suffix="h"
            originalValue={originalExit?.maxHoldMinutes != null ? originalExit.maxHoldMinutes / 60 : undefined}
          />
        </div>

        {/* Comparison Metrics Table */}
        {m && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-400 font-medium">Metric</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Original</th>
                  <th className="text-right py-2 text-gray-400 font-medium">What-If</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <CompRow
                  label="Return"
                  original={o.return_pct}
                  whatIf={m.returnPct}
                  format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
                  higherIsBetter
                />
                <CompRow
                  label="Win Rate"
                  original={o.win_rate}
                  whatIf={m.winRate}
                  format={(v) => `${v.toFixed(1)}%`}
                  higherIsBetter
                />
                <CompRow
                  label="Trades"
                  original={o.total_trades}
                  whatIf={m.totalTrades}
                  format={(v) => `${v}`}
                />
                <CompRow
                  label="Max Drawdown"
                  original={o.max_drawdown_pct}
                  whatIf={m.maxDrawdownPct}
                  format={(v) => `${v.toFixed(2)}%`}
                  lowerIsBetter
                />
                <CompRow
                  label="Total PnL"
                  original={o.total_pnl}
                  whatIf={m.totalPnl}
                  format={(v) => `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`}
                  higherIsBetter
                />
                <CompRow
                  label="Avg Trade PnL"
                  original={o.avg_trade_pnl}
                  whatIf={m.avgTradePnl}
                  format={(v) => `${v >= 0 ? "+" : ""}$${v.toFixed(2)}`}
                  higherIsBetter
                />
              </tbody>
            </table>
          </div>
        )}

        {/* Dual Equity Curve */}
        {chartData.length > 1 && (
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-3">Equity Comparison</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    stroke="#d1d5db"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#d1d5db"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      color: "#111827",
                      fontSize: 12,
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      name === "original" ? "Original" : "What-If",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "#6b7280" }}
                    formatter={(value) => (value === "original" ? "Original" : "What-If")}
                  />
                  <Line
                    type="monotone"
                    dataKey="original"
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="whatIf"
                    stroke={
                      m && m.returnPct >= 0 ? "#059669" : "#dc2626"
                    }
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Sub-components ---

function ParamSlider({
  label,
  enabled,
  onToggle,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  originalValue,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  originalValue?: number | null;
}) {
  const isAtOriginal = originalValue != null && Math.abs(value - originalValue) < 0.01;
  const isChanged = originalValue != null && enabled && !isAtOriginal;
  const originalPct = originalValue != null ? ((originalValue - min) / (max - min)) * 100 : null;

  // Snap to original when close
  const handleChange = (rawValue: number) => {
    if (originalValue != null) {
      const snapRange = (max - min) * 0.015; // 1.5% of range
      if (Math.abs(rawValue - originalValue) <= snapRange) {
        onChange(originalValue);
        return;
      }
    }
    onChange(rawValue);
  };

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        enabled
          ? "border-gray-200 bg-gray-50"
          : "border-gray-100 bg-transparent opacity-50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="rounded border-gray-300 bg-white text-[#0A1628] focus:ring-[#0A1628] focus:ring-offset-0 h-3.5 w-3.5"
          />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </label>
        <div className="flex items-center gap-1.5">
          {isAtOriginal && originalValue != null && (
            <span className="text-[10px] text-emerald-600 font-medium">original</span>
          )}
          <span className={`text-sm font-mono ${isAtOriginal ? "text-emerald-600" : isChanged ? "text-amber-600" : "text-gray-900"}`}>
            {value}{suffix}
          </span>
        </div>
      </div>
      <div className="relative">
        {/* Original value marker — small triangle above track */}
        {originalPct != null && enabled && !isAtOriginal && (
          <div
            className="absolute -top-1 -translate-x-1/2 z-20 pointer-events-none"
            style={{ left: `${originalPct}%` }}
          >
            <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-gray-400" />
          </div>
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleChange(Number(e.target.value))}
          disabled={!enabled}
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0A1628] disabled:cursor-not-allowed relative z-10"
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-400">{min}{suffix}</span>
        <span className="text-[10px] text-gray-400">{max}{suffix}</span>
      </div>
    </div>
  );
}

function CompRow({
  label,
  original,
  whatIf,
  format,
  higherIsBetter,
  lowerIsBetter,
}: {
  label: string;
  original: number | undefined;
  whatIf: number;
  format: (v: number) => string;
  higherIsBetter?: boolean;
  lowerIsBetter?: boolean;
}) {
  const origVal = original ?? 0;
  const diff = whatIf - origVal;

  let changeColor = "text-gray-400";
  if (higherIsBetter) {
    changeColor = diff > 0.01 ? "text-emerald-600" : diff < -0.01 ? "text-red-600" : "text-gray-400";
  } else if (lowerIsBetter) {
    changeColor = diff < -0.01 ? "text-emerald-600" : diff > 0.01 ? "text-red-600" : "text-gray-400";
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 text-gray-500">{label}</td>
      <td className="py-2 text-right font-mono">{original !== undefined ? format(origVal) : "--"}</td>
      <td className="py-2 text-right font-mono text-gray-900">{format(whatIf)}</td>
      <td className={`py-2 text-right font-mono ${changeColor}`}>
        {diff > 0 ? "+" : ""}{diff.toFixed(2)}
      </td>
    </tr>
  );
}
