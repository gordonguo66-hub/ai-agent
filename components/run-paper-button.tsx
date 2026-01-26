"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/browser";

export function RunPaperButton({ strategyId }: { strategyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    try {
      // Get user from client-side (we know they're authenticated)
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("You must be signed in");
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append("strategy_id", strategyId);
      formData.append("user_id", user.id);

      const response = await fetch("/api/paper-run", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/dashboard/run/${data.run_id}`);
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to run paper trading");
        setLoading(false);
      }
    } catch (error) {
      alert("Failed to run paper trading");
      setLoading(false);
    }
  };

  return (
    <Button type="button" onClick={handleRun} size="sm" disabled={loading}>
      {loading ? "Running..." : "Run Paper"}
    </Button>
  );
}
