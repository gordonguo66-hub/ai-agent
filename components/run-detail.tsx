"use client";

import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/browser";
import { useState } from "react";
import { FormattedDate } from "@/components/formatted-date";

interface RunDetailProps {
  run: any;
  isInArena: boolean;
}

export function RunDetail({ run, isInArena }: RunDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [inArena, setInArena] = useState(isInArena);

  const metrics = run.metrics || {};
  const equityCurve = run.equity_curve || [];

  const handleArenaToggle = async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    if (inArena) {
      // Leave arena
      await supabase
        .from("arena_entries")
        .delete()
        .eq("run_id", run.id)
        .eq("user_id", user.id);
      setInArena(false);
    } else {
      // Join arena
      await supabase.from("arena_entries").insert({
        run_id: run.id,
        user_id: user.id,
      });
      setInArena(true);
    }
    setLoading(false);
    router.refresh();
  };

  const returnValue = metrics.total_return
    ? (metrics.total_return * 100).toFixed(2)
    : "N/A";
  const isPositive = metrics.total_return && metrics.total_return > 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-6">
              ← Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                {run.strategies?.name || "Unknown Strategy"}
              </h1>
              <p className="text-muted-foreground">
                Started: <FormattedDate date={run.started_at} format="full" />
              </p>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Return
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold font-mono ${
                  returnValue !== "N/A"
                    ? isPositive
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                    : ""
                }`}>
                  {returnValue !== "N/A" ? `${isPositive ? "+" : ""}${returnValue}%` : "N/A"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Max Drawdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono text-red-600 dark:text-red-400">
                  {metrics.max_drawdown
                    ? `${(metrics.max_drawdown * 100).toFixed(2)}%`
                    : "N/A"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Trades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-mono">{metrics.trades || 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Equity Curve */}
          <Card className="mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Equity Curve</CardTitle>
              <CardDescription>Performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height={450}>
                  <LineChart data={equityCurve} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="t" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(value) => value.toFixed(2)}
                    />
                    <Tooltip
                      formatter={(value: number) => value.toFixed(4)}
                      labelFormatter={(label) => `Time: ${label}`}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-12">
                  No equity curve data available
                </p>
              )}
            </CardContent>
          </Card>

          {/* Arena Toggle */}
          <div className="flex justify-center">
            <Button
              onClick={handleArenaToggle}
              disabled={loading}
              variant={inArena ? "destructive" : "default"}
              size="lg"
            >
              {loading
                ? "Loading..."
                : inArena
                ? "Leave Arena"
                : "Join Arena"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
