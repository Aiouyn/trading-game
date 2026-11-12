import { assertLocalSingleProcessAuth, authErrorResponse, getAuthService, jsonResponse, tokenFromRequest } from "@/server/auth";
import { getLaunchpad, syncListings } from "@/server/launchpad";

export const dynamic = "force-dynamic";

/**
 * The Launchpad board: every coin with its public curve state and public tape (no account ids; the creator's own trades
 * are flagged). A signed-in caller also gets their own cash and holdings, never anyone else's. GET only and read-only:
 * the session is checked without refreshing it (peekSession) and nothing is written.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalSingleProcessAuth();
    const session = await getAuthService().peekSession(tokenFromRequest(request));
    await syncListings(); // a graduated coin's mark is the listed asset's
    return jsonResponse(await getLaunchpad().view(session));
  } catch (err) {
    return authErrorResponse(err);
  }
}
