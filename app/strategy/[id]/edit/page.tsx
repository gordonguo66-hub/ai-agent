"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { StrategyForm } from "@/components/strategy-form";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import { Button } from "@/components/ui/button";

function EditStrategyContent() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;
  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStrategy = async () => {
      try {
        const bearer = await getBearerToken();
        const response = await fetch(`/api/strategies/${strategyId}`, {
          headers: bearer ? { Authorization: bearer } : {},
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.error || "Failed to load strategy");
          setLoading(false);
          return;
        }

        const data = await response.json();
        setStrategy(data.strategy);
      } catch (err: any) {
        setError(err.message || "Failed to load strategy");
      } finally {
        setLoading(false);
      }
    };

    loadStrategy();
  }, [strategyId]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] page-container">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-center py-16">
              <p className="text-muted-foreground">Loading strategy...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="min-h-[calc(100vh-4rem)] page-container">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <p className="text-muted-foreground">{error || "Strategy not found"}</p>
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4">
            <Button variant="outline" onClick={() => router.push(`/strategy/${strategyId}`)}>
              ← Back to Strategy
            </Button>
          </div>
          <StrategyForm strategyId={strategyId} initialData={strategy} />
        </div>
      </div>
    </div>
  );
}

export default function EditStrategyPage() {
  return (
    <AuthGuard>
      <EditStrategyContent />
    </AuthGuard>
  );
}
