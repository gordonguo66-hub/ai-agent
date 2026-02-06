"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTimezone } from "@/components/timezone-provider";
import { TIMEZONES, getBrowserTimezone, getTimezoneOffset } from "@/lib/utils/dateFormat";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";
import { Textarea } from "@/components/ui/textarea";

type Venue = "hyperliquid" | "coinbase";

// Provider options for saved keys
const PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google / Gemini" },
  { id: "xai", name: "xAI (Grok)" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "meta", name: "Meta (LLaMA)" },
  { id: "qwen", name: "Qwen" },
  { id: "glm", name: "GLM" },
  { id: "perplexity", name: "Perplexity" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "together", name: "Together AI" },
  { id: "groq", name: "Groq" },
  { id: "fireworks", name: "Fireworks" },
];

interface SavedApiKey {
  id: string;
  provider: string;
  label: string;
  key_preview: string;
  created_at: string;
}

function SettingsContent() {
  const { timezone, setTimezone, isLoading } = useTimezone();
  const [selectedTimezone, setSelectedTimezone] = useState<string>(timezone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [browserTz, setBrowserTz] = useState<string>("");

  // Saved API Keys state
  const [savedKeys, setSavedKeys] = useState<SavedApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false);
  const [showExchangeHelp, setShowExchangeHelp] = useState(false);

  useEffect(() => {
    setBrowserTz(getBrowserTimezone());
    loadSavedKeys();
    loadExchangeConnections();
  }, []);

  useEffect(() => {
    setSelectedTimezone(timezone || "");
  }, [timezone]);

  // Load saved API keys
  const loadSavedKeys = async () => {
    try {
      setLoadingKeys(true);
      const bearer = await getBearerToken();
      if (!bearer) {
        console.error("No bearer token available");
        return;
      }

      const response = await fetch("/api/settings/api-keys", {
        headers: { Authorization: bearer },
      });

      if (response.ok) {
        const data = await response.json();
        setSavedKeys(data.keys || []);
      } else {
        console.error("Failed to load saved keys:", await response.text());
      }
    } catch (error) {
      console.error("Error loading saved keys:", error);
    } finally {
      setLoadingKeys(false);
    }
  };

  // Add new saved API key
  const handleAddKey = async () => {
    if (!newKeyProvider || !newKeyLabel.trim() || !newKeyValue.trim()) {
      setAddError("All fields are required");
      return;
    }

    try {
      setAddingKey(true);
      setAddError(null);

      const bearer = await getBearerToken();
      if (!bearer) {
        setAddError("Not authenticated");
        return;
      }

      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer,
        },
        body: JSON.stringify({
          provider: newKeyProvider,
          label: newKeyLabel.trim(),
          api_key: newKeyValue.trim(),
        }),
      });

      if (response.ok) {
        // Success - reload keys and close dialog
        await loadSavedKeys();
        setIsAddDialogOpen(false);
        setNewKeyProvider("");
        setNewKeyLabel("");
        setNewKeyValue("");
        setAddError(null);
      } else {
        const errorData = await response.json();
        setAddError(errorData.error || "Failed to save API key");
      }
    } catch (error: any) {
      setAddError(error.message || "An error occurred");
    } finally {
      setAddingKey(false);
    }
  };

  // Delete saved API key
  const handleDeleteKey = async (keyId: string, label: string) => {
    if (!confirm(`Delete saved key "${label}"? Strategies using this key will need to select another key.`)) {
      return;
    }

    try {
      const bearer = await getBearerToken();
      if (!bearer) {
        alert("Not authenticated");
        return;
      }

      const response = await fetch(`/api/settings/api-keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: bearer },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.affectedStrategies && data.affectedStrategies.length > 0) {
          alert(
            `Key deleted. ${data.affectedStrategies.length} strategy(ies) will need a new key: ${data.affectedStrategies.map((s: any) => s.name).join(", ")}`
          );
        }
        await loadSavedKeys();
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to delete key");
      }
    } catch (error: any) {
      alert(error.message || "An error occurred");
    }
  };

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

          {/* Saved API Keys Section */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-xl">Saved API Keys</CardTitle>
                  <CardDescription className="mt-1.5">
                    Save API keys once and reuse them across strategies. Keys are encrypted server-side.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApiKeyHelp(!showApiKeyHelp)}
                  className="ml-4 whitespace-nowrap"
                >
                  {showApiKeyHelp ? "Hide" : "How to Get API Keys"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Help Section */}
              {showApiKeyHelp && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg max-h-[600px] overflow-y-auto">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">📚 How to Get API Keys</h4>
                  
                  {/* Important Notice */}
                  <div className="mb-4 p-3 bg-orange-100 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded">
                    <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">💳 Important: Add Credits First!</p>
                    <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
                      Most AI providers require you to add credits/billing before API keys work. Add at least $5-10 to your account after signing up.
                    </p>
                  </div>

                  <div className="space-y-4 text-sm text-blue-800 dark:text-blue-200">
                    <div>
                      <strong className="block mb-1">🔹 OpenAI (GPT-4, GPT-3.5):</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Sign up at: <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/signup</a></li>
                        <li><strong>Add credits:</strong> Go to Billing → Add payment method → Add at least $5</li>
                        <li>Go to: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/api-keys</a></li>
                        <li>Click "Create new secret key"</li>
                        <li>Copy the key (starts with <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">sk-...</code>)</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 Anthropic (Claude):</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Sign up at: <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com</a></li>
                        <li><strong>Add credits:</strong> Go to Settings → Billing → Add at least $5</li>
                        <li>Go to: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com/settings/keys</a></li>
                        <li>Click "Create Key"</li>
                        <li>Copy the key (starts with <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">sk-ant-...</code>)</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 Google / DeepMind Gemini - FREE Tier Available:</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Go to: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com/app/apikey</a></li>
                        <li>Sign in with Google account</li>
                        <li>Click "Create API key"</li>
                        <li>Copy the key</li>
                        <li><strong>No billing required</strong> - has generous free tier!</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 xAI (Grok):</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Sign up at: <a href="https://console.x.ai" target="_blank" rel="noopener noreferrer" className="underline">console.x.ai</a></li>
                        <li><strong>Add credits:</strong> Go to Billing → Add payment method</li>
                        <li>Go to API Keys section</li>
                        <li>Click "Create API Key"</li>
                        <li>Copy the key</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 DeepSeek (Cheapest!):</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Sign up at: <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="underline">platform.deepseek.com</a></li>
                        <li><strong>Add credits:</strong> Click "Recharge" → Add at least $5 (very cheap usage)</li>
                        <li>Go to: <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="underline">platform.deepseek.com/api_keys</a></li>
                        <li>Click "Create API Key"</li>
                        <li>Copy the key (starts with <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">sk-...</code>)</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 Meta (LLaMA):</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Access via third-party providers like <a href="https://together.ai" target="_blank" rel="noopener noreferrer" className="underline">Together.ai</a> or <a href="https://replicate.com" target="_blank" rel="noopener noreferrer" className="underline">Replicate</a></li>
                        <li>Sign up and add billing ($5+ recommended)</li>
                        <li>Create API key in their dashboard</li>
                        <li>Copy the key</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 Qwen:</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Access via <a href="https://dashscope.aliyun.com" target="_blank" rel="noopener noreferrer" className="underline">Alibaba Cloud DashScope</a></li>
                        <li>Sign up and verify account</li>
                        <li><strong>Add credits:</strong> Add payment method and credits</li>
                        <li>Go to API Keys section</li>
                        <li>Create and copy your API key</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 GLM (ChatGLM):</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Access via <a href="https://open.bigmodel.cn" target="_blank" rel="noopener noreferrer" className="underline">Zhipu AI (open.bigmodel.cn)</a></li>
                        <li>Sign up (may require Chinese phone number)</li>
                        <li><strong>Add credits:</strong> Recharge account</li>
                        <li>Go to API management</li>
                        <li>Create and copy API key</li>
                      </ol>
                    </div>
                    
                    <div>
                      <strong className="block mb-1">🔹 Perplexity:</strong>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Sign up at: <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener noreferrer" className="underline">perplexity.ai/settings/api</a></li>
                        <li><strong>Add credits:</strong> Go to Billing → Add payment method</li>
                        <li>Click "Generate API Key"</li>
                        <li>Copy the key</li>
                      </ol>
                    </div>
                    
                    <div className="pt-3 border-t border-blue-300 dark:border-blue-700">
                      <p className="font-medium text-green-700 dark:text-green-300 mb-2">💰 Cost Comparison (per 1M tokens):</p>
                      <ul className="text-xs space-y-1 ml-5">
                        <li>DeepSeek: ~$0.14 (Cheapest! ⭐)</li>
                        <li>Google Gemini: Free tier ⭐</li>
                        <li>OpenAI GPT-4: ~$10-30</li>
                        <li>Anthropic Claude: ~$3-15</li>
                        <li>xAI Grok: ~$5-10</li>
                      </ul>
                    </div>
                    
                    <div className="pt-3 border-t border-blue-300 dark:border-blue-700">
                      <p className="font-medium">💡 Pro Tip:</p>
                      <p>Save keys here once and reuse them across multiple strategies without pasting every time!</p>
                    </div>
                  </div>
                </div>
              )}
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New API Key</DialogTitle>
                      <DialogDescription>
                        Save an API key to reuse it across multiple strategies without pasting it every time.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="provider">Provider</Label>
                        <select
                          id="provider"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={newKeyProvider}
                          onChange={(e) => setNewKeyProvider(e.target.value)}
                        >
                          <option value="">Select provider...</option>
                          {PROVIDERS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="label">Label</Label>
                        <Input
                          id="label"
                          placeholder="e.g., Main API Key"
                          value={newKeyLabel}
                          onChange={(e) => setNewKeyLabel(e.target.value)}
                          maxLength={50}
                        />
                        <p className="text-xs text-muted-foreground">
                          A descriptive name to identify this key (max 50 chars)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <Input
                          id="apiKey"
                          type="password"
                          placeholder="sk-..."
                          value={newKeyValue}
                          onChange={(e) => setNewKeyValue(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Your API key will be encrypted and never displayed again
                        </p>
                      </div>
                      {addError && (
                        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                          <p className="text-sm text-red-800 dark:text-red-200">{addError}</p>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsAddDialogOpen(false);
                            setNewKeyProvider("");
                            setNewKeyLabel("");
                            setNewKeyValue("");
                            setAddError(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleAddKey} disabled={addingKey}>
                          {addingKey ? "Saving..." : "Save Key"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              
              {loadingKeys ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Loading saved keys...
                </div>
              ) : savedKeys.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  <p className="mb-2">No saved API keys yet.</p>
                  <p>Add a key to reuse it across multiple strategies.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Key Preview</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedKeys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">{key.label}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {PROVIDERS.find((p) => p.id === key.provider)?.name || key.provider}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {key.key_preview}
                            </code>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(key.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteKey(key.id, key.label)}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="mt-4 p-3 rounded-md bg-muted text-sm text-muted-foreground">
                <strong>Note:</strong> Keys are encrypted server-side. You can delete them anytime. If a strategy
                references a deleted key, it will need to select a new key or use a manual key.
              </div>
              
              {/* Add New Key Button at Bottom */}
              <div className="mt-6">
                <Button onClick={() => setIsAddDialogOpen(true)} className="w-full sm:w-auto">
                  <span className="text-lg mr-2">+</span> Add New Key
                </Button>
              </div>
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
