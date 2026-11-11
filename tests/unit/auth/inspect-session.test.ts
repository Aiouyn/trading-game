import { afterEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as leaderboard } from "@/app/api/leaderboard/route";
import {
  AuthService,
  MemoryAuthStore,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  setAuthServiceForTests,
  type AuthStoreSnapshot,
  type SessionLookupResult,
  type SessionRejectionCode,
} from "@/server/auth";
import { mintSessionToken } from "@/server/auth/crypto";

const REASONS: readonly SessionRejectionCode[] = [
  "MISSING_TOKEN",
  "MALFORMED_TOKEN",
  "UNKNOWN_SESSION",
  "EXPIRED_SESSION",
  "REVOKED_SESSION",
  "UNKNOWN_ACCOUNT",
];

class CountingStore extends MemoryAuthStore {
  saves = 0;
  override async save(snapshot: AuthStoreSnapshot): Promise<void> {
    this.saves += 1;
    await super.save(snapshot);
  }
}

function clock() {
  let now = 1_700_000_000_000;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

async function signedIn(store: MemoryAuthStore, now: () => number, handle: string) {
  const auth = new AuthService({ store, now });
  const session = await auth.register({ handle, password: "password1" });
  return { auth, ...session };
}

async function cloneService(source: MemoryAuthStore, now: () => number) {
  const store = new MemoryAuthStore();
  await store.save(await source.load());
  return { store, auth: new AuthService({ store, now }) };
}

function viewOrNull(result: SessionLookupResult) {
  return result.ok ? result.view : null;
}

describe("inspectSession reasons", () => {
  it("MISSING_TOKEN for null, undefined, and empty string", async () => {
    const store = new CountingStore();
    const { auth } = await signedIn(store, () => 1_000, "MissingTok");
    const saves = store.saves;
    for (const raw of [null, undefined, ""]) {
      const found = await auth.inspectSession(raw);
      expect(found).toEqual({ ok: false, reason: "MISSING_TOKEN" });
      expect(await auth.inspectSession(raw, { refresh: true })).toEqual({ ok: false, reason: "MISSING_TOKEN" });
    }
    expect(store.saves).toBe(saves);
  });

  it("MALFORMED_TOKEN when the string is not a minted 32-byte base64url token", async () => {
    const store = new CountingStore();
    const { auth } = await signedIn(store, () => 1_000, "BadShape");
    const saves = store.saves;
    const minted = mintSessionToken().rawToken;
    expect(minted).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const raw of ["nope", "a".repeat(43), `${minted}=`, "+++not-a-token+++"]) {
      expect(await auth.inspectSession(raw)).toEqual({ ok: false, reason: "MALFORMED_TOKEN" });
      expect(await auth.inspectSession(raw, { refresh: false })).toEqual({ ok: false, reason: "MALFORMED_TOKEN" });
    }
    expect(store.saves).toBe(saves);
  });

  it("UNKNOWN_SESSION for a minted token that matches no row", async () => {
    const store = new CountingStore();
    const { auth } = await signedIn(store, () => 1_000, "UnknownSes");
    const saves = store.saves;
    const raw = mintSessionToken().rawToken;
    expect(await auth.inspectSession(raw)).toEqual({ ok: false, reason: "UNKNOWN_SESSION" });
    expect(await auth.inspectSession(raw, { refresh: true })).toEqual({ ok: false, reason: "UNKNOWN_SESSION" });
    expect(store.saves).toBe(saves);
  });

  it("EXPIRED_SESSION for idle, absolute, and stored expiry, without confusing a later revoked row", async () => {
    const idle = clock();
    const idleStore = new CountingStore();
    const idleAuth = await signedIn(idleStore, idle.now, "IdleExp");
    const before = JSON.stringify(await idleStore.load());
    const saves = idleStore.saves;
    idle.advance(SESSION_IDLE_MS);
    expect((await idleAuth.auth.inspectSession(idleAuth.rawToken)).ok).toBe(true);
    idle.advance(1);
    const peeked = await idleAuth.auth.inspectSession(idleAuth.rawToken, { refresh: false });
    expect(peeked).toEqual({ ok: false, reason: "EXPIRED_SESSION" });
    expect(idleStore.saves).toBe(saves);
    expect(JSON.stringify(await idleStore.load())).toBe(before);
    expect((await idleStore.load()).sessions[0]?.revokedAtMs).toBeNull();

    const stamped = await idleAuth.auth.inspectSession(idleAuth.rawToken, { refresh: true });
    expect(stamped).toEqual({ ok: false, reason: "EXPIRED_SESSION" });
    expect(idleStore.saves).toBe(saves + 1);
    expect((await idleStore.load()).sessions[0]?.revokedAtMs).not.toBeNull();
    expect(await idleAuth.auth.inspectSession(idleAuth.rawToken)).toEqual({ ok: false, reason: "REVOKED_SESSION" });

    const abs = clock();
    const absStore = new MemoryAuthStore();
    const absAuth = await signedIn(absStore, abs.now, "AbsExp");
    const bornAt = abs.now();
    while (abs.now() < bornAt + SESSION_MAX_MS - 1_000) {
      const room = bornAt + SESSION_MAX_MS - 1_000 - abs.now();
      abs.advance(Math.min(SESSION_IDLE_MS - 1_000, room));
      expect((await absAuth.auth.resolveSession(absAuth.rawToken))?.sessionId).toBe(absAuth.view.sessionId);
    }
    abs.advance(1_000 + 1);
    const absRow = (await absStore.load()).sessions[0];
    expect(abs.now()).toBeGreaterThan(bornAt + SESSION_MAX_MS);
    expect(abs.now()).toBeLessThan((absRow?.lastSeenAtMs ?? 0) + SESSION_IDLE_MS);
    expect(await absAuth.auth.inspectSession(absAuth.rawToken)).toEqual({ ok: false, reason: "EXPIRED_SESSION" });
    expect((await absStore.load()).sessions[0]?.revokedAtMs).toBeNull();

    const stored = clock();
    const storedStore = new MemoryAuthStore();
    const storedAuth = await signedIn(storedStore, stored.now, "StoredExp");
    const snap = await storedStore.load();
    await storedStore.save({
      ...snap,
      sessions: snap.sessions.map((s) => ({ ...s, expiresAtMs: stored.now() - 1 })),
    });
    await storedAuth.auth.reload();
    expect(await storedAuth.auth.inspectSession(storedAuth.rawToken)).toEqual({ ok: false, reason: "EXPIRED_SESSION" });
    expect((await storedStore.load()).sessions[0]?.revokedAtMs).toBeNull();
    expect((await storedStore.load()).sessions[0]?.lastSeenAtMs).toBe(snap.sessions[0]?.lastSeenAtMs);
  });

  it("REVOKED_SESSION when the stored row has revokedAtMs set", async () => {
    const store = new CountingStore();
    const { auth, rawToken } = await signedIn(store, () => 5_000, "RevokedSes");
    await auth.logout(rawToken);
    const saves = store.saves;
    const row = (await store.load()).sessions[0];
    expect(row?.revokedAtMs).not.toBeNull();
    expect(await auth.inspectSession(rawToken)).toEqual({ ok: false, reason: "REVOKED_SESSION" });
    expect(await auth.inspectSession(rawToken, { refresh: true })).toEqual({ ok: false, reason: "REVOKED_SESSION" });
    expect(store.saves).toBe(saves);
    expect((await store.load()).sessions[0]).toEqual(row);
  });

  it("UNKNOWN_ACCOUNT when the session row is live but the account row is gone", async () => {
    const c = clock();
    const quiet = new CountingStore();
    const quietAuth = await signedIn(quiet, c.now, "NoAcctPeek");
    const snap = await quiet.load();
    await quiet.save({ ...snap, accounts: [] });
    await quietAuth.auth.reload();
    const saves = quiet.saves;
    const before = JSON.stringify(await quiet.load());
    expect(await quietAuth.auth.inspectSession(quietAuth.rawToken)).toEqual({ ok: false, reason: "UNKNOWN_ACCOUNT" });
    expect(quiet.saves).toBe(saves);
    expect(JSON.stringify(await quiet.load())).toBe(before);

    const writing = new CountingStore();
    const writingAuth = await signedIn(writing, c.now, "NoAcctWrite");
    const snap2 = await writing.load();
    await writing.save({ ...snap2, accounts: [] });
    await writingAuth.auth.reload();
    const saves2 = writing.saves;
    c.advance(5_000);
    expect(await writingAuth.auth.inspectSession(writingAuth.rawToken, { refresh: true })).toEqual({
      ok: false,
      reason: "UNKNOWN_ACCOUNT",
    });
    expect(writing.saves).toBe(saves2 + 1);
    const row = (await writing.load()).sessions[0];
    expect(row?.lastSeenAtMs).toBe(c.now());
    expect(row?.revokedAtMs).toBeNull();
    expect((await writing.load()).accounts).toEqual([]);
  });
});

