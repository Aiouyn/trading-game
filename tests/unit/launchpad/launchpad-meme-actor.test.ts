import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAuthStore } from "@/server/auth";
import { ActorBinding, BindingError, MemoryBindingStore } from "@/server/actor-binding";
import { authService, register, Clock } from "../actor-binding/fixture";
import { LP } from "@/launchpad/rules";
import { advanceFarm, assertConservation, cashTotal, commandFarm, createFarm } from "@/server/launchpad/failureFarm/engine";
import { FailureFarmEngine, FileFarmStore, MEME_ACTOR_DEFAULT_ENABLED } from "@/server/launchpad/failureFarm/store";
import type { FarmCommand, FarmState } from "@/server/launchpad/failureFarm/model";

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

function genesisFor(...ids: string[]): FarmState {
  return createFarm("meme-actor-test", [
    ...ids.map((id) => ({ id, kind: "PLAYER" as const, cash: 10_000_000 })),
    { id: "npc", kind: "NPC", cash: 20_000_000 },
    { id: "retail", kind: "RETAIL", cash: 20_000_000 },
  ]);
}

function launchCmd(wallet: string, ticker: string, key = `launch-${ticker}`): FarmCommand {
  return { kind: "LAUNCH", wallet, key, ticker, name: `${ticker} Club`, fee: LP.LAUNCH_FEE, nowMs: 0 };
}

function buyCmd(wallet: string, ticker: string, amount = 50_000, key = `buy-${ticker}`): FarmCommand {
  return { kind: "TRADE", wallet, key, ticker, side: "BUY", amount };
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

function walk(root: string, files: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name === ".next" || name === "failureFarm" || name === "actor-binding" || name === "fx") continue;
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) files.push(path);
  }
  return files;
}

describe("meme actor guard default-off", () => {
  it("is default-off and keeps unguarded sys/meme-failure-farm behaviour", async () => {
    expect(MEME_ACTOR_DEFAULT_ENABLED).toBe(false);
    const initial = genesisFor("creator", "holder");
    const launched = commandFarm(initial, launchCmd("creator", "GULL"));
    expect(launched.reply).toEqual({ kind: "LAUNCHED", ticker: "GULL" });
    expect(launched.state.wallets.creator?.cash).toBe(10_000_000 - LP.LAUNCH_FEE);
    expect(cashTotal(launched.state)).toBe(initial.initialCash);

    const dir = await mkdtemp(join(tmpdir(), "meme-actor-off-"));
    try {
      const engine = await FailureFarmEngine.open(new FileFarmStore(join(dir, "farm.json")), initial);
      const reply = await engine.execute(launchCmd("creator", "GULL"));
      expect(reply).toEqual({ kind: "LAUNCHED", ticker: "GULL" });
      expect(engine.snapshot().wallets.creator?.cash).toBe(10_000_000 - LP.LAUNCH_FEE);
      const preview = await engine.preview(buyCmd("holder", "GULL"));
      expect(preview.kind).toBe("FILLED");
      expect(engine.snapshot().wallets.holder?.cash).toBe(10_000_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is not imported by live app or server routes, and issueActorContext stays inside actor-binding", () => {
    const roots = [join(process.cwd(), "src/app"), join(process.cwd(), "src/server"), join(process.cwd(), "src/shell")];
    const hits: string[] = [];
    const leakedIssue: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (/server\/launchpad\/failureFarm|@\/server\/launchpad\/failureFarm|server\/actor-binding|@\/server\/actor-binding/.test(text)) {
          hits.push(file);
        }
        if (/actor-binding\/model/.test(text) && /issueActorContext/.test(text)) leakedIssue.push(file);
      }
    }
    expect(hits).toEqual([]);
    expect(leakedIssue).toEqual([]);
  });
});

