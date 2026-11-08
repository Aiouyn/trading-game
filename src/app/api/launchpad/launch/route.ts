import { authErrorResponse, jsonResponse } from "@/server/auth";
import { assertOnlyKeys, readBrokerMutation, requireBrokerSession, requireIdempotencyKey } from "@/server/broker/http";
import { getLaunchpad } from "@/server/launchpad";
import { launchInput } from "@/server/launchpad/http";

export const dynamic = "force-dynamic";

/** One reviewed Launchpad launch for the caller's own account (same-origin JSON, signed in, one idempotency key). */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBrokerMutation(request);
    assertOnlyKeys(body, ["idempotencyKey", "name", "ticker", "tagline", "fee"]);
    const key = requireIdempotencyKey(body);
    const input = launchInput(body);
    const session = await requireBrokerSession(request);
    return jsonResponse(await getLaunchpad().launch(session, key, input));
  } catch (err) {
    return authErrorResponse(err);
  }
}
