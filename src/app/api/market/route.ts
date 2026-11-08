import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { syncListings } from "@/server/launchpad";
import { getBroker } from "@/server/broker";
import { getLiveMarket } from "@/server/market/clock";

export const dynamic = "force-dynamic";

/**
 * Shared Port Avalon quotes (M1-05). GET only: this route does not write cash, holdings, or orders.
 * One process-local clock. A refresh reads the same tick; a process restart starts it again.
 * M1-06: the first read also attaches the Broker's resting-order sweep to that clock (the clock, not this read, fills).
 * M1-07: and the candle history (GET /api/market/candles) starts sampling it.
 */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  getBroker();
  await syncListings(); // L4: graduated coins are quoted from the first read after a start
  return jsonResponse(getLiveMarket().snapshot());
}
