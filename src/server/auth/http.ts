import { forwardedHost, loopbackAliases, normalizeHost, trustedHosts } from "./hosts";
import { AuthError } from "./types";
import { SESSION_IDLE_MS } from "./service";
import {
  clearSessionCookieHeader,
  readSessionTokenFromCookieHeader,
  sessionCookieHeader,
} from "./cookies";
import type { AuthSessionView } from "./types";
import { worldAttachBody } from "@/server/world";

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
    ...worldAttachBody(),
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

/** Read a JSON object, but refuse the raw body above `maxBytes` before parsing. */
export async function readJsonObjectCapped(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new AuthError("BAD_REQUEST", "Request body is too large.", 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString("utf8")) as unknown;
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
 * Hosts whose Origin or Referer may call a mutation.
 * Local (no QUAY_PUBLIC_HOST, not VERCEL): both loopback names of the request
 * URL's port, so Next's localhost stamp and a browser on 127.0.0.1 agree.
 * QUAY_TRUSTED_HOSTS is always included. QUAY_TRUST_PROXY does not gate that list.
 * X-Forwarded-Host is read only when QUAY_TRUST_PROXY is exactly "1", and only
 * a host that is already configured is believed. The header never adds a host.
 * VERCEL or QUAY_PUBLIC_HOST: configured hosts only. The URL host is not trusted.
 */
export function allowedAuthHosts(request: Request): ReadonlySet<string> {
  const hosts = new Set<string>();
  const pinned = process.env.QUAY_PUBLIC_HOST?.trim();
  if (pinned) hosts.add(normalizeHost(pinned));
  for (const host of trustedHosts(process.env.QUAY_TRUSTED_HOSTS)) hosts.add(host);

  const strict = Boolean(process.env.VERCEL) || Boolean(pinned);
  if (!strict) {
    for (const host of loopbackAliases(new URL(request.url).host)) hosts.add(host);
  }

  const believed = believedForwardedHost(request);
  if (believed) hosts.add(believed);
  return hosts;
}

/**
 * X-Forwarded-Host when QUAY_TRUST_PROXY is exactly "1" and the value is already
 * configured (QUAY_PUBLIC_HOST or QUAY_TRUSTED_HOSTS). Otherwise null.
 */
export function believedForwardedHost(request: Request): string | null {
  if (process.env.QUAY_TRUST_PROXY !== "1") return null;
  const forwarded = forwardedHost(request.headers.get("x-forwarded-host"));
  if (!forwarded) return null;
  const pinned = process.env.QUAY_PUBLIC_HOST?.trim();
  const configured = new Set<string>(trustedHosts(process.env.QUAY_TRUSTED_HOSTS));
  if (pinned) configured.add(normalizeHost(pinned));
  return configured.has(forwarded) ? forwarded : null;
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
 * X-Forwarded-Host is ignored unless QUAY_TRUST_PROXY is exactly "1" and that host is configured.
 * Missing Origin and Referer is 403 (fail closed).
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
    return;
  }
  throw new AuthError("FORBIDDEN", "Cross-origin auth mutation blocked.", 403);
}
