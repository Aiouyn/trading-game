import { assertLocalSingleProcessAuth, jsonResponse } from "@/server/auth";
import { getLiveMarket } from "@/server/market/clock";

export const dynamic = "force-dynamic";

/**
 * Shared Port Avalon quotes (M1-05). GET only: this route does not write cash, holdings, or orders.
 * One process-local clock. A refresh reads the same tick; a process restart starts it again.
 */
export async function GET(): Promise<Response> {
  assertLocalSingleProcessAuth();
  return jsonResponse(getLiveMarket().snapshot());
}
