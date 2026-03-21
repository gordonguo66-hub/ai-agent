"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormattedDate } from "@/components/formatted-date";
import { Wallet, ArrowRight, X, FlaskConical, Loader2, AlertTriangle } from "lucide-react";
import { isFreeTier } from "@/lib/tier/constants";

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

      try {
        const bearer = await getBearerToken();
        const sessionsResponse = await fetch("/api/sessions", {
          headers: bearer ? { Authorization: bearer } : {},
        });
        if (sessionsResponse.ok) {
          const sessionsJson = await sessionsResponse.json();
          const allSessions = sessionsJson.sessions || [];
          const strategySessions = allSessions
            .filter((s: any) => s.strategy_id === strategyId)
            .slice(0, 10);
          setSessions(strategySessions);

          const totalSessionCount = allSessions.length;

          const creditsResponse = await fetch("/api/credits", {
            headers: bearer ? { Authorization: bearer } : {},
          });
          if (creditsResponse.ok) {
            const creditsJson = await creditsResponse.json();
            const tier = creditsJson.subscription?.plan_id || "on_demand";
            const hasLimit = tier === "free" || tier === "pro" || tier === "on_demand" || !tier;
            const limit = tier === "free" ? 1 : 3;
            setSessionLimit({
              count: totalSessionCount,
              limit: hasLimit ? limit : null,
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

  const hasActivePlan = credits?.plan_id && credits.plan_status === "active" && !isFreeTier(credits.plan_id);
  const hasInsufficientFunds = credits && !hasActivePlan && credits.balance_cents <= 0;
  const isFree = isFreeTier(credits?.plan_id);

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

      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({ strategy_id: strategyId, mode }),
      });

      let createJson;
      try {
        createJson = await createRes.json();
      } catch {
        throw new Error(`Server error: ${createRes.status} ${createRes.statusText}`);
      }

      if (!createRes.ok) {
        throw new Error(createJson.error || `Failed to create session (${createRes.status})`);
      }

      const session = createJson.session;

      const startRes = await fetch(`/api/sessions/${session.id}/control`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({ status: "running" }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startJson.error || "Failed to start session");
      }

      router.push(`/dashboard/sessions/${session.id}`);
    } catch (e: any) {
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
      <div className="min-h-[calc(100vh-4rem)] bg-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-white flex items-center justify-center">
        <p className="text-gray-400">{error || "Strategy not found"}</p>
      </div>
    );
  }

  const noApiKey = !strategy.use_platform_key && (!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id;
  const atSessionLimit = sessionLimit?.limit !== null && sessionLimit && sessionLimit.count >= sessionLimit.limit;
  const isDisabled = !!(busy || noApiKey || atSessionLimit);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white">
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-black truncate">{strategy.name}</h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1 truncate">
              {strategy.model_provider} / {strategy.model_name}
              {strategy.use_platform_key && " · Billed to balance"}
            </p>
          </div>
          <button
            onClick={() => router.push(`/strategy/${strategyId}/edit`)}
            className="text-sm sm:text-base text-gray-500 hover:text-black transition-colors flex-shrink-0"
          >
            Edit strategy
          </button>
        </div>

        {error && <p className="text-[13px] text-red-600 mt-4">{error}</p>}
        {atSessionLimit && (
          <p className="text-[13px] text-amber-600 mt-4">
            Session limit reached ({sessionLimit!.count}/{sessionLimit!.limit}).{" "}
            <a href="/settings/billing" className="underline hover:text-amber-700">Upgrade</a>
          </p>
        )}

        {/* ── Deploy ── */}
        <div className="flex flex-wrap items-center gap-2 mt-6 sm:mt-8">
          <button
            disabled={isDisabled}
            onClick={() => handleStartSession("virtual")}
            className="h-10 sm:h-11 px-4 sm:px-6 text-sm sm:text-base font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-black hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {busy ? "Starting…" : "Start Virtual"}
          </button>
          <button
            disabled={isDisabled}
            onClick={() => handleStartSession("arena")}
            className="h-10 sm:h-11 px-4 sm:px-6 text-sm sm:text-base font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-black hover:border-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Start Arena
          </button>
          <button
            disabled={isDisabled || !!isFree}
            onClick={() => handleStartSession("live")}
            className="h-10 sm:h-11 px-4 sm:px-6 text-sm sm:text-base font-medium rounded-lg bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800 hover:border-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Start Live{isFree ? " (paid)" : ""}
          </button>
        </div>

        {/* ── Backtest trigger ── */}
        <button
          onClick={() => setBacktestDialogOpen(true)}
          className="flex items-center justify-between w-full mt-3 px-4 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <FlaskConical className="h-4 w-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
            <span className="text-base text-gray-600 group-hover:text-black transition-colors">Run Backtest</span>
            {backtestRuns.length > 0 && (
              <span className="text-sm text-gray-400">{backtestRuns.length} run{backtestRuns.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </button>

        {/* ── Recent Backtests ── */}
        {backtestRuns.length > 0 && (
          <div className="border-t border-gray-200 mt-8 sm:mt-10 pt-5 sm:pt-6">
            <h3 className="text-base sm:text-lg font-semibold text-black mb-3 sm:mb-4">Recent Backtests</h3>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {backtestRuns.map((run, i) => {
                const summary = run.result_summary || {};
                const markets = run.markets || [];
                const returnPct = summary.return_pct;
                const isPositive = returnPct > 0;
                const dotColor =
                  run.status === "completed" ? "bg-emerald-500" :
                  run.status === "running" || run.status === "pending" ? "bg-blue-500" :
                  run.status === "cancelled" ? "bg-gray-300" :
                  "bg-red-500";

                return (
                  <div
                    key={run.id}
                    onClick={() => router.push(`/backtest/${run.id}`)}
                    className={`flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors ${
                      i > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                      <div className="min-w-0">
                        <span className="text-sm sm:text-base text-gray-800">
                          {run.start_date && run.end_date
                            ? `${new Date(run.start_date).toLocaleDateString()} – ${new Date(run.end_date).toLocaleDateString()}`
                            : <FormattedDate date={run.created_at} />}
                        </span>
                        <div className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
                          {(Array.isArray(markets) ? markets : []).join(", ") || "—"} · {run.resolution || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {run.status === "completed" && returnPct !== undefined && (
                        <span className={`text-base font-semibold tabular-nums ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                          {isPositive ? "+" : ""}{returnPct.toFixed(2)}%
                        </span>
                      )}
                      {run.status === "completed" && summary.total_trades !== undefined && (
                        <span className="text-xs text-gray-400">{summary.total_trades} trades</span>
                      )}
                      {(run.status === "cancelled" || run.status === "failed") && (
                        <button
                          onClick={(e) => handleDeleteBacktest(e, run.id)}
                          disabled={deletingBacktestId === run.id}
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          {deletingBacktestId === run.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <X className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <ArrowRight className="h-3 w-3 text-gray-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Risk Filters ── */}
        <div className="border-t border-gray-200 mt-8 sm:mt-10 pt-5 sm:pt-6">
          <h3 className="text-base sm:text-lg font-semibold text-black mb-1">Risk Filters</h3>
          <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">Applied to both Virtual and Live sessions</p>
          <div className="space-y-3 text-sm sm:text-base">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Max Position</span>
              <span className="text-black tabular-nums font-medium">${strategy.filters?.risk?.maxPositionUsd ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Max Leverage</span>
              <span className="text-black tabular-nums font-medium">{strategy.filters?.risk?.maxLeverage ?? "—"}x</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Max Daily Loss</span>
              <span className="text-black tabular-nums font-medium">
                {strategy.filters?.risk?.maxDailyLossPct !== undefined && strategy.filters?.risk?.maxDailyLossPct !== null
                  ? `${strategy.filters.risk.maxDailyLossPct}%`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Sessions ── */}
        <div className="border-t border-gray-200 mt-10 pt-6">
          <h3 className="text-lg font-semibold text-black mb-1">Sessions</h3>
          <p className="text-sm text-gray-500 mb-4">
            {sessions.length === 0
              ? "No sessions yet"
              : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
          </p>
          {sessions.length > 0 && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {sessions.map((session, i) => {
                const statusDot =
                  session.status === "running" ? "bg-green-500" :
                  session.status === "stopped" ? "bg-gray-300" :
                  "bg-amber-500";
                const modeStyle =
                  session.mode === "live" ? "border-red-200 text-red-600 bg-red-50" :
                  session.mode === "arena" ? "border-purple-200 text-purple-600 bg-purple-50" :
                  "border-gray-200 text-gray-500 bg-gray-50";

                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors ${
                      i > 0 ? "border-t border-gray-100" : ""
                    }`}
                    onClick={() => router.push(`/dashboard/sessions/${session.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${modeStyle}`}>
                        {session.mode}
                      </span>
                      <span className="text-base text-gray-700">
                        {session.markets?.join(", ") || "No markets"}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      <FormattedDate date={session.created_at} format="full" />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {sessions.length >= 10 && (
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-500 hover:text-black transition-colors mt-3"
            >
              View all sessions
            </button>
          )}
        </div>

        {/* ── Live Confirmation Dialog ── */}
        <Dialog open={liveDialogOpen} onOpenChange={setLiveDialogOpen}>
          <DialogContent className="bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Live trading confirmation</DialogTitle>
              <DialogDescription className="text-gray-500">
                LIVE mode will place real orders on Hyperliquid or Coinbase. Type <strong className="text-gray-900">CONFIRM</strong> to proceed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-300" />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={busy || confirmText !== "CONFIRM"}
                  onClick={async () => {
                    setLiveDialogOpen(false);
                    await createAndStart("live");
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white"
                >
                  Start Live
                </Button>
                <Button variant="outline" onClick={() => setLiveDialogOpen(false)} className="border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50">
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Tip: start with Virtual first to verify intent + risk gates look correct.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Balance Dialog ── */}
        <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
          <DialogContent className="bg-white border-gray-200 p-0 overflow-hidden max-w-md">
            <button
              onClick={() => setBalanceDialogOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center text-center px-8 pt-8 pb-6">
              <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
                <Wallet className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Top Up to Get Started</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-1">
                Running a session requires AI tokens to analyze markets and generate trades. You need at least <span className="text-gray-900 font-medium">$1.00</span> in credits or an active membership plan to cover AI usage.
              </p>
              <div className="mt-4 mb-2 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-200 w-full">
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
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-5 text-sm"
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

        {/* ── Backtest Dialog ── */}
        <Dialog open={backtestDialogOpen} onOpenChange={setBacktestDialogOpen}>
          <DialogContent className="bg-white border-gray-200 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-500" />
                Run Backtest
              </DialogTitle>
              <DialogDescription className="text-gray-500">
                Replay historical price data through your AI model to simulate past performance. Each tick makes a real AI call, so this uses your credits.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Start Date</label>
                  <Input
                    type="date"
                    value={backtestStartDate}
                    onChange={(e) => setBacktestStartDate(e.target.value)}
                    className="bg-gray-50 border-gray-200 text-gray-900"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">End Date</label>
                  <Input
                    type="date"
                    value={backtestEndDate}
                    onChange={(e) => setBacktestEndDate(e.target.value)}
                    className="bg-gray-50 border-gray-200 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Resolution (tick interval)</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: "5m", label: "5 min", desc: "Ultra detail" },
                    { value: "15m", label: "15 min", desc: "High detail" },
                    { value: "1h", label: "1 hour", desc: "Recommended" },
                    { value: "4h", label: "4 hours", desc: "Low cost" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setBacktestResolution(opt.value)}
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        backtestResolution === opt.value
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-600"
                      }`}
                    >
                      <div className="text-[13px] font-medium">{opt.label}</div>
                      <div className="text-[10px] opacity-50 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {backtestError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-red-600 text-[13px]">{backtestError}</p>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                {backtestEstimateLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-[13px]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating estimate...
                  </div>
                ) : backtestEstimate?.estimate ? (
                  <>
                    {backtestEstimate.data_warning && (
                      <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 mb-1">
                        <p className="text-amber-700 text-xs leading-relaxed">
                          <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />
                          {backtestEstimate.data_warning}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-gray-500">Estimated cost</span>
                      <span className="text-gray-900 font-mono font-semibold text-lg">
                        ${backtestEstimate.estimate.estimated_cost_usd.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{backtestEstimate.estimate.total_ticks} ticks x ${(backtestEstimate.estimate.cost_per_tick_cents / 100).toFixed(3)}/tick</span>
                      <span>~{backtestEstimate.estimate.duration_days.toFixed(1)} days</span>
                    </div>
                    {backtestEstimate.estimate.requested_resolution && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Resolution</span>
                        <span className="text-amber-600">
                          {backtestEstimate.estimate.requested_resolution} → {backtestEstimate.estimate.resolution} (fallback)
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Your balance</span>
                      <span className={backtestEstimate.balance.sufficient ? "text-emerald-600" : "text-red-600"}>
                        ${(backtestEstimate.balance.available_cents / 100).toFixed(2)}
                        {!backtestEstimate.balance.sufficient && " (insufficient)"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Model</span>
                      <span className="text-gray-600">{backtestEstimate.estimate.model}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Markets</span>
                      <span className="text-gray-600">{backtestEstimate.estimate.markets_count} market{backtestEstimate.estimate.markets_count > 1 ? "s" : ""}</span>
                    </div>
                  </>
                ) : null}
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
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
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
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
                  className="border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
