"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { getBearerToken } from "@/lib/api/clientAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  AlertTriangle,
  DollarSign,
  Clock,
  Trash2,
} from "lucide-react";
import { BacktestWhatIf } from "@/components/backtest-what-if";
import { BacktestAnalysisChat } from "@/components/backtest-analysis-chat";

function BacktestResultContent() {
  const params = useParams();
  const router = useRouter();
  const backtestId = params.id as string;

  const [backtest, setBacktest] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [equityPoints, setEquityPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch(
        `/api/backtest/${backtestId}?trades=true&equity=true`,
        { headers: { Authorization: bearer } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBacktest(data.backtest);
      setTrades(data.trades || []);
      setEquityPoints(data.equity_points || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (backtest?.status === "running" || backtest?.status === "pending") {
        fetchData();
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backtestId, backtest?.status]);

  const handleCancel = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;
      await fetch(`/api/backtest/${backtestId}`, {
        method: "DELETE",
        headers: { Authorization: bearer },
      });
      fetchData();
    } catch {}
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;
      await fetch(`/api/backtest/${backtestId}`, {
        method: "DELETE",
        headers: { Authorization: bearer },
      });
      router.push("/dashboard");
    } catch {
      setDeleting(false);
    }
  };

  const chartData = useMemo(() => {
    return equityPoints.map((ep: any) => ({
      time: new Date(ep.tick_timestamp).getTime(),
      equity: Number(ep.equity),
      pnl: Number(ep.equity) - (backtest?.starting_equity || 100000),
    }));
  }, [equityPoints, backtest?.starting_equity]);

  const summary = backtest?.result_summary || {};
  const isRunning = backtest?.status === "running" || backtest?.status === "pending";
  const isCompleted = backtest?.status === "completed";
  const isFailed = backtest?.status === "failed" || backtest?.status === "cancelled";

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A1628]" />
      </div>
    );
  }

  if (error || !backtest) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-50 container mx-auto px-4 py-16 text-center">
        <p className="text-red-600">{error || "Backtest not found"}</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4 border-gray-300 text-gray-700 hover:bg-gray-100">
          Go Back
        </Button>
      </div>
    );
  }

  const progressPct =
    backtest.total_ticks > 0
      ? Math.round((backtest.completed_ticks / backtest.total_ticks) * 100)
      : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 ${isCompleted ? "max-w-[1600px]" : "max-w-7xl"}`}>
        {/* Header — always full width above both columns */}
        <div className="flex items-center gap-3 mb-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Backtest Results</h1>
            <Badge
              variant="outline"
              className={
                isRunning
                  ? "border-[#0A1628]/30 text-[#0A1628] bg-[#0A1628]/5"
                  : isCompleted
                  ? "border-emerald-500/40 text-emerald-700 bg-emerald-50"
                  : "border-red-300 text-red-700 bg-red-50"
              }
            >
              {backtest.status}
            </Badge>
          </div>

        {/* Two-column layout: content left, chat right */}
        <div className={`${isCompleted ? "flex gap-6" : ""}`}>
        <div className={`${isCompleted ? "flex-1 min-w-0" : ""}`}>

          {isRunning && (
            <Card className="mb-6 bg-white border-gray-200 shadow-sm">
              <CardContent className="py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Loader2 className="h-4 w-4 animate-spin text-[#0A1628]" />
                    <span className="text-sm font-medium">
                      Running... {backtest.completed_ticks}/{backtest.total_ticks} ticks
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </Button>
                </div>
                <div className="relative w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-[#0a1628] to-[#1a3a6e] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500"
                    style={{ left: `${progressPct}%` }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="rotate-90">
                      <path d="M12 2L4 14h6v8l8-12h-6V2z" fill="#1a3a6e" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Cost so far: ${(backtest.actual_cost_cents / 100).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}

          {isFailed && backtest.error_message && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{backtest.error_message}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.resolution_fallback && (
            <Card className="mb-6 bg-amber-50 border-amber-200">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">{summary.resolution_fallback.reason}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard
              label="Return"
              value={
                summary.return_pct !== undefined
                  ? `${summary.return_pct >= 0 ? "+" : ""}${summary.return_pct.toFixed(2)}%`
                  : "--"
              }
              icon={summary.return_pct >= 0 ? TrendingUp : TrendingDown}
              valueColor={summary.return_pct >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <MetricCard
              label="Win Rate"
              value={
                summary.win_rate !== undefined
                  ? `${summary.win_rate.toFixed(1)}%`
                  : "--"
              }
              icon={Target}
            />
            <MetricCard
              label="Total Trades"
              value={summary.total_trades?.toString() || "--"}
              icon={BarChart3}
            />
            <MetricCard
              label="Max Drawdown"
              value={
                summary.max_drawdown_pct !== undefined
                  ? `${summary.max_drawdown_pct.toFixed(2)}%`
                  : "--"
              }
              icon={AlertTriangle}
              valueColor="text-amber-600"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard
              label="Total PnL"
              value={
                summary.total_pnl !== undefined
                  ? `${summary.total_pnl >= 0 ? "+" : ""}$${summary.total_pnl.toFixed(2)}`
                  : "--"
              }
              icon={DollarSign}
              valueColor={summary.total_pnl >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <MetricCard
              label="Avg Trade PnL"
              value={
                summary.avg_trade_pnl !== undefined
                  ? `${summary.avg_trade_pnl >= 0 ? "+" : ""}$${summary.avg_trade_pnl.toFixed(2)}`
                  : "--"
              }
              icon={DollarSign}
              valueColor={summary.avg_trade_pnl >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <MetricCard
              label="W / L"
              value={`${summary.winning_trades || 0} / ${summary.losing_trades || 0}`}
              icon={BarChart3}
            />
            <MetricCard
              label="Backtest Cost"
              value={`$${(backtest.actual_cost_cents / 100).toFixed(2)}`}
              icon={Clock}
            />
          </div>

          {chartData.length > 1 && (
            <Card className="mb-6 bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">Equity Curve</CardTitle>
                <CardDescription className="text-gray-500">
                  Portfolio value over the backtest period (starting: $
                  {(backtest.starting_equity || 100000).toLocaleString()})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 30 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) => {
                          const d = new Date(t);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }}
                        stroke="#d1d5db"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        minTickGap={40}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)
                        }
                        stroke="#d1d5db"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        width={55}
                      />
                      <ReferenceLine
                        y={backtest.starting_equity || 100000}
                        stroke="#d1d5db"
                        strokeDasharray="3 3"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          color: "#111827",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        }}
                        labelStyle={{
                          color: "#6b7280",
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                        separator=": "
                        labelFormatter={(t) =>
                          new Date(t).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        }
                        formatter={(value: number, name: string) => {
                          const formatted = `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          if (name === "equity")
                            return [formatted, "Equity"];
                          return [formatted, name];
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="equity"
                        stroke={
                          chartData.length > 0 &&
                          chartData[chartData.length - 1].pnl >= 0
                            ? "#059669"
                            : "#dc2626"
                        }
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {isCompleted && (
            <BacktestWhatIf
              backtestId={backtestId}
              backtest={backtest}
              originalEquityPoints={chartData}
              originalSummary={summary}
            />
          )}

          <Card className="mb-6 bg-white border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-700 space-y-1.5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                <div>
                  <span className="text-gray-400">Period:</span>{" "}
                  {new Date(backtest.start_date).toLocaleDateString()} –{" "}
                  {new Date(backtest.end_date).toLocaleDateString()}
                </div>
                <div>
                  <span className="text-gray-400">Resolution:</span> {backtest.resolution}
                </div>
                <div>
                  <span className="text-gray-400">Markets:</span>{" "}
                  {(backtest.markets || []).join(", ")}
                </div>
                <div>
                  <span className="text-gray-400">Model:</span>{" "}
                  {backtest.model_provider}/{backtest.model_name}
                </div>
                <div>
                  <span className="text-gray-400">Starting Equity:</span> $
                  {(backtest.starting_equity || 100000).toLocaleString()}
                </div>
                <div>
                  <span className="text-gray-400">Venue:</span> {backtest.venue}
                </div>
              </div>
            </CardContent>
          </Card>

          {trades.length > 0 && (
            <Card className="mb-6 bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">
                  Trade Log ({trades.length} trades)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-400 text-xs">
                        <th className="text-left py-2 pr-3">#</th>
                        <th className="text-left py-2 pr-3">Time</th>
                        <th className="text-left py-2 pr-3">Market</th>
                        <th className="text-left py-2 pr-3">Action</th>
                        <th className="text-left py-2 pr-3">Side</th>
                        <th className="text-right py-2 pr-3">Price</th>
                        <th className="text-right py-2 pr-3">Size</th>
                        <th className="text-right py-2 pr-3">PnL</th>
                        <th className="text-left py-2">Reasoning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t: any, i: number) => {
                        const isExpanded = expandedTradeId === t.id;
                        return (
                          <React.Fragment key={t.id}>
                            <tr
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                              <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                                {new Date(t.tick_timestamp).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="py-2 pr-3 text-gray-700">{t.market}</td>
                              <td className="py-2 pr-3">
                                <Badge
                                  variant="outline"
                                  className={
                                    t.action === "open"
                                      ? "border-[#0A1628]/30 text-[#0A1628] bg-[#0A1628]/5"
                                      : "border-gray-300 text-gray-500"
                                  }
                                >
                                  {t.action}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3">
                                <span
                                  className={
                                    t.side === "buy" ? "text-emerald-600" : "text-red-600"
                                  }
                                >
                                  {t.side}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-700 font-mono">
                                ${Number(t.price).toFixed(2)}
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-500 font-mono">
                                {Number(t.size).toFixed(6)}
                              </td>
                              <td
                                className={`py-2 pr-3 text-right font-mono ${
                                  Number(t.realized_pnl) > 0
                                    ? "text-emerald-600"
                                    : Number(t.realized_pnl) < 0
                                    ? "text-red-600"
                                    : "text-gray-400"
                                }`}
                              >
                                {t.action === "close" || t.action === "flip"
                                  ? `${Number(t.realized_pnl) >= 0 ? "+" : ""}$${Number(t.realized_pnl).toFixed(2)}`
                                  : "-"}
                              </td>
                              <td
                                className={`py-2 text-xs max-w-[200px] truncate ${t.reasoning ? "cursor-pointer text-gray-500 hover:text-gray-900 select-none" : "text-gray-400"}`}
                                onClick={() => t.reasoning && setExpandedTradeId(isExpanded ? null : t.id)}
                              >
                                <span className="flex items-center gap-1">
                                  {t.reasoning ? (
                                    <>
                                      <span className="text-gray-300">{isExpanded ? "▲" : "▼"}</span>
                                      <span className="truncate">{t.reasoning}</span>
                                    </>
                                  ) : "-"}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && t.reasoning && (
                              <tr key={`${t.id}-expanded`} className="border-b border-gray-100 bg-gray-50">
                                <td colSpan={9} className="px-4 py-3">
                                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                                    {t.reasoning}
                                  </p>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {isCompleted && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                Delete Backtest
              </Button>
            </div>
          )}
        </div>
        {/* Right column: chat panel */}
        {isCompleted && (
          <div className="hidden lg:block w-[380px] flex-shrink-0">
            <div className="sticky top-[7rem]">
              <BacktestAnalysisChat
                backtestId={backtestId}
                backtest={backtest}
              />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: any;
  valueColor?: string;
}) {
  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-400">{label}</span>
        </div>
        <p className={`text-lg font-semibold font-mono ${valueColor || "text-gray-900"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function BacktestResultPage() {
  return (
    <AuthGuard>
      <BacktestResultContent />
    </AuthGuard>
  );
}
