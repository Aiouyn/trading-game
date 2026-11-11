import {
  AuthError,
  assertLocalSingleProcessAuth,
  authErrorResponse,
  getAuthService,
  jsonResponse,
  sessionBody,
  tokenFromRequest,
} from "@/server/auth";
import { getLiveMarket } from "@/server/market/clock";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalSingleProcessAuth();
    const view = await getAuthService().resolveSession(tokenFromRequest(request));
    if (!view) {
      throw new AuthError("UNAUTHORIZED", "Not signed in.", 401);
    }
    const auth = getAuthService();
    const player = await auth.getPlayerPrivate(view, view.account.accountId);
    const tick = getLiveMarket().wire().tick;
    return jsonResponse({
      ...sessionBody(view),
      // Own ledger only (session-gated). Read-only: there is no client write route for cash/holdings.
      player: {
        accountId: player.accountId,
        cashCents: player.cashCents,
        positions: player.positions,
        openOrders: player.openOrders,
      },
      remainingToday: await auth.remainingWirePostsToday(view.account.accountId, tick),
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
