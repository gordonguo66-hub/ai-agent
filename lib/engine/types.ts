export type SessionMode = "virtual" | "live";
export type SessionStatus = "running" | "stopped";

export type OrderSide = "buy" | "sell";

// Exchange venues
export type Venue = "hyperliquid" | "coinbase";

// Market types - perpetual (Hyperliquid) vs spot (Coinbase)
export type MarketType = "perpetual" | "spot";

export interface MarketData {
  market: string;
  bid: number;
  ask: number;
  mid: number;
  mark: number;
  timestamp: number;
  venue?: Venue;
  marketType?: MarketType;
}

export interface OrderRequest {
  market: string;
  side: OrderSide;
  size: number; // base units
  clientOrderId: string;
}

export interface OrderExecutionResult {
  status: "skipped" | "filled" | "sent" | "failed";
  filledPrice?: number;
  feeUsd?: number;
  realizedPnlUsd?: number;
  venueResponse: Record<string, any>;
}

// Spot balance for Coinbase accounts
export interface SpotBalance {
  asset: string;
  available: number;
  hold: number;
  total: number;
  usdValue: number;
}

export interface EngineAccountState {
  // For risk checks + sizing only
  equityUsd: number;
  cashUsd?: number;
  // signed notional exposure in USD (approx)
  netExposureUsd: number;
  // absolute exposure in USD (approx)
  grossExposureUsd: number;
  // Spot balances for Coinbase accounts
  spotBalances?: SpotBalance[];
}

export interface BrokerContext {
  userId: string;
  sessionId: string;
  mode: SessionMode;
  marketData: MarketData;
  venue?: Venue;
}

export interface Broker {
  placeOrder(ctx: BrokerContext, req: OrderRequest): Promise<OrderExecutionResult>;
  // Called each tick even if no order (virtual uses this to update unrealized/equity curve)
  onTick?(ctx: BrokerContext): Promise<void>;
  getAccountState(ctx: BrokerContext): Promise<EngineAccountState>;
}

