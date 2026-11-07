import { authErrorResponse, jsonResponse } from "@/server/auth";
import { getBroker } from "@/server/broker";
import { requireBrokerSession } from "@/server/broker/http";

export const dynamic = "force-dynamic";

/** The caller's own saved Broker ledger (M1-06). GET only; it never writes cash, holdings or orders. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireBrokerSession(request);
    return jsonResponse(await getBroker().read(session));
  } catch (err) {
    return authErrorResponse(err);
  }
}
