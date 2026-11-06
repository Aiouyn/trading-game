import { AuthError } from "./types";
import { SESSION_IDLE_MS } from "./service";
import {
  clearSessionCookieHeader,
  readSessionTokenFromCookieHeader,
  sessionCookieHeader,
} from "./cookies";
import type { AuthSessionView } from "./types";

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(headers ?? {}),
    },
  });
}

export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return jsonResponse({ error: { code: err.code, message: err.message } }, err.status);
  }
  return jsonResponse({ error: { code: "BAD_REQUEST", message: "Unexpected error." } }, 500);
}

export function withSessionCookie(response: Response, rawToken: string, requestUrl: string): Response {
  const secure = new URL(requestUrl).protocol === "https:";
  const headers = new Headers(response.headers);
  headers.append(
    "set-cookie",
    sessionCookieHeader(rawToken, {
      secure,
      maxAgeSec: Math.floor(SESSION_IDLE_MS / 1000),
    }),
  );
  return new Response(response.body, { status: response.status, headers });
}

export function withClearedSessionCookie(response: Response, requestUrl: string): Response {
  const secure = new URL(requestUrl).protocol === "https:";
  const headers = new Headers(response.headers);
  headers.append("set-cookie", clearSessionCookieHeader(secure));
  return new Response(response.body, { status: response.status, headers });
}

export function tokenFromRequest(request: Request): string | null {
  return readSessionTokenFromCookieHeader(request.headers.get("cookie"));
}

export function sessionBody(view: AuthSessionView) {
  return {
    account: view.account,
    session: { sessionId: view.sessionId, expiresAtMs: view.expiresAtMs },
  };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new AuthError("BAD_REQUEST", "Expected JSON body.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AuthError("BAD_REQUEST", "Expected JSON object.", 400);
  }
  return parsed as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new AuthError("BAD_REQUEST", `Missing or invalid field: ${key}.`, 400);
  }
  return value;
}
