import { assertLocalSingleProcessAuth, AuthError, authErrorResponse, getAuthService, jsonResponse, tokenFromRequest } from "@/server/auth";
import { buildLeaderboard } from "@/server/leaderboard/board";
import { getLiveMarket } from "@/server/market/clock";

export const dynamic = "force-dynamic";

/**
 * World net-worth board (M2-03). Signed-in players only. GET only and read-only: the session is checked without
 * refreshing it (peekSession) and the ledgers are read inside the auth lock with the quote snapshot taken in the same
 * step, so nothing is written to the store and every row is valued at one tick. Public-safe rows only.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalSingleProcessAuth();
    const auth = getAuthService();
    const session = await auth.peekSession(tokenFromRequest(request));
    if (!session) throw new AuthError("UNAUTHORIZED", "Not signed in.", 401);
    const market = getLiveMarket();
    return jsonResponse(await auth.readStandings((rows) => buildLeaderboard(rows, market.snapshot(), session.account.accountId)));
  } catch (err) {
    return authErrorResponse(err);
  }
}
