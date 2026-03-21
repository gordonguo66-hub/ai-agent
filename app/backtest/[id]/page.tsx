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
      <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !backtest) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a] container mx-auto px-4 py-16 text-center">
        <p className="text-red-400">{error || "Backtest not found"}</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
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
    <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-white">Backtest Results</h1>
            <Badge
              className={
                isRunning
                  ? "bg-blue-600 text-white"
                  : isCompleted
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
              }
            >
              {backtest.status}
            </Badge>
          </div>

          {isRunning && (
            <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
              <CardContent className="py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-blue-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">
                      Running... {backtest.completed_ticks}/{backtest.total_ticks} ticks
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="border-red-800 text-red-400 hover:bg-red-950/30"
                  >
                    Cancel
                  </Button>
                </div>
                <div className="w-full bg-blue-950/50 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Cost so far: ${(backtest.actual_cost_cents / 100).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}

          {isFailed && backtest.error_message && (
            <Card className="mb-6 bg-[#0A0E1A] border-red-900/50">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{backtest.error_message}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.resolution_fallback && (
            <Card className="mb-6 bg-[#0A0E1A] border-amber-900/50">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-amber-400">
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
              color={summary.return_pct >= 0 ? "text-green-400" : "text-red-400"}
            />
            <MetricCard
              label="Win Rate"
              value={
                summary.win_rate !== undefined
                  ? `${summary.win_rate.toFixed(1)}%`
                  : "--"
              }
              icon={Target}
              color="text-blue-400"
            />
            <MetricCard
              label="Total Trades"
              value={summary.total_trades?.toString() || "--"}
              icon={BarChart3}
              color="text-purple-400"
            />
            <MetricCard
              label="Max Drawdown"
              value={
                summary.max_drawdown_pct !== undefined
                  ? `${summary.max_drawdown_pct.toFixed(2)}%`
                  : "--"
              }
              icon={AlertTriangle}
              color="text-amber-400"
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
              color={summary.total_pnl >= 0 ? "text-green-400" : "text-red-400"}
            />
            <MetricCard
              label="Avg Trade PnL"
              value={
                summary.avg_trade_pnl !== undefined
                  ? `${summary.avg_trade_pnl >= 0 ? "+" : ""}$${summary.avg_trade_pnl.toFixed(2)}`
                  : "--"
              }
              icon={DollarSign}
              color={summary.avg_trade_pnl >= 0 ? "text-green-400" : "text-red-400"}
            />
            <MetricCard
              label="W / L"
              value={`${summary.winning_trades || 0} / ${summary.losing_trades || 0}`}
              icon={BarChart3}
              color="text-gray-300"
            />
            <MetricCard
              label="Backtest Cost"
              value={`$${(backtest.actual_cost_cents / 100).toFixed(2)}`}
              icon={Clock}
              color="text-gray-400"
            />
          </div>

          {chartData.length > 1 && (
            <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
              <CardHeader>
                <CardTitle className="text-white">Equity Curve</CardTitle>
                <CardDescription className="text-gray-400">
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) => {
                          const d = new Date(t);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }}
                        stroke="#475569"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        minTickGap={40}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)
                        }
                        stroke="#475569"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        width={55}
                      />
                      <ReferenceLine
                        y={backtest.starting_equity || 100000}
                        stroke="#475569"
                        strokeDasharray="3 3"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #1e293b",
                          borderRadius: 8,
                          color: "#e2e8f0",
                        }}
                        labelStyle={{
                          color: "#94a3b8",
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
                            ? "#10b981"
                            : "#ef4444"
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

          <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
            <CardHeader>
              <CardTitle className="text-white">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-300 space-y-1.5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                <div>
                  <span className="text-gray-500">Period:</span>{" "}
                  {new Date(backtest.start_date).toLocaleDateString()} –{" "}
                  {new Date(backtest.end_date).toLocaleDateString()}
                </div>
                <div>
                  <span className="text-gray-500">Resolution:</span> {backtest.resolution}
                </div>
                <div>
                  <span className="text-gray-500">Markets:</span>{" "}
                  {(backtest.markets || []).join(", ")}
                </div>
                <div>
                  <span className="text-gray-500">Model:</span>{" "}
                  {backtest.model_provider}/{backtest.model_name}
                </div>
                <div>
                  <span className="text-gray-500">Starting Equity:</span> $
                  {(backtest.starting_equity || 100000).toLocaleString()}
                </div>
                <div>
                  <span className="text-gray-500">Venue:</span> {backtest.venue}
                </div>
              </div>
            </CardContent>
          </Card>

          {trades.length > 0 && (
            <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
              <CardHeader>
                <CardTitle className="text-white">
                  Trade Log ({trades.length} trades)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-900/30 text-gray-500 text-xs">
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
                              className="border-b border-blue-900/10 hover:bg-blue-950/20"
                            >
                              <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
                              <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">
                                {new Date(t.tick_timestamp).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="py-2 pr-3 text-gray-300">{t.market}</td>
                              <td className="py-2 pr-3">
                                <Badge
                                  variant="outline"
                                  className={
                                    t.action === "open"
                                      ? "border-blue-500 text-blue-400"
                                      : "border-gray-500 text-gray-400"
                                  }
                                >
                                  {t.action}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3">
                                <span
                                  className={
                                    t.side === "buy" ? "text-green-400" : "text-red-400"
                                  }
                                >
                                  {t.side}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-300 font-mono">
                                ${Number(t.price).toFixed(2)}
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-400 font-mono">
                                {Number(t.size).toFixed(6)}
                              </td>
                              <td
                                className={`py-2 pr-3 text-right font-mono ${
                                  Number(t.realized_pnl) > 0
                                    ? "text-green-400"
                                    : Number(t.realized_pnl) < 0
                                    ? "text-red-400"
                                    : "text-gray-500"
                                }`}
                              >
                                {t.action === "close" || t.action === "flip"
                                  ? `${Number(t.realized_pnl) >= 0 ? "+" : ""}$${Number(t.realized_pnl).toFixed(2)}`
                                  : "-"}
                              </td>
                              <td
                                className={`py-2 text-xs max-w-[200px] truncate ${t.reasoning ? "cursor-pointer text-blue-400/70 hover:text-blue-400 select-none" : "text-gray-500"}`}
                                onClick={() => t.reasoning && setExpandedTradeId(isExpanded ? null : t.id)}
                              >
                                <span className="flex items-center gap-1">
                                  {t.reasoning ? (
                                    <>
                                      <span className="text-gray-600">{isExpanded ? "▲" : "▼"}</span>
                                      <span className="truncate">{t.reasoning}</span>
                                    </>
                                  ) : "-"}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && t.reasoning && (
                              <tr key={`${t.id}-expanded`} className="border-b border-blue-900/20 bg-blue-950/10">
                                <td colSpan={9} className="px-4 py-3">
                                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
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
                className="border-red-900/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
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
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
}) {
  return (
    <Card className="bg-[#0A0E1A] border-blue-900/50">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          <span className="text-xs text-gray-500">{label}</span>
        </div>
        <p className={`text-lg font-semibold font-mono ${color}`}>{value}</p>
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
