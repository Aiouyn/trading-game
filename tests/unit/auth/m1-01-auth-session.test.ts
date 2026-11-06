import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthError,
  AuthService,
  FileAuthStore,
  MemoryAuthStore,
  PORT_AVALON_WORLD_ID,
  SESSION_COOKIE_NAME,
  START_CASH_CENTS,
  clearSessionCookieHeader,
  readSessionTokenFromCookieHeader,
  sessionCookieHeader,
  SESSION_IDLE_MS,
  allowedAuthHosts,
  assertSameOriginMutation,
  assertLocalSingleProcessAuth,
  AttemptThrottle,
} from "@/server/auth";
import { hashToken } from "@/server/auth/crypto";
import type { AccountId } from "@/server/auth";

describe("M1-01 auth foundation", () => {
  const temps: string[] = [];
  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("registers a new player account with hashed password and session cookie token", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    const { view, rawToken } = await auth.register({ handle: "Alice", password: "correct-horse" });

    expect(view.account.handle).toBe("Alice");
    expect(view.account.accountId.startsWith("acc_")).toBe(true);
    expect(view.account.worldId).toBe(PORT_AVALON_WORLD_ID);
    expect(rawToken.length).toBeGreaterThan(20);

    const snap = await new MemoryAuthStore().load();
    void snap;
    // Password material must not appear on the public view.
    expect(JSON.stringify(view)).not.toMatch(/password/i);
    expect(JSON.stringify(view)).not.toContain("correct-horse");

    const me = await auth.resolveSession(rawToken);
    expect(me?.account.accountId).toBe(view.account.accountId);
  });

  it("rejects weak password and invalid handle", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    await expect(auth.register({ handle: "ab", password: "longenough" })).rejects.toMatchObject({ code: "HANDLE_INVALID" });
    await expect(auth.register({ handle: "Valid", password: "short" })).rejects.toMatchObject({ code: "PASSWORD_WEAK" });
  });

  it("rejects duplicate handles case-insensitively", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    await auth.register({ handle: "Trader", password: "password1" });
    await expect(auth.register({ handle: "trader", password: "password2" })).rejects.toMatchObject({ code: "HANDLE_TAKEN" });
  });

  it("logs in with correct password and rejects bad credentials", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    await auth.register({ handle: "Bob", password: "password1" });
    const ok = await auth.login({ handle: "bob", password: "password1" });
    expect(ok.view.account.handle).toBe("Bob");

    await expect(auth.login({ handle: "Bob", password: "wrong-password" })).rejects.toMatchObject({ code: "BAD_CREDENTIALS" });
    await expect(auth.login({ handle: "nobody", password: "password1" })).rejects.toMatchObject({ code: "BAD_CREDENTIALS" });
  });

  it("session survives refresh (resolveSession) and logout revokes it", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    const { rawToken } = await auth.register({ handle: "Carol", password: "password1" });

    const first = await auth.resolveSession(rawToken);
    const second = await auth.resolveSession(rawToken);
    expect(first?.account.accountId).toBe(second?.account.accountId);

    await auth.logout(rawToken);
    expect(await auth.resolveSession(rawToken)).toBeNull();
  });

  it("never stores the raw session token; only its hash", async () => {
    const store = new MemoryAuthStore();
    const auth = new AuthService({ store });
    const { rawToken } = await auth.register({ handle: "Dana", password: "password1" });
    const snap = await store.load();
    const body = JSON.stringify(snap);
    expect(body).not.toContain(rawToken);
    expect(snap.sessions[0]?.tokenHash).toBe(hashToken(rawToken));
    expect(snap.accounts[0]?.passwordHash).not.toBe("password1");
    expect(snap.accounts[0]?.passwordSalt.length).toBeGreaterThan(8);
  });

  it("player isolation: session A cannot read or write session B private state", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    const a = await auth.register({ handle: "Eve", password: "password1" });
    const b = await auth.register({ handle: "Frank", password: "password1" });

    const aPrivate = await auth.getPlayerPrivate(a.view, a.view.account.accountId);
    const bPrivate = await auth.getPlayerPrivate(b.view, b.view.account.accountId);
    expect(aPrivate.cashCents).toBe(START_CASH_CENTS);
    expect(bPrivate.cashCents).toBe(START_CASH_CENTS);
    expect(aPrivate.accountId).not.toBe(bPrivate.accountId);

    await expect(auth.getPlayerPrivate(a.view, b.view.account.accountId as AccountId)).rejects.toBeInstanceOf(AuthError);
    await expect(auth.getPlayerPrivate(a.view, b.view.account.accountId as AccountId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await auth.setOwnCashCents(a.view, 42);
    const aAfter = await auth.getPlayerPrivate(a.view, a.view.account.accountId);
    const bAfter = await auth.getPlayerPrivate(b.view, b.view.account.accountId);
    expect(aAfter.cashCents).toBe(42);
    expect(bAfter.cashCents).toBe(START_CASH_CENTS);
  });

  it("file store: sessions and private state survive a new AuthService (process restart)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-01-auth-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");

    const first = new AuthService({ store: new FileAuthStore(file) });
    const { rawToken, view } = await first.register({ handle: "Grace", password: "password1" });
    await first.setOwnCashCents(view, 777);

    const second = new AuthService({ store: new FileAuthStore(file) });
    const resumed = await second.resolveSession(rawToken);
    expect(resumed?.account.accountId).toBe(view.account.accountId);
    expect(resumed?.account.handle).toBe("Grace");
    const privateState = await second.getPlayerPrivate(resumed!, resumed!.account.accountId);
    expect(privateState.cashCents).toBe(777);
  });

  it("cookie helpers: HttpOnly SameSite=Lax; Secure on https; clear expires", () => {
    const set = sessionCookieHeader("tok", { secure: true, maxAgeSec: 3600 });
    expect(set).toContain(`${SESSION_COOKIE_NAME}=tok`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Secure");
    expect(set).toContain("Max-Age=3600");

    const clear = clearSessionCookieHeader(false);
    expect(clear).toContain("Max-Age=0");
    expect(clear).not.toContain("Secure");

    expect(readSessionTokenFromCookieHeader(`a=1; ${SESSION_COOKIE_NAME}=abc%2Fdef; b=2`)).toBe("abc/def");
  });
});