describe("inspectSession refresh writes", () => {
  it("refresh true slides lastSeen and persists; omitted or false refresh does not write", async () => {
    const c = clock();
    const store = new CountingStore();
    const { auth, rawToken, view } = await signedIn(store, c.now, "SlideUser");
    const afterRegister = store.saves;
    const before = JSON.stringify(await store.load());

    const peeked = await auth.inspectSession(rawToken);
    expect(peeked).toEqual({
      ok: true,
      refreshed: false,
      view: { sessionId: view.sessionId, account: view.account, expiresAtMs: view.expiresAtMs },
    });
    expect(await auth.peekSession(rawToken)).toEqual(viewOrNull(peeked));
    expect(store.saves).toBe(afterRegister);
    expect(JSON.stringify(await store.load())).toBe(before);

    c.advance(5_000);
    const refreshed = await auth.inspectSession(rawToken, { refresh: true });
    expect(refreshed).toMatchObject({
      ok: true,
      refreshed: true,
      view: { sessionId: view.sessionId, expiresAtMs: c.now() + SESSION_IDLE_MS },
    });
    expect(store.saves).toBe(afterRegister + 1);
    const row = (await store.load()).sessions[0];
    expect(row?.lastSeenAtMs).toBe(c.now());
    expect(row?.expiresAtMs).toBe(c.now() + SESSION_IDLE_MS);

    const savesAfterSlide = store.saves;
    const afterSlide = JSON.stringify(await store.load());
    const again = await auth.inspectSession(rawToken, { refresh: false });
    expect(again).toEqual({
      ok: true,
      refreshed: false,
      view: {
        sessionId: view.sessionId,
        account: view.account,
        expiresAtMs: c.now() + SESSION_IDLE_MS,
      },
    });
    expect(store.saves).toBe(savesAfterSlide);
    expect(JSON.stringify(await store.load())).toBe(afterSlide);
  });
});

