import {
  assertLocalSingleProcessAuth,
  assertSameOriginMutation,
  authErrorResponse,
  getAuthService,
  jsonResponse,
  readJsonObject,
  requireString,
  sessionBody,
  withSessionCookie,
} from "@/server/auth";
import { runTelemetryContext } from "@/server/telemetry";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return runTelemetryContext(request, async () => {
    try {
      assertLocalSingleProcessAuth();
      assertSameOriginMutation(request);
      const body = await readJsonObject(request);
      const handle = requireString(body, "handle");
      const password = requireString(body, "password");
      const { view, rawToken } = await getAuthService().login({ handle, password });
      const res = jsonResponse(sessionBody(view), 200);
      return withSessionCookie(res, rawToken, request.url);
    } catch (err) {
      return authErrorResponse(err);
    }
  });
}
