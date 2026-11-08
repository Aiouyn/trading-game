import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { getLiveMarket } from "@/server/market/clock";

export const dynamic = "force-dynamic";

/**
 * Port Avalon Wire stories (M1-09): the stories the shared clock has published, each with the price effect it applied
 * to the quotes at its tick (GET /api/market reads the same clock). GET only: reading publishes nothing, applies
 * nothing and writes no account. Process-local like the clock: a restart is a new `epoch` whose stories start again.
 */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  getBroker();
  return jsonResponse(getLiveMarket().wire());
}
