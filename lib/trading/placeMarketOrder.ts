/**
 * Shared order execution module
 *
 * Routes orders to the correct broker (Hyperliquid, Coinbase, or virtual)
 * based on session mode and venue. Handles trade recording, PnL calculation,
 * and session pausing on critical failures.
 *
 * Used by:
 * - Tick route (AI-driven entries and exits)
 * - Price guard (automated TP/SL exits between ticks)
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { placeMarketOrder as placeHyperliquidOrder } from "@/lib/hyperliquid/orderExecution";
import { placeMarketOrder as placeCoinbaseOrder } from "@/lib/coinbase/orderExecution";
import { placeMarketOrder as placeVirtualOrder } from "@/lib/brokers/virtualBroker";
import {
  recordLiveTrade,
  updatePositionFromTrade,
} from "@/lib/brokers/liveBroker";
import type { Venue } from "@/lib/engine/types";

export async function placeMarketOrder(params: {
  sessionMode: "virtual" | "live" | "arena";
  venue?: Venue;
  livePrivateKey?: string;
  liveApiKey?: string;
  liveApiSecret?: string;
  account_id: string;
  strategy_id: string;
  session_id: string;
  market: string;
  side: "buy" | "sell";
  notionalUsd: number;
  slippageBps: number;
  feeBps: number;
  isExit?: boolean;
  exitPosition?: { side: "long" | "short"; avgEntry: number };
  exitPositionSize?: number;
  leverage?: number;
}): Promise<{
  success: boolean;
  error?: string;
  trade?: any;
}> {
  const { sessionMode, venue = "hyperliquid", livePrivateKey, liveApiKey, liveApiSecret, isExit, exitPosition, exitPositionSize, leverage = 1, ...orderParams } = params;

  console.log(`[Order Execution] Session mode: ${sessionMode}, Venue: ${venue}`);

  if (sessionMode === "live") {
    // LIVE MODE: Place real order on exchange based on venue
    if (venue === "coinbase") {
      // COINBASE LIVE ORDER
      if (!liveApiKey || !liveApiSecret) {
        return { success: false, error: "Coinbase API credentials required for live trading" };
      }

      console.log(`[Order Execution] 🔴 LIVE MODE: Placing REAL order on Coinbase`);

      // For exits (closing positions), use sellAll (spot) or exactSize (INTX) to ensure complete close
      const isIntxMarket = orderParams.market.includes("-PERP") || orderParams.market.endsWith("-INTX");
      const isSellAll = isExit && orderParams.side === "sell" && !isIntxMarket; // sellAll is for spot only
      const exactSizeForIntx = isExit && isIntxMarket ? exitPositionSize : undefined;

      if (isSellAll) {
        console.log(`[Order Execution] 🔄 Exit order (spot): Using sellAll to close entire position`);
      }
      if (exactSizeForIntx) {
        console.log(`[Order Execution] 🔄 Exit order (INTX): Using exact size ${exactSizeForIntx} to close position`);
      }

      try {
        const result = await placeCoinbaseOrder(
          liveApiKey,
          liveApiSecret,
          orderParams.market,
          orderParams.side,
          orderParams.notionalUsd,
          isSellAll,
          exactSizeForIntx
        );

        if (result.success) {
          console.log(`[Order Execution] ✅ Coinbase order placed successfully: ${result.orderId}`);

          // Record the trade in our database
          try {
            const tradeSize = result.fillSize || 0;
            const tradePrice = result.fillPrice || 0;
            const tradeFee = (result.fillValue || orderParams.notionalUsd) * (orderParams.feeBps / 10000);

            // Calculate realized PnL for exit trades
            let realizedPnl = 0;
            if (isExit && exitPosition && tradeSize > 0 && tradePrice > 0) {
              if (exitPosition.side === "long") {
                realizedPnl = (tradePrice - exitPosition.avgEntry) * tradeSize;
              } else {
                realizedPnl = (exitPosition.avgEntry - tradePrice) * tradeSize;
              }
              console.log(`[Order Execution] 💰 Calculated realized PnL: ${exitPosition.side} entry=$${exitPosition.avgEntry.toFixed(2)}, exit=$${tradePrice.toFixed(2)}, size=${tradeSize.toFixed(8)} → PnL=$${realizedPnl.toFixed(4)}`);
            }

            // Determine leverage - INTX perpetuals can use leverage, spot is always 1x
            const isIntxMarketForLeverage = orderParams.market.includes("-PERP") || orderParams.market.endsWith("-INTX");
            const tradeLeverage = isIntxMarketForLeverage ? (leverage || 1) : 1;

            await recordLiveTrade(
              orderParams.account_id,
              orderParams.session_id || "",
              {
                market: orderParams.market,
                action: isExit ? "close" : "open",
                side: orderParams.side,
                size: tradeSize,
                price: tradePrice,
                fee: tradeFee,
                realized_pnl: realizedPnl,
                venue_order_id: result.orderId,
                leverage: tradeLeverage,
              }
            );
            console.log(`[Order Execution] ✅ Coinbase trade recorded: ${tradeSize.toFixed(8)} @ $${tradePrice.toFixed(2)}, PnL: $${realizedPnl.toFixed(4)} (${tradeLeverage}x leverage)`);

            // For INTX perpetuals, update position locally since we can't sync from Coinbase API
            if (isIntxMarketForLeverage) {
              await updatePositionFromTrade(
                orderParams.account_id,
                {
                  market: orderParams.market,
                  action: isExit ? "close" : "open",
                  side: orderParams.side,
                  size: tradeSize,
                  price: tradePrice,
                  leverage: tradeLeverage,
                }
              );
            }
          } catch (dbError: any) {
            console.error(`[CRITICAL] Live Coinbase trade executed but DB recording failed. Manual intervention required.`);
            console.error(`[CRITICAL] Trade details:`, JSON.stringify({
              account_id: orderParams.account_id,
              session_id: orderParams.session_id,
              market: orderParams.market,
              side: orderParams.side,
              orderId: result.orderId,
              fillPrice: result.fillPrice,
              fillSize: result.fillSize,
              error: dbError.message,
            }));

            // Pause the session to prevent further trading with corrupted state
            try {
              const pauseClient = createServiceRoleClient();
              await pauseClient
                .from("strategy_sessions")
                .update({
                  status: "paused",
                  error_message: `CRITICAL: Coinbase trade executed (Order: ${result.orderId}) but failed to record in database. Manual review required.`,
                })
                .eq("id", orderParams.session_id);
            } catch (pauseErr) {
              console.error(`[CRITICAL] Also failed to pause session after trade recording failure`);
            }
          }

          return {
            success: true,
            trade: {
              order_id: result.orderId,
              fill_price: result.fillPrice,
              fill_size: result.fillSize,
            },
          };
        } else {
          console.error(`[Order Execution] ❌ Coinbase order failed: ${result.error}`);
          return {
            success: false,
            error: result.error || "Order failed",
          };
        }
      } catch (error: any) {
        console.error(`[Order Execution] ❌ Exception placing Coinbase order:`, error);
        return {
          success: false,
          error: error.message || "Failed to place order",
        };
      }
    } else {
      // HYPERLIQUID LIVE ORDER
      if (!livePrivateKey) {
        return { success: false, error: "Private key required for Hyperliquid live trading" };
      }

      console.log(`[Order Execution] 🔴 LIVE MODE: Placing REAL order on Hyperliquid`);

      try {
        // Remove -PERP suffix if present (SDK uses coin name without suffix)
        const coin = orderParams.market.replace(/-PERP$/i, "");

        const result = await placeHyperliquidOrder(
          livePrivateKey,
          coin,
          orderParams.side,
          orderParams.notionalUsd,
          orderParams.slippageBps / 10000,
          !!isExit,
          leverage
        );

        if (result.success) {
          console.log(`[Order Execution] ✅ Hyperliquid order placed successfully: ${result.orderId}`);

          // Record the trade in our database for tracking
          try {
            const tradeSize = result.fillSize || 0;
            const tradePrice = result.fillPrice || 0;
            const tradeFee = tradeSize * tradePrice * (orderParams.feeBps / 10000);

            // Calculate realized PnL for exit trades
            let realizedPnl = 0;
            if (isExit && exitPosition && tradeSize > 0 && tradePrice > 0) {
              if (exitPosition.side === "long") {
                realizedPnl = (tradePrice - exitPosition.avgEntry) * tradeSize;
              } else {
                realizedPnl = (exitPosition.avgEntry - tradePrice) * tradeSize;
              }
              console.log(`[Order Execution] 💰 Calculated realized PnL: ${exitPosition.side} entry=$${exitPosition.avgEntry.toFixed(2)}, exit=$${tradePrice.toFixed(2)}, size=${tradeSize.toFixed(4)} → PnL=$${realizedPnl.toFixed(4)}`);
            }

            await recordLiveTrade(
              orderParams.account_id,
              orderParams.session_id || "",
              {
                market: orderParams.market,
                action: isExit ? "close" : "open",
                side: orderParams.side,
                size: tradeSize,
                price: tradePrice,
                fee: tradeFee,
                realized_pnl: realizedPnl,
                venue_order_id: result.orderId,
                leverage: leverage,
              }
            );
            console.log(`[Order Execution] ✅ Trade recorded: ${tradeSize.toFixed(4)} ${coin} @ $${tradePrice.toFixed(2)}, PnL: $${realizedPnl.toFixed(4)} (${leverage}x leverage)`);
          } catch (dbError: any) {
            console.error(`[CRITICAL] Live Hyperliquid trade executed but DB recording failed. Manual intervention required.`);
            console.error(`[CRITICAL] Trade details:`, JSON.stringify({
              account_id: orderParams.account_id,
              session_id: orderParams.session_id,
              market: orderParams.market,
              side: orderParams.side,
              coin,
              orderId: result.orderId,
              fillPrice: result.fillPrice,
              fillSize: result.fillSize,
              leverage,
              error: dbError.message,
            }));

            // Pause the session to prevent further trading with corrupted state
            try {
              const pauseClient = createServiceRoleClient();
              await pauseClient
                .from("strategy_sessions")
                .update({
                  status: "paused",
                  error_message: `CRITICAL: Hyperliquid trade executed (Order: ${result.orderId}) but failed to record in database. Manual review required.`,
                })
                .eq("id", orderParams.session_id);
            } catch (pauseErr) {
              console.error(`[CRITICAL] Also failed to pause session after trade recording failure`);
            }
          }

          return {
            success: true,
            trade: {
              order_id: result.orderId,
              fill_price: result.fillPrice,
              fill_size: result.fillSize,
            },
          };
        } else {
          console.error(`[Order Execution] ❌ Hyperliquid order failed: ${result.error}`);
          return {
            success: false,
            error: result.error || "Order failed",
          };
        }
      } catch (error: any) {
        console.error(`[Order Execution] ❌ Exception placing Hyperliquid order:`, error);
        return {
          success: false,
          error: error.message || "Failed to place order",
        };
      }
    }
  } else {
    // VIRTUAL/ARENA MODE: Use virtual broker (simulation)
    const modeLabel = sessionMode === "arena" ? "ARENA (virtual)" : "VIRTUAL";
    console.log(`[Order Execution] 🟢 ${modeLabel} MODE: Simulating order (${leverage}x leverage)`);
    return await placeVirtualOrder({ ...orderParams, leverage });
  }
}
