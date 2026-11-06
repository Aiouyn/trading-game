import {
  AuthError,
  assertLocalSingleProcessAuth,
  authErrorResponse,
  getAuthService,
  jsonResponse,
  sessionBody,
  tokenFromRequest,
} from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    assertLocalSingleProcessAuth();
    const view = await getAuthService().resolveSession(tokenFromRequest(request));
    if (!view) {
      throw new AuthError("UNAUTHORIZED", "Not signed in.", 401);
    }
    const player = await getAuthService().getPlayerPrivate(view, view.account.accountId);
    return jsonResponse({
      ...sessionBody(view),
      player: {
        accountId: player.accountId,
        cashCents: player.cashCents,
        positions: player.positions,
        openOrderIds: player.openOrderIds,
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