describe("meme actor guard", () => {
  it("rejects missing, spoofed, forged and cross-account commands with no state or fee change", async () => {
    const { ctxA, ctxB, actorA, actorB, auth, binding, a } = await session();
    const initial = genesisFor(actorA, actorB);
    const before = JSON.stringify(initial);
    const cashA = initial.wallets[actorA]?.cash;
    const cashB = initial.wallets[actorB]?.cash;
    const cmd = launchCmd(actorA, "GULL");
    const options = { actorGuard: true as const, contexts: { [cmd.key]: ctxA } };

    try { commandFarm(initial, cmd, { actorGuard: true, binding }); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "MISSING_SESSION"); }
    expect(JSON.stringify(initial)).toBe(before);

    try { commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: ctxB } }); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "ACTOR_MISMATCH"); }
    expect(initial.wallets[actorA]?.cash).toBe(cashA);
    expect(initial.wallets[actorB]?.cash).toBe(cashB);
    expect(initial.sink).toBe(0);
    expect(initial.receipts).toEqual({});

    try { commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: { ...ctxA } } }); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "FORGED_CONTEXT"); }
    try { commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: structuredClone(ctxA) } }); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "FORGED_CONTEXT"); }
    try { commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: Object.create(ctxA) } }); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "FORGED_CONTEXT"); }
    try { commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: new Proxy(ctxA, {}) } }); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "FORGED_CONTEXT"); }
    try {
      commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: Object.assign(Object.create(null), ctxA) } });
      throw new Error("expected throw");
    } catch (err) { expectCode(err, "FORGED_CONTEXT"); }
    expect(JSON.stringify(initial)).toBe(before);

    const inherited = Object.create({ contexts: { [cmd.key]: ctxA } }) as { actorGuard: true; contexts?: unknown };
    inherited.actorGuard = true;
    try { commandFarm(initial, cmd, inherited); throw new Error("expected throw"); }
    catch (err) { expectCode(err, "MISSING_SESSION"); }

    const dir = await mkdtemp(join(tmpdir(), "meme-actor-reject-"));
    try {
      await expect(FailureFarmEngine.open(new FileFarmStore(join(dir, "nobind.json")), initial, { actorGuard: true }))
        .rejects.toBeInstanceOf(BindingError);
      const engine = await FailureFarmEngine.open(new FileFarmStore(join(dir, "farm.json")), initial, { actorGuard: true, binding });
      const opened = engine.snapshot();
      const bytes = await readFile(join(dir, "farm.json"));
      await expectReject(() => engine.execute(cmd), "MISSING_SESSION");
      await expectReject(() => engine.execute(cmd, ctxB), "ACTOR_MISMATCH");
      await expectReject(() => engine.execute(cmd, { ...ctxA }), "FORGED_CONTEXT");
      await expectReject(() => engine.execute(cmd, structuredClone(ctxA)), "FORGED_CONTEXT");
      await expectReject(() => engine.execute(cmd, Object.create(ctxA)), "FORGED_CONTEXT");
      await expectReject(() => engine.execute(cmd, new Proxy(ctxA, {})), "FORGED_CONTEXT");
      await expectReject(() => engine.preview(cmd), "MISSING_SESSION");
      await expectReject(() => engine.preview(cmd, ctxB), "ACTOR_MISMATCH");
      await expectReject(() => engine.preview(cmd, { ...ctxA }), "FORGED_CONTEXT");
      await auth.logout(a.rawToken);
      await expectReject(() => engine.preview(cmd, ctxA), "SESSION_REJECTED");
      await expectReject(() => engine.execute(cmd, ctxA), "SESSION_REJECTED");
      expect(JSON.stringify(engine.snapshot())).toBe(JSON.stringify(opened));
      expect(engine.snapshot().wallets[actorA]?.cash).toBe(cashA);
      expect(engine.snapshot().wallets[actorB]?.cash).toBe(cashB);
      expect(engine.snapshot().sink).toBe(0);
      expect(await readFile(join(dir, "farm.json"))).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("charges the $1,000 launch fee only to the bound actor and matches the unguarded journal", async () => {
    const { ctxA, ctxB, actorA, actorB, binding } = await session();
    const initial = genesisFor(actorA, actorB);
    const cmd = launchCmd(actorA, "GULL");
    const unguarded = commandFarm(initial, cmd);
    const guarded = commandFarm(initial, cmd, { actorGuard: true, contexts: { [cmd.key]: ctxA } });
    expect(JSON.stringify(guarded.state)).toBe(JSON.stringify(unguarded.state));
    expect(guarded.reply).toEqual({ kind: "LAUNCHED", ticker: "GULL" });
    expect(unguarded.state.wallets[actorA]?.cash).toBe(10_000_000 - LP.LAUNCH_FEE);
    expect(unguarded.state.wallets[actorB]?.cash).toBe(10_000_000);
    expect(unguarded.state.sink).toBe(LP.LAUNCH_FEE);
    expect(cashTotal(unguarded.state)).toBe(initial.initialCash);
    assertConservation(unguarded.state);

    const dir = await mkdtemp(join(tmpdir(), "meme-actor-id-"));
    try {
      const off = await FailureFarmEngine.open(new FileFarmStore(join(dir, "off.json")), initial);
      await off.execute(cmd);
      const on = await FailureFarmEngine.open(new FileFarmStore(join(dir, "on.json")), initial, { actorGuard: true, binding });
      await on.execute(cmd, ctxA);
      expect(JSON.stringify(on.snapshot())).toBe(JSON.stringify(off.snapshot()));
      expect(await readFile(join(dir, "on.json"))).toEqual(await readFile(join(dir, "off.json")));
      expect(on.snapshot().wallets[actorA]?.cash).toBe(10_000_000 - LP.LAUNCH_FEE);
      expect(on.snapshot().wallets[actorB]?.cash).toBe(10_000_000);

      const buy = buyCmd(actorB, "GULL", 50_000, "buy-GULL");
      const preview = await on.preview(buy, ctxB);
      const unguardedPreview = await off.preview(buy);
      expect(preview).toEqual(unguardedPreview);
      expect(on.snapshot().wallets[actorB]?.cash).toBe(10_000_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("advances hourly effects under the guard without a context and reopens without sessions", async () => {
    const { ctxA, ctxB, actorA, actorB, binding } = await session();
    const initial = genesisFor(actorA, actorB);
    const launch = launchCmd(actorA, "GULL");
    const buy = buyCmd(actorB, "GULL", 50_000, "buy-GULL");
    const dir = await mkdtemp(join(tmpdir(), "meme-actor-reopen-"));
    try {
      const path = join(dir, "farm.json");
      const first = await FailureFarmEngine.open(new FileFarmStore(path), initial, { actorGuard: true, binding });
      expect(await first.execute(launch, ctxA)).toEqual({ kind: "LAUNCHED", ticker: "GULL" });
      expect((await first.execute(buy, ctxB)).kind).toBe("FILLED");
      await first.advance(Array.from({ length: 3 }, (_, i) => ({ hour: i + 1, coins: {} })));
      const mid = first.snapshot();
      assertConservation(mid);
      expect(mid.hour).toBe(3);
      const bytes = await readFile(path);
      const reopened = await FailureFarmEngine.open(new FileFarmStore(path), initial, { actorGuard: true, binding });
      expect(JSON.stringify(reopened.snapshot())).toBe(JSON.stringify(mid));
      expect(await readFile(path)).toEqual(bytes);
      const jumped = advanceFarm(commandFarm(commandFarm(initial, launch).state, buy).state, Array.from({ length: 3 }, (_, i) => ({ hour: i + 1, coins: {} })));
      expect(JSON.stringify(reopened.snapshot())).toBe(JSON.stringify(jumped));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
