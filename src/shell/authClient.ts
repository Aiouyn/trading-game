/** Browser client for M1-01 /api/auth/* — credentials include HttpOnly cookie. */

export type AuthPublicAccount = {
  accountId: string;
  handle: string;
  createdAtMs: number;
  worldId: string;
};

/** Server-owned world attach (M1-02). */
export type AuthWorldView = {
  worldId: string;
  marketSeed: number;
  persistence: "none";
};

export type AuthPlayerView = {
  accountId: string;
  cashCents: number;
  positions: Record<string, number>;
  openOrderIds: string[];
};

export type AuthMeResponse = {
  account: AuthPublicAccount;
  session: { sessionId: string; expiresAtMs: number };
  player: AuthPlayerView;
  world: AuthWorldView;
};

export type AuthSessionResponse = {
  account: AuthPublicAccount;
  session: { sessionId: string; expiresAtMs: number };
  world: AuthWorldView;
};

export type AuthClientError = {
  code: string;
  message: string;
  status: number;
};

async function parseError(res: Response): Promise<AuthClientError> {
  let code = "BAD_REQUEST";
  let message = "Something went wrong.";
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error?: { code?: unknown; message?: unknown } }).error;
      if (err && typeof err.code === "string") code = err.code;
      if (err && typeof err.message === "string") message = err.message;
    }
  } catch {
    /* keep defaults */
  }
  return { code, message, status: res.status };
}

async function postAuth(path: string, body?: Record<string, string>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function fetchWorld(): Promise<AuthWorldView> {
  const res = await fetch("/api/world", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { world: AuthWorldView };
  return body.world;
}

export async function fetchMe(): Promise<AuthMeResponse | null> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    // Drain the body. Leaving it unread keeps the Chromium fetch "inflight", so
    // Playwright waitForLoadState('networkidle') (tools/ci/route-budget.mjs) never settles.
    await res.text();
    return null;
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AuthMeResponse;
}

export async function registerAccount(handle: string, password: string): Promise<AuthSessionResponse> {
  const res = await postAuth("/api/auth/register", { handle, password });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AuthSessionResponse;
}

export async function loginAccount(handle: string, password: string): Promise<AuthSessionResponse> {
  const res = await postAuth("/api/auth/login", { handle, password });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AuthSessionResponse;
}

export async function logoutAccount(): Promise<void> {
  const res = await postAuth("/api/auth/logout");
  if (!res.ok) throw await parseError(res);
}

/** Map API codes to short private-safe UI copy (never echo server stacks). */
export function authErrorCopy(err: AuthClientError, locale: "en" | "fr"): string {
  const en: Record<string, string> = {
    HANDLE_TAKEN: "That handle is already taken.",
    HANDLE_INVALID: "Handle must start with a letter and use 3–32 letters, digits, or _.",
    PASSWORD_WEAK: "Password must be 8–128 characters.",
    BAD_CREDENTIALS: "Handle or password is incorrect.",
    RATE_LIMITED: "Too many attempts. Wait a bit and try again.",
    FORBIDDEN: "That request was blocked.",
    UNAUTHORIZED: "You are signed out.",
    UNSUPPORTED_DEPLOY: "Account service is not available in this environment.",
    BAD_REQUEST: "Check the form and try again.",
  };
  const fr: Record<string, string> = {
    HANDLE_TAKEN: "Ce pseudo est déjà pris.",
    HANDLE_INVALID: "Le pseudo doit commencer par une lettre (3–32 lettres, chiffres ou _).",
    PASSWORD_WEAK: "Le mot de passe doit faire 8 à 128 caractères.",
    BAD_CREDENTIALS: "Pseudo ou mot de passe incorrect.",
    RATE_LIMITED: "Trop de tentatives. Réessayez plus tard.",
    FORBIDDEN: "Requête bloquée.",
    UNAUTHORIZED: "Vous êtes déconnecté.",
    UNSUPPORTED_DEPLOY: "Compte indisponible dans cet environnement.",
    BAD_REQUEST: "Vérifiez le formulaire et réessayez.",
  };
  const table = locale === "fr" ? fr : en;
  return table[err.code] ?? (locale === "fr" ? "Une erreur est survenue." : "Something went wrong.");
}