describe("resolveSession and peekSession parity", () => {
  async function pair(handle: string) {
    const c = clock();
    const store = new MemoryAuthStore();
    const signed = await signedIn(store, c.now, handle);
    return { c, store, ...signed };
  }

  it("resolveSession matches inspectSession refresh, including expiry revocation", async () => {
    const live = await pair("ParityLive");
    live.c.advance(4_000);
    const viaResolve = await cloneService(live.store, live.c.now);
    const viaInspect = await cloneService(live.store, live.c.now);
    const resolved = await viaResolve.auth.resolveSession(live.rawToken);
    const inspected = await viaInspect.auth.inspectSession(live.rawToken, { refresh: true });
    expect(resolved).toEqual(viewOrNull(inspected));
    expect(inspected.ok && inspected.refreshed).toBe(true);
    expect(JSON.stringify(await viaResolve.store.load())).toBe(JSON.stringify(await viaInspect.store.load()));

    const expired = await pair("ParityExp");
    expired.c.advance(SESSION_IDLE_MS + 1);
    const expResolve = await cloneService(expired.store, expired.c.now);
    const expInspect = await cloneService(expired.store, expired.c.now);
    expect(await expResolve.auth.resolveSession(expired.rawToken)).toBeNull();
    expect(await expInspect.auth.inspectSession(expired.rawToken, { refresh: true })).toEqual({
      ok: false,
      reason: "EXPIRED_SESSION",
    });
    expect(JSON.stringify(await expResolve.store.load())).toBe(JSON.stringify(await expInspect.store.load()));
    expect((await expResolve.store.load()).sessions[0]?.revokedAtMs).not.toBeNull();
  });

  it("peekSession matches inspectSession without refresh and neither writes", async () => {
    const live = await pair("ParityPeek");
    live.c.advance(4_000);
    const left = await cloneService(live.store, live.c.now);
    const right = await cloneService(live.store, live.c.now);
    const beforeLeft = JSON.stringify(await left.store.load());
    const beforeRight = JSON.stringify(await right.store.load());
    const peeked = await left.auth.peekSession(live.rawToken);
    const inspected = await right.auth.inspectSession(live.rawToken);
    expect(peeked).toEqual(viewOrNull(inspected));
    expect(inspected.ok && inspected.refreshed).toBe(false);
    expect(JSON.stringify(await left.store.load())).toBe(beforeLeft);
    expect(JSON.stringify(await right.store.load())).toBe(beforeRight);

    const dead = await pair("ParityPeekDead");
    await dead.auth.logout(dead.rawToken);
    const deadPeek = await cloneService(dead.store, dead.c.now);
    const deadInspect = await cloneService(dead.store, dead.c.now);
    expect(await deadPeek.auth.peekSession(dead.rawToken)).toBeNull();
    expect(await deadInspect.auth.inspectSession(dead.rawToken, { refresh: false })).toEqual({
      ok: false,
      reason: "REVOKED_SESSION",
    });
    expect(JSON.stringify(await deadPeek.store.load())).toBe(JSON.stringify(await deadInspect.store.load()));
  });
});

