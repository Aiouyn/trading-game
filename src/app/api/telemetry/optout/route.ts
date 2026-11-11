import { AuthError } from "@/server/auth/types";
import { getAuthService } from "@/server/auth/instance";
import { jsonResponse, tokenFromRequest } from "@/server/auth/http";
import { addOptOut, anonIdForAccount, handleTelemetry, isAnonId } from "@/server/telemetry";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleTelemetry(request, "optout", async (body, requestId) => {
    const view = await getAuthService().resolveSession(tokenFromRequest(request));
    const anonId = view ? anonIdForAccount(view.account.accountId) : body.anonId;
    if (!isAnonId(anonId)) throw new AuthError("BAD_REQUEST", "Missing or invalid field: anonId.", 400);
    await addOptOut(anonId);
    return jsonResponse({ ok: true, requestId });
  });
}
