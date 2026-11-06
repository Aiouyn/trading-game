import {
  authErrorResponse,
  getAuthService,
  jsonResponse,
  tokenFromRequest,
  withClearedSessionCookie,
} from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await getAuthService().logout(tokenFromRequest(request));
    const res = jsonResponse({ ok: true }, 200);
    return withClearedSessionCookie(res, request.url);
  } catch (err) {
    return authErrorResponse(err);
  }
}
