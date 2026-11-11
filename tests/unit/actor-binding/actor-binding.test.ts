import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  FileAuthStore,
  MemoryAuthStore,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
} from "@/server/auth";
import {
  ACTOR_BINDING_DEFAULT_ENABLED,
  ActorBinding,
  BindingError,
  FileBindingStore,
  MemoryBindingStore,
  actorIdFor,
  authorizeClaimed,
  makeCheckpoint,
  parseCheckpoint,
  requireBoundActor,
  type BindingStore,
} from "@/server/actor-binding";
import { authService, cookieRequest, register, Clock } from "./fixture";

class SpyStore implements BindingStore {
  loads = 0;
  saves = 0;
  async load(): Promise<unknown | null> {
    this.loads += 1;
    throw new Error("STORE_TOUCHED");
  }
  async save(): Promise<void> {
    this.saves += 1;
    throw new Error("STORE_TOUCHED");
  }
}

function expectCode(err: unknown, code: string): void {
  expect(err).toBeInstanceOf(BindingError);
  expect((err as BindingError).code).toBe(code);
}

async function expectReject(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expectCode(err, code);
  }
}

function walk(root: string, files: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name === ".next" || name === "actor-binding") continue;
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) files.push(path);
  }
  return files;
}

describe("actor-binding default-off boundary", () => {
  it("is default-off and touches no store unless explicitly enabled", async () => {
    expect(ACTOR_BINDING_DEFAULT_ENABLED).toBe(false);
    const clock = new Clock();
    const auth = authService(clock);
    for (const enabled of [undefined, false, "true", 1, null, 0, "yes"]) {
      const store = new SpyStore();
      await expectReject(() => ActorBinding.open(auth, store, enabled === undefined ? undefined : { enabled }), "ACTOR_BINDING_DISABLED");
      await expectReject(() => ActorBinding.open(auth, store), "ACTOR_BINDING_DISABLED");
      expect(store.loads + store.saves).toBe(0);
    }
  });

  it("is not imported by live app or server routes", () => {
    const roots = [join(process.cwd(), "src/app"), join(process.cwd(), "src/server"), join(process.cwd(), "src/shell")];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (/server\/actor-binding|@\/server\/actor-binding/.test(text)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("actor-binding mapping and sessions", () => {
  it("maps one account to one actor, including a second session and a file restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "actor-binding-"));
    try {
      const clock = new Clock();
      const authFile = join(dir, "auth.json");
      const bindFile = join(dir, "bind.json");
      const auth = new (await import("@/server/auth")).AuthService({ store: new FileAuthStore(authFile), now: clock.now });
      const a = await register(auth, "BindA");
      const b = await register(auth, "BindB");
      const first = await ActorBinding.open(auth, new FileBindingStore(bindFile), { enabled: true, now: clock.now });
      const ctxA = await first.bindToken(a.rawToken);
      const ctxB = await first.bindToken(b.rawToken);
      expect(ctxA.accountId).toBe(a.view.account.accountId);
      expect(ctxA.actorId).toBe(actorIdFor(a.view.account.accountId));
      expect(ctxB.actorId).toBe(actorIdFor(b.view.account.accountId));
      expect(ctxA.actorId).not.toBe(ctxB.actorId);
      const again = await first.bindToken(a.rawToken);
      expect(again.actorId).toBe(ctxA.actorId);
      expect(again.boundAtMs).toBe(ctxA.boundAtMs);
      const loginAgain = await auth.login({ handle: "BindA", password: "local-bind-test" });
      const secondSession = await first.bindToken(loginAgain.rawToken);
      expect(secondSession.actorId).toBe(ctxA.actorId);
      expect(secondSession.sessionId).toBe(loginAgain.view.sessionId);
      expect(secondSession.sessionId).not.toBe(ctxA.sessionId);
      const bytes = await readFile(bindFile);
      const restartedAuth = new (await import("@/server/auth")).AuthService({ store: new FileAuthStore(authFile), now: clock.now });
      const restarted = await ActorBinding.open(restartedAuth, new FileBindingStore(bindFile), { enabled: true, now: clock.now });
      const rebound = await restarted.bindToken(a.rawToken);
      expect(rebound.actorId).toBe(ctxA.actorId);
      expect(rebound.boundAtMs).toBe(ctxA.boundAtMs);
      expect(rebound.accountId).toBe(ctxA.accountId);
      expect(await readFile(bindFile)).toEqual(bytes);
      expect(restarted.snapshot()).toEqual(first.snapshot());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed for missing, malformed, unknown, expired and revoked sessions", async () => {
    const clock = new Clock();
    const auth = authService(clock);
    const store = new MemoryBindingStore();
    const binding = await ActorBinding.open(auth, store, { enabled: true, now: clock.now });
    const a = await register(auth, "BindA");
    await expectReject(() => binding.bindToken(null), "MISSING_SESSION");
    await expectReject(() => binding.bindToken(undefined), "MISSING_SESSION");
    await expectReject(() => binding.bindToken(""), "MISSING_SESSION");
    await expectReject(() => binding.bindRequest(cookieRequest(null)), "MISSING_SESSION");
    await expectReject(() => binding.bindToken("  token  "), "MALFORMED_SESSION");
    await expectReject(() => binding.bindToken("has\nnewline"), "MALFORMED_SESSION");
    await expectReject(() => binding.bindToken("x".repeat(300)), "MALFORMED_SESSION");
    await expectReject(() => binding.bindToken(1), "MALFORMED_SESSION");
    await expectReject(() => binding.bindToken({ token: a.rawToken }), "MALFORMED_SESSION");
    await expectReject(() => binding.bindToken(new Date(clock.nowMs)), "MALFORMED_SESSION");
    const unknown = "A".repeat(43);
    await expectReject(() => binding.bindToken(unknown), "SESSION_REJECTED");
    const expired = await register(auth, "BindExp");
    clock.advance(SESSION_IDLE_MS + 1);
    await expectReject(() => binding.bindToken(expired.rawToken), "SESSION_REJECTED");
    clock.advance(-(SESSION_IDLE_MS + 1));
    const maxed = await register(auth, "BindMax");
    clock.advance(SESSION_MAX_MS + 1);
    await expectReject(() => binding.bindToken(maxed.rawToken), "SESSION_REJECTED");
    clock.advance(-(SESSION_MAX_MS + 1));
    const living = await register(auth, "BindLive");
    await auth.logout(living.rawToken);
    await expectReject(() => binding.bindToken(living.rawToken), "SESSION_REJECTED");
    expect(binding.snapshot().bindings).toEqual([]);
  });

  it("rejects spoofed actor ids, missing claims and cross-account commands", async () => {
    const clock = new Clock();
    const auth = authService(clock);
    const binding = await ActorBinding.open(auth, new MemoryBindingStore(), { enabled: true, now: clock.now });
    const a = await register(auth, "BindA");
    const b = await register(auth, "BindB");
    const ctxA = await binding.bindRequest(cookieRequest(a.rawToken));
    const ctxB = await binding.bindToken(b.rawToken);
    await expectReject(() => binding.authorizeCommand(null, { actor: ctxA.actorId }), "MISSING_SESSION");
    await expectReject(() => binding.authorizeCommand(a.rawToken, {}), "CLAIM_MISSING");
    await expectReject(() => binding.authorizeCommand(a.rawToken, { actor: "" }), "CLAIM_MISSING");
    await expectReject(() => binding.authorizeCommand(a.rawToken, { actor: 1 }), "CLAIM_MALFORMED");
    await expectReject(() => binding.authorizeCommand(a.rawToken, { actor: a.view.account.accountId }), "CLAIM_MALFORMED");
    await expectReject(() => binding.authorizeCommand(a.rawToken, "actor"), "CLAIM_MALFORMED");
    const spoof = `chr_${"0".repeat(32)}`;
    await expectReject(() => binding.authorizeCommand(a.rawToken, { actor: spoof }), "ACTOR_MISMATCH");
    await expectReject(() => binding.authorizeCommand(a.rawToken, { actor: ctxB.actorId }), "ACTOR_MISMATCH");
    await expectReject(() => binding.authorizeCommand(b.rawToken, { actor: ctxA.actorId }), "ACTOR_MISMATCH");
    const ok = await binding.authorizeCommand(a.rawToken, { actor: ctxA.actorId });
    expect(ok.actorId).toBe(ctxA.actorId);
    const asWallet = await binding.authorizeCommand(a.rawToken, { wallet: ctxA.actorId }, "wallet");
    expect(asWallet.actorId).toBe(ctxA.actorId);
    const asAccount = await binding.authorizeCommand(a.rawToken, { account: ctxA.actorId }, "account");
    expect(asAccount.actorId).toBe(ctxA.actorId);
    expect(() => requireBoundActor(ctxA, ctxB.actorId)).toThrow(BindingError);
    expect(() => authorizeClaimed(ctxA, { actor: ctxB.actorId })).toThrow(BindingError);
  });

  it("rejects Proxy, getters, toJSON, Date, sparse arrays, unknown fields and non-JSON checkpoints", async () => {
    let traps = 0;
    const handler = { get() { traps += 1; return undefined; } };
    const clock = new Clock();
    const auth = authService(clock);
    const valid = makeCheckpoint([]);
    expect(() => parseCheckpoint(new Proxy(valid, handler))).toThrow(BindingError);
    const revocable = Proxy.revocable({ ...valid }, handler);
    revocable.revoke();
    expect(() => parseCheckpoint(revocable.proxy)).toThrow(BindingError);
    // Nested proxy inside a plain load payload: await inspects `.then` on a root proxy, so the
    // boundary is tested on the value parseCheckpoint walks, not on the awaited root.
    await expect(ActorBinding.open(auth, { load: async () => ({ ...valid, bindings: new Proxy(valid.bindings, handler) }), save: async () => undefined }, { enabled: true })).rejects.toThrow(BindingError);
    const cases: unknown[] = [
      { ...valid, extra: 1 },
      { v: 1, bindings: [], sha256: valid.sha256, toJSON: () => valid },
      { v: 1, bindings: [undefined], sha256: valid.sha256 },
      { v: 2, bindings: [], sha256: valid.sha256 },
      { v: 1, bindings: valid.bindings, sha256: "ff".repeat(32) },
      { v: 1, bindings: new Date(0), sha256: valid.sha256 },
    ];
    const sparse: unknown[] = [];
    sparse[1] = { accountId: "acc_" + "0".repeat(32), actorId: "chr_" + "0".repeat(32), boundAtMs: 0 };
    cases.push({ v: 1, bindings: sparse, sha256: valid.sha256 });
    const getter = { v: 1, bindings: [], sha256: valid.sha256 };
    Object.defineProperty(getter, "bindings", { enumerable: true, get() { traps += 1; return []; } });
    cases.push(getter);
    for (const bad of cases) {
      await expect(ActorBinding.open(auth, { load: async () => bad, save: async () => undefined }, { enabled: true })).rejects.toThrow(BindingError);
    }
    const remapped = makeCheckpoint([{ accountId: "acc_" + "a".repeat(32) as never, actorId: "chr_" + "b".repeat(32) as never, boundAtMs: 1 }]);
    await expect(ActorBinding.open(auth, { load: async () => remapped, save: async () => undefined }, { enabled: true })).rejects.toThrow(BindingError);
    expect(traps).toBe(0);
    const binding = await ActorBinding.open(auth, new MemoryBindingStore(), { enabled: true, now: clock.now });
    const a = await register(auth, "BindA");
    const ctx = await binding.bindToken(a.rawToken);
    await expectReject(() => binding.authorizeCommand(a.rawToken, new Proxy({ actor: ctx.actorId }, handler)), "CLAIM_MALFORMED");
    expect(traps).toBe(0);
    parseCheckpoint(binding.snapshot());
    expect(parseCheckpoint(JSON.parse(JSON.stringify(binding.snapshot())))).toEqual(binding.snapshot());
  });

  it("peek binds without requiring a write when the account is already recorded", async () => {
    const clock = new Clock();
    const auth = authService(clock, new MemoryAuthStore());
    const store = new MemoryBindingStore();
    const binding = await ActorBinding.open(auth, store, { enabled: true, now: clock.now });
    const a = await register(auth, "BindA");
    const first = await binding.bindToken(a.rawToken);
    const peeked = await binding.bindToken(a.rawToken, { refresh: false });
    expect(peeked.actorId).toBe(first.actorId);
  });
});

describe("actor-binding file store", () => {
  it("treats a missing file as empty and rejects a corrupt file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "actor-binding-file-"));
    try {
      const clock = new Clock();
      const auth = authService(clock);
      const path = join(dir, "missing", "bind.json");
      const opened = await ActorBinding.open(auth, new FileBindingStore(path), { enabled: true, now: clock.now });
      expect(opened.snapshot().bindings).toEqual([]);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(opened.snapshot());
      const bad = join(dir, "bad.json");
      await writeFile(bad, "{not json");
      await expect(ActorBinding.open(auth, new FileBindingStore(bad), { enabled: true })).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
