import { authErrorResponse, jsonResponse } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { assertOnlyKeys, readBrokerMutation, requireBrokerSession, requireDraft, requireIdempotencyKey } from "@/server/broker/http";
import { assertMutationAllowed } from "@/server/mutationLimit";
import { runTelemetryContext } from "@/server/telemetry";

export const dynamic = "force-dynamic";

/**
 * Place one order on the caller's own ledger (M1-06). The server prices and fills it from its own quote; the body
 * carries only the draft and an idempotency key. The same key again returns the first decision without executing.
 */
export async function POST(request: Request): Promise<Response> {
  return runTelemetryContext(request, async () => {
    try {
      await assertMutationAllowed(request);
      const body = await readBrokerMutation(request);
      assertOnlyKeys(body, ["idempotencyKey", "draft"]);
      const key = requireIdempotencyKey(body);
      const draft = requireDraft(body);
      const session = await requireBrokerSession(request);
      return jsonResponse(await getBroker().place(session, key, draft));
    } catch (err) {
      return authErrorResponse(err);
    }
  });
}
