import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAuthStore } from "@/server/auth";
import {
  ActorBinding,
  BindingError,
  MemoryBindingStore,
} from "@/server/actor-binding";
import { authService, register, Clock } from "../actor-binding/fixture";
import { FX_ACTOR_DEFAULT_ENABLED, FileFxStore, FxEngine, stateHash } from "@/server/market/fx/store";
import { authorizeFxCommands, assertLiveFxCommands } from "@/server/market/fx/actor";
import { advanceFx, createFx, previewFx } from "@/server/market/fx/engine";
import { canonical, cash, parseCommand, parseFrame, parseGenesis, type Command, type Genesis } from "@/server/market/fx/model";
import { MARKS } from "../../fixtures/fx";

const EPOCH = "fx-actor-epoch";

function system(id: string, amount = 0) {
  return { id, cash: cash(amount), units: {}, access: { kind: "SYSTEM" as const } };
}
function actor(id: string, amount = 1_000_000) {
  return { id, cash: cash(amount), units: {}, access: { kind: "ACTOR" as const, license: 2, held: false } };
}

function genesisFor(...actorIds: string[]): Genesis {
  return parseGenesis({
    epoch: EPOCH,
    startTick: 0,
    feeWallet: "fees",
    banks: [{ id: "retail", inventory: "bank", income: "bank-income" }],
    wallets: [...actorIds.map((id) => actor(id)), system("fees"), system("bank", 1_000_000), system("bank-income")],
  });
}

function bankCmd(id: string, account: string, spend = 10_000): Command {
  return parseCommand({ kind: "BANK", id, account, bank: "retail", from: "FDL", to: "NKR", spend, minOutput: 1 });
}

function frame(tick: number, commands: Command[]) {
  return parseFrame({ epoch: EPOCH, tick, marks: MARKS, controls: [], assets: [], commands });
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

function fingerprint(s: ReturnType<typeof createFx>): string {
  return canonical(s);
}

function walk(root: string, files: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name === ".next" || name === "fx" || name === "actor-binding") continue;
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) files.push(path);
  }
  return files;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function session() {
  const clock = new Clock();
  const auth = authService(clock, new MemoryAuthStore());
  const binding = await ActorBinding.open(auth, new MemoryBindingStore(), { enabled: true, now: clock.now });
  const a = await register(auth, "BindA");
  const b = await register(auth, "BindB");
  const ctxA = await binding.bindToken(a.rawToken);
  const ctxB = await binding.bindToken(b.rawToken);
  return { clock, auth, binding, a, b, ctxA, ctxB, actorA: ctxA.actorId, actorB: ctxB.actorId };
}

