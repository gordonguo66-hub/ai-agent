"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Switch } from "./ui/switch";
import { Select, SelectItem } from "./ui/select";
import { Badge } from "./ui/badge";
import { createClient } from "@/lib/supabase/browser";

// Model configurations by provider (Jan 2026) - Using actual API model identifiers
const MODELS_BY_PROVIDER: Record<string, { id: string; name: string; description?: string }[]> = {
  openai: [
    { id: "gpt-5.2", name: "GPT-5.2 (Thinking)", description: "Deeper reasoning, coding, long documents" },
    { id: "gpt-5.2-pro", name: "GPT-5.2 Pro", description: "Highest performance, precision over speed" },
    { id: "gpt-5.2-chat-latest", name: "GPT-5.2 Instant", description: "Fast everyday chat and quick tasks" },
    { id: "gpt-4o", name: "GPT-4o", description: "Previous generation, still available" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Cost-efficient variant" },
  ],
  anthropic: [
    { id: "claude-opus-4-5", name: "Claude Opus 4.5", description: "Frontier intelligence, complex coding" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", description: "Strong coding and agentic tasks" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Balanced variant" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Fast, efficient variant" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", description: "High-performance variant" },
  ],
  google: [
    { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", description: "Most powerful agentic & multimodal" },
    { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", description: "Image generation & editing" },
    { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", description: "Fast variant" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Previous generation, stable" },
  ],
  xai: [
    { id: "grok-4", name: "Grok-4", description: "Latest major release (256K context)" },
    { id: "grok-4-latest", name: "Grok-4 Latest", description: "Alias for latest Grok-4" },
    { id: "grok-2-1212", name: "Grok-2", description: "Previous generation" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat", description: "V3.2 non-thinking mode" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", description: "V3.2 thinking mode for complex reasoning" },
  ],
  meta: [
    { id: "llama-3.1-70b-versatile", name: "LLaMA 3.1 70B", description: "Latest open ecosystem model" },
    { id: "llama-3.1-8b-instruct", name: "LLaMA 3.1 8B", description: "Smaller, faster variant" },
  ],
  qwen: [
    { id: "qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", description: "Latest version" },
    { id: "qwen-2.5-32b-instruct", name: "Qwen 2.5 32B", description: "Mid-size variant" },
  ],
  glm: [
    { id: "glm-4-9b-chat", name: "GLM-4 9B", description: "Latest version" },
  ],
  perplexity: [
    { id: "sonar", name: "Perplexity Sonar", description: "Search + summarization" },
    { id: "sonar-pro", name: "Perplexity Sonar Pro", description: "Enhanced search variant" },
  ],
};

const PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google / DeepMind Gemini" },
  { id: "xai", name: "xAI (Grok)" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "meta", name: "Meta (LLaMA)" },
  { id: "qwen", name: "Qwen" },
  { id: "glm", name: "GLM" },
  { id: "perplexity", name: "Perplexity" },
];

const CADENCE_OPTIONS = [
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
];

const MAJOR_MARKETS = ["BTC-PERP", "ETH-PERP", "SOL-PERP"];

interface StrategyFormProps {
  strategyId?: string;
  initialData?: any;
}

export function StrategyForm({ strategyId, initialData }: StrategyFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basics");
  const isEditMode = !!strategyId;
  
  // Basic fields
  const [name, setName] = useState("");
  const [modelProvider, setModelProvider] = useState("deepseek");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  
  // Saved API Keys
  const [savedKeys, setSavedKeys] = useState<Array<{
    id: string;
    provider: string;
    label: string;
    key_preview: string;
  }>>([]);
  const [selectedSavedKeyId, setSelectedSavedKeyId] = useState<string>("");
  const [useManualKey, setUseManualKey] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  
  // Markets
  const [availableMarkets, setAvailableMarkets] = useState<Array<{ symbol: string; display: string }>>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketsError, setMarketsError] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [manualMarketsInput, setManualMarketsInput] = useState("");
  const [useManualInput, setUseManualInput] = useState(false);
  const [cadenceHours, setCadenceHours] = useState<number | "">(0);
  const [cadenceMinutes, setCadenceMinutes] = useState<number | "">(0);
  const [cadenceSeconds, setCadenceSeconds] = useState<number | "">(60); // Default to 60 seconds minimum
  
  // Force 60 seconds when hours=0 and minutes=0 on mount
  useEffect(() => {
    if (cadenceHours === 0 && cadenceMinutes === 0) {
      setCadenceSeconds(60);
    }
  }, []); // Run once on mount
  
  // Enforce minimum 60 seconds when hours=0 and minutes=0
  // CRITICAL FIX: When minutes > 0, seconds should be 0 (not 60) to avoid double-counting
  useEffect(() => {
    const h = typeof cadenceHours === "number" ? cadenceHours : 0;
    const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
    const s = typeof cadenceSeconds === "number" ? cadenceSeconds : (cadenceSeconds === "" ? 0 : 0);
    
    // If hours=0 and minutes=0, seconds must ALWAYS be 60
    if (h === 0 && m === 0) {
      // Force to 60 no matter what
      if (s !== 60) {
        setCadenceSeconds(60);
      }
    } else if (m > 0 && s > 0) {
      // CRITICAL FIX: If minutes > 0, seconds should be 0 to avoid double-counting
      // Example: 1 minute should be 60 seconds, not 60 + 60 = 120 seconds
      console.log(`[Strategy Form] Fixing cadence: minutes=${m}, seconds=${s} -> setting seconds to 0`);
      setCadenceSeconds(0);
    }
  }, [cadenceHours, cadenceMinutes, cadenceSeconds]);
  
  // AI Inputs
  const [aiInputs, setAiInputs] = useState<{
    candles: { enabled: boolean; count: number | ""; timeframe: string };
    orderbook: { enabled: boolean; depth: number };
    indicators: {
      rsi: { enabled: boolean; period: number };
      atr: { enabled: boolean; period: number };
      volatility: { enabled: boolean; window: number };
      ema: { enabled: boolean; fast: number; slow: number };
    };
    includePositionState: boolean;
    includeRecentDecisions: boolean;
    recentDecisionsCount: number;
  }>({
    candles: { enabled: true, count: 200, timeframe: "5m" },
    orderbook: { enabled: false, depth: 20 },
    indicators: {
      rsi: { enabled: true, period: 14 },
      atr: { enabled: false, period: 14 },
      volatility: { enabled: true, window: 50 },
      ema: { enabled: false, fast: 12, slow: 26 },
    },
    includePositionState: true,
    includeRecentDecisions: true,
    recentDecisionsCount: 5,
  });
  
  // Entry/Exit - Comprehensive structure
  const [entryExit, setEntryExit] = useState<{
    entry: {
      mode: "trend" | "meanReversion" | "breakout" | "signal";
      behaviors: {
        trend: boolean;
        breakout: boolean;
        meanReversion: boolean;
      };
      confirmation: {
        minSignals: number | "";
        requireVolatilityCondition: boolean;
        volatilityMax: number | null;
      };
      timing: {
        waitForClose: boolean;
        maxSlippagePct: number | "";
      };
    };
    exit: {
      mode: "signal" | "tp_sl" | "trailing" | "time";
      maxLossProtectionPct: number | null;
      maxProfitCapPct: number | null;
      takeProfitPct: number;
      stopLossPct: number;
      trailingStopPct: number | null;
      initialStopLossPct: number | null;
      maxHoldMinutes: number | null;
    };
    tradeControl: {
      maxTradesPerHour: number | "";
      maxTradesPerDay: number | "";
      cooldownMinutes: number | "";
      minHoldMinutes: number | "";
      allowReentrySameDirection: boolean;
    };
    confidenceControl: {
      minConfidence: number | "";
      confidenceScaling: boolean;
    };
  }>({
    entry: {
      mode: "signal" as "trend" | "meanReversion" | "breakout" | "signal", // Kept for backwards compatibility
      behaviors: {
        trend: true,
        breakout: true,
        meanReversion: true,
      },
      confirmation: {
        minSignals: 2,
        requireVolatilityCondition: false,
        volatilityMax: null as number | null,
      },
      timing: {
        waitForClose: true,
        maxSlippagePct: 0.005,
      },
    },
    exit: {
      mode: "signal" as "signal" | "tp_sl" | "trailing" | "time",
      // Signal mode guardrails (optional safety limits)
      maxLossProtectionPct: null as number | null,
      maxProfitCapPct: null as number | null,
      // TP/SL mode fields
      takeProfitPct: 2.0,
      stopLossPct: 1.0,
      // Trailing mode fields
      trailingStopPct: null as number | null,
      initialStopLossPct: null as number | null, // Optional hard stop for trailing mode
      // Time mode fields
      maxHoldMinutes: null as number | null,
    },
    tradeControl: {
      maxTradesPerHour: 2,
      maxTradesPerDay: 10,
      cooldownMinutes: 15,
      minHoldMinutes: 5,
      allowReentrySameDirection: false,
    },
    confidenceControl: {
      minConfidence: 0.65,
      confidenceScaling: true,
    },
  });
  
  // Guardrails (kept separate for backward compatibility, but will merge into entryExit)
  const [guardrails, setGuardrails] = useState({
    allowLong: true,
    allowShort: true,
  });
  
  // Risk
  const [risk, setRisk] = useState<{
    maxDailyLossPct: number | "";
    maxPositionUsd: number | "";
    maxLeverage: number | "";
  }>({
    maxDailyLossPct: 5,
    maxPositionUsd: 10000,
    maxLeverage: 2,
  });

  // Reset model_name when provider changes
  useEffect(() => {
    const models = MODELS_BY_PROVIDER[modelProvider] || [];
    if (models.length > 0 && !models.some(m => m.id === modelName)) {
      setModelName("");
    }
  }, [modelProvider, modelName]);

  // Load initial data if in edit mode
  useEffect(() => {
    if (isEditMode && initialData) {
      setName(initialData.name || "");
      setModelProvider(initialData.model_provider || "deepseek");
      setModelName(initialData.model_name || "");
      setPrompt(initialData.prompt || "");
      // Don't load API key for security - user must re-enter if they want to change it
      setApiKey("");

      // Load filters
      const filters = initialData.filters || {};
      
      // Markets
      if (filters.markets) {
        setSelectedMarkets(filters.markets);
      }

      // Cadence
      let cadenceSecondsValue = filters.cadenceSeconds || 60;
      // Enforce minimum 60 seconds
      if (cadenceSecondsValue < 60) {
        cadenceSecondsValue = 60;
      }
      
      // CRITICAL FIX: If cadence is exactly 60, 120, 180, etc. (multiples of 60),
      // it might be stored incorrectly. Normalize it:
      // - 60 seconds = 0h 1m 0s (not 0h 0m 60s)
      // - 120 seconds = 0h 2m 0s (not 0h 1m 60s)
      const hours = Math.floor(cadenceSecondsValue / 3600);
      const remainingAfterHours = cadenceSecondsValue % 3600;
      const minutes = Math.floor(remainingAfterHours / 60);
      const seconds = remainingAfterHours % 60;
      
      // If seconds > 0 and minutes > 0, this is likely a bug (double-counting)
      // Normalize: convert extra seconds to minutes
      if (seconds > 0 && minutes > 0) {
        console.warn(`[Strategy Form] Detected double-counting bug: ${cadenceSecondsValue}s = ${hours}h ${minutes}m ${seconds}s. Normalizing...`);
        const totalMinutes = minutes + Math.floor(seconds / 60);
        const normalizedSeconds = seconds % 60;
        setCadenceHours(hours);
        setCadenceMinutes(totalMinutes);
        setCadenceSeconds(normalizedSeconds);
      } else {
        setCadenceHours(hours);
        setCadenceMinutes(minutes);
        // If hours=0 and minutes=0, ensure seconds is at least 60
        if (hours === 0 && minutes === 0) {
          setCadenceSeconds(seconds < 60 ? 60 : seconds);
        } else {
          setCadenceSeconds(seconds);
        }
      }

      // AI Inputs
      if (filters.aiInputs) {
        setAiInputs(filters.aiInputs);
      }

      // Entry/Exit
      if (filters.entryExit) {
        // Migration layer: Derive behaviors from mode if behaviors don't exist
        const loadedEntryExit = { ...filters.entryExit };
        if (!loadedEntryExit.entry.behaviors) {
          const mode = loadedEntryExit.entry.mode;
          loadedEntryExit.entry.behaviors = {
            trend: mode === "trend" || mode === "signal",
            breakout: mode === "breakout" || mode === "signal",
            meanReversion: mode === "meanReversion" || mode === "signal",
          };
          console.log(`[Migration] Derived behaviors from entry.mode="${mode}":`, loadedEntryExit.entry.behaviors);
        }
        // Migration: Add new exit fields if missing
        if (!loadedEntryExit.exit.hasOwnProperty('maxLossProtectionPct')) {
          loadedEntryExit.exit.maxLossProtectionPct = null;
        }
        if (!loadedEntryExit.exit.hasOwnProperty('maxProfitCapPct')) {
          loadedEntryExit.exit.maxProfitCapPct = null;
        }
        if (!loadedEntryExit.exit.hasOwnProperty('initialStopLossPct')) {
          loadedEntryExit.exit.initialStopLossPct = null;
        }
        setEntryExit(loadedEntryExit);
      } else {
        // Migrate old format if needed
        if (filters.entryMode || filters.exitMode) {
          const mode = filters.entryMode || "signal";
          setEntryExit({
            entry: {
              mode,
              behaviors: {
                trend: mode === "trend" || mode === "signal",
                breakout: mode === "breakout" || mode === "signal",
                meanReversion: mode === "meanReversion" || mode === "signal",
              },
              confirmation: {
                minSignals: 2,
                requireVolatilityCondition: false,
                volatilityMax: null,
              },
              timing: {
                waitForClose: true,
                maxSlippagePct: 0.005,
              },
            },
            exit: {
              mode: filters.exitMode || "signal",
              maxLossProtectionPct: null,
              maxProfitCapPct: null,
              takeProfitPct: filters.takeProfitPct || 2.0,
              stopLossPct: filters.stopLossPct || 1.0,
              trailingStopPct: filters.trailingStopPct || null,
              initialStopLossPct: null,
              maxHoldMinutes: filters.timeStopMinutes || null,
            },
            tradeControl: filters.tradeFrequency || {
              maxTradesPerHour: 2,
              maxTradesPerDay: 10,
              cooldownMinutes: 15,
              minHoldMinutes: 5,
              allowReentrySameDirection: false,
            },
            confidenceControl: {
              minConfidence: filters.guardrails?.minConfidence || 0.65,
              confidenceScaling: true,
            },
          });
        }
      }

      // Guardrails
      if (filters.guardrails) {
        setGuardrails({
          allowLong: filters.guardrails.allowLong !== false,
          allowShort: filters.guardrails.allowShort !== false,
        });
      }

      // Risk
      if (filters.risk) {
        setRisk({
          maxDailyLossPct: filters.risk.maxDailyLossPct || 5,
          maxPositionUsd: filters.risk.maxPositionUsd || 10000,
          maxLeverage: filters.risk.maxLeverage || 2,
        });
      }
    }
  }, [isEditMode, initialData]);

  // Fetch markets on mount
  useEffect(() => {
    const fetchMarkets = async () => {
      setMarketsLoading(true);
      setMarketsError(false);
      try {
        const response = await fetch("/api/hyperliquid/markets");
        if (response.ok) {
          const data = await response.json();
          setAvailableMarkets(data.markets || []);
        } else {
          setMarketsError(true);
        }
      } catch (err) {
        console.error("Failed to fetch markets:", err);
        setMarketsError(true);
      } finally {
        setMarketsLoading(false);
      }
    };

    fetchMarkets();
  }, []);

  // Load saved API keys when provider changes
  useEffect(() => {
    const loadSavedKeys = async () => {
      if (!modelProvider) {
        setSavedKeys([]);
        return;
      }

      try {
        setLoadingKeys(true);
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          console.warn("No session token available");
          return;
        }

        const response = await fetch("/api/settings/api-keys", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Filter keys for the current provider
          const keysForProvider = (data.keys || []).filter(
            (k: any) => k.provider === modelProvider
          );
          setSavedKeys(keysForProvider);
          
          // If editing and strategy has a saved_api_key_id, select it
          if (isEditMode && initialData?.saved_api_key_id) {
            const matchingKey = keysForProvider.find(
              (k: any) => k.id === initialData.saved_api_key_id
            );
            if (matchingKey) {
              setSelectedSavedKeyId(matchingKey.id);
              setUseManualKey(false);
            } else {
              // Saved key was deleted, fall back to manual
              setSelectedSavedKeyId("");
              setUseManualKey(true);
            }
          } else if (!isEditMode && keysForProvider.length > 0) {
            // For new strategy, default to first saved key if available
            setSelectedSavedKeyId(keysForProvider[0].id);
            setUseManualKey(false);
          } else {
            // No saved keys, use manual
            setSelectedSavedKeyId("");
            setUseManualKey(true);
          }
        }
      } catch (err) {
        console.error("Failed to load saved keys:", err);
      } finally {
        setLoadingKeys(false);
      }
    };

    loadSavedKeys();
  }, [modelProvider, isEditMode, initialData?.saved_api_key_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate required fields (API key only required for new strategies)
    // Either saved key or manual key must be provided
    if (!isEditMode && !selectedSavedKeyId && (!apiKey || !apiKey.trim())) {
      setError("API Key is required - either select a saved key or enter one manually");
      setLoading(false);
      return;
    }

    // Validate cadence
    const totalCadenceSeconds = getTotalCadenceSeconds();
    if (totalCadenceSeconds <= 0) {
      setError("Please set a decision cadence (at least 1 second)");
      setLoading(false);
      return;
    }
    if (totalCadenceSeconds < 60) {
      setError("Minimum AI cadence is 60 seconds (1 minute). The system checks for decisions every minute.");
      setLoading(false);
      return;
    }
    
    // Note: We don't need to validate m > 0 && s > 0 anymore because getTotalCadenceSeconds
    // now automatically ignores seconds when minutes > 0, preventing the double-counting bug

    console.log(`[Strategy Form] Saving strategy with cadence: ${totalCadenceSeconds}s (hours=${cadenceHours}, minutes=${cadenceMinutes}, seconds=${cadenceSeconds})`);

    // Handle manual input if API failed
    let finalMarkets = selectedMarkets;
    if (useManualInput && manualMarketsInput.trim()) {
      finalMarkets = parseManualMarkets(manualMarketsInput);
    }

    if (finalMarkets.length === 0) {
      setError("Please select at least one market");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setError("You must be signed in");
      setLoading(false);
      return;
    }

    // Build filters JSON with new entryExit structure
    const calculatedCadence = getTotalCadenceSeconds();
    console.log(`[Strategy Form] 💾 SAVING strategy with cadence: ${calculatedCadence}s`);
    console.log(`[Strategy Form] 💾 Raw state values: hours=${cadenceHours}, minutes=${cadenceMinutes}, seconds=${cadenceSeconds}`);
    
    // Ensure candles.count is a number before saving
    const aiInputsToSave = {
      ...aiInputs,
      candles: {
        ...aiInputs.candles,
        count: typeof aiInputs.candles.count === "number" ? aiInputs.candles.count : 200,
      },
    };
    
    // Ensure numeric fields are numbers before saving
    const entryExitToSave = {
      ...entryExit,
      entry: {
        ...entryExit.entry,
        timing: {
          ...entryExit.entry.timing,
          maxSlippagePct: typeof entryExit.entry.timing.maxSlippagePct === "number" ? entryExit.entry.timing.maxSlippagePct : 0.15,
        },
        confirmation: {
          ...entryExit.entry.confirmation,
          minSignals: typeof entryExit.entry.confirmation.minSignals === "number" ? entryExit.entry.confirmation.minSignals : 2,
        },
      },
      tradeControl: {
        ...entryExit.tradeControl,
        maxTradesPerHour: typeof entryExit.tradeControl.maxTradesPerHour === "number" ? entryExit.tradeControl.maxTradesPerHour : 2,
        maxTradesPerDay: typeof entryExit.tradeControl.maxTradesPerDay === "number" ? entryExit.tradeControl.maxTradesPerDay : 10,
        cooldownMinutes: typeof entryExit.tradeControl.cooldownMinutes === "number" ? entryExit.tradeControl.cooldownMinutes : 15,
        minHoldMinutes: typeof entryExit.tradeControl.minHoldMinutes === "number" ? entryExit.tradeControl.minHoldMinutes : 5,
      },
      confidenceControl: {
        ...entryExit.confidenceControl,
        minConfidence: typeof entryExit.confidenceControl.minConfidence === "number" ? entryExit.confidenceControl.minConfidence : 0.65,
      },
    };
    
    const filters: any = {
      cadenceSeconds: calculatedCadence,
      markets: finalMarkets,
      aiInputs: aiInputsToSave,
      entryExit: {
        entry: entryExitToSave.entry,
        exit: entryExitToSave.exit,
        tradeControl: entryExitToSave.tradeControl,
        confidenceControl: entryExitToSave.confidenceControl,
      },
      guardrails: {
        minConfidence: entryExit.confidenceControl.minConfidence,
        allowLong: guardrails.allowLong,
        allowShort: guardrails.allowShort,
      },
      risk: {
        maxDailyLossPct: typeof risk.maxDailyLossPct === "number" ? risk.maxDailyLossPct : 5,
        maxPositionUsd: typeof risk.maxPositionUsd === "number" ? risk.maxPositionUsd : 10000,
        maxLeverage: typeof risk.maxLeverage === "number" ? risk.maxLeverage : 2,
      },
    };

    // Use API route to create or update strategy
    const bearer = `Bearer ${session.access_token}`;
    const url = isEditMode ? `/api/strategies/${strategyId}` : "/api/strategies";
    const method = isEditMode ? "PATCH" : "POST";
    
    const body: any = {
      name,
      model_provider: modelProvider,
      model_name: modelName,
      prompt,
      filters,
    };

    // Handle API key: either saved key reference or manual key
    if (!useManualKey && selectedSavedKeyId) {
      // Use saved key reference
      body.saved_api_key_id = selectedSavedKeyId;
      // Clear api_key to indicate we're using saved key
      body.api_key = null;
    } else if (apiKey && apiKey.trim()) {
      // Use manual key (only include if provided for edit mode, or required for create mode)
      body.api_key = apiKey.trim();
      // Clear saved_api_key_id to indicate we're using manual key
      body.saved_api_key_id = null;
    }

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: bearer,
      },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      setError(json.error || `Failed to ${isEditMode ? "update" : "create"} strategy`);
      setLoading(false);
    } else {
      router.push(`/strategy/${json.strategy.id}`);
      router.refresh();
    }
  };

  const toggleMarket = (market: string) => {
    setSelectedMarkets(prev =>
      prev.includes(market)
        ? prev.filter(m => m !== market)
        : [...prev, market]
    );
  };

  const filteredMarkets = availableMarkets.filter(m =>
    m.symbol.toLowerCase().includes(marketSearch.toLowerCase()) ||
    m.display.toLowerCase().includes(marketSearch.toLowerCase())
  );

  const handleSelectAll = () => {
    const symbols = filteredMarkets.map(m => m.symbol);
    setSelectedMarkets(prev => {
      const newSet = new Set([...prev, ...symbols]);
      return Array.from(newSet);
    });
  };

  const handleClear = () => {
    setSelectedMarkets([]);
  };

  const handleSelectMajors = () => {
    setSelectedMarkets(prev => {
      const newSet = new Set([...prev, ...MAJOR_MARKETS]);
      return Array.from(newSet);
    });
  };

  const removeMarket = (market: string) => {
    setSelectedMarkets(prev => prev.filter(m => m !== market));
  };

  const parseManualMarkets = (input: string): string[] => {
    return input
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.toUpperCase().replace(/\s+/g, "-"));
  };

  // Calculate total seconds from hours, minutes, seconds
  const getTotalCadenceSeconds = (): number => {
    const h = typeof cadenceHours === "number" ? cadenceHours : 0;
    const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
    let s = typeof cadenceSeconds === "number" ? cadenceSeconds : 0;

    // CRITICAL FIX: If hours > 0 OR minutes > 0, ALWAYS set seconds to 0 to avoid double-counting
    // This prevents the bug where 1 minute + 60 seconds = 120 seconds
    // The user sets "1 minute" in the UI, which should be 60 seconds, not 120
    // REASON: The seconds field shows "60" when h=0 m=0 as the minimum required value
    // But when user sets minutes to 1, we should use ONLY minutes (60s), not minutes + seconds (120s)
    if (h > 0 || m > 0) {
      // If hours OR minutes are set, ignore the seconds field completely
      // This is the correct behavior: 1 minute = 60 seconds, not 1 minute + 60 seconds
      s = 0;
      console.log(`[getTotalCadenceSeconds] Hours or minutes set (${h}h ${m}m), forcing seconds to 0 to prevent double-counting.`);
    }

    // Enforce minimum 60 seconds if hours and minutes are both 0
    if (h === 0 && m === 0 && s < 60) {
      s = 60;
    }

    const total = (h * 3600) + (m * 60) + s;
    console.log(`[getTotalCadenceSeconds] Final calculation: ${h}h ${m}m ${s}s = ${total}s`);

    return total;
  };

  const formatCadenceDisplay = (): string => {
    const h = typeof cadenceHours === "number" ? cadenceHours : 0;
    const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
    const s = typeof cadenceSeconds === "number" ? cadenceSeconds : 0;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h} hour${h !== 1 ? "s" : ""}`);
    if (m > 0) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
    if (s > 0) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(" ") : "0 seconds";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Strategy Builder</CardTitle>
            <CardDescription className="text-base">
              {isEditMode ? "Update your AI trading strategy settings" : "Configure your AI trading strategy with advanced settings"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  {error}
                </div>
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="basics">Basics</TabsTrigger>
                  <TabsTrigger value="markets">Markets</TabsTrigger>
                  <TabsTrigger value="ai">AI Inputs</TabsTrigger>
                  <TabsTrigger value="entry">Entry/Exit</TabsTrigger>
                  <TabsTrigger value="risk">Risk</TabsTrigger>
                </TabsList>

                <TabsContent value="basics" className="space-y-6 mt-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-semibold">
                      Strategy Name *
                    </label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="e.g., Momentum Scalper v1"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="model_provider" className="text-sm font-semibold">
                      Model Provider *
                    </label>
                    <select
                      id="model_provider"
                      value={modelProvider}
                      onChange={(e) => {
                        setModelProvider(e.target.value);
                        setModelName("");
                      }}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      required
                    >
                      {PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="model_name" className="text-sm font-semibold">
                      Model Name *
                    </label>
                    <select
                      id="model_name"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      required
                      disabled={!modelProvider || (MODELS_BY_PROVIDER[modelProvider] || []).length === 0}
                    >
                      <option value="">
                        {modelProvider
                          ? `Select a ${PROVIDERS.find(p => p.id === modelProvider)?.name || 'provider'} model...`
                          : "Select a provider first..."}
                      </option>
                      {(MODELS_BY_PROVIDER[modelProvider] || []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* API Key Selection - Saved or Manual */}
                  <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold">
                        API Key {!isEditMode && "*"}
                      </label>
                      <a
                        href="/settings"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Manage saved keys →
                      </a>
                    </div>

                    {loadingKeys ? (
                      <div className="text-sm text-muted-foreground py-2">Loading saved keys...</div>
                    ) : (
                      <>
                        {savedKeys.length > 0 && (
                          <div className="space-y-2">
                            <label htmlFor="saved_key_dropdown" className="text-sm font-medium">
                              Use Saved API Key
                            </label>
                            <select
                              id="saved_key_dropdown"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={useManualKey ? "__manual__" : selectedSavedKeyId}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "__manual__") {
                                  setUseManualKey(true);
                                  setSelectedSavedKeyId("");
                                } else {
                                  setUseManualKey(false);
                                  setSelectedSavedKeyId(value);
                                  setApiKey(""); // Clear manual key when switching to saved
                                }
                              }}
                            >
                              {savedKeys.map((key) => (
                                <option key={key.id} value={key.id}>
                                  {key.label} ({key.key_preview})
                                </option>
                              ))}
                              <option value="__manual__">✎ Manual / Paste Key</option>
                            </select>
                            <p className="text-xs text-muted-foreground">
                              Select a saved key or choose "Manual" to paste a key directly
                            </p>
                          </div>
                        )}

                        {(useManualKey || savedKeys.length === 0) && (
                          <div className="space-y-2">
                            <label htmlFor="api_key" className="text-sm font-medium">
                              {savedKeys.length > 0 ? "Manual API Key" : "API Key"} {!isEditMode && "*"}
                            </label>
                            <Input
                              id="api_key"
                              type="password"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={isEditMode ? "Leave blank to keep existing key" : "sk-..."}
                              required={!isEditMode && (useManualKey || savedKeys.length === 0)}
                              className="h-10"
                            />
                            <p className="text-xs text-muted-foreground">
                              {isEditMode 
                                ? "Leave blank to keep existing key, or enter new key to update"
                                : savedKeys.length === 0
                                ? `No saved keys for ${modelProvider}. Save keys in Settings to reuse them.`
                                : "Paste your API key directly"}
                            </p>
                          </div>
                        )}

                        {!useManualKey && selectedSavedKeyId && (
                          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                            </svg>
                            <span>Using saved key - no need to paste</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="prompt" className="text-sm font-semibold">
                      Trading Prompt *
                    </label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={10}
                      placeholder="Enter your trading strategy prompt..."
                      required
                      className="resize-none font-mono text-sm"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="markets" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-semibold mb-3 block">
                        Select Markets *
                      </label>

                      {marketsError && !useManualInput && (
                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                            Could not load Hyperliquid markets. You can enter symbols manually.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setUseManualInput(true)}
                          >
                            Switch to Manual Input
                          </Button>
                        </div>
                      )}

                      {useManualInput ? (
                        <div className="space-y-2">
                          <Textarea
                            value={manualMarketsInput}
                            onChange={(e) => setManualMarketsInput(e.target.value)}
                            placeholder="Enter one market symbol per line (e.g., BTC-PERP, ETH-PERP)"
                            rows={6}
                            className="font-mono text-sm"
                          />
                          <p className="text-xs text-muted-foreground">
                            Enter one symbol per line. Symbols will be normalized (uppercase, hyphens).
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUseManualInput(false);
                              setManualMarketsInput("");
                            }}
                          >
                            Try Loading Markets Again
                          </Button>
                        </div>
                      ) : (
                        <>
                          {marketsLoading ? (
                            <p className="text-sm text-muted-foreground">Loading markets...</p>
                          ) : (
                            <>
                              {/* Search input */}
                              <Input
                                type="text"
                                placeholder="Search markets..."
                                value={marketSearch}
                                onChange={(e) => setMarketSearch(e.target.value)}
                                className="mb-3"
                              />

                              {/* Action buttons */}
                              <div className="flex flex-wrap gap-2 mb-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSelectAll}
                                  disabled={filteredMarkets.length === 0}
                                >
                                  Select All Filtered ({filteredMarkets.length})
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSelectMajors}
                                >
                                  Select Majors (BTC/ETH/SOL)
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleClear}
                                  disabled={selectedMarkets.length === 0}
                                >
                                  Clear ({selectedMarkets.length})
                                </Button>
                              </div>

                              {/* Selected chips */}
                              {selectedMarkets.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Selected: {selectedMarkets.length} market{selectedMarkets.length !== 1 ? "s" : ""}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedMarkets.map((market) => (
                                      <div
                                        key={market}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm"
                                      >
                                        <span>{market}</span>
                                        <button
                                          type="button"
                                          onClick={() => removeMarket(market)}
                                          className="hover:bg-primary/20 rounded px-1"
                                          aria-label={`Remove ${market}`}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Market list */}
                              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                                {filteredMarkets.length === 0 ? (
                                  <p className="p-4 text-sm text-muted-foreground text-center">
                                    {marketSearch ? "No markets match your search" : "No markets available"}
                                  </p>
                                ) : (
                                  <div className="divide-y">
                                    {filteredMarkets.map((market) => {
                                      const isSelected = selectedMarkets.includes(market.symbol);
                                      return (
                                        <div
                                          key={market.symbol}
                                          className={`flex items-center space-x-2 p-2 hover:bg-muted/50 cursor-pointer ${
                                            isSelected ? "bg-primary/5" : ""
                                          }`}
                                          onClick={() => toggleMarket(market.symbol)}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleMarket(market.symbol)}
                                            className="h-4 w-4 rounded border-gray-300"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <label className="text-sm cursor-pointer flex-1">
                                            {market.display}
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold">
                        Decision Cadence *
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="cadence-hours" className="text-xs text-muted-foreground">
                            Hours
                          </label>
                          <Input
                            id="cadence-hours"
                            type="number"
                            min="0"
                            value={cadenceHours}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setCadenceHours("");
                              } else {
                                const num = parseInt(val);
                                if (!isNaN(num)) {
                                  setCadenceHours(Math.max(0, num));
                                }
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "") {
                                setCadenceHours(0);
                              }
                              // If hours changed to 0 and minutes=0, ensure seconds >= 60
                              const currentHours = typeof cadenceHours === "number" ? cadenceHours : (e.target.value ? parseInt(e.target.value) || 0 : 0);
                              if (currentHours === 0 && cadenceMinutes === 0) {
                                const currentSeconds = typeof cadenceSeconds === "number" ? cadenceSeconds : 0;
                                if (currentSeconds < 60) {
                                  setCadenceSeconds(60);
                                }
                              }
                            }}
                            placeholder="0"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="cadence-minutes" className="text-xs text-muted-foreground">
                            Minutes
                          </label>
                          <Input
                            id="cadence-minutes"
                            type="number"
                            min="0"
                            max="59"
                            value={cadenceMinutes}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setCadenceMinutes("");
                              } else {
                                const num = parseInt(val);
                                if (!isNaN(num)) {
                                  const newMinutes = Math.max(0, Math.min(59, num));
                                  setCadenceMinutes(newMinutes);
                                  // CRITICAL FIX: When minutes > 0, set seconds to 0 to avoid double-counting
                                  // Example: 1 minute should be 60 seconds total, not 60 + 60 = 120 seconds
                                  if (newMinutes > 0 && typeof cadenceSeconds === "number" && cadenceSeconds > 0) {
                                    setCadenceSeconds(0);
                                  }
                                }
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "") {
                                setCadenceMinutes(0);
                              }
                            }}
                            placeholder="0"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="cadence-seconds" className="text-xs text-muted-foreground">
                            Seconds
                          </label>
                          <Input
                            id="cadence-seconds"
                            type="number"
                            min={cadenceHours === 0 && cadenceMinutes === 0 ? undefined : "0"}
                            max={cadenceHours === 0 && cadenceMinutes === 0 ? undefined : "59"}
                            disabled={cadenceHours === 0 && cadenceMinutes === 0}
                            title={cadenceHours === 0 && cadenceMinutes === 0 ? "Minimum cadence: 60 seconds" : undefined}
                            value={(() => {
                              const h = typeof cadenceHours === "number" ? cadenceHours : 0;
                              const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
                              // If hours=0 and minutes=0, ALWAYS return 60, no exceptions
                              if (h === 0 && m === 0) {
                                return 60; // ALWAYS return 60 - don't update state here
                              }
                              return cadenceSeconds;
                            })()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const h = typeof cadenceHours === "number" ? cadenceHours : 0;
                              const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
                              
                              // If hours=0 and minutes=0, seconds field is read-only - prevent any changes
                              if (h === 0 && m === 0) {
                                // Immediately reset to 60, no matter what user types
                                setCadenceSeconds(60);
                                return;
                              }
                              
                              if (val === "") {
                                setCadenceSeconds("");
                                return;
                              }
                              
                              const num = parseInt(val);
                              if (!isNaN(num)) {
                                // Normal range 0-59 when hours or minutes > 0
                                setCadenceSeconds(Math.max(0, Math.min(59, num)));
                              }
                            }}
                            onKeyDown={(e) => {
                              // Prevent typing when hours=0 and minutes=0
                              const h = typeof cadenceHours === "number" ? cadenceHours : 0;
                              const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
                              if (h === 0 && m === 0) {
                                // Prevent all key input except navigation keys
                                if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) {
                                  e.preventDefault();
                                }
                                setCadenceSeconds(60);
                              }
                            }}
                            onInput={(e) => {
                              // Additional safeguard - prevent any input when hours=0 and minutes=0
                              const h = typeof cadenceHours === "number" ? cadenceHours : 0;
                              const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
                              if (h === 0 && m === 0) {
                                const target = e.target as HTMLInputElement;
                                if (target.value !== "60") {
                                  target.value = "60";
                                  setCadenceSeconds(60);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const h = typeof cadenceHours === "number" ? cadenceHours : 0;
                              const m = typeof cadenceMinutes === "number" ? cadenceMinutes : 0;
                              
                              if (e.target.value === "") {
                                // If hours and minutes are 0, default to 60 seconds
                                if (h === 0 && m === 0) {
                                  setCadenceSeconds(60);
                                } else {
                                  setCadenceSeconds(0);
                                }
                              } else {
                                // Ensure minimum 60 seconds if hours and minutes are 0
                                const currentSeconds = typeof cadenceSeconds === "number" ? cadenceSeconds : parseInt(e.target.value) || 0;
                                if (h === 0 && m === 0) {
                                  if (currentSeconds < 60) {
                                    setCadenceSeconds(60);
                                  }
                                }
                              }
                            }}
                            placeholder={cadenceHours === 0 && cadenceMinutes === 0 ? "60" : "30"}
                            className="h-11"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        How often the AI will evaluate the market and make decisions
                      </p>
                      {getTotalCadenceSeconds() > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Total: {formatCadenceDisplay()} ({getTotalCadenceSeconds()} seconds)
                        </p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="ai" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-semibold">Candles Data</label>
                        <p className="text-xs text-muted-foreground">Historical price candles</p>
                      </div>
                      <Switch
                        checked={aiInputs.candles.enabled}
                        onCheckedChange={(checked) =>
                          setAiInputs(prev => ({
                            ...prev,
                            candles: { ...prev.candles, enabled: checked },
                          }))
                        }
                      />
                    </div>
                    {aiInputs.candles.enabled && (
                      <div className="pl-4 space-y-2 border-l-2">
                        <Input
                          type="number"
                          value={aiInputs.candles.count}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAiInputs(prev => ({
                              ...prev,
                              candles: { 
                                ...prev.candles, 
                                count: value === "" ? "" : parseInt(value) || prev.candles.count 
                              },
                            }));
                          }}
                          onBlur={(e) => {
                            // When user leaves the field, ensure it has a valid number
                            if (e.target.value === "" || parseInt(e.target.value) < 1) {
                              setAiInputs(prev => ({
                                ...prev,
                                candles: { ...prev.candles, count: 200 },
                              }));
                            }
                          }}
                          placeholder="Count"
                          className="h-9"
                        />
                        <Input
                          value={aiInputs.candles.timeframe}
                          onChange={(e) =>
                            setAiInputs(prev => ({
                              ...prev,
                              candles: { ...prev.candles, timeframe: e.target.value },
                            }))
                          }
                          placeholder="Timeframe (e.g., 5m)"
                          className="h-9"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-semibold">Orderbook</label>
                        <p className="text-xs text-muted-foreground">Order book depth</p>
                      </div>
                      <Switch
                        checked={aiInputs.orderbook.enabled}
                        onCheckedChange={(checked) =>
                          setAiInputs(prev => ({
                            ...prev,
                            orderbook: { ...prev.orderbook, enabled: checked },
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-semibold">Technical Indicators</label>
                      <div className="space-y-2 pl-4 border-l-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">RSI</span>
                          <Switch
                            checked={aiInputs.indicators.rsi.enabled}
                            onCheckedChange={(checked) =>
                              setAiInputs(prev => ({
                                ...prev,
                                indicators: {
                                  ...prev.indicators,
                                  rsi: { ...prev.indicators.rsi, enabled: checked },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">ATR</span>
                          <Switch
                            checked={aiInputs.indicators.atr.enabled}
                            onCheckedChange={(checked) =>
                              setAiInputs(prev => ({
                                ...prev,
                                indicators: {
                                  ...prev.indicators,
                                  atr: { ...prev.indicators.atr, enabled: checked },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Volatility</span>
                          <Switch
                            checked={aiInputs.indicators.volatility.enabled}
                            onCheckedChange={(checked) =>
                              setAiInputs(prev => ({
                                ...prev,
                                indicators: {
                                  ...prev.indicators,
                                  volatility: { ...prev.indicators.volatility, enabled: checked },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">EMA</span>
                          <Switch
                            checked={aiInputs.indicators.ema.enabled}
                            onCheckedChange={(checked) =>
                              setAiInputs(prev => ({
                                ...prev,
                                indicators: {
                                  ...prev.indicators,
                                  ema: { ...prev.indicators.ema, enabled: checked },
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-semibold">Include Position State</label>
                        <p className="text-xs text-muted-foreground">Current open positions</p>
                      </div>
                      <Switch
                        checked={aiInputs.includePositionState}
                        onCheckedChange={(checked) =>
                          setAiInputs(prev => ({ ...prev, includePositionState: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-semibold">Include Recent Decisions</label>
                        <p className="text-xs text-muted-foreground">Previous AI decisions</p>
                      </div>
                      <Switch
                        checked={aiInputs.includeRecentDecisions}
                        onCheckedChange={(checked) =>
                          setAiInputs(prev => ({ ...prev, includeRecentDecisions: checked }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="entry" className="space-y-6 mt-6">
                  {/* Entry Configuration */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Entry Configuration</CardTitle>
                      <CardDescription>Control when and how trades are entered</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-semibold">Entry Behaviors</label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Control what types of entries the AI is allowed to take (guardrails)
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="space-y-0.5">
                              <label className="text-sm font-medium">Allow Trend-Following Entries</label>
                              <p className="text-xs text-muted-foreground">
                                Enter when price is moving in a clear trend direction
                              </p>
                            </div>
                            <Switch
                              checked={entryExit.entry.behaviors.trend}
                              onCheckedChange={(checked) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    behaviors: { ...prev.entry.behaviors, trend: checked },
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="space-y-0.5">
                              <label className="text-sm font-medium">Allow Breakout Entries</label>
                              <p className="text-xs text-muted-foreground">
                                Enter when price breaks through key support/resistance levels
                              </p>
                            </div>
                            <Switch
                              checked={entryExit.entry.behaviors.breakout}
                              onCheckedChange={(checked) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    behaviors: { ...prev.entry.behaviors, breakout: checked },
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="space-y-0.5">
                              <label className="text-sm font-medium">Allow Mean-Reversion Entries</label>
                              <p className="text-xs text-muted-foreground">
                                Enter when price deviates significantly from its average
                              </p>
                            </div>
                            <Switch
                              checked={entryExit.entry.behaviors.meanReversion}
                              onCheckedChange={(checked) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    behaviors: { ...prev.entry.behaviors, meanReversion: checked },
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-4 space-y-4">
                        <h4 className="text-sm font-semibold">Entry Confirmation</h4>
                        
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Minimum Signals Required</label>
                          <Input
                            type="number"
                            min="1"
                            max="5"
                            value={entryExit.entry.confirmation.minSignals}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEntryExit(prev => ({
                                ...prev,
                                entry: {
                                  ...prev.entry,
                                  confirmation: {
                                    ...prev.entry.confirmation,
                                    minSignals: value === "" ? "" : parseInt(value),
                                  },
                                },
                              }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "" || parseInt(e.target.value) < 1) {
                                setEntryExit(prev => ({
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    confirmation: {
                                      ...prev.entry.confirmation,
                                      minSignals: 2,
                                    },
                                  },
                                }));
                              }
                            }}
                            className="h-11"
                          />
                          <p className="text-xs text-muted-foreground">
                            Require multiple confirming signals before entry (1-5)
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <label className="text-sm font-medium">Require Volatility Condition</label>
                            <p className="text-xs text-muted-foreground">
                              Only enter when volatility is within limits
                            </p>
                          </div>
                          <Switch
                            checked={entryExit.entry.confirmation.requireVolatilityCondition}
                            onCheckedChange={(checked) =>
                              setEntryExit(prev => ({
                                ...prev,
                                entry: {
                                  ...prev.entry,
                                  confirmation: {
                                    ...prev.entry.confirmation,
                                    requireVolatilityCondition: checked,
                                  },
                                },
                              }))
                            }
                          />
                        </div>

                        {entryExit.entry.confirmation.requireVolatilityCondition && (
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Max Volatility %</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.entry.confirmation.volatilityMax || ""}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    confirmation: {
                                      ...prev.entry.confirmation,
                                      volatilityMax: e.target.value ? parseFloat(e.target.value) : null,
                                    },
                                  },
                                }))
                              }
                              className="h-11"
                              placeholder="e.g., 5.0"
                            />
                            <p className="text-xs text-muted-foreground">
                              Maximum volatility percentage to allow entry
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="border-t pt-4 space-y-4">
                        <h4 className="text-sm font-semibold">Entry Timing</h4>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Max Slippage %</label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={
                              entryExit.entry.timing.maxSlippagePct === "" 
                                ? "" 
                                : typeof entryExit.entry.timing.maxSlippagePct === "number"
                                ? entryExit.entry.timing.maxSlippagePct * 100
                                : 0.5
                            }
                            onChange={(e) => {
                              const value = e.target.value;
                              setEntryExit(prev => ({
                                ...prev,
                                entry: {
                                  ...prev.entry,
                                  timing: {
                                    ...prev.entry.timing,
                                    maxSlippagePct: value === "" ? "" : parseFloat(value) / 100,
                                  },
                                },
                              }));
                            }}
                            onBlur={(e) => {
                              // When user leaves the field, ensure it has a valid number
                              if (e.target.value === "" || parseFloat(e.target.value) < 0) {
                                setEntryExit(prev => ({
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    timing: {
                                      ...prev.entry.timing,
                                      maxSlippagePct: 0.005,
                                    },
                                  },
                                }));
                              }
                            }}
                            className="h-11"
                          />
                          <p className="text-xs text-muted-foreground">
                            Maximum acceptable slippage percentage (e.g., 10 = 10%, 20 = 20%, max 100%)
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Exit Configuration */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Exit Configuration</CardTitle>
                      <CardDescription>Control when and how positions are closed</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Exit Mode *</label>
                        <Select
                          value={entryExit.exit.mode}
                          onValueChange={(v: any) =>
                            setEntryExit(prev => ({
                              ...prev,
                              exit: { ...prev.exit, mode: v },
                            }))
                          }
                          className="h-11"
                        >
                          <SelectItem value="signal">Signal (AI-driven)</SelectItem>
                          <SelectItem value="tp_sl">Take Profit / Stop Loss</SelectItem>
                          <SelectItem value="trailing">Trailing Stop</SelectItem>
                          <SelectItem value="time">Time-Based</SelectItem>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          How positions are automatically closed
                        </p>
                      </div>

                      {/* Signal mode: Show optional safety guardrails */}
                      {entryExit.exit.mode === "signal" && (
                        <>
                          <div className="border-t pt-4">
                            <h4 className="text-sm font-semibold mb-2">Optional Safety Guardrails</h4>
                            <p className="text-xs text-muted-foreground mb-4">
                              Emergency limits that override AI decisions (optional)
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Max Loss Protection %</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.exit.maxLossProtectionPct || ""}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  exit: {
                                    ...prev.exit,
                                    maxLossProtectionPct: e.target.value ? parseFloat(e.target.value) : null,
                                  },
                                }))
                              }
                              className="h-11"
                              placeholder="e.g., 5.0 (leave empty to disable)"
                            />
                            <p className="text-xs text-muted-foreground">
                              Force close if loss reaches this % (emergency override)
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Max Profit Cap % (optional)</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.exit.maxProfitCapPct || ""}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  exit: {
                                    ...prev.exit,
                                    maxProfitCapPct: e.target.value ? parseFloat(e.target.value) : null,
                                  },
                                }))
                              }
                              className="h-11"
                              placeholder="e.g., 10.0 (leave empty to disable)"
                            />
                            <p className="text-xs text-muted-foreground">
                              Force close if profit reaches this % (optional cap)
                            </p>
                          </div>
                        </>
                      )}

                      {/* TP/SL mode: Show take profit and stop loss */}
                      {entryExit.exit.mode === "tp_sl" && (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Take Profit %</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.exit.takeProfitPct}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  exit: {
                                    ...prev.exit,
                                    takeProfitPct: parseFloat(e.target.value) || 2.0,
                                  },
                                }))
                              }
                              className="h-11"
                            />
                            <p className="text-xs text-muted-foreground">
                              Percentage gain to trigger take profit
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Stop Loss %</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.exit.stopLossPct}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  exit: {
                                    ...prev.exit,
                                    stopLossPct: parseFloat(e.target.value) || 1.0,
                                  },
                                }))
                              }
                              className="h-11"
                            />
                            <p className="text-xs text-muted-foreground">
                              Percentage loss to trigger stop loss
                            </p>
                          </div>
                        </>
                      )}

                      {/* Trailing mode: Show trailing stop + optional initial hard stop */}
                      {entryExit.exit.mode === "trailing" && (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Trailing Stop %</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.exit.trailingStopPct || ""}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  exit: {
                                    ...prev.exit,
                                    trailingStopPct: e.target.value ? parseFloat(e.target.value) : null,
                                  },
                                }))
                              }
                              className="h-11"
                              placeholder="e.g., 2.0"
                            />
                            <p className="text-xs text-muted-foreground">
                              Percentage below peak price to trigger trailing stop
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Initial Stop Loss % (optional)</label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={entryExit.exit.initialStopLossPct || ""}
                              onChange={(e) =>
                                setEntryExit(prev => ({
                                  ...prev,
                                  exit: {
                                    ...prev.exit,
                                    initialStopLossPct: e.target.value ? parseFloat(e.target.value) : null,
                                  },
                                }))
                              }
                              className="h-11"
                              placeholder="e.g., 3.0 (leave empty to disable)"
                            />
                            <p className="text-xs text-muted-foreground">
                              Hard stop loss before trailing activates (optional)
                            </p>
                          </div>
                        </>
                      )}

                      {entryExit.exit.mode === "time" && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Max Hold Time (minutes)</label>
                          <Input
                            type="number"
                            min="1"
                            value={entryExit.exit.maxHoldMinutes || ""}
                            onChange={(e) =>
                              setEntryExit(prev => ({
                                ...prev,
                                exit: {
                                  ...prev.exit,
                                  maxHoldMinutes: e.target.value ? parseInt(e.target.value) : null,
                                },
                              }))
                            }
                            className="h-11"
                            placeholder="e.g., 60"
                          />
                          <p className="text-xs text-muted-foreground">
                            Maximum time to hold a position before forced exit
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Trade Control */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Trade Control</CardTitle>
                      <CardDescription>Limit trade frequency and prevent overtrading</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Max Trades Per Hour</label>
                          <Input
                            type="number"
                            min="1"
                            value={entryExit.tradeControl.maxTradesPerHour}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEntryExit(prev => ({
                                ...prev,
                                tradeControl: {
                                  ...prev.tradeControl,
                                  maxTradesPerHour: value === "" ? "" : parseInt(value) || prev.tradeControl.maxTradesPerHour,
                                },
                              }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "" || parseInt(e.target.value) < 1) {
                                setEntryExit(prev => ({
                                  ...prev,
                                  tradeControl: {
                                    ...prev.tradeControl,
                                    maxTradesPerHour: 2,
                                  },
                                }));
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Max Trades Per Day</label>
                          <Input
                            type="number"
                            min="1"
                            value={entryExit.tradeControl.maxTradesPerDay}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEntryExit(prev => ({
                                ...prev,
                                tradeControl: {
                                  ...prev.tradeControl,
                                  maxTradesPerDay: value === "" ? "" : parseInt(value) || prev.tradeControl.maxTradesPerDay,
                                },
                              }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "" || parseInt(e.target.value) < 1) {
                                setEntryExit(prev => ({
                                  ...prev,
                                  tradeControl: {
                                    ...prev.tradeControl,
                                    maxTradesPerDay: 10,
                                  },
                                }));
                              }
                            }}
                            className="h-11"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Cooldown (minutes)</label>
                          <Input
                            type="number"
                            min="0"
                            value={entryExit.tradeControl.cooldownMinutes}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEntryExit(prev => ({
                                ...prev,
                                tradeControl: {
                                  ...prev.tradeControl,
                                  cooldownMinutes: value === "" ? "" : parseInt(value) || prev.tradeControl.cooldownMinutes,
                                },
                              }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "" || parseInt(e.target.value) < 0) {
                                setEntryExit(prev => ({
                                  ...prev,
                                  tradeControl: {
                                    ...prev.tradeControl,
                                    cooldownMinutes: 15,
                                  },
                                }));
                              }
                            }}
                            className="h-11"
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum time between trades
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Min Hold Time (minutes)</label>
                          <Input
                            type="number"
                            min="0"
                            value={entryExit.tradeControl.minHoldMinutes}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEntryExit(prev => ({
                                ...prev,
                                tradeControl: {
                                  ...prev.tradeControl,
                                  minHoldMinutes: value === "" ? "" : parseInt(value) || prev.tradeControl.minHoldMinutes,
                                },
                              }));
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "" || parseInt(e.target.value) < 0) {
                                setEntryExit(prev => ({
                                  ...prev,
                                  tradeControl: {
                                    ...prev.tradeControl,
                                    minHoldMinutes: 5,
                                  },
                                }));
                              }
                            }}
                            className="h-11"
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum time to hold before exit
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">Allow Re-entry Same Direction</label>
                          <p className="text-xs text-muted-foreground">
                            Allow opening new position in same direction after closing
                          </p>
                        </div>
                        <Switch
                          checked={entryExit.tradeControl.allowReentrySameDirection}
                          onCheckedChange={(checked) =>
                            setEntryExit(prev => ({
                              ...prev,
                              tradeControl: {
                                ...prev.tradeControl,
                                allowReentrySameDirection: checked,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Confidence Control */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Confidence Control</CardTitle>
                      <CardDescription>Control AI decision confidence thresholds</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Minimum Confidence *</label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={
                            entryExit.confidenceControl.minConfidence === "" 
                              ? "" 
                              : typeof entryExit.confidenceControl.minConfidence === "number"
                              ? Math.round(entryExit.confidenceControl.minConfidence * 100)
                              : 65
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setEntryExit(prev => ({
                              ...prev,
                              confidenceControl: {
                                ...prev.confidenceControl,
                                minConfidence: value === "" ? "" : (parseFloat(value) / 100) || prev.confidenceControl.minConfidence,
                              },
                            }));
                          }}
                          onBlur={(e) => {
                            // When user leaves the field, ensure it has a valid number
                            if (e.target.value === "" || parseFloat(e.target.value) < 0) {
                              setEntryExit(prev => ({
                                ...prev,
                                confidenceControl: {
                                  ...prev.confidenceControl,
                                  minConfidence: 0.65,
                                },
                              }));
                            }
                          }}
                          className="h-11"
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum AI confidence percentage required to execute trade (e.g., 65 = 65%, 80 = 80%)
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">Confidence Scaling</label>
                          <p className="text-xs text-muted-foreground">
                            Scale position size based on confidence level
                          </p>
                        </div>
                        <Switch
                          checked={entryExit.confidenceControl.confidenceScaling}
                          onCheckedChange={(checked) =>
                            setEntryExit(prev => ({
                              ...prev,
                              confidenceControl: {
                                ...prev.confidenceControl,
                                confidenceScaling: checked,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="risk" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Max Daily Loss (%)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={risk.maxDailyLossPct}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRisk(prev => ({
                            ...prev,
                            maxDailyLossPct: value === "" ? "" : parseFloat(value) || prev.maxDailyLossPct,
                          }));
                        }}
                        onBlur={(e) => {
                          if (e.target.value === "" || parseFloat(e.target.value) < 0) {
                            setRisk(prev => ({
                              ...prev,
                              maxDailyLossPct: 5,
                            }));
                          }
                        }}
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Max Position Size (USD)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={risk.maxPositionUsd}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRisk(prev => ({
                            ...prev,
                            maxPositionUsd: value === "" ? "" : parseFloat(value) || prev.maxPositionUsd,
                          }));
                        }}
                        onBlur={(e) => {
                          if (e.target.value === "" || parseFloat(e.target.value) < 0) {
                            setRisk(prev => ({
                              ...prev,
                              maxPositionUsd: 10000,
                            }));
                          }
                        }}
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Max Leverage</label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          min="1"
                          value={risk.maxLeverage}
                          onChange={(e) => {
                            const value = e.target.value;
                            setRisk(prev => ({
                              ...prev,
                              maxLeverage: value === "" ? "" : parseFloat(value) || prev.maxLeverage,
                            }));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === "" || parseFloat(e.target.value) < 1) {
                              setRisk(prev => ({
                                ...prev,
                                maxLeverage: 2,
                              }));
                            }
                          }}
                          className="h-11 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                          x
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-semibold">Allow Long Positions</label>
                        <p className="text-xs text-muted-foreground">Buy/Go long</p>
                      </div>
                      <Switch
                        checked={guardrails.allowLong}
                        onCheckedChange={(checked) =>
                          setGuardrails(prev => ({ ...prev, allowLong: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-semibold">Allow Short Positions</label>
                        <p className="text-xs text-muted-foreground">Sell/Go short</p>
                      </div>
                      <Switch
                        checked={guardrails.allowShort}
                        onCheckedChange={(checked) =>
                          setGuardrails(prev => ({ ...prev, allowShort: checked }))
                        }
                      />
                    </div>

                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="flex-1"
                >
                  {loading ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Strategy" : "Create Strategy")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-muted-foreground">Markets</div>
              <div className="font-medium">
                {useManualInput
                  ? manualMarketsInput.trim()
                    ? `${parseManualMarkets(manualMarketsInput).length} markets (manual)`
                    : "None entered"
                  : selectedMarkets.length > 0
                  ? `${selectedMarkets.length} selected`
                  : "None selected"}
              </div>
              {!useManualInput && selectedMarkets.length > 0 && selectedMarkets.length <= 5 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedMarkets.join(", ")}
                </div>
              )}
            </div>
            <div>
              <div className="text-muted-foreground">Cadence</div>
              <div className="font-medium">
                {getTotalCadenceSeconds() > 0 ? formatCadenceDisplay() : "Not set"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Entry Behaviors</div>
              <div className="font-medium">
                {[
                  entryExit.entry.behaviors.trend && "Trend",
                  entryExit.entry.behaviors.breakout && "Breakout",
                  entryExit.entry.behaviors.meanReversion && "Mean Reversion",
                ]
                  .filter(Boolean)
                  .join(", ") || "None (No entries allowed)"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Exit Strategy</div>
              <div className="font-medium">
                {entryExit.exit.mode === "signal" && "AI-Driven"}
                {entryExit.exit.mode === "tp_sl" && `TP/SL: ${entryExit.exit.takeProfitPct}% / ${entryExit.exit.stopLossPct}%`}
                {entryExit.exit.mode === "trailing" && `Trailing: ${entryExit.exit.trailingStopPct || 0}%`}
                {entryExit.exit.mode === "time" && `Time: ${entryExit.exit.maxHoldMinutes || 0}min`}
              </div>
              {entryExit.exit.mode === "signal" && (entryExit.exit.maxLossProtectionPct || entryExit.exit.maxProfitCapPct) && (
                <div className="text-xs text-muted-foreground mt-1">
                  Guardrails: 
                  {entryExit.exit.maxLossProtectionPct && ` Max Loss ${entryExit.exit.maxLossProtectionPct}%`}
                  {entryExit.exit.maxProfitCapPct && ` Max Profit ${entryExit.exit.maxProfitCapPct}%`}
                </div>
              )}
              {entryExit.exit.mode === "trailing" && entryExit.exit.initialStopLossPct && (
                <div className="text-xs text-muted-foreground mt-1">
                  Initial Stop: {entryExit.exit.initialStopLossPct}%
                </div>
              )}
            </div>
            <div>
              <div className="text-muted-foreground">Max Position</div>
              <div className="font-medium">
                ${typeof risk.maxPositionUsd === "number" ? risk.maxPositionUsd.toLocaleString() : "10,000"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Max Leverage</div>
              <div className="font-medium">
                {typeof risk.maxLeverage === "number" ? risk.maxLeverage : 2}x
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Min Confidence</div>
              <div className="font-medium">
                {typeof entryExit.confidenceControl.minConfidence === "number" 
                  ? `${(entryExit.confidenceControl.minConfidence * 100).toFixed(0)}%` 
                  : "65%"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
