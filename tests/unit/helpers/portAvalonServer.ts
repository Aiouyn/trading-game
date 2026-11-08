// Test double for the two signed-in reads a feed makes (M1-05 /api/market, M1-06 /api/broker/me), routed by URL.
// Real LiveMarket snapshots; the ledger is whatever the test says the server saved.
import type { BrokerLedgerView } from "@/market/brokerLedger";
import { LiveMarket } from "@/server/market/clock";

export interface ServerStubOptions {
  readonly cashCents?: number;
  readonly market?: LiveMarket;
  readonly ledger?: Partial<BrokerLedgerView>;
  /** Anything else (e.g. /api/auth/me); default 404. */
  readonly other?: (url: string, init?: RequestInit) => Response | Promise<Response>;
}

export function portAvalonServer(opts: ServerStubOptions = {}) {
  const market = opts.market ?? new LiveMarket();
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/api/market")) return Response.json(market.snapshot());
    if (url.endsWith("/api/broker/me")) {
      const view: BrokerLedgerView = {
        tick: market.snapshot().tick, cashCents: opts.cashCents ?? 1_000_000, reservedCashCents: 0,
        positions: {}, orders: {}, fills: [], intents: [], coins: [], ...opts.ledger,
      };
      return Response.json(view);
    }
    return opts.other ? opts.other(url, init) : new Response(null, { status: 404 });
  };
}
