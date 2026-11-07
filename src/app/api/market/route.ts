import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { getLiveMarket } from "@/server/market/clock";

export const dynamic = "force-dynamic";

/**
 * Shared Port Avalon quotes (M1-05). GET only: this route does not write cash, holdings, or orders.
 * One process-local clock. A refresh reads the same tick; a process restart starts it again.
 * M1-06: the first read also attaches the Broker's resting-order sweep to that clock (the clock, not this read, fills).
 */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  getBroker();
  return jsonResponse(getLiveMarket().snapshot());
}
