import { Broker, BrokerContext, EngineAccountState, OrderExecutionResult, OrderRequest } from "@/lib/engine/types";
import { hyperliquidClient } from "@/lib/hyperliquid/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptCredential } from "@/lib/crypto/credentials";

import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { PrivateKeySigner } from "@nktkas/hyperliquid/signing";

// Cache coin->assetIndex mapping in-memory
const assetIndexCache = new Map<string, number>();

export class HyperliquidBroker implements Broker {
  async getAccountState(ctx: BrokerContext): Promise<EngineAccountState> {
    const { walletAddress } = await this.getLatestConnectionOrThrow(ctx.userId);
    const state = await hyperliquidClient.getAccountState(walletAddress);

    const equityUsd = Number(state.marginSummary.accountValue || "0");
    const grossExposureUsd = Number(state.marginSummary.totalNtlPos || "0");

    // net exposure: sum(szi)*mid approx
    const mid = ctx.marketData.mid;
    const netExposureUsd = (state.positions || []).reduce((acc, p: any) => {
      const szi = Number((p as any).szi ?? 0);
      return acc + szi * mid;
    }, 0);

    return {
      equityUsd,
      grossExposureUsd: Math.abs(grossExposureUsd),
      netExposureUsd,
    };
  }

  async placeOrder(ctx: BrokerContext, req: OrderRequest): Promise<OrderExecutionResult> {
    // Safety: live broker should only be called for live mode.
    if (ctx.mode !== "live") {
      return { status: "skipped", venueResponse: { reason: "not live mode" } };
    }

    if (!req.size || req.size <= 0) {
      return { status: "skipped", venueResponse: { reason: "size=0" } };
    }

    const { walletAddress, privateKey } = await this.getLatestConnectionOrThrow(ctx.userId);

    // Hyperliquid: emulate market with aggressive IOC limit at top-of-book.
    const ob = await hyperliquidClient.getOrderbookTop(req.market);
    const isBuy = req.side === "buy";
    const px = isBuy ? ob.ask * 1.001 : ob.bid * 0.999;

    const coin = normalizeCoin(req.market);
    const a = await getAssetIndex(coin);

    const signer = new PrivateKeySigner(normalizePk(privateKey));
    const exchange = new ExchangeClient({
      transport: new HttpTransport(),
      wallet: signer,
    });

    try {
      const res = await exchange.order({
        orders: [
          {
            a,
            b: isBuy,
            p: px.toFixed(2),
            s: req.size.toString(),
            r: false,
            t: { limit: { tif: "Ioc" } },
          },
        ],
        grouping: "na",
      } as any);

      return {
        status: "sent",
        venueResponse: {
          broker: "hyperliquid",
          request: { a, coin, px, size: req.size, side: req.side, clientOrderId: req.clientOrderId },
          response: res,
        },
      };
    } catch (e: any) {
      return {
        status: "failed",
        venueResponse: { broker: "hyperliquid", error: e?.message || String(e) },
      };
    }
  }

  private async getLatestConnectionOrThrow(userId: string): Promise<{ walletAddress: string; privateKey: string }> {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("exchange_connections")
      .select("wallet_address, key_material_encrypted")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      throw new Error("No exchange connection found. Please connect Hyperliquid in Settings.");
    }

    return {
      walletAddress: data.wallet_address,
      privateKey: decryptCredential(data.key_material_encrypted),
    };
  }
}

function normalizeCoin(market: string) {
  // UI uses BTC-PERP; Hyperliquid universe uses coin like "BTC"
  return market.replace(/-PERP$/i, "");
}

function normalizePk(pk: string) {
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

async function getAssetIndex(coin: string): Promise<number> {
  const cached = assetIndexCache.get(coin);
  if (typeof cached === "number") return cached;

  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta" }),
  });
  if (!res.ok) throw new Error(`Failed to load Hyperliquid meta: ${res.statusText}`);
  const data = await res.json();

  const universe: Array<{ name: string }> = data?.universe || data?.[0]?.universe || [];
  const idx = universe.findIndex((u) => u?.name === coin);
  if (idx < 0) throw new Error(`Coin ${coin} not found in Hyperliquid universe`);

  assetIndexCache.set(coin, idx);
  return idx;
}

