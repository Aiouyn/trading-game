import { AuthError, assertLocalSingleProcessAuth, authErrorResponse, jsonResponse } from "@/server/auth";
import { getLaunchpad } from "@/server/launchpad";

export const dynamic = "force-dynamic";

/**
 * One coin's recorded price/volume history (one point per executed trade: the curve after it and the tape's volume).
 * Public and read-only: no session is read or refreshed, nothing is written, and the reply holds no account ids,
 * handles, order ids, receipts or holdings.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalSingleProcessAuth();
    const ticker = new URL(request.url).searchParams.get("ticker") ?? "";
    if (!/^[A-Z]{3,5}$/.test(ticker)) throw new AuthError("BAD_REQUEST", "Invalid ticker.", 400);
    const h = await getLaunchpad().history(ticker);
    return h ? jsonResponse(h) : jsonResponse({ error: { code: "UNKNOWN_COIN", message: "No coin with that ticker." } }, 404);
  } catch (err) {
    return authErrorResponse(err);
  }
}
