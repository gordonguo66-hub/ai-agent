"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthGuard } from "@/components/auth-guard";
import { Badge } from "@/components/ui/badge";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";

function ExchangeSettingsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<any[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState({
    wallet_address: "",
    key_material_encrypted: "",
  });

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const bearer = await getBearerToken();
      const response = await fetch("/api/exchange-connections", {
        headers: bearer ? { Authorization: bearer } : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error("Failed to load connections", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");
      const response = await fetch("/api/exchange-connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer,
        },
        body: JSON.stringify({
          wallet_address: formData.wallet_address,
          key_material_encrypted: formData.key_material_encrypted,
          venue: "hyperliquid",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create connection");
      }

      // Reset form and reload
      setFormData({ wallet_address: "", key_material_encrypted: "" });
      await loadConnections();
    } catch (err: any) {
      setError(err.message || "Failed to create connection");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (connectionId: string) => {
    setVerifying(connectionId);
    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");
      
      const response = await fetch(`/api/exchange-connections/${connectionId}/verify`, {
        method: "POST",
        headers: {
          Authorization: bearer,
        },
      });

      const result = await response.json();
      setVerifyResults({ ...verifyResults, [connectionId]: result });
    } catch (err: any) {
      setVerifyResults({ 
        ...verifyResults, 
        [connectionId]: { 
          success: false, 
          error: err.message || "Verification failed" 
        } 
      });
    } finally {
      setVerifying(null);
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (!confirm("Are you sure you want to delete this connection?")) {
      return;
    }

    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");
      
      const response = await fetch(`/api/exchange-connections/${connectionId}`, {
        method: "DELETE",
        headers: {
          Authorization: bearer,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete connection");
      }

      // Reload connections
      await loadConnections();
      // Clear verify result for this connection
      const newResults = { ...verifyResults };
      delete newResults[connectionId];
      setVerifyResults(newResults);
    } catch (err: any) {
      alert(err.message || "Failed to delete connection");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Exchange Settings</h1>
            <p className="text-muted-foreground">
              Connect your Hyperliquid account to enable live and dry-run trading
            </p>
          </div>

          {/* Warning Card */}
          <Card className="mb-8 border-yellow-500/50 bg-yellow-500/10">
            <CardHeader>
              <CardTitle className="text-lg">Security Notice</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your private key is stored encrypted on our servers. Never share your private key with anyone.
                For MVP, keys are stored with basic encryption. Production should use stronger encryption.
              </p>
            </CardContent>
          </Card>

          {/* Add Connection Form */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Add Hyperliquid Connection</CardTitle>
              <CardDescription>
                Enter your wallet address and private key to connect
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="wallet_address" className="block text-sm font-medium mb-2">
                    Wallet Address
                  </label>
                  <Input
                    id="wallet_address"
                    type="text"
                    placeholder="0x..."
                    value={formData.wallet_address}
                    onChange={(e) =>
                      setFormData({ ...formData, wallet_address: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label htmlFor="key_material_encrypted" className="block text-sm font-medium mb-2">
                    Private Key
                  </label>
                  <Input
                    id="key_material_encrypted"
                    type="password"
                    placeholder="Enter your private key"
                    value={formData.key_material_encrypted}
                    onChange={(e) =>
                      setFormData({ ...formData, key_material_encrypted: e.target.value })
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This will be encrypted before storage
                  </p>
                </div>
                {error && (
                  <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                )}
                <Button type="submit" disabled={loading}>
                  {loading ? "Connecting..." : "Connect"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Existing Connections */}
          <Card>
            <CardHeader>
              <CardTitle>Your Connections</CardTitle>
              <CardDescription>
                Manage your exchange connections
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connections.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No connections yet. Add one above to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {connections.map((conn) => (
                    <div key={conn.id}>
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{conn.venue}</span>
                            <Badge variant="outline" className="text-xs">
                              {conn.wallet_address.slice(0, 6)}...{conn.wallet_address.slice(-4)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Connected <FormattedDate date={conn.created_at} format="date" />
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerify(conn.id)}
                            disabled={verifying === conn.id}
                          >
                            {verifying === conn.id ? "Verifying..." : "Verify"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(conn.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      {verifyResults[conn.id] && (
                        <div className={`mt-2 p-3 rounded-lg text-sm ${
                          verifyResults[conn.id].success 
                            ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-800" 
                            : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800"
                        }`}>
                          {verifyResults[conn.id].success ? (
                            <div>
                              <div className="font-semibold mb-2">✅ Connection Verified!</div>
                              <div className="space-y-1 text-xs">
                                <div>Account Value: ${verifyResults[conn.id].account?.account_value || 'N/A'}</div>
                                <div>Margin Used: ${verifyResults[conn.id].account?.margin_used || 'N/A'}</div>
                                <div>Positions: {verifyResults[conn.id].account?.positions_count || 0}</div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold mb-1">❌ Verification Failed</div>
                              <div className="text-xs">{verifyResults[conn.id].error}</div>
                              {verifyResults[conn.id].details && (
                                <div className="text-xs mt-1 opacity-75">{verifyResults[conn.id].details}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ExchangeSettingsPage() {
  return (
    <AuthGuard>
      <ExchangeSettingsContent />
    </AuthGuard>
  );
}