describe("fx actor guard default-off", () => {
  it("is default-off and keeps unguarded sys/fx behaviour", async () => {
    expect(FX_ACTOR_DEFAULT_ENABLED).toBe(false);
    const dir = await mkdtemp(join(tmpdir(), "fx-actor-off-"));
    try {
      const g = genesisFor("alice");
      const store = new FileFxStore(join(dir, "fx.json"));
      const engine = await FxEngine.open(store, g);
      const cmd = bankCmd("b1", "alice");
      const after = await engine.observe([frame(0, [cmd])]);
      expect(after.receipts).toHaveLength(1);
      expect(after.receipts[0]?.result.kind).toBe("BANK_CONVERTED");
      const previewEngine = await FxEngine.open(new FileFxStore(join(dir, "fx.json")));
      expect(previewEngine.preview(bankCmd("preview", "alice")).kind).toBe("BANK_CONVERTED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is not imported by live app or server routes", () => {
    const roots = [join(process.cwd(), "src/app"), join(process.cwd(), "src/server"), join(process.cwd(), "src/shell")];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (/server\/market\/fx|@\/server\/market\/fx|server\/actor-binding|@\/server\/actor-binding/.test(withoutComments(text))) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("fx actor guard", () => {
  it("rejects missing, spoofed and cross-account commands with no state or audit change", async () => {
    const { ctxA, ctxB, actorA, actorB, auth, binding, a } = await session();
    const g = genesisFor(actorA, actorB);
    const start = advanceFx(createFx(g), [frame(0, [])]);
    const before = fingerprint(start);
    const receipts = start.receipts.length;
    const transfers = start.transfers.length;
    const cmdA = bankCmd("pay", actorA);
    const cmdB = bankCmd("other", actorB);
    const spoof = bankCmd("spoof", actorA);

    expect(() => advanceFx(start, [frame(1, [cmdA])], { actorGuard: true, binding })).toThrow(BindingError);
    try { advanceFx(start, [frame(1, [cmdA])], { actorGuard: true, binding }); } catch (err) { expectCode(err, "MISSING_SESSION"); }
    expect(fingerprint(start)).toBe(before);
    expect(start.receipts).toHaveLength(receipts);
    expect(start.transfers).toHaveLength(transfers);

    expect(() => advanceFx(start, [frame(1, [cmdA])], { actorGuard: true, contexts: { [cmdA.id]: ctxB } })).toThrow(BindingError);
    try { advanceFx(start, [frame(1, [cmdA])], { actorGuard: true, contexts: { [cmdA.id]: ctxB } }); } catch (err) { expectCode(err, "ACTOR_MISMATCH"); }

    const fake = { ...ctxA, actorId: ctxB.actorId };
    expect(() => advanceFx(start, [frame(1, [spoof])], { actorGuard: true, contexts: { [spoof.id]: fake } })).toThrow(BindingError);

    expect(() => previewFx(start, cmdA, { actorGuard: true, binding })).toThrow(BindingError);
    expect(() => previewFx(start, cmdB, { actorGuard: true, contexts: { [cmdB.id]: ctxA } })).toThrow(BindingError);

    const dir = await mkdtemp(join(tmpdir(), "fx-actor-reject-"));
    try {
      await expect(FxEngine.open(new FileFxStore(join(dir, "nobind.json")), g, { actorGuard: true })).rejects.toBeInstanceOf(BindingError);
      const engine = await FxEngine.open(new FileFxStore(join(dir, "fx.json")), g, { actorGuard: true, binding });
      await engine.observe([frame(0, [])], {});
      const opened = engine.snapshot();
      const bytes = await readFile(join(dir, "fx.json"));
      await expectReject(() => engine.observe([frame(1, [cmdA])]), "MISSING_SESSION");
      await expectReject(() => engine.observe([frame(1, [cmdA])], { [cmdA.id]: ctxB }), "ACTOR_MISMATCH");
      await expectReject(() => engine.observe([frame(1, [cmdA])], { [cmdA.id]: { ...ctxA } }), "FORGED_CONTEXT");
      await expectReject(() => engine.observe([frame(1, [cmdA])], { [cmdA.id]: structuredClone(ctxA) }), "FORGED_CONTEXT");
      expect(() => engine.preview(cmdA)).toThrow(BindingError);
      expect(() => engine.preview(cmdA, ctxB)).toThrow(BindingError);
      expect(() => engine.preview(cmdA, { ...ctxA })).toThrow(BindingError);
      await auth.logout(a.rawToken);
      await expectReject(() => engine.observe([frame(1, [cmdA])], { [cmdA.id]: ctxA }), "SESSION_REJECTED");
      expect(fingerprint(engine.snapshot())).toBe(fingerprint(opened));
      expect(engine.snapshot().receipts).toEqual(opened.receipts);
      expect(engine.snapshot().transfers).toEqual(opened.transfers);
      expect(await readFile(join(dir, "fx.json"))).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lets a legitimate command match the unguarded sys/fx state and journal bytes", async () => {
    const { ctxA, actorA, binding } = await session();
    const g = genesisFor(actorA);
    const cmd = bankCmd("pay", actorA);
    const tape = [frame(0, [cmd])];
    const unguarded = advanceFx(createFx(g), tape);
    const guarded = advanceFx(createFx(g), tape, { actorGuard: true, contexts: { [cmd.id]: ctxA } });
    expect(canonical(guarded)).toBe(canonical(unguarded));
    expect(stateHash(guarded)).toBe(stateHash(unguarded));
    expect(guarded.receipts).toHaveLength(1);
    expect(guarded.receipts[0]?.result.kind).toBe("BANK_CONVERTED");

    const dir = await mkdtemp(join(tmpdir(), "fx-actor-id-"));
    try {
      const off = await FxEngine.open(new FileFxStore(join(dir, "off.json")), g);
      await off.observe(tape);
      const on = await FxEngine.open(new FileFxStore(join(dir, "on.json")), g, { actorGuard: true, binding });
      await on.observe(tape, { [cmd.id]: ctxA });
      expect(canonical(on.snapshot())).toBe(canonical(off.snapshot()));
      expect(await readFile(join(dir, "on.json"))).toEqual(await readFile(join(dir, "off.json")));
      const preview = on.preview(bankCmd("peek", actorA), ctxA);
      const unguardedPreview = previewFx(off.snapshot(), bankCmd("peek", actorA));
      expect(preview).toEqual(unguardedPreview);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reopens a guarded journal without sessions and keeps conservation", async () => {
    const { ctxA, actorA, binding } = await session();
    const g = genesisFor(actorA);
    const cmd = bankCmd("pay", actorA);
    const dir = await mkdtemp(join(tmpdir(), "fx-actor-reopen-"));
    try {
      const path = join(dir, "fx.json");
      const first = await FxEngine.open(new FileFxStore(path), g, { actorGuard: true, binding });
      await first.observe([frame(0, [cmd])], { [cmd.id]: ctxA });
      const bytes = await readFile(path);
      const reopened = await FxEngine.open(new FileFxStore(path), g, { actorGuard: true, binding });
      expect(canonical(reopened.snapshot())).toBe(canonical(first.snapshot()));
      expect(await readFile(path)).toEqual(bytes);
      const { assertFxConservation } = await import("@/server/market/fx/engine");
      assertFxConservation(reopened.snapshot());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});


describe("fx actor guard: contexts are read as an own property (q5)", () => {
  it("a prototype-inherited contexts map is ignored by authorizeFxCommands and assertLiveFxCommands", async () => {
    const { ctxA, actorA, binding } = await session();
    const cmd = bankCmd("pay", actorA);
    const commands = [cmd];
    expect(() => authorizeFxCommands(commands, { actorGuard: true, contexts: { [cmd.id]: ctxA } })).not.toThrow();
    await assertLiveFxCommands(commands, { actorGuard: true, binding, contexts: { [cmd.id]: ctxA } });

    const inherited = Object.assign(Object.create({ contexts: { [cmd.id]: ctxA } }) as object, { actorGuard: true });
    try { authorizeFxCommands(commands, inherited); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "MISSING_SESSION"); }
    const inheritedLive = Object.assign(Object.create({ contexts: { [cmd.id]: ctxA } }) as object, { actorGuard: true, binding });
    await expectReject(() => assertLiveFxCommands(commands, inheritedLive), "MISSING_SESSION");

    const g = genesisFor(actorA);
    const start = advanceFx(createFx(g), [frame(0, [])]);
    const before = fingerprint(start);
    expect(() => advanceFx(start, [frame(1, [cmd])], inherited)).toThrow(BindingError);
    try { advanceFx(start, [frame(1, [cmd])], inherited); } catch (err) { expectCode(err, "MISSING_SESSION"); }
    expect(fingerprint(start)).toBe(before);
  });
});

describe("fx actor guard: forged context values are FORGED_CONTEXT (q3)", () => {
  it("Object.create, Proxy, null-prototype and spread context values are FORGED_CONTEXT, not CLAIM_MALFORMED", async () => {
    const { ctxA, actorA, binding } = await session();
    const cmd = bankCmd("pay", actorA);
    const commands = [cmd];
    const forgeries: Array<[string, unknown]> = [
      ["Object.create", Object.create(ctxA)],
      ["Proxy", new Proxy(ctxA, {})],
      ["null-prototype", Object.assign(Object.create(null) as object, ctxA)],
      ["spread", { ...ctxA }],
    ];
    const codes = forgeries.map(([name, value]) => {
      try { authorizeFxCommands(commands, { actorGuard: true, contexts: { [cmd.id]: value } }); return [name, "ACCEPTED"]; }
      catch (err) { return [name, err instanceof BindingError ? err.code : String(err)]; }
    });
    expect(codes).toEqual(forgeries.map(([name]) => [name, "FORGED_CONTEXT"]));
    for (const [, value] of forgeries) {
      await expectReject(() => assertLiveFxCommands(commands, { actorGuard: true, binding, contexts: { [cmd.id]: value } }), "FORGED_CONTEXT");
    }

    const g = genesisFor(actorA);
    const start = advanceFx(createFx(g), [frame(0, [])]);
    const before = fingerprint(start);
    for (const [, value] of forgeries) {
      try { advanceFx(start, [frame(1, [cmd])], { actorGuard: true, contexts: { [cmd.id]: value } }); throw new Error("expected throw"); }
      catch (err) { expectCode(err, "FORGED_CONTEXT"); }
    }
    expect(fingerprint(start)).toBe(before);
  });

  it("a malformed contexts map stays CLAIM_MALFORMED and its getters never run", async () => {
    const { ctxA, actorA, binding } = await session();
    const cmd = bankCmd("pay", actorA);
    const commands = [cmd];
    let ran = 0;
    const getter = Object.defineProperty({}, cmd.id, { enumerable: true, get: () => { ran++; return ctxA; } });
    const maps: unknown[] = [
      new Proxy({ [cmd.id]: ctxA }, {}),
      Object.assign(Object.create(null) as object, { [cmd.id]: ctxA }),
      [ctxA],
      "contexts",
      getter,
      { "": ctxA },
    ];
    for (const contexts of maps) {
      try { authorizeFxCommands(commands, { actorGuard: true, contexts }); throw new Error("expected throw"); }
      catch (err) { expectCode(err, "CLAIM_MALFORMED"); }
      await expectReject(() => assertLiveFxCommands(commands, { actorGuard: true, binding, contexts }), "CLAIM_MALFORMED");
    }
    expect(ran).toBe(0);
  });
});
