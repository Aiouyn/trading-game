import { assertLocalSingleProcessAuth } from "@/server/auth/deploy";
import { AuthError } from "@/server/auth/types";
import { assertSameOriginMutation, authErrorResponse, jsonResponse } from "@/server/auth/http";
import { isAnonId, requestIdFrom } from "./ids";
import { TELEMETRY_MAX_BODY_BYTES, TelemetryDirFullError } from "./log";
import { checkTelemetryRate, mintTelemetryGuestId, readTelemetryGuestId, telemetryGuestCookieHeader } from "./ratelimit";
import { runTelemetryContext } from "./context";

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Read a JSON object, enforcing `maxBytes` on the stream. An oversize body is cancelled
 * after the cap (at most one extra chunk is pulled) and never fully buffered.
 */
export async function readJsonObjectCappedStreaming(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && declared !== "") {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      try { await request.body?.cancel(); } catch { /* already closed */ }
      throw new AuthError("BAD_REQUEST", "Request body is too large.", 400);
    }
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("BAD_REQUEST", "Expected JSON body.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (size + value.byteLength > maxBytes) {
        try { await reader.cancel(); } catch { /* already closed */ }
        throw new AuthError("BAD_REQUEST", "Request body is too large.", 400);
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* released */ }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } catch {
    throw new AuthError("BAD_REQUEST", "Expected JSON body.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuthError("BAD_REQUEST", "Expected JSON object.", 400);
  }
  return parsed as Record<string, unknown>;
}

export async function readTelemetryBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await readJsonObjectCappedStreaming(request, TELEMETRY_MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof AuthError && /too large/i.test(err.message)) {
      throw new AuthError("BAD_REQUEST", "Request body is too large.", 400);
    }
    throw err;
  }
}

export function telemetryGuard(request: Request): string {
  assertLocalSingleProcessAuth();
  assertSameOriginMutation(request);
  return requestIdFrom(request);
}

function withGuestCookie(response: Response, request: Request): Response {
  if (readTelemetryGuestId(request.headers.get("cookie"))) return response;
  let secure = false;
  try {
    secure = new URL(request.url).protocol === "https:";
  } catch {
    secure = false;
  }
  const headers = new Headers(response.headers);
  headers.append("set-cookie", telemetryGuestCookieHeader(mintTelemetryGuestId(), secure));
  return new Response(response.body, { status: response.status, headers });
}

export async function handleTelemetry(
  request: Request,
  kind: "error" | "event" | "feedback" | "optout" | "consent",
  fn: (body: Record<string, unknown>, requestId: string) => Promise<Response>,
): Promise<Response> {
  return runTelemetryContext(request, async () => {
    let requestId = requestIdFrom(request);
    try {
      requestId = telemetryGuard(request);
      const type = request.headers.get("content-type") ?? "";
      if (!/^application\/json\b/i.test(type)) throw new AuthError("BAD_REQUEST", "Expected application/json.", 415);
      const body = await readTelemetryBody(request);
      const anonId = isAnonId(body.anonId) ? body.anonId : undefined;
      const retry = checkTelemetryRate(kind, request, anonId);
      if (retry !== null) {
        throw new AuthError("RATE_LIMITED", "Too many telemetry requests. Try again later.", 429, retry);
      }
      return withGuestCookie(withRequestId(await fn(body, requestId), requestId), request);
    } catch (err) {
      if (err instanceof TelemetryDirFullError) {
        return withGuestCookie(
          withRequestId(authErrorResponse(new AuthError("TELEMETRY_UNAVAILABLE", "Telemetry log is full.", 503)), requestId),
          request,
        );
      }
      return withGuestCookie(withRequestId(authErrorResponse(err), requestId), request);
    }
  });
}

export { jsonResponse };
