"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useTimezone } from "@/components/timezone-provider";
import { TIMEZONES, getBrowserTimezone, getTimezoneOffset } from "@/lib/utils/dateFormat";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { Textarea } from "@/components/ui/textarea";

type Venue = "hyperliquid" | "coinbase";


function SettingsContent() {
  const { timezone, setTimezone, isLoading } = useTimezone();
  const [selectedTimezone, setSelectedTimezone] = useState<string>(timezone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [browserTz, setBrowserTz] = useState<string>("");

  // Exchange Connection state
  const [connections, setConnections] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeSuccess, setExchangeSuccess] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, any>>({});

  // Venue selection for adding new connection
  const [selectedVenue, setSelectedVenue] = useState<Venue>("hyperliquid");

  // Hyperliquid form data
  const [exchangeFormData, setExchangeFormData] = useState({
    wallet_address: "",
    key_material_encrypted: "",
  });

  // Coinbase form data
  const [cbFormData, setCbFormData] = useState({
    api_key: "",
    api_secret: "",
    intx_enabled: false,
  });

  // Help sections state
  const [showExchangeHelp, setShowExchangeHelp] = useState(false);

  useEffect(() => {
    setBrowserTz(getBrowserTimezone());
    loadExchangeConnections();
  }, []);

  useEffect(() => {
    setSelectedTimezone(timezone || "");
  }, [timezone]);

  // Load saved API keys
  // Exchange Connection functions
  const loadExchangeConnections = async () => {
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

  const handleExchangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingConnections(true);
    setExchangeError(null);
    setExchangeSuccess(false);

    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");

      let body: any = { venue: selectedVenue };

      if (selectedVenue === "hyperliquid") {
        body.wallet_address = exchangeFormData.wallet_address;
        body.key_material_encrypted = exchangeFormData.key_material_encrypted;
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
        // Include details if available for debugging
        const errorMsg = errorData.details
          ? `${errorData.error}\n\nDetails: ${errorData.details}`
          : errorData.error || "Failed to create connection";
        throw new Error(errorMsg);
      }

      // Reset forms and reload
      setExchangeFormData({ wallet_address: "", key_material_encrypted: "" });
      setCbFormData({ api_key: "", api_secret: "", intx_enabled: false });
      await loadExchangeConnections();

      // Show success message
      setExchangeSuccess(true);
      setTimeout(() => setExchangeSuccess(false), 4000);
    } catch (err: any) {
      setExchangeError(err.message || "Failed to create connection");
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleVerifyConnection = async (connectionId: string) => {
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

  const handleDeleteConnection = async (connectionId: string) => {
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
      await loadExchangeConnections();
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

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await setTimezone(selectedTimezone || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save timezone:", error);
    } finally {
      setSaving(false);
    }
  };

  const currentOffset = getTimezoneOffset(selectedTimezone || undefined);
  const now = new Date();
  const previewTime = now.toLocaleString("en-US", {
    timeZone: selectedTimezone || undefined,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] page-container white-cards">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Settings</h1>
            <p className="text-gray-300">
              Manage your account preferences and display settings.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Timezone</CardTitle>
              <CardDescription>
                Set your preferred timezone for displaying dates and times across the platform.
                By default, your browser&apos;s local timezone is used.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading preferences...</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Timezone</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={selectedTimezone}
                      onChange={(e) => setSelectedTimezone(e.target.value)}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                          {tz.value === "" && browserTz ? ` (${browserTz})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Your browser detected timezone: <strong>{browserTz}</strong>
                    </p>
                  </div>

                  <div className="rounded-md bg-muted p-4">
                    <p className="text-sm font-medium mb-1">Preview</p>
                    <p className="text-lg font-mono">
                      {previewTime} {currentOffset && <span className="text-muted-foreground text-sm">({currentOffset})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This is how times will appear across the platform.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleSave}
                      disabled={saving || selectedTimezone === (timezone || "")}
                    >
                      {saving ? "Saving..." : "Save Preference"}
                    </Button>
                    {saved && (
                      <span className="text-sm text-green-600">Saved!</span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Exchange Connection Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Exchange Connection</CardTitle>
                  <CardDescription>
                    Connect your exchange account to enable live and dry-run trading
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExchangeHelp(!showExchangeHelp)}
                >
                  {showExchangeHelp ? "Hide" : "How to Get Credentials"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Security Notice */}
              <div className="rounded-md bg-yellow-500/10 border border-yellow-500/50 p-3">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-yellow-700 dark:text-yellow-400">Security Notice:</strong> Your API keys and credentials are stored encrypted on our servers. Never share your private keys with anyone.
                </p>
              </div>

              {/* Venue Selector Tabs */}
              <div className="flex gap-2">
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

              {/* Help Section - Hyperliquid */}
              {showExchangeHelp && selectedVenue === "hyperliquid" && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">How to Get Hyperliquid Credentials</h4>
                  <div className="space-y-4 text-sm text-blue-800 dark:text-blue-200">
                    <div>
                      <strong className="block mb-2">Option 1: Using Hyperliquid API Wallet (Recommended)</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Go to <a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="underline">app.hyperliquid.xyz</a></li>
                        <li>Connect your wallet (MetaMask or other)</li>
                        <li>Click <strong>"More"</strong> → <strong>"API"</strong></li>
                        <li>Click <strong>"Authorize API Wallet"</strong></li>
                        <li>Copy the <strong>API Wallet Address</strong></li>
                        <li>Click <strong>"Show Private Key"</strong> and copy it</li>
                      </ol>
                    </div>
                    <div className="pt-3 border-t border-blue-300 dark:border-blue-700">
                      <p className="font-medium text-red-700 dark:text-red-300">Security Tips:</p>
                      <ul className="list-disc ml-5 space-y-1 mt-1">
                        <li>Never share your private key with anyone</li>
                        <li>Private key must be 66 characters and start with <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">0x</code></li>
                        <li>We encrypt your key before storing it</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Help Section - Coinbase */}
              {showExchangeHelp && selectedVenue === "coinbase" && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">How to Get Coinbase API Keys</h4>
                  <div className="space-y-4 text-sm text-blue-800 dark:text-blue-200">
                    <ol className="list-decimal ml-5 space-y-2">
                      <li>Go to <a href="https://www.coinbase.com/settings/api" target="_blank" rel="noopener noreferrer" className="underline">coinbase.com/settings/api</a></li>
                      <li>Sign in with your Coinbase account</li>
                      <li>Select portfolio:
                        <ul className="list-disc ml-5 mt-1">
                          <li><strong>US users (Spot):</strong> Select <strong>Primary</strong> portfolio</li>
                          <li><strong>Non-US users (Perpetuals):</strong> Select <strong>Perpetuals</strong> portfolio</li>
                        </ul>
                      </li>
                      <li>Click <strong>&quot;Create API Key&quot;</strong></li>
                      <li>Copy the <strong>API Key ID</strong></li>
                      <li>Copy the <strong>Secret</strong> - it will be a PEM key starting with <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">-----BEGIN EC PRIVATE KEY-----</code></li>
                    </ol>
                    <div className="mt-3 p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded">
                      <p className="text-green-700 dark:text-green-300 text-xs">
                        Both key types use ECDSA PEM format. No passphrase needed.
                      </p>
                    </div>
                    <div className="pt-3 border-t border-blue-300 dark:border-blue-700">
                      <p className="font-medium text-blue-700 dark:text-blue-300">Capabilities by Portfolio:</p>
                      <ul className="list-disc ml-5 space-y-1 mt-1">
                        <li><strong>Primary (US):</strong> Spot trading only, no leverage, no shorts</li>
                        <li><strong>Perpetuals (non-US):</strong> Perpetuals + leverage + shorts allowed</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Hyperliquid Form */}
              {selectedVenue === "hyperliquid" && (
                <form onSubmit={handleExchangeSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="wallet_address">Wallet Address</Label>
                    <Input
                      id="wallet_address"
                      type="text"
                      placeholder="0x..."
                      value={exchangeFormData.wallet_address}
                      onChange={(e) =>
                        setExchangeFormData({ ...exchangeFormData, wallet_address: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="key_material_encrypted">Private Key</Label>
                    <Input
                      id="key_material_encrypted"
                      type="password"
                      placeholder="0x... (66 characters)"
                      value={exchangeFormData.key_material_encrypted}
                      onChange={(e) =>
                        setExchangeFormData({ ...exchangeFormData, key_material_encrypted: e.target.value })
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Your private key will be encrypted before storage
                    </p>
                  </div>
                  {exchangeError && (
                    <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">{exchangeError}</p>
                    </div>
                  )}
                  <Button type="submit" disabled={loadingConnections}>
                    {loadingConnections ? "Connecting..." : "Connect Hyperliquid"}
                  </Button>
                </form>
              )}

              {/* Coinbase Form */}
              {selectedVenue === "coinbase" && (
                <form onSubmit={handleExchangeSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="api_key">API Key ID</Label>
                    <Input
                      id="api_key"
                      type="text"
                      placeholder="e.g., f3808258-..."
                      value={cbFormData.api_key}
                      onChange={(e) =>
                        setCbFormData({ ...cbFormData, api_key: e.target.value })
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Copy the &quot;API key ID&quot; shown when you create the key
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api_secret">Secret (PEM Private Key)</Label>
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
                    <p className="text-xs text-muted-foreground">
                      Paste the full PEM private key including the BEGIN/END lines
                    </p>
                  </div>
                  {/* INTX Access Toggle */}
                  <div className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/30">
                    <input
                      type="checkbox"
                      id="intx-enabled-main"
                      checked={cbFormData.intx_enabled}
                      onChange={(e) =>
                        setCbFormData({ ...cbFormData, intx_enabled: e.target.checked })
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <label htmlFor="intx-enabled-main" className="font-medium text-sm cursor-pointer">
                        I have Coinbase International (INTX) access
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enable if you&apos;re a <strong>non-US resident</strong> who passed Coinbase&apos;s derivatives
                        verification. This unlocks perpetuals trading with leverage and short selling (spot trading remains available).
                      </p>
                    </div>
                  </div>
                  {exchangeError && (
                    <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">{exchangeError}</p>
                    </div>
                  )}
                  <Button type="submit" disabled={loadingConnections}>
                    {loadingConnections ? "Connecting..." : "Connect Coinbase"}
                  </Button>
                </form>
              )}

              {/* Success Message */}
              {exchangeSuccess && (
                <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 p-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                    Exchange connection saved successfully
                  </p>
                </div>
              )}

              {/* Existing Connections */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Your Connections</h3>
                {connections.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 border rounded-md">
                    No connections yet. Add one above to get started.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {connections.map((conn) => (
                      <div key={conn.id}>
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
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
                              onClick={() => handleVerifyConnection(conn.id)}
                              disabled={verifying === conn.id}
                            >
                              {verifying === conn.id ? "Verifying..." : "Verify"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteConnection(conn.id)}
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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
