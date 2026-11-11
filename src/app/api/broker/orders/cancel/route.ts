import { authErrorResponse, jsonResponse } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { assertOnlyKeys, readBrokerMutation, requireBrokerSession, requireIdempotencyKey, requireOrderId } from "@/server/broker/http";
import { assertMutationAllowed } from "@/server/mutationLimit";

export const dynamic = "force-dynamic";

/** Cancel one of the caller's own working orders (M1-06). Idempotent by key, like placing. */
export async function POST(request: Request): Promise<Response> {
  try {
    await assertMutationAllowed(request);
    const body = await readBrokerMutation(request);
    assertOnlyKeys(body, ["idempotencyKey", "orderId"]);
    const key = requireIdempotencyKey(body);
    const orderId = requireOrderId(body);
    const session = await requireBrokerSession(request);
    return jsonResponse(await getBroker().cancel(session, key, orderId));
  } catch (err) {
    return authErrorResponse(err);
  }
}