describe("session reasons stay off HTTP", () => {
  afterEach(() => {
    setAuthServiceForTests(undefined);
  });

  it("me and leaderboard answer unauthorized without a rejection code", async () => {
    const c = clock();
    const auth = new AuthService({ store: new MemoryAuthStore(), now: c.now });
    setAuthServiceForTests(auth);
    const { rawToken } = await auth.register({ handle: "HttpQuiet", password: "password1" });
    await auth.logout(rawToken);
    c.advance(SESSION_IDLE_MS + 1);
    const { rawToken: expiredToken } = await auth.login({ handle: "HttpQuiet", password: "password1" });
    c.advance(SESSION_IDLE_MS + 1);

    const cookies = [
      undefined,
      `${SESSION_COOKIE_NAME}=`,
      `${SESSION_COOKIE_NAME}=not-a-token`,
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(mintSessionToken().rawToken)}`,
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(expiredToken)}`,
    ];
    for (const cookie of cookies) {
      const headers = cookie ? { cookie } : undefined;
      for (const handler of [me, leaderboard]) {
        const res = await handler(new Request("http://localhost/api/auth/me", { headers }));
        expect(res.status).toBe(401);
        const body = await res.text();
        expect(JSON.parse(body)).toEqual({ error: { code: "UNAUTHORIZED", message: "Not signed in." } });
        for (const reason of REASONS) expect(body).not.toContain(reason);
      }
    }
  });
});
