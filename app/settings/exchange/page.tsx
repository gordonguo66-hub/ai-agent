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
import { Textarea } from "@/components/ui/textarea";

type Venue = "hyperliquid" | "coinbase";

function ExchangeSettingsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, any>>({});

  // Venue selection for adding new connection
  const [selectedVenue, setSelectedVenue] = useState<Venue>("hyperliquid");

  // Hyperliquid form data
  const [hlFormData, setHlFormData] = useState({
    wallet_address: "",
    key_material_encrypted: "",
  });

  // Coinbase form data
  const [cbFormData, setCbFormData] = useState({
    api_key: "",
    api_secret: "",
    intx_enabled: false,
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
    setSuccess(false);

    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");

      let body: any = { venue: selectedVenue };

      if (selectedVenue === "hyperliquid") {
        body.wallet_address = hlFormData.wallet_address;
        body.key_material_encrypted = hlFormData.key_material_encrypted;
      } else {
        body.api_key = cbFormData.api_key;
        body.api_secret = cbFormData.api_secret;
        body.intx_enabled = cbFormData.intx_enabled;
      }

      const response = await fetch("/api/exchange-connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create connection");
      }

      // Reset forms and reload
      setHlFormData({ wallet_address: "", key_material_encrypted: "" });
      setCbFormData({ api_key: "", api_secret: "", intx_enabled: false });
      await loadConnections();

      // Show success message
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
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

  const getConnectionIdentifier = (conn: any) => {
    if (conn.venue === "coinbase") {
      return conn.identifier || conn.api_key?.split("/").pop() || "Connected";
    }
    return conn.wallet_address
      ? `${conn.wallet_address.slice(0, 6)}...${conn.wallet_address.slice(-4)}`
      : "Unknown";
  };

  const getVenueBadgeColor = (venue: string) => {
    return venue === "coinbase"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
      : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Exchange Settings</h1>
            <p className="text-muted-foreground">
              Connect your exchange accounts to enable live trading
            </p>
          </div>

          {/* Warning Card */}
          <Card className="mb-8 border-yellow-500/50 bg-yellow-500/10">
            <CardHeader>
              <CardTitle className="text-lg">Security Notice</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your API keys and credentials are stored encrypted on our servers. Never share your private keys with anyone.
                For MVP, keys are stored with basic encryption. Production should use stronger encryption.
              </p>
            </CardContent>
          </Card>

          {/* Venue Selector */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Add Exchange Connection</CardTitle>
              <CardDescription>
                Select your exchange and enter your credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Venue tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setSelectedVenue("hyperliquid")}
                  className={`flex-1 p-4 border rounded-lg text-left transition-colors ${
                    selectedVenue === "hyperliquid"
                      ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/20"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="font-semibold">Hyperliquid</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Perpetuals trading (global)
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedVenue("coinbase")}
                  className={`flex-1 p-4 border rounded-lg text-left transition-colors ${
                    selectedVenue === "coinbase"
                      ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="font-semibold">Coinbase</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Spot (US) or INTX perpetuals (non-US)
                  </div>
                </button>
              </div>

              {/* Hyperliquid Form */}
              {selectedVenue === "hyperliquid" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="wallet_address" className="block text-sm font-medium mb-2">
                      Wallet Address
                    </label>
                    <Input
                      id="wallet_address"
                      type="text"
                      placeholder="0x..."
                      value={hlFormData.wallet_address}
                      onChange={(e) =>
                        setHlFormData({ ...hlFormData, wallet_address: e.target.value })
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
                      placeholder="0x... (66 characters)"
                      value={hlFormData.key_material_encrypted}
                      onChange={(e) =>
                        setHlFormData({ ...hlFormData, key_material_encrypted: e.target.value })
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Your private key will be encrypted before storage
                    </p>
                  </div>
                  {error && (
                    <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                  )}
                  <Button type="submit" disabled={loading}>
                    {loading ? "Connecting..." : "Connect Hyperliquid"}
                  </Button>
                </form>
              )}

              {/* Coinbase Form */}
              {selectedVenue === "coinbase" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md mb-4 space-y-2">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <strong>How to get API Keys:</strong> Go to{" "}
                      <a
                        href="https://www.coinbase.com/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        coinbase.com/settings/api
                      </a>
                    </p>
                    <ul className="text-sm text-blue-700 dark:text-blue-400 list-disc list-inside space-y-1">
                      <li>
                        <strong>US users (Spot):</strong> Select <strong>Primary</strong> portfolio
                      </li>
                      <li>
                        <strong>Non-US users (Perpetuals):</strong> Select <strong>Perpetuals</strong> portfolio
                      </li>
                    </ul>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      Both key types use ECDSA PEM format. No passphrase needed.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="api_key" className="block text-sm font-medium mb-2">
                      API Key ID
                    </label>
                    <Input
                      id="api_key"
                      type="text"
                      placeholder="organizations/xxx/apiKeys/xxx or short UUID"
                      value={cbFormData.api_key}
                      onChange={(e) =>
                        setCbFormData({ ...cbFormData, api_key: e.target.value })
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      The API key name/ID shown when you create the key
                    </p>
                  </div>
                  <div>
                    <label htmlFor="api_secret" className="block text-sm font-medium mb-2">
                      Secret (PEM Private Key)
                    </label>
                    <Textarea
                      id="api_secret"
                      placeholder="-----BEGIN EC PRIVATE KEY-----&#10;...&#10;-----END EC PRIVATE KEY-----"
                      value={cbFormData.api_secret}
                      onChange={(e) =>
                        setCbFormData({ ...cbFormData, api_secret: e.target.value })
                      }
                      required
                      rows={5}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Paste the full PEM private key including the BEGIN/END lines
                    </p>
                  </div>
                  {/* INTX Access Toggle */}
                  <div className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/30">
                    <input
                      type="checkbox"
                      id="intx-enabled"
                      checked={cbFormData.intx_enabled}
                      onChange={(e) =>
                        setCbFormData({ ...cbFormData, intx_enabled: e.target.checked })
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <label htmlFor="intx-enabled" className="font-medium text-sm cursor-pointer">
                        I have Coinbase International (INTX) access
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enable if you&apos;re a <strong>non-US resident</strong> who passed Coinbase&apos;s derivatives
                        verification. This unlocks perpetuals trading with leverage and short selling (spot trading remains available).
                      </p>
                    </div>
                  </div>
                  {error && (
                    <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                  )}
                  <Button type="submit" disabled={loading}>
                    {loading ? "Connecting..." : "Connect Coinbase"}
                  </Button>
                </form>
              )}

              {/* Success Message */}
              {success && (
                <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 p-3 flex items-center gap-2 mt-4">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                    Exchange connection saved successfully
                  </p>
                </div>
              )}
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
                            <Badge className={getVenueBadgeColor(conn.venue)}>
                              {conn.venue === "coinbase" ? "Coinbase" : "Hyperliquid"}
                            </Badge>
                            <span className="font-mono text-sm">
                              {getConnectionIdentifier(conn)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Connected <FormattedDate date={conn.created_at} format="date" />
                            {conn.venue === "coinbase" && (
                              conn.intx_enabled ? (
                                <span className="ml-2 text-green-600 dark:text-green-400">
                                  (INTX - Spot + Perps)
                                </span>
                              ) : (
                                <span className="ml-2 text-blue-600 dark:text-blue-400">
                                  (Spot Only)
                                </span>
                              )
                            )}
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
                              <div className="font-semibold mb-2">Connection Verified!</div>
                              <div className="space-y-1 text-xs">
                                {conn.venue === "coinbase" ? (
                                  <>
                                    <div>Total Equity: ${verifyResults[conn.id].account?.equity?.toLocaleString() || 'N/A'}</div>
                                    <div>Balances: {verifyResults[conn.id].account?.balances_count || 0} assets</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-medium">Total Equity: ${Number(verifyResults[conn.id].account?.account_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <div className="text-muted-foreground mt-1">
                                      <span>Perp: ${Number(verifyResults[conn.id].account?.perp_equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      <span className="mx-1">•</span>
                                      <span>Spot USDC: ${Number(verifyResults[conn.id].account?.spot_usdc || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div>Positions: {verifyResults[conn.id].account?.positions_count || 0}</div>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold mb-1">Verification Failed</div>
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
