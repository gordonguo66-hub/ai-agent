"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { RunDetail } from "@/components/run-detail";
import { AuthGuard } from "@/components/auth-guard";

function RunDetailContent({ runId }: { runId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<any>(null);
  const [isInArena, setIsInArena] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRun = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/dashboard");
        return;
      }

      const { data: runData, error } = await supabase
        .from("paper_runs")
        .select("*, strategies(name)")
        .eq("id", runId)
        .eq("user_id", user.id)
        .single();

      if (error || !runData) {
        router.push("/dashboard");
        return;
      }

      const { data: arenaEntry } = await supabase
        .from("arena_entries")
        .select("*")
        .eq("run_id", runId)
        .eq("user_id", user.id)
        .single();

      setRun(runData);
      setIsInArena(!!arenaEntry);
      setLoading(false);
    };

    loadRun();
  }, [runId, router]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!run) {
    return null;
  }

  return <RunDetail run={run} isInArena={isInArena} />;
}

export default function RunDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AuthGuard>
      <RunDetailContent runId={params.id} />
    </AuthGuard>
  );
}
