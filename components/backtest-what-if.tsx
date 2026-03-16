"use client";

import { useState, useMemo, useCallback } from "react";
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

  // Parameter state
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
      setDataLoaded(true);
    } catch (err: any) {
      setDataError(err.message || "Failed to load data");
    } finally {
      setDataLoading(false);
    }
  }, [backtestId]);

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
      <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
        <CardContent className="py-8">
          <div className="text-center">
            <SlidersHorizontal className="h-8 w-8 text-gray-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">What-If Analysis</h3>
            <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">
              Adjust exit parameters (SL, TP, trailing stop, hold time) and instantly see
              how results would change. Entry decisions stay the same.
            </p>
            {dataError && (
              <p className="text-sm text-red-400 mb-3">{dataError}</p>
            )}
            <Button
              onClick={loadData}
              disabled={dataLoading}
              className="px-6"
            >
              {dataLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading market data...
                </>
              ) : (
                "Load What-If Data"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const m = result?.metrics;
  const o = originalSummary || {};

  return (
    <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
      <CardHeader className="pb-4">
        <CardTitle className="text-white flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-blue-400" />
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
          />
        </div>

        {/* Comparison Metrics Table */}
        {m && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 text-gray-400 font-medium">Metric</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Original</th>
                  <th className="text-right py-2 text-gray-400 font-medium">What-If</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    stroke="#4b5563"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#4b5563"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e3a5f",
                      borderRadius: "8px",
                      color: "#e5e7eb",
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      name === "original" ? "Original" : "What-If",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
                    formatter={(value) => (value === "original" ? "Original" : "What-If")}
                  />
                  <Line
                    type="monotone"
                    dataKey="original"
                    stroke="#6b7280"
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
                      m && m.returnPct >= 0 ? "#22c55e" : "#ef4444"
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
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        enabled
          ? "border-blue-900/50 bg-blue-950/20"
          : "border-gray-800 bg-transparent opacity-50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 h-3.5 w-3.5"
          />
          <span className="text-sm font-medium text-gray-300">{label}</span>
        </label>
        <span className="text-sm font-mono text-white">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={!enabled}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">{min}{suffix}</span>
        <span className="text-[10px] text-gray-600">{max}{suffix}</span>
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

  let changeColor = "text-gray-500";
  if (higherIsBetter) {
    changeColor = diff > 0.01 ? "text-green-400" : diff < -0.01 ? "text-red-400" : "text-gray-500";
  } else if (lowerIsBetter) {
    changeColor = diff < -0.01 ? "text-green-400" : diff > 0.01 ? "text-red-400" : "text-gray-500";
  }

  return (
    <tr className="border-b border-gray-800/50">
      <td className="py-2 text-gray-400">{label}</td>
      <td className="py-2 text-right font-mono">{original !== undefined ? format(origVal) : "--"}</td>
      <td className="py-2 text-right font-mono text-white">{format(whatIf)}</td>
      <td className={`py-2 text-right font-mono ${changeColor}`}>
        {diff > 0 ? "+" : ""}{diff.toFixed(2)}
      </td>
    </tr>
  );
}
