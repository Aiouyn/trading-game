import { AuthError, authErrorResponse, getAuthService, jsonResponse, tokenFromRequest } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { assertOnlyKeys, readBrokerMutation, requireDraft } from "@/server/broker/http";

export const dynamic = "force-dynamic";

/** Read-only authoritative finite-book estimate. The POST body is never an intent and saves nothing. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBrokerMutation(request);
    assertOnlyKeys(body, ["draft"]);
    const draft = requireDraft(body);
    const session = await getAuthService().peekSession(tokenFromRequest(request));
    if (!session) throw new AuthError("UNAUTHORIZED", "Not signed in.", 401);
    return jsonResponse(await getBroker().preview(session, draft));
  } catch (err) {
    return authErrorResponse(err);
  }
}
