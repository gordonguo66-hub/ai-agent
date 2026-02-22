"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { BarChart3, TrendingUp, ChevronDown, Loader2 } from "lucide-react";

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

interface Aggregates {
  total_consumption_cents: number;
  total_tokens: number;
}

/** Get actual charged amount in cents (what was deducted from balance/budget) */
function getChargedCents(record: UsageRecord): number {
  // amount field is negative for usage (deductions), so take absolute value
  return Math.abs(record.amount || record.amount_cents || 0);
}

const INITIAL_LIMIT = 50;

function UsageContent() {
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [aggregates, setAggregates] = useState<Aggregates>({ total_consumption_cents: 0, total_tokens: 0 });

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch(`/api/credits/usage?limit=${INITIAL_LIMIT}`, {
        headers: { Authorization: bearer },
      });
      if (res.ok) {
        const data = await res.json();
        setUsageRecords(data.transactions || []);
        setTotalCount(data.total || 0);
        if (data.aggregates) {
          setAggregates(data.aggregates);
        }
      }
    } catch (error) {
      console.error("Failed to load usage:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsage = useCallback(async () => {
    if (expanded || loadingMore) return;
    setLoadingMore(true);
    try {
      const bearer = await getBearerToken();
      if (!bearer) return;

      const res = await fetch(`/api/credits/usage?limit=5000&offset=${INITIAL_LIMIT}`, {
        headers: { Authorization: bearer },
      });
      if (res.ok) {
        const data = await res.json();
        setUsageRecords(prev => [...prev, ...(data.transactions || [])]);
        setExpanded(true);
      }
    } catch (error) {
      console.error("Failed to load all usage:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [expanded, loadingMore]);

  // Filter to only usage records (both top-up usage and subscription usage)
  const usageOnlyRecords = useMemo(() =>
    usageRecords.filter(record => record.transaction_type === "usage" || record.transaction_type === "subscription_usage"),
    [usageRecords]
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

  const hasMoreRecords = !expanded && totalCount > INITIAL_LIMIT;

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
                        <p className="text-2xl font-bold text-white">{formatCost(aggregates.total_consumption_cents)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Total Tokens</p>
                      <p className="text-lg font-semibold text-gray-200">{formatTokens(aggregates.total_tokens)}</p>
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
                  <CardDescription className="text-gray-400">
                    {expanded
                      ? `Showing all ${usageOnlyRecords.length} usage records`
                      : `Your recent AI model usage${totalCount > INITIAL_LIMIT ? ` (${INITIAL_LIMIT} most recent of ${totalCount})` : ""}`
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {usageOnlyRecords.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      No usage records yet. Start a trading session to see AI usage.
                    </div>
                  ) : (
                    <>
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
                              const chargedCents = getChargedCents(record);
                              const model = record.metadata?.model || "-";
                              const isSubscription = record.transaction_type === "subscription_usage";

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
                                      {isSubscription && (
                                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                                          SUB
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-gray-300">
                                    {formatTokens(recordTokens)}
                                  </TableCell>
                                  <TableCell className="text-right text-gray-300">
                                    {formatCost(chargedCents)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Show All button */}
                      {hasMoreRecords && (
                        <div className="flex justify-center pt-4">
                          <Button
                            variant="outline"
                            className="border-blue-500/30 text-blue-400 hover:bg-blue-950/30 hover:text-blue-300"
                            onClick={loadAllUsage}
                            disabled={loadingMore}
                          >
                            {loadingMore ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Loading all usage...
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4 mr-2" />
                                Show all {totalCount} records
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
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
