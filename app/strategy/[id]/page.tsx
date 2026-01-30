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

function StrategyDetailContent() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liveDialogOpen, setLiveDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("strategies")
        .select("id, user_id, name, model_provider, model_name, prompt, filters, api_key_ciphertext, saved_api_key_id, created_at")
        .eq("id", strategyId)
        .eq("user_id", user.id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setStrategy(data);
      }
      setLoading(false);
    };

    load();
  }, [strategyId]);

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


  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#030712] container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#030712] container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-gray-400">{error || "Strategy not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#030712]">
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
                LIVE places real orders on Hyperliquid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">AI Model</Badge>
                  <span className="text-muted-foreground">{strategy.model_provider} / {strategy.model_name}</span>
                </div>
                {(!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id ? (
                  <p className="text-xs text-muted-foreground">
                    This strategy needs an API key. Edit the strategy to add your API key.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    ✓ API key configured for this strategy {strategy.saved_api_key_id ? "(using saved key)" : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  disabled={busy || ((!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id)} 
                  onClick={() => createAndStart("virtual")}
                  className="bg-blue-900 hover:bg-blue-800 text-white border border-blue-700"
                >
                  {busy ? "Starting..." : "Start Virtual ($100k)"}
                </Button>
                <Button
                  disabled={busy || ((!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id)}
                  variant="default"
                  onClick={() => createAndStart("arena")}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  {busy ? "Starting..." : "Start in Arena 🏆"}
                </Button>
                <Button
                  disabled={busy || ((!strategy.api_key_ciphertext || strategy.api_key_ciphertext === "stored_in_ai_connections") && !strategy.saved_api_key_id)}
                  variant="destructive"
                  onClick={() => {
                    setConfirmText("");
                    setLiveDialogOpen(true);
                  }}
                  className="bg-red-900 hover:bg-red-800 text-white"
                >
                  Start Live
                </Button>
                <Button variant="outline" onClick={() => router.push("/settings")} className="border-blue-900 text-gray-300 hover:text-white hover:border-blue-800 hover:bg-blue-950/30">
                  Manage Exchange Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0A0E1A] border-blue-900/50">
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

          <Dialog open={liveDialogOpen} onOpenChange={setLiveDialogOpen}>
            <DialogContent className="bg-[#0A0E1A] border-blue-900">
              <DialogHeader>
                <DialogTitle className="text-white">⚠️ Live trading confirmation</DialogTitle>
                <DialogDescription className="text-gray-300">
                  LIVE mode will place real orders on Hyperliquid. Type <strong className="text-white">CONFIRM</strong> to proceed.
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