describe("M1-01 auth hardening (small)", () => {
  it("serializes concurrent same-handle registers (one wins, one HANDLE_TAKEN)", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    const results = await Promise.allSettled([
      auth.register({ handle: "RaceBot", password: "password1" }),
      auth.register({ handle: "RaceBot", password: "password1" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "HANDLE_TAKEN" });
  });

  it("rejects oversized passwords", async () => {
    const auth = new AuthService({ store: new MemoryAuthStore() });
    await expect(
      auth.register({ handle: "LongPass", password: "x".repeat(129) }),
    ).rejects.toMatchObject({ code: "PASSWORD_WEAK" });
  });

  it("expires idle sessions", async () => {
    let now = 1_000_000;
    const auth = new AuthService({ store: new MemoryAuthStore(), now: () => now });
    const { rawToken } = await auth.register({ handle: "IdleUser", password: "password1" });
    expect(await auth.resolveSession(rawToken)).not.toBeNull();
    now += SESSION_IDLE_MS + 1;
    expect(await auth.resolveSession(rawToken)).toBeNull();
  });
});

describe("M1-01 CSRF host pinning", () => {
  afterEach(() => {
    delete process.env.QUAY_PUBLIC_HOST;
    delete process.env.QUAY_TRUST_PROXY;
    delete process.env.QUAY_TRUSTED_HOSTS;
    delete process.env.VERCEL;
    delete process.env.QUAY_AUTH_MULTI_PROCESS;
  });

  it("ignores X-Forwarded-Host unless trust proxy + allowlist", () => {
    process.env.QUAY_PUBLIC_HOST = "localhost:3000";
    const req = new Request("http://localhost:3000/api/auth/login", {
      headers: { "x-forwarded-host": "evil.example", origin: "http://localhost:3000" },
    });
    expect([...allowedAuthHosts(req)]).toEqual(["localhost:3000"]);
    expect(() => assertSameOriginMutation(req)).not.toThrow();
    expect(() =>
      assertSameOriginMutation(
        new Request("http://localhost:3000/api/auth/login", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow(/Cross-origin|Invalid/);
  });

  it("rejects Origin null", () => {
    process.env.QUAY_PUBLIC_HOST = "localhost:3000";
    expect(() =>
      assertSameOriginMutation(
        new Request("http://localhost:3000/api/auth/login", { headers: { origin: "null" } }),
      ),
    ).toThrow();
  });

  it("refuses Vercel / multi-process deploy flags", () => {
    process.env.VERCEL = "1";
    expect(() => assertLocalSingleProcessAuth()).toThrow(/Vercel/);
    delete process.env.VERCEL;
    process.env.QUAY_AUTH_MULTI_PROCESS = "1";
    expect(() => assertLocalSingleProcessAuth()).toThrow(/Multi-process/);
  });
});

describe("M1-01 attempt throttle", () => {
  it("blocks after limit", () => {
    let now = 0;
    const t = new AttemptThrottle(2, 1000, () => now);
    expect(t.check("a")).toBeNull();
    t.hit("a");
    t.hit("a");
    expect(t.check("a")).toBeGreaterThan(0);
    now = 1000;
    expect(t.check("a")).toBeNull();
  });
});
