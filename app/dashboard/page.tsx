"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormattedDate } from "@/components/formatted-date";

function DashboardContent() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sessionDeleteDialogOpen, setSessionDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [sessionLimit, setSessionLimit] = useState<{ limit: number | null; tier: string } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClient();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out contacting Supabase")), 7000)
        );
        const {
          data: { user },
        } = await Promise.race([supabase.auth.getUser(), timeoutPromise]);

        if (!user) {
          setLoading(false);
          return;
        }

        const { data: strategiesData } = await supabase
          .from("strategies")
          .select("id, user_id, name, model_provider, model_name, created_at, filters, ai_connection_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        try {
          const bearer = await getBearerToken();
          const sessionsResponse = await fetch("/api/sessions");
          if (sessionsResponse.ok) {
            const sessionsData = await sessionsResponse.json();
            setSessions(sessionsData.sessions || []);
          } else if (sessionsResponse.status === 401) {
            if (bearer) {
              const res2 = await fetch("/api/sessions", { headers: { Authorization: bearer } });
              if (res2.ok) {
                const sessionsData = await res2.json();
                setSessions(sessionsData.sessions || []);
              }
            }
          }
        } catch (err) {
          console.error("Failed to load sessions", err);
        }

        try {
          const bearer = await getBearerToken();
          const creditsResponse = await fetch("/api/credits", {
            headers: bearer ? { Authorization: bearer } : {},
          });
          if (creditsResponse.ok) {
            const creditsJson = await creditsResponse.json();
            const tier = creditsJson.subscription?.plan_id || "on_demand";
            const hasLimit = tier === "pro" || tier === "on_demand" || !tier;
            setSessionLimit({
              limit: hasLimit ? 3 : null,
              tier,
            });
          }
        } catch (err) {
          console.error("Failed to load subscription info", err);
        }

        setStrategies(strategiesData || []);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleDeleteClick = (strategyId: string) => {
    setStrategyToDelete(strategyId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!strategyToDelete) return;
    setDeleting(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/strategies/${strategyToDelete}`, {
        method: "DELETE",
        headers: bearer ? { Authorization: bearer } : {},
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete strategy");
        return;
      }
      setStrategies((prev) => prev.filter((s) => s.id !== strategyToDelete));
      setDeleteDialogOpen(false);
      setStrategyToDelete(null);
    } catch (error: any) {
      alert(error.message || "Failed to delete strategy");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setStrategyToDelete(null);
  };

  const handleSessionDeleteClick = (sessionId: string) => {
    setSessionToDelete(sessionId);
    setSessionDeleteDialogOpen(true);
  };

  const handleSessionDeleteConfirm = async () => {
    if (!sessionToDelete) return;
    setDeletingSession(true);
    try {
      const bearer = await getBearerToken();
      const response = await fetch(`/api/sessions/${sessionToDelete}`, {
        method: "DELETE",
        headers: bearer ? { Authorization: bearer } : {},
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete session");
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete));
      setSessionDeleteDialogOpen(false);
      setSessionToDelete(null);
    } catch (error: any) {
      alert(error.message || "Failed to delete session");
    } finally {
      setDeletingSession(false);
    }
  };

  const handleSessionDeleteCancel = () => {
    setSessionDeleteDialogOpen(false);
    setSessionToDelete(null);
  };

  useEffect(() => {
    if (!deleteDialogOpen) {
      setStrategyToDelete(null);
    }
  }, [deleteDialogOpen]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const activeCount = sessions.filter((s: any) => s.status === "running").length;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white">
      <div className="max-w-[1060px] mx-auto px-8 py-14">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-6 mb-14">
          <div>
            <h1 className="text-4xl font-bold text-black">Dashboard</h1>
            <p className="text-lg text-gray-500 mt-1.5">Manage your strategies and view performance</p>
          </div>
          <Link href="/strategy/new">
            <button className="h-12 px-7 text-lg font-medium rounded-lg bg-black text-white hover:bg-gray-800 transition-colors">
              + Create Strategy
            </button>
          </Link>
        </div>

        {/* ── Strategies ── */}
        <div className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-black">Strategies</h2>
            <span className="text-base text-gray-400">{strategies.length} total</span>
          </div>

          {strategies.length === 0 ? (
            <div className="text-center py-16 border border-gray-200 rounded-lg">
              <p className="text-gray-500 text-base mb-4">No strategies yet. Create your first one to get started.</p>
              <Link href="/strategy/new">
                <button className="h-10 px-5 text-sm font-medium rounded-lg bg-gradient-to-b from-[#162d5a] to-[#0f1f3d] text-white hover:from-[#1c3a72] hover:to-[#162d5a] shadow-lg shadow-[#0f1f3d]/40 transition-all">
                  Create Strategy
                </button>
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {strategies.map((strategy, i) => {
                const strategySessions = sessions.filter((s: any) => s.strategy_id === strategy.id);
                const runningCount = strategySessions.filter((s: any) => s.status === "running").length;

                return (
                  <div
                    key={strategy.id}
                    className={`flex items-center justify-between px-6 py-5 hover:bg-gray-50 transition-colors group ${
                      i > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <Link href={`/strategy/${strategy.id}`} className="group/link">
                          <h3 className="text-lg font-semibold text-black group-hover/link:text-blue-600 transition-colors truncate">
                            {strategy.name}
                          </h3>
                        </Link>
                        <p className="text-base text-gray-500 mt-0.5">
                          {strategy.model_provider} / {strategy.model_name}
                        </p>
                      </div>
                      {runningCount > 0 && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                          <span className="text-base text-gray-500">{runningCount} active</span>
                        </div>
                      )}
                      {strategySessions.length > 0 && runningCount === 0 && (
                        <span className="text-base text-gray-400 flex-shrink-0">{strategySessions.length} session{strategySessions.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 ml-4 flex-shrink-0">
                      <Link href={`/strategy/${strategy.id}/edit`}>
                        <button className="h-10 px-4 text-base rounded-lg border border-gray-200 text-gray-500 hover:text-black hover:border-gray-300 hover:bg-gray-50 transition-all">
                          Edit
                        </button>
                      </Link>
                      <Link href={`/strategy/${strategy.id}`}>
                        <button className="h-10 px-4 text-base font-medium rounded-lg bg-black text-white hover:bg-gray-800 transition-colors">
                          View
                        </button>
                      </Link>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(strategy.id); }}
                        className="h-9 w-9 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        title="Delete strategy"
                      >
                        <span className="text-lg">×</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Trading Sessions ── */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-black">Trading Sessions</h2>
            {sessions.length > 0 && (
              <div className="flex items-center gap-3">
                {activeCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    <span className="text-base text-gray-500">{activeCount} active</span>
                  </div>
                )}
                {sessionLimit?.limit !== null && (
                  <span className="text-base text-gray-400">{sessions.length}/{sessionLimit?.limit} sessions</span>
                )}
              </div>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-16 border border-gray-200 rounded-lg">
              <p className="text-gray-500 text-base">No trading sessions yet.</p>
              <p className="text-sm text-gray-400 mt-1">Deploy a strategy to start trading.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {sessions.map((session: any, i: number) => {
                const strategy = session.strategies || {};
                const account = session.mode === "live"
                  ? (session.live_accounts || null)
                  : (session.virtual_accounts || session.sim_accounts || null);
                const equity = account ? Number(account.equity) : null;
                const startingEquity = session.starting_equity != null
                  ? Number(session.starting_equity)
                  : (account ? Number(account.starting_equity) : null);
                const pnl = equity != null && startingEquity != null ? equity - startingEquity : null;

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
                    className={`flex items-center justify-between px-6 py-5 hover:bg-gray-50 transition-colors group ${
                      i > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusDot}`} />
                      <span className={`text-sm font-medium px-2.5 py-0.5 rounded border flex-shrink-0 ${modeStyle}`}>
                        {session.mode}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/dashboard/sessions/${session.id}`}>
                          <h3 className="text-lg font-medium text-black hover:text-blue-600 transition-colors truncate">
                            {strategy.name || "Unknown Strategy"}
                          </h3>
                        </Link>
                        <p className="text-base text-gray-500 mt-0.5">
                          {session.market} · {session.strategies?.filters?.cadenceSeconds || session.cadence_seconds}s cadence
                          {session.last_tick_at && (
                            <> · Last tick <FormattedDate date={session.last_tick_at} /></>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                      {equity != null && pnl != null && (
                        <div className="text-right">
                          <p className="text-lg font-semibold text-black tabular-nums">${equity.toFixed(2)}</p>
                          <p className={`text-base tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                          </p>
                        </div>
                      )}
                      <Link href={`/dashboard/sessions/${session.id}`}>
                        <button className="h-10 px-4 text-base font-medium rounded-lg border border-gray-200 text-gray-600 hover:text-black hover:border-gray-300 hover:bg-gray-50 transition-all">
                          View
                        </button>
                      </Link>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSessionDeleteClick(session.id); }}
                        className="h-9 w-9 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        title="Delete session"
                      >
                        <span className="text-lg">×</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Delete Strategy Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-white border-gray-200" onClose={handleDeleteCancel}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Delete Strategy</DialogTitle>
            <DialogDescription className="text-gray-500">
              Are you sure you want to delete this strategy? This action cannot be undone.
              All associated trading sessions will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={handleDeleteCancel} disabled={deleting} className="border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-600 hover:bg-red-500">
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Session Dialog ── */}
      <Dialog open={sessionDeleteDialogOpen} onOpenChange={setSessionDeleteDialogOpen}>
        <DialogContent className="bg-white border-gray-200" onClose={handleSessionDeleteCancel}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Delete Trading Session</DialogTitle>
            <DialogDescription className="text-gray-500">
              Are you sure you want to delete this trading session? This action cannot be undone.
              All associated trades, decisions, and equity data will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={handleSessionDeleteCancel} disabled={deletingSession} className="border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSessionDeleteConfirm} disabled={deletingSession} className="bg-red-600 hover:bg-red-500">
              {deletingSession ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
