"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getBearerToken } from "@/lib/api/clientAuth";
import { FormattedDate } from "@/components/formatted-date";

function AiSettingsContent() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState("deepseek");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [defaultModel, setDefaultModel] = useState("deepseek-chat");
  const [apiKey, setApiKey] = useState("");
  const [modelsLoadingId, setModelsLoadingId] = useState<string | null>(null);
  const [modelsByConnId, setModelsByConnId] = useState<Record<string, string[]>>({});
  const [formModels, setFormModels] = useState<string[]>([]);
  const [formModelsLoading, setFormModelsLoading] = useState(false);

  const presets: Array<{ id: string; label: string; baseUrl: string; modelHint: string }> = [
    // OpenAI (GPT Family)
    { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", modelHint: "gpt-5.2" },
    
    // Anthropic Claude
    { id: "anthropic", label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", modelHint: "claude-opus-4-6" },
    
    // Google / DeepMind Gemini (OpenAI-compatible endpoint)
    { id: "google", label: "Google (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelHint: "gemini-3-pro" },
    
    // xAI Grok
    { id: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", modelHint: "grok-4" },
    
    // DeepSeek (supports both /v1 and root)
    { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", modelHint: "deepseek-chat" },
    
    // OpenRouter (Aggregator - many models)
    { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", modelHint: "openai/gpt-5.2" },
    
    // Together AI
    { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1", modelHint: "meta-llama/Llama-4-70B-Instruct" },
    
    // Groq
    { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", modelHint: "llama-3.1-70b-versatile" },
    
    // Perplexity (no /v1 needed)
    { id: "perplexity", label: "Perplexity", baseUrl: "https://api.perplexity.ai", modelHint: "sonar-pro" },
    
    // Fireworks
    { id: "fireworks", label: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", modelHint: "accounts/fireworks/models/llama-v3p1-8b-instruct" },
    
    // Custom
    { id: "custom", label: "Custom (OpenAI-compatible)", baseUrl: "https://api.example.com/v1", modelHint: "your-model" },
  ];

  const loadConnections = async () => {
    const bearer = await getBearerToken();
    if (!bearer) return;
    const res = await fetch("/api/ai-connections", { headers: { Authorization: bearer } });
    if (res.ok) {
      const json = await res.json();
      setConnections(json.connections || []);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await loadConnections();
      } catch (e: any) {
        if (!cancelled) {
          console.error("Failed to load connections:", e);
          setError(e?.message || "Failed to load connections");
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-load known models when provider/baseUrl changes
  useEffect(() => {
    if (baseUrl && formModels.length === 0) {
      import("@/lib/ai/knownModels").then(({ getKnownModels }) => {
        const knownModels = getKnownModels(baseUrl);
        if (knownModels.length > 0) {
          console.log("Auto-loading known models on mount:", knownModels.length);
          setFormModels(knownModels);
          if (defaultModel && !knownModels.includes(defaultModel)) {
            setDefaultModel(""); // Clear if current model not in list
          }
        }
      }).catch((err) => {
        console.warn("Could not load known models:", err);
      });
    }
  }, [baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");

      const res = await fetch("/api/ai-connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer,
        },
        body: JSON.stringify({ provider, base_url: baseUrl, default_model: defaultModel, api_key: apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");

      setApiKey("");
      setFormModels([]);
      setDefaultModel(presets.find((p) => p.id === provider)?.modelHint || "");
      await loadConnections();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  const deleteConnection = async (id: string) => {
    const ok = window.confirm("Delete this AI connection? This cannot be undone.");
    if (!ok) return;

    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");

      const res = await fetch(`/api/ai-connections/${id}`, {
        method: "DELETE",
        headers: { Authorization: bearer },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");

      await loadConnections();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    }
  };

  const fetchModels = async (id: string) => {
    setError(null);
    setModelsLoadingId(id);
    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");
      const res = await fetch(`/api/ai-connections/${id}/models`, { headers: { Authorization: bearer } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch models");
      setModelsByConnId((prev) => ({ ...prev, [id]: json.models || [] }));
    } catch (e: any) {
      setError(e?.message || "Failed to fetch models");
    } finally {
      setModelsLoadingId(null);
    }
  };

  const setDefaultModelForConn = async (id: string, model: string) => {
    setError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) throw new Error("Unauthorized");
      const res = await fetch(`/api/ai-connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({ default_model: model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update default model");
      await loadConnections();
    } catch (e: any) {
      setError(e?.message || "Failed to update default model");
    }
  };

  const fetchModelsForForm = async () => {
    console.log("fetchModelsForForm called", { apiKey: !!apiKey, baseUrl });
    if (!apiKey || !baseUrl) {
      setError("Please enter API Key and Base URL first");
      return;
    }
    setFormModelsLoading(true);
    setError(null);
    try {
      const bearer = await getBearerToken();
      if (!bearer) {
        throw new Error("Not authenticated. Please sign in.");
      }

      console.log("Fetching models from:", baseUrl);
      const res = await fetch("/api/ai-connections/fetch-models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: bearer,
        },
        body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
      });

      const json = await res.json();
      console.log("Fetch response:", { ok: res.ok, status: res.status, json });

      if (!res.ok) {
        throw new Error(json.error || `Failed to fetch models (${res.status})`);
      }

      const models = json.models || [];
      const source = json.source || "api"; // "api" or "fallback"
      console.log("Models fetched:", models.length, models, "source:", source);
      
      if (models.length === 0) {
        setError("No models found. The provider may not expose models via /models endpoint, or your API key may be invalid.");
        setFormModels([]);
        return;
      }
      
      // Update state directly - React will handle re-render
      console.log("Setting formModels to:", models);
      setFormModels(models);
      
      // Show info if using fallback
      if (source === "fallback") {
        console.log("Using known models fallback - API didn't return models");
      }
      
      // Don't auto-select - let user choose
      if (defaultModel && models.includes(defaultModel)) {
        // Keep current selection if it's in the list
        console.log("Keeping current model:", defaultModel);
      } else {
        setDefaultModel(""); // Clear to force user selection
        console.log("Cleared defaultModel, user must select");
      }
    } catch (e: any) {
      console.error("Error fetching models:", e);
      setError(e?.message || "Failed to fetch models");
      setFormModels([]);
    } finally {
      setFormModelsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">AI Settings</h1>
            <p className="text-muted-foreground">
              Connect your GenAI provider. Keys are stored server-side encrypted and never returned to the browser.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Add AI Connection</CardTitle>
              <CardDescription>
                Supports many OpenAI-compatible providers. Keys are validated before saving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={provider}
                    onChange={(e) => {
                      const next = e.target.value;
                      setProvider(next);
                      const preset = presets.find((p) => p.id === next);
                      if (preset) {
                        setBaseUrl(preset.baseUrl);
                        setDefaultModel(preset.modelHint);
                        
                        // Auto-load known models for this provider immediately
                        import("@/lib/ai/knownModels").then(({ getKnownModels }) => {
                          const knownModels = getKnownModels(preset.baseUrl);
                          if (knownModels.length > 0) {
                            console.log("Auto-loading known models:", knownModels.length, knownModels);
                            setFormModels(knownModels);
                            setDefaultModel(""); // Clear selection so user picks from full list
                          }
                        }).catch((err) => {
                          console.warn("Could not load known models:", err);
                        });
                      } else {
                        setFormModels([]);
                      }
                    }}
                  >
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL</label>
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://.../v1" required />
                  <p className="text-xs text-muted-foreground">
                    Must be OpenAI-compatible and include <code>/v1</code> when required by the provider.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Model</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={defaultModel}
                      onChange={(e) => {
                        console.log("Model selected:", e.target.value);
                        setDefaultModel(e.target.value);
                      }}
                      disabled={formModelsLoading}
                    >
                      {formModels.length === 0 ? (
                        <>
                          {defaultModel ? (
                            <option value={defaultModel}>{defaultModel} (click Fetch Models for more)</option>
                          ) : (
                            <option value="">Click &apos;Fetch Models&apos; to load available models</option>
                          )}
                        </>
                      ) : (
                        <>
                          <option value="">-- Select a model ({formModels.length} available) --</option>
                          {formModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("Fetch Models button clicked", { apiKey: !!apiKey, baseUrl, formModelsCount: formModels.length });
                        await fetchModelsForForm();
                      }}
                      disabled={formModelsLoading || !apiKey || !baseUrl}
                    >
                      {formModelsLoading ? (
                        <>
                          <span className="mr-2">⏳</span> Loading...
                        </>
                      ) : formModels.length > 0 ? (
                        <>
                          <span className="mr-2">🔄</span> Refresh ({formModels.length} models)
                        </>
                      ) : (
                        <>
                          <span className="mr-2">📋</span> Fetch Models
                        </>
                      )}
                    </Button>
                  </div>
                  {formModels.length > 0 && (
                    <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                      <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                        ✓ Loaded {formModels.length} model{formModels.length !== 1 ? "s" : ""} from {baseUrl}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Select a model from the dropdown above. All available models are listed.
                      </p>
                      <details className="mt-2">
                        <summary className="text-xs text-green-600 dark:text-green-400 cursor-pointer">
                          View all {formModels.length} models
                        </summary>
                        <ul className="mt-1 text-xs text-green-700 dark:text-green-300 list-disc list-inside max-h-32 overflow-y-auto">
                          {formModels.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
                  {formModels.length === 0 && apiKey && baseUrl && !formModelsLoading && (
                    <p className="text-xs text-muted-foreground">
                      Click &quot;Fetch Models&quot; to load available models from your provider.
                    </p>
                  )}
                  {formModelsLoading && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      ⏳ Fetching models from {baseUrl}... Please wait.
                    </p>
                  )}
                  {process.env.NODE_ENV === "development" && formModels.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Debug: {formModels.length} models loaded</summary>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(formModels, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your API key"
                    required
                  />
                </div>
                {error && (
                  <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">Error: {error}</p>
                  </div>
                )}
                <Button disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your AI Connections</CardTitle>
              <CardDescription>We never display secrets; only metadata.</CardDescription>
            </CardHeader>
            <CardContent>
              {connections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No connections yet.</p>
              ) : (
                <div className="space-y-2">
                  {connections.map((c) => (
                    <div key={c.id} className="border rounded-md p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{c.provider}</div>
                        <div className="text-xs text-muted-foreground">{c.base_url}</div>
                        {c.default_model && (
                          <div className="text-xs text-muted-foreground">model: {c.default_model}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          <FormattedDate date={c.created_at} />
                        </div>
                        {modelsByConnId[c.id]?.length ? (
                          <div className="mt-2">
                            <label className="text-xs text-muted-foreground">Choose model</label>
                            <select
                              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                              value={c.default_model || ""}
                              onChange={(e) => setDefaultModelForConn(c.id, e.target.value)}
                            >
                              <option value="">(no default)</option>
                              {modelsByConnId[c.id].map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">connected</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchModels(c.id)}
                          disabled={modelsLoadingId === c.id}
                        >
                          {modelsLoadingId === c.id ? "Loading..." : "Models"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteConnection(c.id)}
                        >
                          Delete
                        </Button>
                      </div>
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

export default function AiSettingsPage() {
  return (
    <AuthGuard>
      <AiSettingsContent />
    </AuthGuard>
  );
}

