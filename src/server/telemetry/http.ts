import { assertLocalSingleProcessAuth } from "@/server/auth/deploy";
import { AuthError } from "@/server/auth/types";
import { assertSameOriginMutation, authErrorResponse, jsonResponse, readJsonObjectCapped } from "@/server/auth/http";
import { requestIdFrom } from "./ids";
import { TELEMETRY_MAX_BODY_BYTES } from "./log";
import { checkTelemetryRate } from "./ratelimit";
import { runTelemetryContext } from "./context";

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, headers });
}

export async function readTelemetryBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await readJsonObjectCapped(request, TELEMETRY_MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof AuthError && /too large/i.test(err.message)) {
      throw new AuthError("BAD_REQUEST", "Request body is too large.", 400);
    }
    throw err;
  }
}

export function telemetryGuard(request: Request, kind: "error" | "event" | "feedback" | "optout"): string {
  assertLocalSingleProcessAuth();
  assertSameOriginMutation(request);
  const retry = checkTelemetryRate(kind, request);
  if (retry !== null) {
    throw new AuthError("RATE_LIMITED", "Too many telemetry requests. Try again later.", 429, retry);
  }
  return requestIdFrom(request);
}

export async function handleTelemetry(
  request: Request,
  kind: "error" | "event" | "feedback" | "optout",
  fn: (body: Record<string, unknown>, requestId: string) => Promise<Response>,
): Promise<Response> {
  return runTelemetryContext(request, async () => {
    let requestId = requestIdFrom(request);
    try {
      requestId = telemetryGuard(request, kind);
      const type = request.headers.get("content-type") ?? "";
      if (!/^application\/json\b/i.test(type)) throw new AuthError("BAD_REQUEST", "Expected application/json.", 415);
      const body = await readTelemetryBody(request);
      return withRequestId(await fn(body, requestId), requestId);
    } catch (err) {
      return withRequestId(authErrorResponse(err), requestId);
    }
  });
}

export { jsonResponse };
