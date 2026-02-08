"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthGuard } from "@/components/auth-guard";
import { getSessionBadgeConfig } from "@/lib/utils/sessionDisplay";
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

        // Load sessions from API
        try {
        const bearer = await getBearerToken();
          const sessionsResponse = await fetch("/api/sessions");
          if (sessionsResponse.ok) {
            const sessionsData = await sessionsResponse.json();
            setSessions(sessionsData.sessions || []);
        } else if (sessionsResponse.status === 401) {
          // Try again with bearer token if cookies aren't present server-side.
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

        // Fetch subscription tier for session limits
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

      // Remove from local state
      setStrategies((prev) => prev.filter((s) => s.id !== strategyToDelete));
      setDeleteDialogOpen(false);
      setStrategyToDelete(null);
    } catch (error: any) {
      console.error("Delete error:", error);
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

      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete));
      setSessionDeleteDialogOpen(false);
      setSessionToDelete(null);
    } catch (error: any) {
      console.error("Delete session error:", error);
      alert(error.message || "Failed to delete session");
    } finally {
      setDeletingSession(false);
    }
  };

  const handleSessionDeleteCancel = () => {
    setSessionDeleteDialogOpen(false);
    setSessionToDelete(null);
  };

  // Close dialog when open state changes to false
  useEffect(() => {
    if (!deleteDialogOpen) {
      setStrategyToDelete(null);
    }
  }, [deleteDialogOpen]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] page-container container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-gray-300">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-white">
                Dashboard
              </h1>
              <p className="text-gray-300">Manage your strategies and view performance</p>
            </div>
            <Link href="/strategy/new">
              <Button size="lg" className="bg-blue-900 hover:bg-blue-800 text-white border border-blue-700">
                + Create Strategy
              </Button>
            </Link>
          </div>

          {/* Strategies Section */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                My Strategies
              </h2>
              <span className="text-sm text-gray-300 bg-blue-950/30 px-3 py-1 rounded-full border border-blue-900">
                {strategies.length} total
              </span>
            </div>
            {strategies.length === 0 ? (
              <Card className="border-dashed border-blue-900/50 bg-blue-950/20">
                <CardContent className="pt-12 pb-12">
                  <div className="text-center max-w-md mx-auto">
                    <p className="text-gray-200 mb-6 text-base">
                      No strategies yet. Create your first strategy to get started.
                    </p>
                    <Link href="/strategy/new">
                      <Button className="bg-blue-900 hover:bg-blue-800 text-white border border-blue-700">
                        Create Your First Strategy
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {strategies.map((strategy) => (
                  <Card key={strategy.id} className="bg-[#0A0E1A] border-blue-900/50 hover:border-blue-800 transition-all relative group">
                    <CardHeader className="pb-3 border-b border-blue-900/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg mb-2 font-bold text-white">
                            <Link href={`/strategy/${strategy.id}`} className="hover:text-gray-300 transition-colors">
                              {strategy.name}
                            </Link>
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-300">
                            <span className="font-mono">{strategy.model_provider}</span> / <span className="font-mono">{strategy.model_name}</span>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <button
                      type="button"
                      className="absolute top-3 right-3 h-8 w-8 p-0 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-900/30 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer z-20 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteClick(strategy.id);
                      }}
                      title="Delete strategy"
                      aria-label="Delete strategy"
                    >
                      <span className="text-xl font-bold leading-none">×</span>
                    </button>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge className="text-xs bg-blue-950/30 border-blue-900 text-gray-300">
                          <FormattedDate date={strategy.created_at} format="date" />
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Link href={`/strategy/${strategy.id}/edit`} className="flex-1">
                            <Button variant="ghost" size="sm" className="w-full text-white bg-blue-950/30 hover:bg-blue-900/50 transition-all">
                              Edit
                            </Button>
                          </Link>
                          <Link href={`/strategy/${strategy.id}`} className="flex-1">
                            <Button size="sm" className="w-full bg-blue-900 hover:bg-blue-800 text-white border border-blue-700 transition-all">
                              Start Session
                            </Button>
                          </Link>
                        </div>
                        {(() => {
                          const strategySessions = sessions.filter((s: any) => s.strategy_id === strategy.id);
                          const sessionCount = strategySessions.length;
                          
                          if (sessionCount === 0) return null;
                          
                          // Always show the detailed list format
                          return (
                            <div className="w-full space-y-1">
                              <div className="text-xs text-gray-400 px-1 mb-1">
                                {sessionCount} {sessionCount === 1 ? 'Session' : 'Sessions'}:
                              </div>
                              {strategySessions.map((session: any) => (
                                <Link key={session.id} href={`/dashboard/sessions/${session.id}`} className="block">
                                  <Button size="sm" className="w-full bg-blue-900/50 text-white hover:bg-blue-900 border border-blue-800 transition-all text-xs justify-start">
                                    <span className="capitalize">{session.mode}</span>
                                    {session.status === "running" && <span className="ml-auto text-green-400">●</span>}
                                    {session.status === "stopped" && <span className="ml-auto text-gray-500">■</span>}
                                  </Button>
                                </Link>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Trading Sessions Section */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                Trading Sessions
              </h2>
              {sessions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-300 bg-blue-950/30 px-3 py-1 rounded-full border border-blue-900">
                    {sessions.filter((s: any) => s.status === "running").length} active
                  </span>
                  {sessionLimit && (
                    <span className="text-sm text-gray-400">
                      {sessionLimit.limit !== null
                        ? `${sessions.length}/${sessionLimit.limit} sessions`
                        : `${sessions.length} sessions`}
                    </span>
                  )}
                </div>
              )}
            </div>
            {sessions.length === 0 ? (
              <Card className="border-dashed border-blue-900/50 bg-blue-950/20">
                <CardContent className="pt-12 pb-12">
                  <div className="text-center max-w-md mx-auto">
                    <p className="text-gray-200 mb-1 text-base">
                      No trading sessions yet.
                    </p>
                    <p className="text-sm text-gray-300">
                      Create a session from a strategy to start dry-run or live trading.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {sessions.map((session: any) => {
                  const strategy = session.strategies || {};
                  // Get account based on mode
                  const account = session.mode === "live" 
                    ? (session.live_accounts || null)
                    : (session.virtual_accounts || session.sim_accounts || null);
                  const equity = account ? Number(account.equity) : null;
                  // Use session-level starting_equity if available, fallback to account-level for old sessions
                  const startingEquity = session.starting_equity != null
                    ? Number(session.starting_equity)
                    : (account ? Number(account.starting_equity) : null);
                  const pnl = equity != null && startingEquity != null ? equity - startingEquity : null;
                  
                  return (
                    <Card key={session.id} className="bg-[#0A0E1A] border-blue-900/50 hover:border-blue-800 transition-all relative group">
                      <button
                        type="button"
                        className="absolute top-3 right-3 h-8 w-8 p-0 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-900/30 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer z-20 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSessionDeleteClick(session.id);
                        }}
                        title="Delete session"
                        aria-label="Delete session"
                      >
                        <span className="text-xl font-bold leading-none">×</span>
                      </button>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="font-bold text-base text-white truncate">
                                {strategy.name || "Unknown Strategy"}
                              </h3>
                              {(() => {
                                const badgeConfig = getSessionBadgeConfig(session);
                                return (
                                  <Badge
                                    variant={badgeConfig.variant}
                                    className={`text-xs ${badgeConfig.className || ""}`}
                                  >
                                    {badgeConfig.label}
                                  </Badge>
                                );
                              })()}
                              <Badge className={`text-xs ${
                                session.status === "running" 
                                  ? "bg-emerald-900/50 text-emerald-300 border-emerald-800" 
                                  : "bg-gray-900/50 text-gray-400 border-gray-800"
                              }`}>
                                {session.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-300 font-mono">
                              {session.market} • {session.strategies?.filters?.cadenceSeconds || session.cadence_seconds}s cadence
                            </p>
                            {equity != null && pnl != null && (
                              <p className="text-sm text-gray-200 mt-2 font-mono">
                                Equity: <span className="text-white font-bold">${equity.toFixed(2)}</span> • PnL:{" "}
                                <span className={`font-bold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                                </span>
                              </p>
                            )}
                            {session.last_tick_at && (
                              <p className="text-xs text-gray-400 mt-1">
                                Last tick: <FormattedDate date={session.last_tick_at} />
                              </p>
                            )}
                          </div>
                          <Link href={`/dashboard/sessions/${session.id}`}>
                            <Button size="sm" className="flex-shrink-0 bg-blue-900/50 text-white hover:bg-blue-900 border border-blue-800 transition-all">
                              View →
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Strategy Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent onClose={handleDeleteCancel}>
          <DialogHeader>
            <DialogTitle>Delete Strategy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this strategy? This action cannot be undone.
              All associated trading sessions will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={handleDeleteCancel}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Session Confirmation Dialog */}
      <Dialog open={sessionDeleteDialogOpen} onOpenChange={setSessionDeleteDialogOpen}>
        <DialogContent onClose={handleSessionDeleteCancel}>
          <DialogHeader>
            <DialogTitle>Delete Trading Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this trading session? This action cannot be undone.
              All associated trades, decisions, and equity data will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={handleSessionDeleteCancel}
              disabled={deletingSession}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSessionDeleteConfirm}
              disabled={deletingSession}
            >
              {deletingSession ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
