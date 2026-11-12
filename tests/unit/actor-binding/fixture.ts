import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, type AuthSessionView } from "@/server/auth";

export const PASSWORD = "local-bind-test";

export class Clock {
  nowMs: number;
  constructor(nowMs = 1_700_000_000_000) {
    this.nowMs = nowMs;
  }
  now = () => this.nowMs;
  advance(ms: number): void {
    this.nowMs += ms;
  }
}

export function authService(clock: Clock, store = new MemoryAuthStore()): AuthService {
  return new AuthService({ store, now: clock.now });
}

export async function register(
  auth: AuthService,
  handle: string,
): Promise<{ view: AuthSessionView; rawToken: string }> {
  return auth.register({ handle, password: PASSWORD });
}

export function cookieRequest(rawToken: string | null, url = "http://localhost/api/probe"): Request {
  const headers = rawToken === null ? undefined : { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}` };
  return new Request(url, headers ? { headers } : undefined);
}
