"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/formatted-date";
import { Wallet, ArrowRight, X, FlaskConical, Loader2, AlertTriangle } from "lucide-react";

function StrategyDetailContent() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [strategy, setStrategy] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liveDialogOpen, setLiveDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);

  // Session limit tracking
  const [sessionLimit, setSessionLimit] = useState<{ count: number; limit: number | null; tier: string } | null>(null);
  const [credits, setCredits] = useState<{ balance_cents: number; plan_id: string | null; plan_status: string } | null>(null);

  // Recent backtest runs
  const [backtestRuns, setBacktestRuns] = useState<any[]>([]);

  // Backtest state
  const [backtestDialogOpen, setBacktestDialogOpen] = useState(false);
  const [backtestStartDate, setBacktestStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [backtestEndDate, setBacktestEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [backtestResolution, setBacktestResolution] = useState("1h");
  const [backtestEstimate, setBacktestEstimate] = useState<any>(null);
  const [backtestEstimateLoading, setBacktestEstimateLoading] = useState(false);
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [deletingBacktestId, setDeletingBacktestId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch strategy
      const { data, error } = await supabase
        .from("strategies")
        .select("id, user_id, name, model_provider, model_name, prompt, filters, api_key_ciphertext, saved_api_key_id, use_platform_key, created_at")
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setStrategy(data);
      }

      // Fetch sessions via API (uses service role, avoids RLS issues)
      try {
        const bearer = await getBearerToken();
        const sessionsResponse = await fetch("/api/sessions", {
          headers: bearer ? { Authorization: bearer } : {},
        });
        if (sessionsResponse.ok) {
          const sessionsJson = await sessionsResponse.json();
          const allSessions = sessionsJson.sessions || [];
          // Filter to only sessions for this strategy
          const strategySessions = allSessions
            .filter((s: any) => s.strategy_id === strategyId)
            .slice(0, 10);
          console.log(`[Strategy Page] Found ${strategySessions.length} sessions for strategy ${strategyId}`);
          setSessions(strategySessions);

          // Calculate session limit info
          const totalSessionCount = allSessions.length;

          // Fetch subscription tier
          const creditsResponse = await fetch("/api/credits", {
            headers: bearer ? { Authorization: bearer } : {},
          });
          if (creditsResponse.ok) {
            const creditsJson = await creditsResponse.json();
            const tier = creditsJson.subscription?.plan_id || "on_demand";
            const hasLimit = tier === "pro" || tier === "on_demand" || !tier;
            setSessionLimit({
              count: totalSessionCount,
              limit: hasLimit ? 3 : null,
              tier,
            });
            setCredits({
              balance_cents: creditsJson.credits?.balance_cents ?? 0,
              plan_id: creditsJson.subscription?.plan_id ?? null,
              plan_status: creditsJson.subscription?.status ?? "inactive",
            });
          }
        }
      } catch (err) {
        console.error("[Strategy Page] Failed to load sessions", err);
      }

      // Fetch recent backtest runs for this strategy
      try {
        const { data: runs } = await supabase
          .from("backtest_runs")
          .select("id, status, created_at, completed_at, starting_equity, result_summary, actual_cost_cents, markets, start_date, end_date, resolution")
          .eq("strategy_id", strategyId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (runs) setBacktestRuns(runs);
      } catch (err) {
        console.error("[Strategy Page] Failed to load backtest runs", err);
      }

      setLoading(false);
    };

    load();
  }, [strategyId]);

  const hasActivePlan = credits?.plan_id && credits.plan_status === "active";
  const hasInsufficientFunds = credits && !hasActivePlan && credits.balance_cents <= 0;

  const handleStartSession = (mode: "virtual" | "live" | "arena") => {
    if (hasInsufficientFunds) {
      setBalanceDialogOpen(true);
      return;
    }
    if (mode === "live") {
      setConfirmText("");
      setLiveDialogOpen(true);
      return;
    }
    createAndStart(mode);
  };

  const createAndStart = async (mode: "virtual" | "live" | "arena") => {
    setBusy(true);
    setError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");

      console.log(`[Start Session] Creating ${mode} session for strategy ${strategyId}`);
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({
          strategy_id: strategyId,
          mode,
        }),
      });
      
      console.log(`[Start Session] Create response status: ${createRes.status}`);
      
      let createJson;
      try {
        createJson = await createRes.json();
      } catch (jsonError) {
        console.error("[Start Session] Failed to parse JSON response:", jsonError);
        throw new Error(`Server error: ${createRes.status} ${createRes.statusText}`);
      }
      
      if (!createRes.ok) {
        console.error("[Start Session] Create failed:", createJson);
        throw new Error(createJson.error || `Failed to create session (${createRes.status})`);
      }

      const session = createJson.session;
      console.log(`[Start Session] Session created: ${session.id}`);

      const startRes = await fetch(`/api/sessions/${session.id}/control`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({
          status: "running",
        }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok) {
        console.error("[Start Session] Start failed:", startJson);
        throw new Error(startJson.error || "Failed to start session");
      }

      console.log(`[Start Session] Session started, redirecting...`);
      router.push(`/dashboard/sessions/${session.id}`);
    } catch (e: any) {
      console.error("[Start Session] Error:", e);
      setError(e.message || "Failed to start");
    } finally {
      setBusy(false);
    }
  };


  const fetchBacktestEstimate = async () => {
    if (!backtestStartDate || !backtestEndDate) return;
    setBacktestEstimateLoading(true);
    setBacktestError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;
      const res = await fetch("/api/backtest/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({
          strategy_id: strategyId,
          start_date: backtestStartDate,
          end_date: backtestEndDate,
          resolution: backtestResolution,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.data_available === false) {
          setBacktestError(data.error || "No historical data available for this date range.");
          setBacktestEstimate(null);
        } else {
          setBacktestEstimate(data);
        }
      } else {
        setBacktestError(data.error || "Failed to estimate cost");
      }
    } catch {
      setBacktestError("Failed to estimate cost");
    } finally {
      setBacktestEstimateLoading(false);
    }
  };

  useEffect(() => {
    if (backtestDialogOpen && strategyId) {
      fetchBacktestEstimate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backtestDialogOpen, backtestStartDate, backtestEndDate, backtestResolution]);

  const handleDeleteBacktest = async (e: React.MouseEvent, backtestId: string) => {
    e.stopPropagation();
    setDeletingBacktestId(backtestId);
    try {
      const bearer = await getBearerToken();
      const res = await fetch(`/api/backtest/${backtestId}`, { method: "DELETE", headers: bearer ? { Authorization: bearer } : {} });
      if (res.ok) {
        setBacktestRuns((prev) => prev.filter((r) => r.id !== backtestId));
      }
    } finally {
      setDeletingBacktestId(null);
    }
  };

  const handleRunBacktest = async () => {
    setBacktestRunning(true);
    setBacktestError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({
          strategy_id: strategyId,
          start_date: backtestStartDate,
          end_date: backtestEndDate,
          resolution: backtestResolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start backtest");
      setBacktestDialogOpen(false);
      router.push(`/backtest/${data.backtest.id}`);
    } catch (e: any) {
      setBacktestError(e.message || "Failed to start backtest");
    } finally {
      setBacktestRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a] container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a] container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-gray-400">{error || "Strategy not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#070d1a]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-3xl font-bold tracking-tight text-white">{strategy.name}</h1>
              <Button variant="outline" onClick={() => router.push(`/strategy/${strategyId}/edit`)} className="border-blue-900 text-gray-300 hover:text-white hover:border-blue-800 hover:bg-blue-950/30">
                Edit Strategy
              </Button>
            </div>
            <p className="text-gray-300">
              {strategy.model_provider} / {strategy.model_name}
            </p>
          </div>

          <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
            <CardHeader>
              <CardTitle className="text-white">Start a Session</CardTitle>
              <CardDescription className="text-gray-300">
                VIRTUAL uses real Hyperliquid prices with simulated execution and a $100,000 starting balance.
                ARENA creates a competitive session visible on the leaderboard (starts with $100k, virtual execution).
                LIVE places real orders on Hyperliquid or Coinbase.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
              {sessionLimit && sessionLimit.limit !== null && sessionLimit.count >= sessionLimit.limit && (
                <div className="mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-600/50">
                  <p className="text-amber-400 text-sm font-medium">
                    Session limit reached ({sessionLimit.count}/{sessionLimit.limit})
                  </p>
                  <p className="text-amber-300/70 text-xs mt-1">
                    Upgrade to Pro+ or Ultra for unlimited sessions.{" "}
                    <a href="/settings/billing" className="underline hover:text-amber-200">Upgrade now</a>
                  </p>
                </div>
              )}
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">AI Model</Badge>
                  <span className="text-muted-foreground">{strategy.model_provider} / {strategy.model_name}</span>
                </div>
                {strategy.use_platform_key ? (
                  <p className="text-xs text-muted-foreground">
                    ✓ Using Corebound platform AI (billed to your credit balance)
                  </p>
                ) : (!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id ? (
                  <p className="text-xs text-muted-foreground">
                    This strategy needs an API key. Edit the strategy to add your API key.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    ✓ API key configured for this strategy {strategy.saved_api_key_id ? "(using saved key)" : ""}
                  </p>
                )}
              </div>
              {(() => {
                const noApiKey = !strategy.use_platform_key && (!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id;
                const atSessionLimit = sessionLimit?.limit !== null && sessionLimit && sessionLimit.count >= sessionLimit.limit;
                const isDisabled = !!(busy || noApiKey || atSessionLimit);
                return (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isDisabled}
                  onClick={() => handleStartSession("virtual")}
                  className="bg-blue-900 hover:bg-blue-800 text-white border border-blue-700"
                >
                  {busy ? "Starting..." : "Start Virtual ($100k)"}
                </Button>
                <Button
                  disabled={isDisabled}
                  variant="default"
                  onClick={() => handleStartSession("arena")}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  {busy ? "Starting..." : "Start in Arena 🏆"}
                </Button>
                <Button
                  disabled={isDisabled}
                  variant="destructive"
                  onClick={() => handleStartSession("live")}
                  className="bg-red-900 hover:bg-red-800 text-white"
                >
                  Start Live
                </Button>
                <Button variant="outline" onClick={() => router.push("/settings")} className="border-blue-900 text-gray-300 hover:text-white hover:border-blue-800 hover:bg-blue-950/30">
                  Manage Exchange Connection
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBacktestDialogOpen(true)}
                  className="border-amber-700 text-amber-400 hover:text-amber-300 hover:border-amber-600 hover:bg-amber-950/30"
                >
                  <FlaskConical className="h-4 w-4 mr-1.5" />
                  Run Backtest
                </Button>
              </div>
                );
              })()}
            </CardContent>
          </Card>

          {backtestRuns.length > 0 && (
            <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-amber-400" />
                  Recent Backtests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {backtestRuns.map((run) => {
                  const summary = run.result_summary || {};
                  const markets = run.markets || [];
                  const returnPct = summary.return_pct;
                  const isPositive = returnPct > 0;
                  const statusColor =
                    run.status === "completed" ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" :
                    run.status === "running" || run.status === "pending" ? "bg-blue-900/60 text-blue-300 border-blue-700" :
                    run.status === "cancelled" ? "bg-gray-800 text-gray-400 border-gray-600" :
                    "bg-red-900/60 text-red-300 border-red-700";

                  return (
                    <div
                      key={run.id}
                      onClick={() => router.push(`/backtest/${run.id}`)}
                      className="flex items-center justify-between p-3 rounded-lg border border-blue-900/40 bg-[#060A14] hover:border-blue-700/60 hover:bg-[#0C1220] cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor}`}>
                            {run.status}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {run.start_date && run.end_date
                              ? `${new Date(run.start_date).toLocaleDateString()} – ${new Date(run.end_date).toLocaleDateString()}`
                              : <FormattedDate date={run.created_at} />}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {(Array.isArray(markets) ? markets : []).join(", ") || "—"} · {run.resolution || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {run.status === "completed" && returnPct !== undefined && (
                          <span className={`text-sm font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}{returnPct.toFixed(2)}%
                          </span>
                        )}
                        {run.status === "completed" && summary.total_trades !== undefined && (
                          <span className="text-xs text-gray-500">{summary.total_trades} trades</span>
                        )}
                        {(run.status === "cancelled" || run.status === "failed") && (
                          <button
                            onClick={(e) => handleDeleteBacktest(e, run.id)}
                            disabled={deletingBacktestId === run.id}
                            className="p-1 rounded hover:bg-red-900/40 text-gray-600 hover:text-red-400 transition-colors"
                          >
                            {deletingBacktestId === run.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <X className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-gray-600" />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card className="mb-6 bg-[#0A0E1A] border-blue-900/50">
            <CardHeader>
              <CardTitle className="text-white">Risk Filters</CardTitle>
              <CardDescription className="text-gray-300">Used by both Virtual and Live modes</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-gray-300 space-y-1">
              <div>
                Max Position (USD): {strategy.filters?.risk?.maxPositionUsd ?? "(not set)"}
              </div>
              <div>
                Max Leverage: {strategy.filters?.risk?.maxLeverage ?? "(not set)"}
              </div>
              <div>
                Max Daily Loss (%): {strategy.filters?.risk?.maxDailyLossPct !== undefined && strategy.filters?.risk?.maxDailyLossPct !== null
                  ? `${strategy.filters.risk.maxDailyLossPct}%`
                  : "(not set)"}
              </div>
            </CardContent>
          </Card>

          {/* Sessions List */}
          <Card className="bg-[#0A0E1A] border-blue-900/50">
            <CardHeader>
              <CardTitle className="text-white">Sessions</CardTitle>
              <CardDescription className="text-gray-300">
                {sessions.length === 0
                  ? "No sessions yet. Start one above!"
                  : `${sessions.length} session${sessions.length === 1 ? "" : "s"} for this strategy`}
              </CardDescription>
            </CardHeader>
            {sessions.length > 0 && (
              <CardContent>
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-blue-900/30 bg-blue-950/20 hover:bg-blue-950/40 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/sessions/${session.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={session.status === "running" ? "default" : "secondary"}
                          className={
                            session.status === "running"
                              ? "bg-green-600 text-white"
                              : session.status === "stopped"
                              ? "bg-gray-600 text-white"
                              : "bg-yellow-600 text-white"
                          }
                        >
                          {session.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            session.mode === "live"
                              ? "border-red-500 text-red-400"
                              : session.mode === "arena"
                              ? "border-purple-500 text-purple-400"
                              : "border-blue-500 text-blue-400"
                          }
                        >
                          {session.mode}
                        </Badge>
                        <span className="text-sm text-gray-400">
                          {session.markets?.join(", ") || "No markets"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        <FormattedDate date={session.created_at} format="full" />
                      </div>
                    </div>
                  ))}
                </div>
                {sessions.length >= 10 && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/dashboard")}
                      className="border-blue-900 text-gray-300 hover:text-white hover:border-blue-800"
                    >
                      View all sessions
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <Dialog open={liveDialogOpen} onOpenChange={setLiveDialogOpen}>
            <DialogContent className="bg-[#0A0E1A] border-blue-900">
              <DialogHeader>
                <DialogTitle className="text-white">⚠️ Live trading confirmation</DialogTitle>
                <DialogDescription className="text-gray-300">
                  LIVE mode will place real orders on Hyperliquid or Coinbase. Type <strong className="text-white">CONFIRM</strong> to proceed.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" className="bg-blue-950/30 border-blue-900 text-white placeholder:text-gray-500" />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={busy || confirmText !== "CONFIRM"}
                    onClick={async () => {
                      setLiveDialogOpen(false);
                      await createAndStart("live");
                    }}
                    className="bg-red-900 hover:bg-red-800 text-white"
                  >
                    Start Live
                  </Button>
                  <Button variant="outline" onClick={() => setLiveDialogOpen(false)} className="border-blue-900 text-gray-300 hover:text-white hover:border-blue-800 hover:bg-blue-950/30">
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-gray-400">
                  Tip: start with Virtual first to verify intent + risk gates look correct.
                </p>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
            <DialogContent className="bg-[#f0f4ff] border-blue-200 p-0 overflow-hidden max-w-md">
              <button
                onClick={() => setBalanceDialogOpen(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex flex-col items-center text-center px-8 pt-8 pb-6">
                <div className="w-16 h-16 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center mb-5">
                  <Wallet className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Top Up to Get Started</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-1">
                  Running a session requires AI tokens to analyze markets and generate trades. You need at least <span className="text-gray-900 font-medium">$1.00</span> in credits or an active membership plan to cover AI usage.
                </p>
                <div className="mt-4 mb-2 px-4 py-2.5 rounded-lg bg-white border border-blue-100 w-full">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Current balance</span>
                    <span className="text-gray-900 font-mono font-medium">
                      ${((credits?.balance_cents ?? 0) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="px-8 pb-8 flex flex-col gap-3">
                <Button
                  onClick={() => {
                    setBalanceDialogOpen(false);
                    router.push("/settings/billing");
                  }}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-medium py-5 text-sm"
                >
                  Add Credits
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <button
                  onClick={() => setBalanceDialogOpen(false)}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
                >
                  Maybe later
                </button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={backtestDialogOpen} onOpenChange={setBacktestDialogOpen}>
            <DialogContent className="bg-[#0A0E1A] border-blue-900 max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-amber-400" />
                  Run Backtest
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Replay historical price data through your AI model to simulate past performance. Each tick makes a real AI call, so this uses your credits.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Start Date</label>
                    <Input
                      type="date"
                      value={backtestStartDate}
                      onChange={(e) => setBacktestStartDate(e.target.value)}
                      className="bg-blue-950/30 border-blue-900 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">End Date</label>
                    <Input
                      type="date"
                      value={backtestEndDate}
                      onChange={(e) => setBacktestEndDate(e.target.value)}
                      className="bg-blue-950/30 border-blue-900 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Resolution (tick interval)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "15m", label: "15 min", desc: "High detail" },
                      { value: "1h", label: "1 hour", desc: "Recommended" },
                      { value: "4h", label: "4 hours", desc: "Low cost" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setBacktestResolution(opt.value)}
                        className={`p-2.5 rounded-lg border text-center transition-colors ${
                          backtestResolution === opt.value
                            ? "border-amber-500 bg-amber-950/30 text-amber-300"
                            : "border-blue-900/50 bg-blue-950/20 text-gray-400 hover:border-blue-800 hover:text-gray-300"
                        }`}
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-[10px] opacity-70">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {backtestError && (
                  <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                    <p className="text-red-400 text-sm">{backtestError}</p>
                  </div>
                )}

                <div className="rounded-lg border border-blue-900/50 bg-blue-950/20 p-3 space-y-2">
                  {backtestEstimateLoading ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Calculating estimate...
                    </div>
                  ) : backtestEstimate?.estimate ? (
                    <>
                      {backtestEstimate.data_warning && (
                        <div className="rounded border border-amber-800/50 bg-amber-950/20 px-2.5 py-2 mb-1">
                          <p className="text-amber-400 text-xs leading-relaxed">
                            <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />
                            {backtestEstimate.data_warning}
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Estimated cost</span>
                        <span className="text-white font-mono font-semibold text-lg">
                          ${backtestEstimate.estimate.estimated_cost_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{backtestEstimate.estimate.total_ticks} ticks x ${(backtestEstimate.estimate.cost_per_tick_cents / 100).toFixed(3)}/tick</span>
                        <span>~{backtestEstimate.estimate.duration_days.toFixed(1)} days</span>
                      </div>
                      {backtestEstimate.estimate.requested_resolution && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Resolution</span>
                          <span className="text-amber-400">
                            {backtestEstimate.estimate.requested_resolution} → {backtestEstimate.estimate.resolution} (fallback)
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Your balance</span>
                        <span className={backtestEstimate.balance.sufficient ? "text-green-400" : "text-red-400"}>
                          ${(backtestEstimate.balance.available_cents / 100).toFixed(2)}
                          {!backtestEstimate.balance.sufficient && " (insufficient)"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Model</span>
                        <span className="text-gray-400">{backtestEstimate.estimate.model}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Markets</span>
                        <span className="text-gray-400">{backtestEstimate.estimate.markets_count} market{backtestEstimate.estimate.markets_count > 1 ? "s" : ""}</span>
                      </div>
                    </>
                  ) : null}
                </div>

                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Backtesting replays real historical price data through your AI model at each interval. Because we make real AI calls on every tick, this uses your credits — same pricing as a live session. Asset names and dates are hidden from the AI to prevent look-ahead bias. Estimated cost may vary slightly based on prompt length.
                </p>

                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={
                      backtestRunning ||
                      !backtestEstimate?.balance?.sufficient ||
                      backtestEstimateLoading
                    }
                    onClick={handleRunBacktest}
                    className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white"
                  >
                    {backtestRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : backtestEstimate ? (
                      `Run Backtest (~$${backtestEstimate.estimate.estimated_cost_usd.toFixed(2)})`
                    ) : (
                      "Run Backtest"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setBacktestDialogOpen(false)}
                    className="border-blue-900 text-gray-300 hover:text-white hover:border-blue-800 hover:bg-blue-950/30"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

export default function StrategyDetailPage() {
  return (
    <AuthGuard>
      <StrategyDetailContent />
    </AuthGuard>
  );
}

