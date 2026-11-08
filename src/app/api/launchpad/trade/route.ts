import { authErrorResponse, jsonResponse } from "@/server/auth";
import { assertOnlyKeys, readBrokerMutation, requireBrokerSession, requireIdempotencyKey } from "@/server/broker/http";
import { getLaunchpad } from "@/server/launchpad";
import { tradeInput } from "@/server/launchpad/http";

export const dynamic = "force-dynamic";

/** One reviewed Launchpad trade for the caller's own account (same-origin JSON, signed in, one idempotency key). */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBrokerMutation(request);
    assertOnlyKeys(body, ["idempotencyKey", "ticker", "side", "amount", "min", "mode"]);
    const key = requireIdempotencyKey(body);
    const input = tradeInput(body);
    const session = await requireBrokerSession(request);
    return jsonResponse(await getLaunchpad().trade(session, key, input));
  } catch (err) {
    return authErrorResponse(err);
  }
}
