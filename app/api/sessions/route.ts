import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api/serverAuth";
import { getOrCreateLiveAccount } from "@/lib/brokers/liveBroker";
import { getMidPrices } from "@/lib/hyperliquid/prices";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();
    const { data: sessions, error } = await serviceClient
      .from("strategy_sessions")
      .select(`
        *,
        strategies(id, name, model_provider, model_name, filters),
        virtual_accounts(id, equity, starting_equity, cash_balance),
        live_accounts(id, equity, starting_equity, cash_balance)
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100); // Limit to 100 most recent sessions per user

    if (error) {
      console.error("Error fetching sessions:", error);
      return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }

    // Calculate real-time equity for each session (like session detail page does)
    const sessionsWithCalculatedEquity = await Promise.all(
      (sessions || []).map(async (s: any) => {
        const account = s.mode === "live" ? s.live_accounts : s.virtual_accounts;
        
        if (!account || !account.id) {
          return {
            ...s,
            strategies: s.strategies || {},
            sim_accounts: s.virtual_accounts || null,
            market: Array.isArray(s.markets) && s.markets.length > 0 ? s.markets[0] : "N/A",
          };
        }

        try {
          // Fetch positions for this account
          const positionsTable = s.mode === "live" ? "live_positions" : "virtual_positions";
          const { data: positions } = await serviceClient
            .from(positionsTable)
            .select("*")
            .eq("account_id", account.id);

          if (!positions || positions.length === 0) {
            // No positions - for live mode use synced equity, for virtual use cash_balance
            const calculatedEquity = s.mode === "live"
              ? Number(account.equity || 0)  // Live: use Hyperliquid-synced equity
              : Number(account.cash_balance || 0);  // Virtual: cash_balance

            // Update account object with calculated equity
            const updatedAccount = {
              ...account,
              equity: calculatedEquity,
            };

            return {
              ...s,
              strategies: s.strategies || {},
              sim_accounts: s.mode === "virtual" ? updatedAccount : s.virtual_accounts,
              virtual_accounts: s.mode === "virtual" ? updatedAccount : s.virtual_accounts,
              live_accounts: s.mode === "live" ? updatedAccount : s.live_accounts,
              market: Array.isArray(s.markets) && s.markets.length > 0 ? s.markets[0] : "N/A",
            };
          }

          // Get current prices for all position markets
          const markets = positions.map((p: any) => p.market);
          const prices = await getMidPrices(markets);

          // Calculate unrealized PnL
          let totalUnrealizedPnl = 0;
          for (const pos of positions) {
            const currentPrice = prices[pos.market];
            if (currentPrice) {
              const pnl = pos.side === "long"
                ? (currentPrice - Number(pos.avg_entry)) * Number(pos.size)
                : (Number(pos.avg_entry) - currentPrice) * Number(pos.size);
              totalUnrealizedPnl += pnl;
            } else {
              // No fresh price, use stored unrealized_pnl
              totalUnrealizedPnl += Number(pos.unrealized_pnl || 0);
            }
          }

          // Calculate real-time equity
          // For live mode: use Hyperliquid-synced equity (already accurate)
          // For virtual mode: cash + unrealized PnL
          const calculatedEquity = s.mode === "live"
            ? Number(account.equity || 0)
            : Number(account.cash_balance || 0) + totalUnrealizedPnl;

          // Update account object with calculated equity
          const updatedAccount = {
            ...account,
            equity: calculatedEquity,
          };

          return {
            ...s,
            strategies: s.strategies || {},
            sim_accounts: s.mode === "virtual" ? updatedAccount : s.virtual_accounts,
            virtual_accounts: s.mode === "virtual" ? updatedAccount : s.virtual_accounts,
            live_accounts: s.mode === "live" ? updatedAccount : s.live_accounts,
            market: Array.isArray(s.markets) && s.markets.length > 0 ? s.markets[0] : "N/A",
          };
        } catch (calcError) {
          console.error(`Error calculating equity for session ${s.id}:`, calcError);
          // Fall back to database equity if calculation fails
          return {
            ...s,
            strategies: s.strategies || {},
            sim_accounts: s.virtual_accounts || null,
            market: Array.isArray(s.markets) && s.markets.length > 0 ? s.markets[0] : "N/A",
          };
        }
      })
    );

    return NextResponse.json({ sessions: sessionsWithCalculatedEquity });
  } catch (error: any) {
    console.error("Sessions API error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { strategy_id, mode = "virtual" } = body;

    if (!strategy_id) {
      return NextResponse.json({ error: "strategy_id is required" }, { status: 400 });
    }

    // Validate mode
    if (mode !== "virtual" && mode !== "live" && mode !== "arena") {
      return NextResponse.json({ error: "Invalid mode. Must be 'virtual', 'live', or 'arena'" }, { status: 400 });
    }

    // IMPORTANT: Arena is Virtual-only ($100k competition)
    // Arena mode automatically uses virtual execution with standardized $100k starting equity
    // There is no "live arena" - the mode field is the single source of truth
    if (mode === "arena") {
      console.log("[Session Creation] 🏆 Arena mode: Will use virtual execution with $100k starting equity");
    }

    const serviceClient = createServiceRoleClient();

    // Verify strategy exists and belongs to user
    const { data: strategy, error: strategyError } = await serviceClient
      .from("strategies")
      .select("*")
      .eq("id", strategy_id)
      .eq("user_id", user.id)
      .single();

    if (strategyError || !strategy) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Get markets and cadence from filters
    const filters = strategy.filters || {};
    const markets = filters.markets || [];
    let cadenceSeconds = filters.cadenceSeconds;
    
    // Validate cadence
    if (!cadenceSeconds || cadenceSeconds <= 0 || !Number.isInteger(cadenceSeconds)) {
      console.warn(`[Session Creation] Invalid cadence in strategy filters: ${cadenceSeconds}, using default 30s`);
      cadenceSeconds = 30;
    }
    
    console.log(`[Session Creation] Creating session with cadence: ${cadenceSeconds}s from strategy: ${strategy.name}`);

    if (markets.length === 0) {
      return NextResponse.json({ error: "Strategy must have at least one market configured" }, { status: 400 });
    }

    // Validate required strategy configuration before allowing session creation
    const risk = filters.risk || {};
    if (!risk.maxPositionUsd || risk.maxPositionUsd <= 0) {
      return NextResponse.json({
        error: "Strategy must have valid Max Position (USD) configured in Risk Filters. Please edit your strategy and set this value."
      }, { status: 400 });
    }

    if (!risk.maxLeverage || risk.maxLeverage <= 0) {
      return NextResponse.json({
        error: "Strategy must have valid Max Leverage configured in Risk Filters. Please edit your strategy and set this value."
      }, { status: 400 });
    }

    if (!cadenceSeconds || cadenceSeconds <= 0) {
      return NextResponse.json({
        error: "Strategy must have valid cadence configured. Please edit your strategy and set this value."
      }, { status: 400 });
    }

    // Create account based on mode
    let accountId = null;
    let liveAccountId = null;
    let sessionStartingEquity: number | null = null; // Track starting equity at session creation

    if (mode === "virtual" || mode === "arena") {
      // Arena mode uses virtual account with standardized starting equity (100k)
      const accountName = mode === "arena" 
        ? `Arena - ${strategy.name}` 
        : `Demo Account - ${strategy.name}`;
      
      const { data: account, error: accountError } = await serviceClient
        .from("virtual_accounts")
        .insert({
          user_id: user.id,
          name: accountName,
          starting_equity: 100000, // Standardized for fair comparison in arena
          cash_balance: 100000,
          equity: 100000,
        })
        .select()
        .single();

      if (accountError || !account) {
        console.error(`Error creating ${mode} account:`, accountError);
        return NextResponse.json({ error: `Failed to create ${mode} account` }, { status: 500 });
      }

      accountId = account.id;
      sessionStartingEquity = 100000; // Capture starting equity for session
      console.log(`[Session Creation] ✅ ${mode} account created: ${accountId} with $100,000 starting equity`);
    } else if (mode === "live") {
      // For live mode, fetch or create live account with REAL exchange data
      // Get venue from strategy filters (default to hyperliquid for backward compatibility)
      const venue = filters.venue || "hyperliquid";
      const venueName = venue === "coinbase" ? "Coinbase" : "Hyperliquid";
      console.log(`[Session Creation] Creating LIVE account for ${venueName} - fetching real equity`);

      try {
        const liveAccount = await getOrCreateLiveAccount(user.id, serviceClient, venue);
        liveAccountId = liveAccount.id;
        sessionStartingEquity = liveAccount.equity; // Capture current equity as session starting point
        console.log(`[Session Creation] ✅ Live account created/fetched: ${liveAccountId}, Real equity: $${liveAccount.equity.toFixed(2)}`);
        console.log(`[Session Creation] 📊 Session starting_equity set to: $${sessionStartingEquity?.toFixed(2) ?? 'N/A'}`);
      } catch (error: any) {
        console.error(`[Session Creation] ❌ Failed to create live account:`, error);
        return NextResponse.json({
          error: `Failed to connect to ${venueName}: ${error.message}. Please check your exchange connection in Settings.`
        }, { status: 500 });
      }
    }

    // Create session
    const sessionData: any = {
      user_id: user.id,
      strategy_id: strategy_id,
      mode,
      status: "stopped",
      markets: markets,
      cadence_seconds: cadenceSeconds,
      starting_equity: sessionStartingEquity, // Per-session starting equity
      venue: filters.venue || "hyperliquid", // Store venue for broker selection
    };

    // Set account_id based on mode
    if (mode === "virtual" || mode === "arena") {
      sessionData.account_id = accountId;
    } else if (mode === "live") {
      sessionData.live_account_id = liveAccountId;
    }
    
    // For arena mode, automatically create arena entry
    let arenaEntryId = null;
    if (mode === "arena") {
      // Get user's username
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
      
      if (!profile || !profile.username || profile.username.trim().length < 2) {
        return NextResponse.json({ 
          error: "Arena requires a valid username. Please set your username in profile settings first." 
        }, { status: 400 });
      }
    }

    const { data: session, error: sessionError } = await serviceClient
      .from("strategy_sessions")
      .insert(sessionData)
      .select(`
        *,
        strategies(id, name, model_provider, model_name),
        virtual_accounts(id, equity, starting_equity, cash_balance),
        live_accounts(id, equity, starting_equity, cash_balance)
      `)
      .single();

    if (sessionError || !session) {
      console.error("Error creating session:", sessionError);
      return NextResponse.json({ 
        error: sessionError?.message || "Failed to create session" 
      }, { status: 500 });
    }

    // RUNTIME ASSERTION: Arena sessions must never be live mode
    // Arena is virtual-only ($100k competition)
    if (session.mode === "arena" && session.mode === "live") {
      console.error("[Session Creation] ❌ ASSERTION FAILED: Arena session created with LIVE mode. Arena must be virtual-only.");
      throw new Error("ASSERTION FAILED: Arena session cannot be LIVE mode. Arena is virtual-only.");
    }

    // Verify Arena uses virtual account, not live account
    if (session.mode === "arena") {
      if (!session.virtual_accounts || session.live_accounts) {
        console.error("[Session Creation] ❌ ASSERTION FAILED: Arena session must use virtual_accounts, not live_accounts.");
        throw new Error("ASSERTION FAILED: Arena must use virtual broker.");
      }
      console.log(`[Session Creation] ✅ Arena session verified: mode=arena, using virtual_account ${accountId}, starting_equity=$100k`);
    }

    // For arena mode, automatically create arena entry
    if (mode === "arena") {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
      
      if (profile && profile.username) {
        const { error: arenaError } = await serviceClient
          .from("arena_entries")
          .insert({
            user_id: user.id,
            session_id: session.id,
            mode: "arena",
            display_name: profile.username.trim(),
            active: true,
            arena_status: 'active', // New arena participant is active by default
          });
        
        if (arenaError) {
          console.error("Error creating arena entry:", arenaError);
          // Don't fail the whole request, just log the error
        } else {
          console.log(`[Session Creation] ✅ Arena entry created for session ${session.id} with active status`);
        }
      }
    }

    return NextResponse.json({
      session: {
        ...session,
        strategies: session.strategies || {},
        sim_accounts: session.virtual_accounts || null,
      },
    });
  } catch (error: any) {
    console.error("Create session error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
