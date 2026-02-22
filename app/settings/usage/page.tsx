"use client";

import { useEffect, useState, useMemo } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { BarChart3, TrendingUp } from "lucide-react";

interface UsageRecord {
  id: string;
  created_at: string;
  transaction_type: string;
  description: string;
  metadata: {
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    actual_cost_cents?: number;
    base_cost_cents?: number;
    charged_cents?: number;
    tier?: string;
    source?: string;
  };
  amount_cents?: number;
  amount?: number;
}

/**
 * Calculate on-demand equivalent cost
 * This shows what the usage would cost at on-demand rates (2× base cost)
 * so subscribers can see the value they're getting from their plan
 */
function getOnDemandEquivalentCents(record: UsageRecord): number {
  // base_cost_cents (or legacy actual_cost_cents) is the base API cost before any markup
  // On-demand rate is 2× the base cost (100% markup)
  const baseCostCents = record.metadata?.base_cost_cents ?? record.metadata?.actual_cost_cents;
  if (baseCostCents !== undefined && baseCostCents !== null) {
    return baseCostCents * 2;
  }
  // Fallback to amount if no metadata
  return (record.amount_cents || record.amount || 0);
}

function UsageContent() {
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch("/api/credits/usage?limit=100", {
        headers: { Authorization: bearer },
      });
      if (res.ok) {
        const data = await res.json();
        setUsageRecords(data.transactions || []);
      }
    } catch (error) {
      console.error("Failed to load usage:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter to only usage records (both top-up usage and subscription usage)
  const usageOnlyRecords = useMemo(() =>
    usageRecords.filter(record => record.transaction_type === "usage" || record.transaction_type === "subscription_usage"),
    [usageRecords]
  );

  // Calculate total consumption at on-demand rates
  const totalConsumptionCents = useMemo(() =>
    usageOnlyRecords.reduce((sum, record) => sum + getOnDemandEquivalentCents(record), 0),
    [usageOnlyRecords]
  );

  // Calculate total tokens
  const totalTokens = useMemo(() =>
    usageOnlyRecords.reduce((sum, record) => {
      const tokens = record.metadata?.total_tokens ||
        ((record.metadata?.input_tokens || 0) + (record.metadata?.output_tokens || 0));
      return sum + tokens;
    }, 0),
    [usageOnlyRecords]
  );

  const formatTokens = (tokens: number | undefined) => {
    if (!tokens) return "-";
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const formatCost = (cents: number | undefined) => {
    if (cents === undefined || cents === null) return "-";
    return `$${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const isMaxModel = (model?: string) => {
    if (!model) return false;
    return model.includes("opus") || model.includes("codex") || model.toLowerCase().includes("max");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Usage</h1>
            <p className="text-gray-300 mt-1">
              Track your AI model usage and costs.
            </p>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-20">Loading usage data...</div>
          ) : (
            <>
              {/* Total Consumption Summary Card */}
              <Card className="bg-[#0a1628] border-blue-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <TrendingUp className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Total Consumption</p>
                        <p className="text-2xl font-bold text-white">{formatCost(totalConsumptionCents)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Total Tokens</p>
                      <p className="text-lg font-semibold text-gray-200">{formatTokens(totalTokens)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Usage History Table */}
              <Card className="bg-[#0a1628] border-blue-500/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    Usage History
                  </CardTitle>
                  <CardDescription className="text-gray-400">Your recent AI model usage</CardDescription>
                </CardHeader>
                <CardContent>
                  {usageOnlyRecords.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      No usage records yet. Start a trading session to see AI usage.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-blue-500/20 hover:bg-transparent">
                            <TableHead className="text-gray-400">Date</TableHead>
                            <TableHead className="text-gray-400">Model</TableHead>
                            <TableHead className="text-gray-400 text-right">Tokens</TableHead>
                            <TableHead className="text-gray-400 text-right">Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usageOnlyRecords.map((record) => {
                            const recordTokens = record.metadata?.total_tokens ||
                              ((record.metadata?.input_tokens || 0) + (record.metadata?.output_tokens || 0));
                            const onDemandCost = getOnDemandEquivalentCents(record);
                            const model = record.metadata?.model || "-";

                            return (
                              <TableRow key={record.id} className="border-blue-500/20 hover:bg-blue-950/20">
                                <TableCell className="text-sm text-gray-300">
                                  <FormattedDate date={record.created_at} format="compact" />
                                </TableCell>
                                <TableCell className="text-gray-300">
                                  <div className="flex items-center gap-2">
                                    <span>{model}</span>
                                    {isMaxModel(model) && (
                                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                                        MAX
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-gray-300">
                                  {formatTokens(recordTokens)}
                                </TableCell>
                                <TableCell className="text-right text-gray-300">
                                  {formatCost(onDemandCost)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UsagePage() {
  return (
    <AuthGuard>
      <UsageContent />
    </AuthGuard>
  );
}
