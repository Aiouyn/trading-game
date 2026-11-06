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
    const headers: HeadersInit = {};
    if (err.code === "RATE_LIMITED" && typeof err.retryAfterMs === "number") {
      headers["retry-after"] = String(Math.max(1, Math.ceil(err.retryAfterMs / 1000)));
    }
    return jsonResponse({ error: { code: err.code, message: err.message } }, err.status, headers);
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

/**
 * Allowed request hosts for Origin/Referer checks.
 * Never incorporates attacker-controlled X-Forwarded-Host unless
 * QUAY_TRUST_PROXY=1 and the host is on QUAY_TRUSTED_HOSTS (comma list).
 * Prefer pinning with QUAY_PUBLIC_HOST (e.g. localhost:3000).
 */
export function allowedAuthHosts(request: Request): ReadonlySet<string> {
  const hosts = new Set<string>();
  const pinned = process.env.QUAY_PUBLIC_HOST?.trim();
  if (pinned) hosts.add(pinned);
  else hosts.add(new URL(request.url).host);

  if (process.env.QUAY_TRUST_PROXY === "1") {
    for (const h of (process.env.QUAY_TRUSTED_HOSTS ?? "").split(",")) {
      const t = h.trim();
      if (t) hosts.add(t);
    }
  }
  return hosts;
}

function parseBrowserOrigin(raw: string, kind: "Origin" | "Referer"): URL {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") {
    throw new AuthError("FORBIDDEN", `Invalid ${kind}.`, 403);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AuthError("FORBIDDEN", `Invalid ${kind}.`, 403);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AuthError("FORBIDDEN", `Invalid ${kind} protocol.`, 403);
  }
  return parsed;
}

/**
 * CSRF guard for auth mutations. Origin (preferred) or Referer must match an allowed host.
 * Does not trust X-Forwarded-* unless QUAY_TRUST_PROXY + allowlist. Missing both allowed for non-browser smoke.
 */
export function assertSameOriginMutation(request: Request): void {
  // Fail closed on known multi-instance deploy shapes before any cookie work.
  // (imported lazily via dynamic would cycle; callers also call assertLocalSingleProcessAuth)
  const allowed = allowedAuthHosts(request);
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const parsed = parseBrowserOrigin(origin, "Origin");
    if (!allowed.has(parsed.host)) {
      throw new AuthError("FORBIDDEN", "Cross-origin auth mutation blocked.", 403);
    }
    return;
  }
  const referer = request.headers.get("referer");
  if (referer !== null && referer !== "") {
    const parsed = parseBrowserOrigin(referer, "Referer");
    if (!allowed.has(parsed.host)) {
      throw new AuthError("FORBIDDEN", "Cross-origin auth mutation blocked.", 403);
    }
  }
}
