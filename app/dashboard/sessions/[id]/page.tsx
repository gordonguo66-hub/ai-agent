"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/auth-guard";
import { createClient } from "@/lib/supabase/browser";
import { getBearerToken } from "@/lib/api/clientAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EquityCurveChart } from "@/components/equity-curve-chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcTotals, calcUnrealizedPnl, calcPositionValue, verifyReconciliation } from "@/lib/accounting/pnl";
import { SessionErrorBoundary } from "@/components/session-error-boundary";
import { getSessionBadgeConfig } from "@/lib/utils/sessionDisplay";
import { FormattedDate } from "@/components/formatted-date";

function SessionDetailContent({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [positionPrices, setPositionPrices] = useState<Record<string, number>>({});
  // Session-level performance metrics are derived from trades/equity; no local state needed
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);
  const [equityPointsData, setEquityPointsData] = useState<any[]>([]);
  // Separate state for status to prevent effect re-runs when session object updates
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [waitingForFreshData, setWaitingForFreshData] = useState(false);
  const [arenaEntry, setArenaEntry] = useState<any>(null);
  const [debugContextOpen, setDebugContextOpen] = useState(false);
  const [debugContext, setDebugContext] = useState<any>(null);
  const [loadingDebugContext, setLoadingDebugContext] = useState(false);
  const [selectedDebugMarket, setSelectedDebugMarket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  // Track equity chart timerange for server-side filtering
  const [equityTimeRange, setEquityTimeRange] = useState<{ start: number; end: number } | null>(null);
  // Use ref to store latest time range for auto-refresh (prevents stale closure)
  const equityTimeRangeRef = useRef<{ start: number; end: number } | null>(null);
  // Track selected time range (controlled state to prevent reset on remount)
  const [selectedTimeRange, setSelectedTimeRange] = useState<"all" | "today" | "24h" | "72h" | "week" | "month" | "custom">("all");

  // Track if loadAll is currently running to prevent race conditions
  const loadingRef = useRef(false);
  // Track the last load time to prevent rapid successive calls
  const lastLoadTimeRef = useRef(0);
  // Track source of last load (auto-refresh vs time-range-change vs manual)
  const lastLoadSourceRef = useRef<'auto-refresh' | 'time-range' | 'initial' | 'manual'>('initial');
  const LOAD_DEBOUNCE_MS = 3000; // Minimum 3 seconds between loads (prevents race conditions)
  const TIME_RANGE_DEBOUNCE_MS = 500; // Faster debounce for time range changes (better UX)

  useEffect(() => {
    // CRITICAL: Clear stale equity data immediately on mount
    // This prevents showing old data from previous page visits
    console.log(`[Mount] 🧹 Clearing stale equity data for session ${sessionId}`);
    setEquityPointsData([]);
    
    // Initial load
    loadAll('initial');

    // Auto-refresh every 10 seconds, but only if not already loading and enough time has passed
    const refreshInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastLoad = now - lastLoadTimeRef.current;

      if (loadingRef.current) {
        console.log(`[Auto-refresh] Skipping refresh - loadAll already in progress`);
        return;
      }

      if (timeSinceLastLoad < LOAD_DEBOUNCE_MS) {
        console.log(`[Auto-refresh] Skipping refresh - only ${timeSinceLastLoad}ms since last load (min: ${LOAD_DEBOUNCE_MS}ms)`);
        return;
      }

      // CRITICAL: Use ref to get latest time range (prevents stale closure)
      const currentTimeRange = equityTimeRangeRef.current;
      console.log(`[Auto-refresh] Triggering refresh with current equityTimeRange:`, currentTimeRange);
      loadAll('auto-refresh');
    }, 10000); // Increased from 5s to 10s to reduce race conditions

    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Sync ref with state to prevent stale closures in auto-refresh
  useEffect(() => {
    equityTimeRangeRef.current = equityTimeRange;
    console.log(`[Equity Timerange Sync] ✅ Updated ref:`, equityTimeRange ? 
      `${new Date(equityTimeRange.start).toISOString().slice(11, 19)} → ${new Date(equityTimeRange.end).toISOString().slice(11, 19)}` : 
      'null');
  }, [equityTimeRange]);

  // Refetch equity data when timerange changes (with faster debounce for better UX)
  useEffect(() => {
    if (equityTimeRange && !loadingRef.current) {
      const now = Date.now();
      const timeSinceLastLoad = now - lastLoadTimeRef.current;
      
      console.log(`[Equity Timerange useEffect] 🔄 Time range changed, checking if should refetch:`, {
        timeSinceLastLoad,
        debounceRequired: TIME_RANGE_DEBOUNCE_MS,
        willRefetch: timeSinceLastLoad >= TIME_RANGE_DEBOUNCE_MS,
      });
      
      if (timeSinceLastLoad >= TIME_RANGE_DEBOUNCE_MS) {
        console.log(`[Equity Timerange useEffect] ✅ Refetching equity data for new range`);
        loadAll('time-range');
      } else {
        console.log(`[Equity Timerange useEffect] ⏸️  Skipping refetch - too soon (${timeSinceLastLoad}ms < ${TIME_RANGE_DEBOUNCE_MS}ms)`);
      }
    } else if (!equityTimeRange) {
      console.log(`[Equity Timerange useEffect] ℹ️  equityTimeRange is null, skipping`);
    } else if (loadingRef.current) {
      console.log(`[Equity Timerange useEffect] ⚠️  Already loading, skipping`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equityTimeRange]);

  // Fetch fresh prices for positions every 2 seconds
  // CRITICAL FIX: Use stable hash to prevent infinite loops from array reference changes
  const positionsHash = useMemo(() => JSON.stringify(positions || []), [positions]);
  const positionsRef = useRef<any[]>([]);
  const lastPositionsHashRef = useRef<string>("");
  
  useEffect(() => {
    // Only update ref if positions actually changed
    if (positionsHash !== lastPositionsHashRef.current) {
      positionsRef.current = positions || [];
      lastPositionsHashRef.current = positionsHash;
    }
    
    // Only set up interval if we have positions
    if (positionsRef.current.length === 0) return;

    const fetchPositionPrices = async () => {
      try {
        // Use ref to get current positions (stable reference)
        const markets = positionsRef.current.map((p: any) => p.market);
        const response = await fetch("/api/hyperliquid/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markets }),
        });
        if (response.ok) {
          const data = await response.json();
          setPositionPrices(data.prices || {});
        }
      } catch (error) {
        console.error("Failed to fetch position prices:", error);
      }
    };

    fetchPositionPrices();
    const priceInterval = setInterval(fetchPositionPrices, 2000); // Update prices every 2 seconds
    return () => clearInterval(priceInterval);
    // Depend on stable hash, not array directly - prevents infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsHash]);

  // Track cadence value in a ref - updated only when needed in the main effect
  const currentCadenceRef = useRef<number | null>(null);

  // Auto-tick when session is running - COMPLETELY isolated from session state updates
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const setupCompleteRef = useRef<boolean>(false);
  const cadenceValueRef = useRef<number | null>(null);
  const sessionStatusRef = useRef<string | null>(null);
  const lastSetupTimeRef = useRef<number>(0);
  
  // Initialize global tracker on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!(window as any).__autoTickIntervals) {
        (window as any).__autoTickIntervals = new Set();
      }
    }
  }, []);

  // CRITICAL FIX: NO useEffect that depends on sessionStatus
  // All status change handling is done in loadAll to prevent infinite loops
  const lastProcessedTransitionRef = useRef<string | null>(null);
  
  // Function to set up auto-tick interval - called from loadAll, NOT from useEffect
  const setupAutoTick = () => {
    const currentStatus = sessionStatusRef.current;
    
    // Only proceed if status is "running" and we haven't set up yet
    if (currentStatus !== "running" || setupCompleteRef.current || ticking || !session) {
      return;
    }
    
    // Prevent duplicate setups within 1 second
    const setupTimeNow = Date.now();
    if (setupTimeNow - lastSetupTimeRef.current < 1000) {
      return;
    }
    
    lastSetupTimeRef.current = setupTimeNow;
    console.log(`[Auto-tick] ✅ Setting up auto-tick - status is "running"`);

    // Get cadence ONCE when setting up
    // PRIORITY: Always use strategy filters cadence if available (most up-to-date)
    const strategy = session.strategies || {};
    const filters = strategy.filters || {};
    let cadenceSeconds = filters?.cadenceSeconds;
    
    // Check if cadence changed from previous value
    const previousCadence = currentCadenceRef.current;
    
    console.log(`[Auto-tick] ========================================`);
    console.log(`[Auto-tick] INITIAL SETUP - Session started`);
    console.log(`[Auto-tick] Raw values:`);
    console.log(`[Auto-tick]   - Strategy filters.cadenceSeconds: ${filters?.cadenceSeconds} (type: ${typeof filters?.cadenceSeconds})`);
    console.log(`[Auto-tick]   - Session cadence_seconds: ${session.cadence_seconds} (type: ${typeof session.cadence_seconds})`);
    console.log(`[Auto-tick]   - Strategy object:`, JSON.stringify(strategy, null, 2));
    
    // Always prefer strategy filters cadence (user's current configuration)
    if (!cadenceSeconds || cadenceSeconds <= 0) {
      console.log(`[Auto-tick] Strategy filters cadence invalid (${cadenceSeconds}), trying session cadence_seconds`);
      cadenceSeconds = session.cadence_seconds;
    }
    if (!cadenceSeconds || cadenceSeconds <= 0) {
      console.log(`[Auto-tick] Session cadence_seconds also invalid (${session.cadence_seconds}), using default 30s`);
      cadenceSeconds = 30;
    }
    // Convert to integer but don't require it to be an integer beforehand (it could be a decimal)
    cadenceSeconds = Math.max(1, Math.floor(Number(cadenceSeconds)));
    
    // Update cadence refs
    currentCadenceRef.current = cadenceSeconds;
    cadenceValueRef.current = cadenceSeconds;
    const cadenceMs = cadenceSeconds * 1000;
    
    // Log if cadence changed
    if (previousCadence !== null && previousCadence !== cadenceSeconds) {
      console.log(`[Auto-tick] 🔄 Cadence changed from ${previousCadence}s to ${cadenceSeconds}s`);
    }

    console.log(`[Auto-tick] Final cadence: ${cadenceSeconds}s (${cadenceMs}ms)`);
    console.log(`[Auto-tick] ========================================`);

    if (cadenceSeconds < 10) {
      console.warn(`[Auto-tick] ⚠️ WARNING: Cadence is very short (${cadenceSeconds}s). Expected 30s?`);
    }

    // Calculate initial delay
    const currentTime = Date.now();
    const lastTick = session.last_tick_at ? new Date(session.last_tick_at).getTime() : currentTime;
    const timeSinceLastTick = currentTime - lastTick;
    const delay = timeSinceLastTick >= cadenceMs ? 100 : Math.max(100, cadenceMs - timeSinceLastTick);
    
    console.log(`[Auto-tick] Last tick: ${session.last_tick_at || 'never'}, Time since: ${timeSinceLastTick}ms, Initial delay: ${delay}ms`);

    // Define recurring interval setup function (will be called after initial tick completes)
    const setupRecurringInterval = (capturedCadence: number, capturedSessionId: string, cadenceMs: number) => {
      // Initialize global tracker if needed
      if (typeof window !== 'undefined' && !(window as any).__autoTickIntervals) {
      (window as any).__autoTickIntervals = new Set();
    }
    
    // CRITICAL: Clear any existing interval first to prevent duplicates
    if (tickIntervalRef.current) {
      console.warn(`[Auto-tick] ⚠️ WARNING: Found existing interval, clearing it before creating new one`);
      clearInterval(tickIntervalRef.current);
      if (typeof window !== 'undefined' && (window as any).__autoTickIntervals) {
        (window as any).__autoTickIntervals.delete(tickIntervalRef.current);
      }
      tickIntervalRef.current = null;
    }
    
    // Check for any other intervals in the global tracker
    if (typeof window !== 'undefined' && (window as any).__autoTickIntervals) {
      const existingIntervals = Array.from((window as any).__autoTickIntervals);
      if (existingIntervals.length > 0) {
        console.warn(`[Auto-tick] ⚠️ WARNING: Found ${existingIntervals.length} other intervals in global tracker, clearing them`);
        existingIntervals.forEach((id: any) => {
          clearInterval(id);
          (window as any).__autoTickIntervals.delete(id);
        });
      }
    }
    
    console.log(`[Auto-tick] Creating interval with cadence: ${capturedCadence}s (${cadenceMs}ms)`);
    
    let tickCount = 0;
    const intervalStartTime = Date.now();
    let lastTickTime = intervalStartTime;
    
    console.log(`[Auto-tick] 🎯 Setting up interval with EXACT cadence: ${capturedCadence}s (${cadenceMs}ms)`);
    console.log(`[Auto-tick] Interval will fire every ${cadenceMs}ms`);
    
    tickIntervalRef.current = setInterval(async () => {
      tickCount++;
      const now = Date.now();
      const timeSinceLastTick = now - lastTickTime;
      const timeSinceStart = now - intervalStartTime;
      const expectedTickTime = tickCount * cadenceMs;
      const drift = timeSinceStart - expectedTickTime;
      
      console.log(`[Auto-tick] 🔔 Interval callback #${tickCount} fired`);
      console.log(`[Auto-tick] ⏱️ Time since LAST tick: ${timeSinceLastTick}ms (expected: ${cadenceMs}ms)`);
      console.log(`[Auto-tick] ⏱️ Time since START: ${timeSinceStart}ms, Expected: ${expectedTickTime}ms, Drift: ${drift}ms`);
      
      lastTickTime = now;
      
      // Check if we're still supposed to be running
      if (!setupCompleteRef.current || !tickIntervalRef.current) {
        console.log(`[Auto-tick] ⚠️ Interval callback: setupComplete=${setupCompleteRef.current}, intervalRef=${!!tickIntervalRef.current}`);
        return;
      }
      
      // Check current status via ref (not session object which might be stale)
      if (sessionStatusRef.current !== "running") {
        console.log(`[Auto-tick] 🛑 Status is now "${sessionStatusRef.current}", stopping interval`);
        if (tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
        setupCompleteRef.current = false;
        return;
      }
      
      if (ticking) {
        console.log(`[Auto-tick] ⏸️ Skipping tick - already ticking (tickCount: ${tickCount})`);
        return;
      }

      const tickTime = new Date().toISOString();
      const tickTimeLocal = new Date().toLocaleString();
      console.log(`[Auto-tick] ⏰ TICK #${tickCount} at ${tickTime} (${tickTimeLocal}) - cadence: ${capturedCadence}s, session: ${capturedSessionId}`);
      console.log(`[Auto-tick] 📊 Actual interval: ${tickCount > 1 ? cadenceMs : 'initial'}ms`);
      await handleTick();
    }, cadenceMs);
    
    // Track this interval globally
    if (typeof window !== 'undefined' && tickIntervalRef.current) {
      if (!(window as any).__autoTickIntervals) {
        (window as any).__autoTickIntervals = new Set();
      }
      (window as any).__autoTickIntervals.add(tickIntervalRef.current);
    }
    
      console.log(`[Auto-tick] ✅ Interval created successfully. Interval ID: ${tickIntervalRef.current}`);
      console.log(`[Auto-tick] Total intervals tracked: ${typeof window !== 'undefined' && (window as any).__autoTickIntervals ? (window as any).__autoTickIntervals.size : 'N/A'}`);

      setupCompleteRef.current = true;
    }; // End of setupRecurringInterval function

    // Set up initial tick
    tickTimerRef.current = setTimeout(async () => {
      if (ticking) {
        console.log("[Auto-tick] Skipping initial tick - already ticking");
        return;
      }
      console.log(`[Auto-tick] Executing initial tick at ${new Date().toISOString()}`);
      
      // Execute initial tick
      const tickBeforeTime = Date.now();
      await handleTick();
      const tickAfterTime = Date.now();
      const tickDuration = tickAfterTime - tickBeforeTime;
      
      // Schedule the first interval tick at cadenceMs from when the initial tick COMPLETED
      const timeUntilNextTick = Math.max(100, cadenceMs - tickDuration);
      
      // Capture cadence in closure so it doesn't change
      const capturedCadence = cadenceSeconds;
      const capturedSessionId = sessionId;
      
      console.log(`[Auto-tick] Initial tick completed in ${tickDuration}ms, scheduling interval to start in ${timeUntilNextTick}ms`);
      
      // Clear any existing interval first
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      
      // Start interval after initial tick completes
      setTimeout(() => {
        setupRecurringInterval(capturedCadence, capturedSessionId, cadenceMs);
      }, timeUntilNextTick);
    }, delay);
  };
  
  // Cleanup effect - ONLY runs on unmount to clean up intervals
  // This is the ONLY useEffect that should exist - no dependencies means it only runs on mount/unmount
  useEffect(() => {
    return () => {
      // Only clean up on unmount
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        if (typeof window !== 'undefined' && (window as any).__autoTickIntervals) {
          (window as any).__autoTickIntervals.delete(tickIntervalRef.current);
        }
        tickIntervalRef.current = null;
      }
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      setupCompleteRef.current = false;
    };
  }, []); // Empty deps - only run on mount/unmount

  // Helper function to fetch with automatic retry on 401 (with token refresh)
  // If preFetchedToken is provided, use it for the first attempt (prevents race conditions in parallel requests)
  const fetchWithAuthRetry = async (url: string, options: RequestInit = {}, retries = 1, preFetchedToken?: string | null): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        // Retry: Get fresh token
        console.log(`[fetchWithAuthRetry] Retry attempt ${attempt} - refreshing token...`);
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Use pre-fetched token on first attempt if provided, otherwise get new token
      let bearer: string | null;
      if (attempt === 0 && preFetchedToken) {
        bearer = preFetchedToken;
        console.log(`[fetchWithAuthRetry] Using pre-fetched token for first attempt`);
      } else {
        bearer = await getBearerToken();
      }
      
      if (!bearer) {
        if (attempt < retries) {
          // Try one more time after a brief delay
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }
        console.error(`[fetchWithAuthRetry] ❌ Failed to get bearer token - redirecting to /auth`);
        window.location.href = '/auth';
        throw new Error('No bearer token available');
      }
      
      // CRITICAL: Always include Authorization header - never make requests without it
      const headers = new Headers(options.headers);
      headers.set('Authorization', bearer);
      
      console.log(`[fetchWithAuthRetry] Making request to ${url} with Authorization header (attempt ${attempt + 1})`);
      
      const response = await fetch(url, {
        ...options,
        headers: headers,
        credentials: 'include',
      });
      
      // If 401 and we have retries left, try again with fresh token
      if (response.status === 401 && attempt < retries) {
        console.warn(`[fetchWithAuthRetry] Got 401 on attempt ${attempt + 1}, retrying with fresh token...`);
        continue;
      }
      
      return response;
    }
    
    // Should never reach here, but TypeScript needs it
    throw new Error('Failed after retries');
  };

  const loadAll = async (source: 'auto-refresh' | 'time-range' | 'initial' | 'manual' = 'manual') => {
    // Prevent concurrent calls to loadAll (race condition protection)
    if (loadingRef.current) {
      console.log(`[loadAll] ⚠️ Already loading, skipping duplicate call`);
      return;
    }
    
    // Debounce: Use different debounce times based on source
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    const debounceTime = source === 'time-range' ? TIME_RANGE_DEBOUNCE_MS : LOAD_DEBOUNCE_MS;
    
    if (timeSinceLastLoad < debounceTime) {
      console.log(`[loadAll] ⚠️ Debouncing (${source}) - only ${timeSinceLastLoad}ms since last load (min: ${debounceTime}ms)`);
      return;
    }
    
    lastLoadSourceRef.current = source;
    
    // CRITICAL: Use ref to get latest time range (prevents stale closure from auto-refresh)
    const capturedTimeRange = equityTimeRangeRef.current;
    console.log(`[loadAll] 🚀 LOADING | timeRange:`, capturedTimeRange ? 
      `${new Date(capturedTimeRange.start).toISOString().slice(11, 19)} → ${new Date(capturedTimeRange.end).toISOString().slice(11, 19)}` : 
      'ALL TIME');
    
    loadingRef.current = true;
    lastLoadTimeRef.current = now;
    
    try {
      setError(null);
      const supabase = createClient();
      
      // Check if user is authenticated before making requests
      const {
        data: { session: userSession },
      } = await supabase.auth.getSession();
      
      if (!userSession) {
        console.error(`[loadAll] ❌ No user session found - redirecting to /auth`);
        window.location.href = '/auth';
        return;
      }
      
      // CRITICAL: Get bearer token ONCE before parallel requests to prevent race conditions
      // All parallel requests will use the same token, preventing intermittent 401s
      const bearer = await getBearerToken();
      
      if (!bearer) {
        console.error(`[loadAll] ❌ Failed to get bearer token - redirecting to /auth`);
        window.location.href = '/auth';
        return;
      }

      console.log(`[loadAll] ✅ Got bearer token, using for all parallel requests (prevents race conditions)`);

      // Run all queries in parallel for better performance
      // Pass the pre-fetched token to prevent race conditions where multiple requests
      // call getBearerToken() simultaneously and get different tokens
      const [sessionResponse, decisionsQuery, arenaEntryQuery] = await Promise.all([
        fetchWithAuthRetry(`/api/sessions/${sessionId}`, {
          method: 'GET',
        }, 1, bearer), // Pass pre-fetched token
        supabase
          .from("session_decisions")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(500), // Increased limit but still bounded for performance
        supabase
          .from("arena_entries")
          .select("*")
          .eq("session_id", sessionId)
          .eq("active", true)
          .maybeSingle(),
      ]);

      // Process session response
      let sessionData: any = null;
      if (sessionResponse.ok) {
        const data = await sessionResponse.json();
        sessionData = data.session;
        setSession(sessionData);

        // DEV-ONLY: Log account starting equity from database
        if (process.env.NODE_ENV === "development") {
          const accountFromDB = sessionData?.mode === "live" 
            ? sessionData.live_accounts 
            : sessionData.sim_accounts;
          
          if (accountFromDB) {
            console.log(`[loadAll] 💰 ACCOUNT DATA FROM DATABASE (${sessionData?.mode || 'virtual'}):`, {
              accountId: sessionData.account_id,
              startingEquity: accountFromDB.starting_equity,
              currentEquity: accountFromDB.equity,
              cash: accountFromDB.cash_balance,
            });
          }
        }

        // CRITICAL: Handle status changes directly here, not in useEffect
        const newStatus = sessionData?.status || null;
        const previousStatus = sessionStatusRef.current;
        const currentStateStatus = sessionStatus;
        
        // Only update if status actually changed
        if (newStatus !== currentStateStatus) {
          console.log(`[loadAll] Status changed from "${currentStateStatus}" to "${newStatus}"`);
          setSessionStatus(newStatus);
        }
        
        // Always handle status change logic (even if state didn't change, ref might be out of sync)
        if (newStatus !== previousStatus) {
          const transitionKey = `${previousStatus}->${newStatus}`;
          if (lastProcessedTransitionRef.current !== transitionKey) {
            lastProcessedTransitionRef.current = transitionKey;
            sessionStatusRef.current = newStatus;
            
            // Clean up if status changed away from running
            if (newStatus !== "running" && setupCompleteRef.current) {
              console.log(`[loadAll] 🛑 Cleaning up - status changed to "${newStatus}"`);
              if (tickIntervalRef.current) {
                clearInterval(tickIntervalRef.current);
                if (typeof window !== 'undefined' && (window as any).__autoTickIntervals) {
                  (window as any).__autoTickIntervals.delete(tickIntervalRef.current);
                }
                tickIntervalRef.current = null;
              }
              if (tickTimerRef.current) {
                clearTimeout(tickTimerRef.current);
                tickTimerRef.current = null;
              }
              setupCompleteRef.current = false;
              cadenceValueRef.current = null;
              lastSetupTimeRef.current = 0;
            } else if (newStatus === "running" && !setupCompleteRef.current) {
              // Status changed to running - set up interval
              setupAutoTick();
            }
          }
        }
      } else if (sessionResponse.status === 401) {
        // Session expired - redirect to auth
        console.error(`[loadAll] ❌ Session expired - redirecting to /auth`);
        window.location.href = '/auth';
        return;
      } else if (!sessionResponse.ok) {
        // Handle other errors (404, 500, etc.)
        const errorData = await sessionResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[loadAll] ❌ Failed to load session: ${sessionResponse.status}`, errorData);
        setError(errorData.error || `Failed to load session (${sessionResponse.status})`);
        setLoading(false);
        loadingRef.current = false;
        return;
      }

      // Set decisions immediately
      const { data: dec } = decisionsQuery;
      setDecisions(dec || []);

      // Set arena entry status from parallel query
      const { data: arenaEntryData } = arenaEntryQuery;
      setArenaEntry(arenaEntryData || null);

      // Load trades, positions, and equity for both virtual and live modes
      const sessionMode = sessionData?.mode || "virtual";
      // Use correct account ID field based on mode
      const accountId = sessionMode === "live"
        ? sessionData?.live_account_id
        : sessionData?.account_id;
      
      // Determine which tables to query based on mode
      const tradesTable = sessionMode === "live" ? "live_trades" : "virtual_trades";
      const positionsTable = sessionMode === "live" ? "live_positions" : "virtual_positions";
      
      if (accountId) {
        // Build queries - make session_id optional in case it's null
        const tradesQuery = supabase
          .from(tradesTable)
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(500); // Increased limit but still bounded for performance
        
        // Only filter by session_id if it exists
        if (sessionId) {
          tradesQuery.eq("session_id", sessionId);
        }
        
        const positionsQuery = supabase
          .from(positionsTable)
          .select("*")
          .eq("account_id", accountId);
        
        console.log(`[loadAll] 🔍 Building equity query with:`, {
          accountId,
          sessionId,
          hasTimeRange: !!capturedTimeRange,
        });
        
        const equityQuery = supabase
          .from("equity_points")
          .select("*")
          .eq("account_id", accountId);

        // Only filter equity_points by session_id if it exists
        if (sessionId) {
          equityQuery.eq("session_id", sessionId);
          console.log(`[loadAll] 🔍 Filtering by session_id: ${sessionId}`);
        }
        
        // SERVER-SIDE TIME FILTERING: Apply timerange filter if specified
        if (capturedTimeRange) {
          const startISO = new Date(capturedTimeRange.start).toISOString();
          const endISO = new Date(capturedTimeRange.end).toISOString();
          equityQuery.gte("t", startISO).lte("t", endISO);

          console.log(`[loadAll] 🔍 Applying SERVER-SIDE time filter to query:`, {
            start: startISO,
            end: endISO,
            startLocal: new Date(capturedTimeRange.start).toLocaleString(),
            endLocal: new Date(capturedTimeRange.end).toLocaleString(),
          });
          // Use range() instead of limit() to bypass Supabase's default 1000 row limit
          // Order oldest-first for chronological display
          equityQuery.order("t", { ascending: true }).range(0, 99999);
        } else {
          console.log(`[loadAll] 🌍 No time filter - fetching ALL equity points for session`);
          // CRITICAL: Use range() instead of limit() to bypass Supabase's default 1000 row limit
          // Set to 1,000,000 to support 5+ years of data at any cadence
          // Order oldest-first so chart displays chronologically
          equityQuery.order("t", { ascending: true }).range(0, 999999);
        }
        
        const [tradesResult, positionsResult, equityResult] = await Promise.all([
          tradesQuery,
          positionsQuery,
          equityQuery,
        ]);

        // Log errors for debugging
        if (tradesResult.error) {
          console.error(`[loadAll] Error fetching ${tradesTable}:`, tradesResult.error);
          console.error("[loadAll] Query details:", { accountId, sessionId });
        }
        if (positionsResult.error) {
          console.error(`[loadAll] Error fetching ${positionsTable}:`, positionsResult.error);
        }
        if (equityResult.error) {
          console.error("[loadAll] Error fetching equity_points:", equityResult.error);
          console.error("[loadAll] This might be due to missing RLS policies. Run the SQL in supabase/fix_equity_points_rls.sql");
        }

        // DEV-ONLY: Log equity data fetch results
        if (process.env.NODE_ENV === "development") {
          const equityCount = equityResult.data?.length || 0;
          console.log(`[loadAll] ========== EQUITY DATA DEBUG ==========`);
          console.log(`[loadAll] Query filters:`, {
            accountId,
            sessionId,
            timeRangeActive: !!equityTimeRange,
            timeRange: equityTimeRange,
          });
          console.log(`[loadAll] Fetched ${equityCount} equity points`);

          if (equityCount > 0 && equityResult.data) {
            const first = equityResult.data[0];
            const last = equityResult.data[equityResult.data.length - 1];
            console.log(`[loadAll] First point: ${first.t} = $${Number(first.equity).toFixed(2)} (session: ${first.session_id})`);
            console.log(`[loadAll] Last point: ${last.t} = $${Number(last.equity).toFixed(2)} (session: ${last.session_id})`);

            // Check if any points are from different sessions
            const sessionIds = new Set(equityResult.data.map((p: any) => p.session_id));
            if (sessionIds.size > 1) {
              console.warn(`[loadAll] ⚠️ WARNING: Equity points span ${sessionIds.size} different sessions!`, Array.from(sessionIds));
            }

            // Show sample of middle points
            if (equityCount > 2) {
              const mid = Math.floor(equityCount / 2);
              const midPoint = equityResult.data[mid];
              console.log(`[loadAll] Middle point (${mid}): ${midPoint.t} = $${Number(midPoint.equity).toFixed(2)} (session: ${midPoint.session_id})`);
            }
          }
          console.log(`[loadAll] Current account equity (from state): $${accountEquity?.toFixed(2) || 'N/A'}`);
          console.log(`[loadAll] Current calculated equity: $${equity?.toFixed(2) || 'N/A'}`);
          console.log(`[loadAll] Starting equity: $${startBal?.toFixed(2) || 'N/A'}`);
          console.log(`[loadAll] ==========================================`);
        }

        setTrades(tradesResult.data || []);
        setPositions(positionsResult.data || []);
        
        // CRITICAL FIX: Always update equity data, even if empty
        // This ensures time range changes clear old data instead of keeping stale data
        // Data now comes in chronological order (ascending) - no reversal needed
        let fetchedEquityData = equityResult.data || [];
        
        // SMART DOWNSAMPLING: For long-running sessions (>10000 points), downsample old data
        // Keep all recent data (last 7 days) at full resolution, downsample older data
        if (!capturedTimeRange && fetchedEquityData.length > 10000) {
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
          const recentData: any[] = [];
          const oldData: any[] = [];
          
          // Separate recent vs old data
          fetchedEquityData.forEach((point: any) => {
            const pointTime = new Date(point.t).getTime();
            if (pointTime > sevenDaysAgo) {
              recentData.push(point);
            } else {
              oldData.push(point);
            }
          });
          
          // Downsample old data: keep every Nth point
          // Target: ~2000 old points + all recent points = manageable for charts
          const targetOldPoints = 2000;
          const downsampleFactor = Math.ceil(oldData.length / targetOldPoints);
          const downsampledOld = oldData.filter((_, index) => index % downsampleFactor === 0);
          
          fetchedEquityData = [...downsampledOld, ...recentData];
          console.log(`[loadAll] 📊 Downsampled equity data: ${oldData.length} old points → ${downsampledOld.length} (${downsampleFactor}x), ${recentData.length} recent points = ${fetchedEquityData.length} total`);
        }
        console.log(`[loadAll] ✅ LOADED ${fetchedEquityData.length} equity points | timeRange:`, capturedTimeRange ? 
          `${new Date(capturedTimeRange.start).toISOString().slice(11, 19)} → ${new Date(capturedTimeRange.end).toISOString().slice(11, 19)}` : 
          'ALL TIME');
        
        // DETAILED LOGGING: Show what we actually loaded
        if (fetchedEquityData.length > 0) {
          const first = fetchedEquityData[0];
          const last = fetchedEquityData[fetchedEquityData.length - 1];
          const now = new Date();
          console.log(`[loadAll] 🔍 EQUITY DATA DETAILS:`, {
            accountId,
            sessionId,
            firstPoint: { time: first.t, equity: first.equity },
            lastPoint: { time: last.t, equity: last.equity },
            currentTime: now.toISOString(),
            ageOfLastPoint: `${((now.getTime() - new Date(last.t).getTime()) / 60000).toFixed(1)} minutes ago`,
          });
        } else {
          console.error(`[loadAll] ❌ NO EQUITY DATA RETURNED! Query params:`, { accountId, sessionId });
        }
        
        setEquityPointsData(fetchedEquityData);

        // Calculate metrics
        const tradesData = tradesResult.data || [];
        const equityData = equityResult.data || [];
        
        // Metrics will be recalculated in useEffect when pnlTotals is available
        // Don't set metrics here - let the useEffect handle it to prevent duplicate updates
      }
    } catch (err: any) {
      console.error("Failed to load session", err);
      setError(err?.message || "Failed to load session. Please try refreshing the page.");
      setLoading(false);
    } finally {
      setLoading(false);
      loadingRef.current = false; // Always reset loading flag, even on error
    }
  };

  const loadDebugContext = async (market: string | null = null) => {
    setLoadingDebugContext(true);
    try {
      const marketParam = market ? `?market=${encodeURIComponent(market)}` : '';
      const response = await fetchWithAuthRetry(`/api/sessions/${sessionId}/debug-context${marketParam}`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const data = await response.json();
        setDebugContext(data);
        
        // If we got sessionMarkets and no market is selected yet, set first market
        if (data.sessionMarkets && data.sessionMarkets.length > 0 && !selectedDebugMarket) {
          setSelectedDebugMarket(data.sessionMarkets[0]);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        setDebugContext({ 
          error: errorData.error || `Failed to load context (${response.status})`,
          statusCode: response.status
        });
      }
    } catch (error: any) {
      console.error("Debug context error:", error);
      setDebugContext({ 
        error: error.message || "Failed to load context. Please check console for details.",
        details: error.toString()
      });
    } finally {
      setLoadingDebugContext(false);
    }
  };

  const handleStatusChange = async (newStatus: "running" | "stopped") => {
    try {
      // CRITICAL: Optimistically update UI immediately for responsive feedback
      setSession((prev: any) => prev ? { ...prev, status: newStatus } : prev);
      setSessionStatus(newStatus);
      sessionStatusRef.current = newStatus;
      
      // CRITICAL: Immediately stop auto-tick if stopping
      if (newStatus === "stopped") {
        console.log(`[handleStatusChange] 🛑 Immediately stopping auto-tick for status: ${newStatus}`);
        
        // Clear the interval immediately
        if (tickIntervalRef.current) {
          console.log(`[handleStatusChange] 🛑 Clearing interval ${tickIntervalRef.current}`);
          clearInterval(tickIntervalRef.current);
          if (typeof window !== 'undefined' && (window as any).__autoTickIntervals) {
            (window as any).__autoTickIntervals.delete(tickIntervalRef.current);
          }
          tickIntervalRef.current = null;
        }
        
        // Clear any pending timer
        if (tickTimerRef.current) {
          console.log(`[handleStatusChange] 🛑 Clearing pending timer ${tickTimerRef.current}`);
          clearTimeout(tickTimerRef.current);
          tickTimerRef.current = null;
        }
        
        // Reset setup flags
        setupCompleteRef.current = false;
        
        console.log(`[handleStatusChange] ✅ Auto-tick stopped immediately. Status: ${newStatus}`);
      }
      
      let response: Response;

      if (newStatus === "running") {
        response = await fetchWithAuthRetry(`/api/sessions/${sessionId}/resume`, {
          method: "POST",
        });
      } else {
        response = await fetchWithAuthRetry(`/api/sessions/${sessionId}/stop`, {
          method: "POST",
        });
      }

      if (response.ok) {
        const data = await response.json();
        console.log(`[handleStatusChange] ✅ Session status updated to: ${newStatus}`, data);
        
        // Update session with the response data
        if (data.session) {
          setSession(data.session);
          setSessionStatus(data.session.status);
        }
        
        // Refresh all data to ensure consistency
        await loadAll('manual');
      } else {
        const e = await response.json();
        console.error(`[handleStatusChange] ❌ Failed to update status:`, e);
        alert(e.error || "Failed to update status");
        
        // Revert optimistic update on failure
        await loadAll('manual');
      }
    } catch (err) {
      console.error("Failed to update status", err);
      alert("Failed to update session status");
      
      // Revert optimistic update on error
      await loadAll('manual');
    }
  };

  const handleTick = async () => {
    const tickStartTime = new Date().toISOString();
    const callStack = new Error().stack;
    console.log(`[handleTick] 🎯 Called at ${tickStartTime}`);
    console.log(`[handleTick] Session status: ${session?.status}, Status ref: ${sessionStatusRef.current}, Ticking state: ${ticking}`);
    console.log(`[handleTick] Call stack:`, callStack?.split('\n').slice(1, 4).join('\n')); // Show first 3 stack frames
    
    // CRITICAL: Check both session status and status ref before proceeding
    // This prevents API calls if session was just stopped
    const currentStatus = sessionStatusRef.current || session?.status;
    if (currentStatus !== "running") {
      console.warn(`[handleTick] 🛑 ABORTING - Session not running (status: ${currentStatus}), NOT calling AI`);
      console.warn(`[handleTick] 🛑 This prevents unnecessary API calls when session is stopped`);
      return; // Don't alert, just return silently
    }
    
    if (session?.status !== "running") {
      console.warn(`[handleTick] ⚠️ Session status mismatch - session.status: ${session?.status}, aborting`);
      return; // Don't alert, just return silently
    }

    if (ticking) {
      console.warn(`[handleTick] ⚠️ Already ticking, skipping duplicate call`);
      console.warn(`[handleTick] ⚠️ This indicates handleTick was called while a previous call is still in progress!`);
      return;
    }

    setTicking(true);
    try {
      console.log(`[handleTick] 📡 Calling /api/sessions/${sessionId}/tick`);
      const response = await fetchWithAuthRetry(`/api/sessions/${sessionId}/tick`, {
        method: "POST",
      });

      if (response.ok) {
        const tickEndTime = new Date().toISOString();
        console.log(`[handleTick] ✅ Tick completed successfully at ${tickEndTime}`);
        await loadAll('manual');
      } else {
        const error = await response.json();
        console.error(`[handleTick] ❌ Tick failed:`, error);
        alert(error.error || "Tick failed");
      }
    } catch (err: any) {
      console.error(`[handleTick] ❌ Tick error:`, err);
      alert(err.message || "Tick failed");
    } finally {
      setTicking(false);
      console.log(`[handleTick] 🏁 Finished, ticking state reset`);
    }
  };

  // Safely derive strategy/account even when session is null
  const strategy = session?.strategies || {};
  // Get account based on session mode (arena uses virtual accounts like virtual mode)
  const account = session?.mode === "live" 
    ? session?.live_accounts 
    : (session?.sim_accounts || session?.virtual_accounts);
  
  // CRITICAL FIX: Extract primitive values directly - these are stable
  const accountEquity = account?.equity != null ? Number(account.equity) : null;
  // Use session-level starting_equity if available (per-session tracking), fallback to account-level for older sessions
  const startBal = session?.starting_equity != null
    ? Number(session.starting_equity)
    : (account?.starting_equity != null ? Number(account.starting_equity) : null);
  const cashBalance = account?.cash_balance != null ? Number(account.cash_balance) : null;
  
  // CRITICAL: Create stable hash using useMemo with primitive dependencies only
  // DO NOT update refs during render - that causes infinite loops
  const accountHash = useMemo(() => {
    if (accountEquity == null && startBal == null && cashBalance == null) return "null";
    return JSON.stringify({
      equity: accountEquity,
      starting_equity: startBal,
      cash_balance: cashBalance,
    });
    // Depend on primitive values - React compares these by value, not reference
  }, [accountEquity, startBal, cashBalance]);
  
  // SIMPLIFIED: Calculate pnlTotals directly without useMemo to avoid infinite loop issues
  // This is a fast calculation, so memoization isn't necessary and was causing problems
  let pnlTotals = null;
  if (startBal != null && cashBalance != null && startBal > 0 && accountEquity != null) {
    try {
      pnlTotals = calcTotals(
        {
          starting_equity: startBal,
          cash_balance: cashBalance,
          equity: accountEquity,
        },
        Array.isArray(positions) ? positions : [],
        Array.isArray(trades) ? trades : [],
        positionPrices || {},
        session?.mode  // Pass mode so live sessions use DB equity
      );
    } catch (error) {
      console.error("[UI] Error calculating pnlTotals:", error);
      pnlTotals = null;
    }
  }
  
  // Always use calculated equity from accounting helper (not stored equity which may be stale)
  const equity = pnlTotals?.equity ?? accountEquity;
  
  // Total PnL MUST equal realized + unrealized - fees (reconciliation identity)
  // Use this formula instead of equity - starting_equity to ensure consistency
  const pnl = pnlTotals 
    ? pnlTotals.realizedPnl + pnlTotals.unrealizedPnl - pnlTotals.feesPaid
    : (equity != null && startBal != null ? equity - startBal : null);
  
  // Return % MUST be calculated from equity and starting_equity (same source of truth)
  // Formula: (current_equity - starting_equity) / starting_equity
  // This ensures consistency with equity curve and summary metrics
  const returnPct = pnlTotals?.returnPct ?? (equity != null && startBal != null && startBal > 0 ? ((equity - startBal) / startBal) * 100 : null);
  
  // Sanity assertion: If total_pnl > 0, return % must be > 0
  if (pnl != null && returnPct != null && pnl > 0 && returnPct <= 0) {
    console.error(`[UI] SANITY CHECK FAILED: pnl=${pnl.toFixed(2)} > 0 but returnPct=${returnPct.toFixed(2)} <= 0`);
    console.error(`[UI] equity=${equity?.toFixed(2)}, startBal=${startBal?.toFixed(2)}`);
  }

  // Purely derived metrics: no local state, no extra renders
  const metrics = useMemo(() => {
    // If we don't have enough data yet, show zeros
    if (!startBal || startBal <= 0 || !pnlTotals) {
      return {
        totalReturn: 0,
        maxDrawdown: 0,
        winRate: null as number | null,
        totalTrades: (trades || []).length,
        totalPnL: 0,
        closedTrades: 0,
      };
    }

    try {
      // Closed trades: prefer explicit action, but fall back to realized_pnl presence
      // This makes Win Rate resilient if some rows have missing/variant action values.
      const closedTrades = (trades || []).filter((t: any) => {
        if (!t) return false;
        const action = String(t.action || "").toLowerCase();
        const realized = Number(
          t.realized_pnl ?? t.realizedPnl ?? 0
        );
        const hasRealized = Number.isFinite(realized) && realized !== 0;
        return action === "close" || action === "reduce" || action === "flip" || hasRealized;
      });
      const winningTrades = closedTrades.filter(
        (t: any) => Number(t.realized_pnl ?? t.realizedPnl ?? 0) > 0
      );
      const totalRealizedPnL = closedTrades.reduce(
        (sum: number, t: any) => sum + Number(t.realized_pnl ?? t.realizedPnl ?? 0),
        0
      );

      // Calculate drawdown from equity points
      let maxDrawdown = 0;
      if (equityPointsData && equityPointsData.length > 0 && startBal > 0) {
        let peak = startBal;
        for (const point of equityPointsData) {
          if (point && point.equity != null) {
            const eq = Number(point.equity);
            if (!Number.isFinite(eq)) continue;
            if (eq > peak) peak = eq;
            const drawdown = ((peak - eq) / peak) * 100;
            if (Number.isFinite(drawdown) && drawdown > maxDrawdown) {
              maxDrawdown = drawdown;
            }
          }
        }
      }

      // Win rate based on closed trades only
      const winRate =
        closedTrades.length > 0
          ? (winningTrades.length / closedTrades.length) * 100
          : null;

      const metricsReturnPct = pnlTotals.returnPct ?? 0;

      return {
        totalReturn: Number.isFinite(metricsReturnPct) ? metricsReturnPct : 0,
        maxDrawdown: Number.isFinite(maxDrawdown) ? maxDrawdown : 0,
        winRate: winRate !== null && Number.isFinite(winRate) ? winRate : null,
        totalTrades: (trades || []).length,
        totalPnL: Number.isFinite(totalRealizedPnL) ? totalRealizedPnL : 0,
        closedTrades: closedTrades.length,
      };
    } catch (error) {
      console.error("[Metrics Update] Error calculating metrics:", error);
      return {
        totalReturn: 0,
        maxDrawdown: 0,
        winRate: null as number | null,
        totalTrades: (trades || []).length,
        totalPnL: 0,
        closedTrades: 0,
      };
    }
  }, [pnlTotals, trades, equityPointsData, startBal]);
  
  // Get configured cadence for display
  const filters = strategy.filters || {};
  // Always use strategy's current cadence (not session's stored cadence_seconds which may be outdated)
  const configuredCadence = filters?.cadenceSeconds || session?.cadence_seconds || 30;
  console.log(
    `[UI] Display cadence - Strategy filters: ${filters?.cadenceSeconds}, Session cadence_seconds: ${session?.cadence_seconds}, Final: ${configuredCadence}`
  );
  const cadenceDisplay = configuredCadence < 60 
    ? `${configuredCadence} seconds`
    : configuredCadence < 3600
    ? `${Math.floor(configuredCadence / 60)} minutes ${configuredCadence % 60 > 0 ? `${configuredCadence % 60} seconds` : ''}`
    : `${Math.floor(configuredCadence / 3600)} hours ${Math.floor((configuredCadence % 3600) / 60)} minutes`;

  // Prepare equity points data for the chart component
  let equityPointsForChart = (equityPointsData || [])
    .filter((p: any) => p && p.t && p.equity != null)
    .map((p: any) => ({
      time: new Date(p.t).getTime(),
      equity: Number(p.equity),
    }))
    .filter((p: any) => Number.isFinite(p.time) && Number.isFinite(p.equity) && p.equity >= 0) // Remove invalid values
    .sort((a: any, b: any) => a.time - b.time);

  // CRITICAL: Filter out stale data that doesn't match the current time range OR is too old
  if (equityPointsForChart.length > 0) {
    const now = Date.now();
    const lastPoint = equityPointsForChart[equityPointsForChart.length - 1].time;
    const ageMinutes = (now - lastPoint) / (1000 * 60);
    
    // If showing "All Time" and the last data point is more than 10 minutes old
    // but the session is still running, the data is stale
    if (!equityTimeRange && sessionStatus === 'running' && ageMinutes > 10) {
      console.log(`[UI] 🚫 Ignoring stale data (last point too old for running session):`, {
        lastPoint: new Date(lastPoint).toISOString(),
        ageMinutes: ageMinutes.toFixed(1),
        status: sessionStatus,
      });
      // Clear the data and trigger immediate refetch
      equityPointsForChart = [];
      if (!waitingForFreshData) {
        setWaitingForFreshData(true);
        // Trigger immediate refetch
        setTimeout(() => {
          console.log(`[UI] 🔄 Refetching data due to stale equity curve`);
          loadAll('manual');
          setWaitingForFreshData(false);
        }, 100);
      }
    }
    
    // Also check if data matches the requested time range
    if (equityTimeRange && equityPointsForChart.length > 0) {
      const firstPoint = equityPointsForChart[0].time;
      const rangeStart = equityTimeRange.start;
      const rangeEnd = equityTimeRange.end;
      
      // Data is valid if it overlaps with the requested range (allow 1 hour tolerance)
      const tolerance = 60 * 60 * 1000; // 1 hour
      const dataMatchesRange = 
        (firstPoint >= rangeStart - tolerance && firstPoint <= rangeEnd + tolerance) ||
        (lastPoint >= rangeStart - tolerance && lastPoint <= rangeEnd + tolerance);
      
      if (!dataMatchesRange) {
        console.log(`[UI] 🚫 Ignoring stale data (doesn't match time range):`, {
          dataRange: `${new Date(firstPoint).toISOString().slice(11, 19)} → ${new Date(lastPoint).toISOString().slice(11, 19)}`,
          requestedRange: `${new Date(rangeStart).toISOString().slice(11, 19)} → ${new Date(rangeEnd).toISOString().slice(11, 19)}`,
          points: equityPointsForChart.length,
        });
        // Clear the data and trigger immediate refetch
        equityPointsForChart = [];
        if (!waitingForFreshData) {
          setWaitingForFreshData(true);
          setTimeout(() => {
            console.log(`[UI] 🔄 Refetching data due to time range mismatch`);
            loadAll('manual');
            setWaitingForFreshData(false);
          }, 100);
        }
      }
    }
  }

  // De-duplicate points with identical timestamps (keep latest)
  const seen = new Map<number, number>();
  equityPointsForChart = equityPointsForChart.filter((p: any) => {
    if (seen.has(p.time)) {
      // Replace if this equity is different (keep latest value)
      seen.set(p.time, p.equity);
      return false;
    }
    seen.set(p.time, p.equity);
    return true;
  });

  // If we have no stored equity points OR the first point is well after session start,
  // inject a baseline point at session creation time so the chart starts correctly
  const sessionStart = session?.started_at || session?.created_at;
  const sessionStartTime = sessionStart ? new Date(sessionStart).getTime() : null;

  if (sessionStartTime && startBal != null) {
    if (equityPointsForChart.length === 0) {
      // No data at all - create baseline point
      equityPointsForChart = [{ time: sessionStartTime, equity: Number(startBal) }];
    } else if (equityPointsForChart[0].time > sessionStartTime + (6 * 60 * 1000)) {
      // Data exists but starts more than 6 minutes after session creation - prepend baseline
      equityPointsForChart.unshift({ time: sessionStartTime, equity: Number(startBal) });
    }
  }

  // Callback to update time range when chart selection changes
  // Special case: start=0 and end=0 means "All Time" (no filter)
  const handleTimeRangeChange = useCallback((start: number, end: number) => {
    // Check if this is the "no filter" signal (All Time)
    if (start === 0 && end === 0) {
      console.log(`[handleTimeRangeChange] 🌍 Chart requesting ALL TIME (no filter)`);
      setEquityTimeRange(null); // Clear the filter
      return;
    }
    
    console.log(`[handleTimeRangeChange] 📅 Chart requesting time range:`, {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      startLocal: new Date(start).toLocaleString(),
      endLocal: new Date(end).toLocaleString(),
    });
    
    setEquityTimeRange((prev) => {
      // Only update if values actually changed
      if (prev && prev.start === start && prev.end === end) {
        console.log(`[handleTimeRangeChange] ⏭️  No change, skipping update`);
        return prev;
      }
      
      console.log(`[handleTimeRangeChange] ✅ Updated time range state`);
      return { start, end };
    });
  }, []);

  // Filter out zero-size positions before rendering (UI-only)
  const EPSILON = 1e-8;
  const validPositions = useMemo(
    () =>
      (positions || []).filter((p: any) => {
        const size = Math.abs(Number(p.size || 0));
        return size >= EPSILON;
      }),
    [positions]
  );

  // Handle loading / error states AFTER all hooks to keep hook order stable
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // Session null check - ensure session loaded before rendering
  if (!session) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-muted-foreground">Loading session data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                ← Back
              </Button>
              <h1 className="text-3xl font-bold tracking-tight">Session Performance</h1>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {(() => {
                const badgeConfig = getSessionBadgeConfig(session);
                return (
                  <Badge 
                    variant={badgeConfig.variant}
                    className={badgeConfig.className || ""}
                  >
                    {badgeConfig.label}
                  </Badge>
                );
              })()}
              <Badge className={`text-xs bg-transparent ${
                session?.status === "running" 
                  ? "text-emerald-300 border-emerald-800" 
                  : "text-gray-400 border-gray-800"
              }`}>
                {session?.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {strategy.name} • {Array.isArray(session?.markets) ? session.markets.join(", ") : "N/A"}
              </span>
              {session?.status === "running" && (
                <Badge variant="secondary" className="ml-2">
                  AI Cadence: {cadenceDisplay}
                </Badge>
              )}
            </div>
            {equity != null && pnl != null && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-sm text-muted-foreground">Equity: </span>
                    <span className="text-lg font-semibold">${equity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Total PnL: </span>
                    <span
                      className={`text-lg font-semibold ${pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                    >
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    </span>
                  </div>
                  {startBal && (
                    <div>
                      <span className="text-sm text-muted-foreground">Return: </span>
                      <span
                        className={`text-lg font-semibold ${returnPct != null && returnPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {returnPct != null ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%` : "N/A"}
                      </span>
                    </div>
                  )}
                </div>
                {/* PnL Breakdown */}
                {pnlTotals && (
                  <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                    <div className="flex items-center gap-4">
                      <span>
                        Unrealized PnL:{" "}
                        <span
                          className={
                            pnlTotals.unrealizedPnl >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {pnlTotals.unrealizedPnl >= 0 ? "+" : ""}${pnlTotals.unrealizedPnl.toFixed(2)}
                        </span>
                      </span>
                      <span>
                        Realized PnL:{" "}
                        <span
                          className={
                            pnlTotals.realizedPnl >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {pnlTotals.realizedPnl >= 0 ? "+" : ""}${pnlTotals.realizedPnl.toFixed(2)}
                        </span>
                      </span>
                      <span>
                        Fees Paid:{" "}
                        <span className="text-red-600 dark:text-red-400">-${pnlTotals.feesPaid.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className="text-xs opacity-75">
                      Reconciliation: {pnlTotals.realizedPnl.toFixed(2)} + {pnlTotals.unrealizedPnl.toFixed(2)} - {pnlTotals.feesPaid.toFixed(2)} = ${(pnlTotals.realizedPnl + pnlTotals.unrealizedPnl - pnlTotals.feesPaid).toFixed(2)}{" "}
                      {verifyReconciliation(pnlTotals) ? (
                        <span className="text-green-600 dark:text-green-400">✓</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
                          (Expected: ${pnlTotals.totalPnl.toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Session Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {session?.status === "running" ? (
                  <Button
                    variant="default"
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    Running
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleStatusChange("running")}
                    variant="outline"
                    className="border-gray-300 text-black hover:text-black hover:bg-gray-200/50"
                  >
                    Start
                  </Button>
                )}
                {session?.status === "stopped" ? (
                  <Button
                    variant="default"
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    Stopped
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleStatusChange("stopped")}
                    variant="outline"
                    className="border-gray-300 text-black hover:text-black hover:bg-gray-200/50"
                  >
                    Stop
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={async () => {
                    // Initialize with first market when opening
                    if (session?.markets && Array.isArray(session.markets) && session.markets.length > 0) {
                      setSelectedDebugMarket(session.markets[0]);
                    }
                    setDebugContextOpen(true);
                    await loadDebugContext(selectedDebugMarket);
                  }}
                >
                  🔍 View AI Context
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Debug AI Context Dialog */}
          <Dialog open={debugContextOpen} onOpenChange={setDebugContextOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>AI Context Debug</DialogTitle>
                <DialogDescription>
                  This shows exactly what data is being sent to the AI when making trading decisions.
                </DialogDescription>
              </DialogHeader>
              {loadingDebugContext ? (
                <div className="py-8 text-center">Loading...</div>
              ) : debugContext?.error ? (
                <div className="py-8 px-4">
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                    <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                      Error Loading AI Context
                    </h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                      {debugContext.error}
                    </p>
                    {debugContext.statusCode && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Status Code: {debugContext.statusCode}
                      </p>
                    )}
                    {debugContext.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer">
                          Technical Details
                        </summary>
                        <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900/30 p-2 rounded overflow-x-auto">
                          {debugContext.details}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ) : debugContext ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">
                      Strategy: {debugContext.strategyName}
                      {debugContext.sessionMode && (
                        <span className={`ml-2 text-xs font-semibold px-2 py-1 rounded ${
                          debugContext.sessionMode === 'live'
                            ? 'bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700'
                            : debugContext.sessionMode === 'arena'
                            ? 'bg-yellow-100 text-yellow-700 border border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-700'
                            : 'bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700'
                        }`}>
                          {debugContext.sessionMode.toUpperCase()} MODE
                        </span>
                      )}
                    </h3>
                    {debugContext.sessionMarkets && debugContext.sessionMarkets.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Session Markets: {debugContext.sessionMarkets.join(", ")}
                        </p>
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-medium">Selected Market:</label>
                          <select
                            className="border rounded px-2 py-1 text-sm bg-background"
                            value={selectedDebugMarket || debugContext.selectedMarket || debugContext.sessionMarkets[0]}
                            onChange={async (e) => {
                              const newMarket = e.target.value;
                              setSelectedDebugMarket(newMarket);
                              await loadDebugContext(newMarket);
                            }}
                          >
                            {debugContext.sessionMarkets.map((m: string) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="font-semibold mb-2">AI Inputs Configured:</h3>
                    <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(debugContext.aiInputsConfigured, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Context Sent to AI:</h3>
                    <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(debugContext.contextSentToAI, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Full Prompt (System + User):</h3>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium mb-1">System Prompt:</p>
                        <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
                          {debugContext.fullPrompt?.system}
                        </pre>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">User Prompt:</p>
                        <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
                          {debugContext.fullPrompt?.user}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {debugContext.note && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm text-yellow-800 dark:text-yellow-200">
                      {debugContext.note}
                    </div>
                  )}
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

          {/* Metrics */}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Return</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-bold ${metrics.totalReturn >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {metrics.totalReturn >= 0 ? "+" : ""}
                    {metrics.totalReturn.toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Max Drawdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {metrics.maxDrawdown.toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Win Rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.winRate === null ? "0.0%" : `${metrics.winRate.toFixed(1)}%`}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalTrades}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Equity Curve */}
          {loading ? (
            <Card>
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
                <CardDescription>Total equity over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80 flex items-center justify-center">
                  <p className="text-muted-foreground">Loading equity data...</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <EquityCurveChart
              key={`equity-chart-${sessionId}-${equityPointsData.length}`}
              equityPoints={equityPointsForChart}
              currentEquity={equity}
              startingEquity={startBal || 100000}
              sessionStartedAt={session.started_at}
              onTimeRangeChange={handleTimeRangeChange}
              timeRange={selectedTimeRange}
              onTimeRangeSelect={(range) => {
                console.log(`[SessionPage] 🎯 Time range selected: "${range}"`);
                setSelectedTimeRange(range);
              }}
            />
          )}

          {/* Current Positions */}
          <Card className="mb-8">
              <CardHeader>
                <CardTitle>Current Positions</CardTitle>
                <CardDescription>Open positions and unrealized PnL</CardDescription>
              </CardHeader>
              <CardContent>
                {validPositions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No open positions. Positions will appear here when trades are executed.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Market</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead className="text-right">Leverage</TableHead>
                          <TableHead className="text-right">Size</TableHead>
                          <TableHead className="text-right">Avg Entry</TableHead>
                          <TableHead className="text-right">Current Price</TableHead>
                          <TableHead className="text-right">Unrealized PnL</TableHead>
                          <TableHead className="text-right">Position Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validPositions.map((position: any) => {
                          const entryPrice = Number(position.avg_entry);
                          const size = Number(position.size);
                          
                          // Use fresh price from API if available
                          let currentPrice = positionPrices[position.market] || 0;
                          
                          // Use accounting helper for consistent calculations
                          const unrealizedPnl = currentPrice > 0 
                            ? calcUnrealizedPnl(position, currentPrice)
                            : Number(position.unrealized_pnl || 0);
                          
                          // If no current price, estimate from stored unrealized PnL (fallback)
                          if (currentPrice === 0 && size > 0) {
                            const storedUnrealized = Number(position.unrealized_pnl || 0);
                            if (position.side === "long") {
                              currentPrice = entryPrice + (storedUnrealized / size);
                            } else {
                              currentPrice = entryPrice - (storedUnrealized / size);
                            }
                          }
                          
                          // Position Value = size * currentPrice (mark-to-market)
                          const positionValue = calcPositionValue(size, currentPrice > 0 ? currentPrice : entryPrice);
                          
                          return (
                            <TableRow key={position.id}>
                              <TableCell className="font-medium">{position.market}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={position.side === "long" ? "default" : "secondary"}
                                >
                                  {position.side.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {position.leverage && position.leverage > 1 ? (
                                  <Badge variant="outline" className="font-mono">
                                    {position.leverage}x
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">1x</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {Number(position.size).toFixed(6)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${Number(position.avg_entry).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : "N/A"}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono font-semibold ${
                                  unrealizedPnl > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : unrealizedPnl < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {unrealizedPnl >= 0 ? "+" : ""}
                                ${unrealizedPnl.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${positionValue.toFixed(2)}
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

          {/* Trade History */}
          <Card className="mb-8">
              <CardHeader>
                <CardTitle>Trade History</CardTitle>
                <CardDescription>All executed trades</CardDescription>
              </CardHeader>
              <CardContent>
                {!trades || trades.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No trades yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Market</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead className="text-right">Leverage</TableHead>
                          <TableHead className="text-right">Size</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Fee</TableHead>
                          <TableHead className="text-right">Realized PnL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(trades || []).map((trade: any) => {
                          if (!trade || !trade.id) {
                            return null;
                          }
                          
                          // Convert action and side to descriptive format
                          // open + buy = open long, open + sell = open short
                          // close/reduce/flip + sell = close long, close/reduce/flip + buy = close short
                          const action = trade.action || "";
                          const side = trade.side || "";
                          const isOpen = action === "open";
                          const isClose = action === "close" || action === "reduce" || action === "flip";
                          const isBuy = side === "buy";
                          const isSell = side === "sell";
                          
                          let actionLabel = "";
                          let actionVariant: "default" | "secondary" | "outline" = "outline";
                          
                          // Style based on OPEN vs CLOSE, not LONG vs SHORT
                          if (isOpen && isBuy) {
                            actionLabel = "open long";
                            actionVariant = "default"; // Dark/primary for opening
                          } else if (isOpen && isSell) {
                            actionLabel = "open short";
                            actionVariant = "default"; // Dark/primary for opening
                          } else if (isClose && isSell) {
                            actionLabel = "close long";
                            actionVariant = "secondary"; // Light/muted for closing
                          } else if (isClose && isBuy) {
                            actionLabel = "close short";
                            actionVariant = "secondary"; // Light/muted for closing
                          } else {
                            // Fallback (shouldn't happen)
                            actionLabel = action || "unknown";
                          }
                          
                          return (
                            <TableRow key={trade.id}>
                              <TableCell className="text-sm">
                                {trade.created_at ? <FormattedDate date={trade.created_at} /> : "N/A"}
                              </TableCell>
                              <TableCell className="font-medium">{trade.market || "N/A"}</TableCell>
                              <TableCell>
                                <Badge variant={actionVariant} className="capitalize">
                                  {actionLabel}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {trade.leverage && trade.leverage > 1 ? (
                                  <Badge variant="outline" className="font-mono">
                                    {trade.leverage}x
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">1x</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {trade.size != null ? Number(trade.size).toFixed(6) : "0.000000"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${trade.price != null ? Number(trade.price).toFixed(2) : "0.00"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                ${trade.fee != null ? Number(trade.fee).toFixed(2) : "0.00"}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono font-semibold ${
                                  Number(trade.realized_pnl || 0) > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : Number(trade.realized_pnl || 0) < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {isOpen ? (
                                  <span className="text-muted-foreground text-xs">
                                    N/A (open)
                                  </span>
                                ) : (
                                  <>
                                    {Number(trade.realized_pnl || 0) >= 0 ? "+" : ""}
                                    ${Number(trade.realized_pnl || 0).toFixed(2)}
                                  </>
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

          {/* Decision Log */}
          <Card>
            <CardHeader>
              <CardTitle>Decision Log</CardTitle>
              <CardDescription>
                AI decisions with confidence, indicators, and execution status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No decisions yet. Start the session and it will automatically generate decisions at your configured cadence.
                </p>
              ) : (
                <div className="space-y-4">
                  {(showAllDecisions ? decisions : decisions.slice(0, 20)).map((decision) => {
                    const intent = decision.intent || {};
                    const confidence = decision.confidence || 0;

                    return (
                      <div key={decision.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            <FormattedDate date={decision.created_at} />
                          </span>
                          <div className="flex items-center gap-2">
                            {decision.executed ? (
                              <Badge variant="default">Executed</Badge>
                            ) : (
                              <Badge variant="outline">Skipped</Badge>
                            )}
                            {confidence > 0 && (
                              <Badge variant="secondary">
                                {(confidence * 100).toFixed(0)}% confidence
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          {decision.action_summary && (
                            <div>
                              <span className="text-muted-foreground">Action: </span>
                              <span className="font-medium">{decision.action_summary}</span>
                            </div>
                          )}
                          {intent.bias && (
                            <div>
                              <span className="text-muted-foreground">Intent: </span>
                              <span className="font-medium capitalize">{intent.bias}</span>
                              {decision.proposed_order?.market && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {decision.proposed_order.market}
                                </Badge>
                              )}
                              {intent.reasoning && (
                                <span className="text-muted-foreground"> - {intent.reasoning}</span>
                              )}
                            </div>
                          )}
                          {Object.keys(decision.indicators_snapshot || {}).length > 0 && (
                            <details className="text-xs text-muted-foreground">
                              <summary className="cursor-pointer">Indicators</summary>
                              <pre className="mt-2 whitespace-pre-wrap break-words">
                                {JSON.stringify(decision.indicators_snapshot, null, 2)}
                              </pre>
                            </details>
                          )}
                          {decision.error && (
                            <div className="text-red-600 dark:text-red-400">
                              Error: {decision.error}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {decisions.length > 20 && (
                    <div className="pt-2 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllDecisions(!showAllDecisions)}
                      >
                        {showAllDecisions ? `Show less (first 20)` : `View all (${decisions.length} entries)`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SessionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!params?.id) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <p className="text-muted-foreground">Invalid session ID</p>
      </div>
    );
  }

  return (
    <AuthGuard>
      <SessionErrorBoundary>
        <SessionDetailContent sessionId={params.id} />
      </SessionErrorBoundary>
    </AuthGuard>
  );
}
