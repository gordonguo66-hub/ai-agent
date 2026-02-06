"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { BarChart3 } from "lucide-react";

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
    tier?: string;
  };
  amount_cents?: number;
  amount?: number;
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
    return `US$${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const getTypeLabel = (type: string, tier?: string) => {
    if (type === "usage") {
      if (tier && tier !== "on_demand") {
        return "Included";
      }
      return "Usage";
    }
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
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
            <Card className="bg-[#0a1628] border-blue-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  Usage History
                </CardTitle>
                <CardDescription className="text-gray-400">Your recent AI model usage</CardDescription>
              </CardHeader>
              <CardContent>
                {usageRecords.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    No usage records yet. Start a trading session to see AI usage.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-blue-500/20 hover:bg-transparent">
                          <TableHead className="text-gray-400">Date</TableHead>
                          <TableHead className="text-gray-400">Type</TableHead>
                          <TableHead className="text-gray-400">Model</TableHead>
                          <TableHead className="text-gray-400 text-right">Tokens</TableHead>
                          <TableHead className="text-gray-400 text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usageRecords
                          .filter(record => record.transaction_type === "usage")
                          .map((record) => {
                            const totalTokens = record.metadata?.total_tokens ||
                              ((record.metadata?.input_tokens || 0) + (record.metadata?.output_tokens || 0));
                            const cost = record.metadata?.actual_cost_cents || record.amount_cents || record.amount;
                            const model = record.metadata?.model || "-";
                            const tier = record.metadata?.tier;

                            return (
                              <TableRow key={record.id} className="border-blue-500/20 hover:bg-blue-950/20">
                                <TableCell className="text-sm text-gray-300">
                                  <FormattedDate date={record.created_at} format="compact" />
                                </TableCell>
                                <TableCell className="text-gray-300">
                                  {getTypeLabel(record.transaction_type, tier)}
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
                                  {formatTokens(totalTokens)}
                                </TableCell>
                                <TableCell className="text-right text-gray-300">
                                  {formatCost(cost)}{" "}
                                  {tier && tier !== "on_demand" && (
                                    <span className="text-gray-500">Included</span>
                                  )}
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
