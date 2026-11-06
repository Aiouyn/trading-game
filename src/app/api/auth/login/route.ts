import {
  authErrorResponse,
  getAuthService,
  jsonResponse,
  readJsonObject,
  requireString,
  sessionBody,
  withSessionCookie,
} from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const handle = requireString(body, "handle");
    const password = requireString(body, "password");
    const { view, rawToken } = await getAuthService().login({ handle, password });
    const res = jsonResponse(sessionBody(view), 200);
    return withSessionCookie(res, rawToken, request.url);
  } catch (err) {
    return authErrorResponse(err);
  }
}
