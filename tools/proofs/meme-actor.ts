import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthService, FileAuthStore } from "@/server/auth";
import { ActorBinding, FileBindingStore, actorIdFor } from "@/server/actor-binding";
import { LP } from "../../src/launchpad/rules";
import { advanceFarm, assertConservation, cashTotal, commandFarm, createFarm } from "../../src/server/launchpad/failureFarm/engine";
import { FailureFarmEngine, FileFarmStore, MEME_ACTOR_DEFAULT_ENABLED } from "../../src/server/launchpad/failureFarm/store";
import type { FarmCommand, FarmFrame, FarmState } from "../../src/server/launchpad/failureFarm/model";

const PASSWORD = "local-bind-test";
const digest = (s: FarmState) => createHash("sha256").update(JSON.stringify(s)).digest("hex");

class Clock {
  nowMs = 1_700_000_000_000;
  now = () => this.nowMs;
}

function genesisFor(ids: string[]): FarmState {
  return createFarm("meme-actor-proof", [
    ...ids.map((id) => ({ id, kind: "PLAYER" as const, cash: 10_000_000 })),
    { id: "npc", kind: "NPC", cash: 20_000_000 },
    { id: "retail", kind: "RETAIL", cash: 20_000_000 },
  ]);
}

function launchCmd(wallet: string, ticker: string): FarmCommand {
  return { kind: "LAUNCH", wallet, key: `launch-${ticker}`, ticker, name: `${ticker} Club`, fee: LP.LAUNCH_FEE, nowMs: 0 };
}

function buyCmd(wallet: string, ticker: string, amount: number, key: string): FarmCommand {
  return { kind: "TRADE", wallet, key, ticker, side: "BUY", amount };
}

function frames(from: number, to: number): FarmFrame[] {
  return Array.from({ length: to - from }, (_, i) => ({ hour: from + i + 1, coins: {} }));
}

function applyUnguarded(initial: FarmState, commands: FarmCommand[], hours: number): FarmState {
  let state = initial;
  for (const command of commands) {
    const next = commandFarm(state, command);
    assert.notEqual(next.reply.kind, "REFUSED");
    state = next.state;
    assertConservation(state);
  }
  if (hours > 0) state = advanceFarm(state, frames(0, hours));
  assertConservation(state);
  assert.equal(cashTotal(state), initial.initialCash);
  return state;
}

async function main() {
  const evidence = process.env.SYS_MEME_ACTOR_EVIDENCE_DIR;
  if (!evidence) throw new Error("SYS_MEME_ACTOR_EVIDENCE_DIR required");
  await mkdir(evidence, { recursive: true });
  const output = async (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(MEME_ACTOR_DEFAULT_ENABLED, false);
  await output("measurement-contract.json", {
    version: 1,
    head,
    gitStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
    zone: "Europe/Paris",
    scope: "Meme farm actor guard on the isolated failure-farm engine; default-off, unmounted, no auth/broker/Wire/live Launchpad edits",
    checks: [
      "unguarded vs guarded legitimate commands are byte-identical",
      "unguarded tape remains comparable to sys/meme-failure-farm ae625a55",
      "restart and jump equivalence on clean stores with the guard on",
      "cash residual 0 and token conservation; launch fee is a sink, not minted",
      "missing, spoofed, forged and cross-account commands do not mutate state or receipts",
    ],
    limits: ["no live route mount", "player wallet ids under the guard are bound chr_ actor ids"],
  });

  const clean = await mkdtemp(path.join(evidence, "clean-stores-"));
  const clock = new Clock();
  const auth = new AuthService({ store: new FileAuthStore(path.join(clean, "auth.json")), now: clock.now });
  const binding = await ActorBinding.open(auth, new FileBindingStore(path.join(clean, "bind.json")), { enabled: true, now: clock.now });
  const a = await auth.register({ handle: "BindA", password: PASSWORD });
  const b = await auth.register({ handle: "BindB", password: PASSWORD });
  const ctxA = await binding.bindToken(a.rawToken);
  const ctxB = await binding.bindToken(b.rawToken);
  assert.equal(ctxA.actorId, actorIdFor(a.view.account.accountId));
  const g = genesisFor([ctxA.actorId, ctxB.actorId]);
  const commands: FarmCommand[] = [
    launchCmd(ctxA.actorId, "GULL"),
    buyCmd(ctxB.actorId, "GULL", 50_000, "buy-GULL-1"),
    buyCmd(ctxA.actorId, "GULL", 25_000, "buy-GULL-2"),
  ];
  const contexts: Record<string, typeof ctxA> = {
    [commands[0]!.key]: ctxA,
    [commands[1]!.key]: ctxB,
    [commands[2]!.key]: ctxA,
  };
  const hours = 8;
  const unguarded = applyUnguarded(g, commands, hours);
  let guarded = g;
  for (const command of commands) {
    const next = commandFarm(guarded, command, { actorGuard: true, contexts });
    assert.notEqual(next.reply.kind, "REFUSED");
    guarded = next.state;
    assertConservation(guarded);
  }
  guarded = advanceFarm(guarded, frames(0, hours));
  assert.equal(JSON.stringify(guarded), JSON.stringify(unguarded));
  assert.equal(digest(guarded), digest(unguarded));
  assert.equal(cashTotal(guarded) - g.initialCash, 0);
  const aliceSpent = g.wallets[ctxA.actorId]!.cash - guarded.wallets[ctxA.actorId]!.cash;
  const bobSpent = g.wallets[ctxB.actorId]!.cash - guarded.wallets[ctxB.actorId]!.cash;
  assert.ok(aliceSpent >= LP.LAUNCH_FEE, "bound launcher pays the fee");
  assert.ok(bobSpent > 0, "counterparty pays the trade, not the launch fee alone");
  assert.notEqual(bobSpent, LP.LAUNCH_FEE);
  assert.ok(guarded.sink >= LP.LAUNCH_FEE);

  const start = g;
  const before = JSON.stringify(start);
  const launch = commands[0]!;
  assert.throws(
    () => commandFarm(start, launch, { actorGuard: true, binding }),
    (err: unknown) => (err as { code?: string }).code === "MISSING_SESSION",
  );
  assert.equal(JSON.stringify(start), before);
  assert.throws(
    () => commandFarm(start, launch, { actorGuard: true, contexts: { [launch.key]: ctxB } }),
    (err: unknown) => (err as { code?: string }).code === "ACTOR_MISMATCH",
  );
  assert.equal(start.wallets[ctxA.actorId]!.cash, 10_000_000);
  assert.equal(start.wallets[ctxB.actorId]!.cash, 10_000_000);
  assert.equal(start.sink, 0);
  assert.throws(
    () => commandFarm(start, launch, { actorGuard: true, contexts: { [launch.key]: { ...ctxA } } }),
    (err: unknown) => (err as { code?: string }).code === "FORGED_CONTEXT",
  );
  assert.throws(
    () => commandFarm(start, launch, { actorGuard: true, contexts: { [launch.key]: structuredClone(ctxA) } }),
    (err: unknown) => (err as { code?: string }).code === "FORGED_CONTEXT",
  );
  assert.throws(
    () => commandFarm(start, launch, { actorGuard: true, contexts: { [launch.key]: Object.create(ctxA) } }),
    (err: unknown) => (err as { code?: string }).code === "FORGED_CONTEXT",
  );
  assert.throws(
    () => commandFarm(start, launch, { actorGuard: true, contexts: { [launch.key]: new Proxy(ctxA, {}) } }),
    (err: unknown) => (err as { code?: string }).code === "FORGED_CONTEXT",
  );
  assert.equal(JSON.stringify(start), before);

  const off = await FailureFarmEngine.open(new FileFarmStore(path.join(clean, "off.json")), g);
  for (const command of commands) await off.execute(command);
  await off.advance(frames(0, hours));
  const on = await FailureFarmEngine.open(new FileFarmStore(path.join(clean, "on.json")), g, { actorGuard: true, binding });
  for (const command of commands) await on.execute(command, contexts[command.key]);
  await on.advance(frames(0, hours));
  assert.equal(JSON.stringify(on.snapshot()), JSON.stringify(off.snapshot()));
  assert.deepEqual(await readFile(path.join(clean, "on.json")), await readFile(path.join(clean, "off.json")));
  assert.equal(digest(on.snapshot()), digest(unguarded));
  await writeFile(path.join(evidence, "unguarded-journal.json"), await readFile(path.join(clean, "off.json")));

  const rows: unknown[] = [];
  for (const cut of [0, 3, hours]) {
    const file = path.join(clean, `restart-${cut}.json`);
    let engine = await FailureFarmEngine.open(new FileFarmStore(file), g, { actorGuard: true, binding });
    for (const command of commands) await engine.execute(command, contexts[command.key]);
    if (cut > 0) await engine.advance(frames(0, cut));
    const mid = engine.snapshot();
    const midBytes = await readFile(file);
    engine = await FailureFarmEngine.open(new FileFarmStore(file), g, { actorGuard: true, binding });
    assert.equal(JSON.stringify(engine.snapshot()), JSON.stringify(mid));
    assert.deepEqual(await readFile(file), midBytes);
    if (cut < hours) await engine.advance(frames(cut, hours));
    assert.equal(JSON.stringify(engine.snapshot()), JSON.stringify(unguarded));
    const jumped = advanceFarm(applyUnguarded(g, commands, 0), frames(0, hours));
    assert.equal(JSON.stringify(engine.snapshot()), JSON.stringify(jumped));
    assertConservation(engine.snapshot());
    rows.push({ cut, stateSha256: digest(mid), finalSha256: digest(engine.snapshot()), restartEqual: true, jumpEqual: true });
  }

  const rejectPath = path.join(clean, "reject.json");
  const rejectEngine = await FailureFarmEngine.open(new FileFarmStore(rejectPath), g, { actorGuard: true, binding });
  const rejectBefore = JSON.stringify(rejectEngine.snapshot());
  const rejectBytes = await readFile(rejectPath);
  const forgedErr = await rejectEngine.execute(launch, { ...ctxA }).then(() => null, (err: unknown) => err);
  assert.equal((forgedErr as { code?: string }).code, "FORGED_CONTEXT");
  const clonedErr = await rejectEngine.execute(launch, structuredClone(ctxA)).then(() => null, (err: unknown) => err);
  assert.equal((clonedErr as { code?: string }).code, "FORGED_CONTEXT");
  const crossErr = await rejectEngine.execute(launch, ctxB).then(() => null, (err: unknown) => err);
  assert.equal((crossErr as { code?: string }).code, "ACTOR_MISMATCH");
  await auth.logout(a.rawToken);
  const previewErr = await rejectEngine.preview(launch, ctxA).then(() => null, (err: unknown) => err);
  assert.equal((previewErr as { code?: string }).code, "SESSION_REJECTED");
  const logoutErr = await rejectEngine.execute(launch, ctxA).then(() => null, (err: unknown) => err);
  assert.equal((logoutErr as { code?: string }).code, "SESSION_REJECTED");
  assert.equal(JSON.stringify(rejectEngine.snapshot()), rejectBefore);
  assert.deepEqual(await readFile(rejectPath), rejectBytes);
  assert.equal(rejectEngine.snapshot().wallets[ctxA.actorId]!.cash, 10_000_000);
  assert.equal(rejectEngine.snapshot().sink, 0);

  await output("identity-proof.json", {
    unguardedSha256: digest(unguarded),
    guardedSha256: digest(guarded),
    engineJournalBytesEqual: true,
    launchFeeCents: LP.LAUNCH_FEE,
    boundActorCharged: true,
    otherActorUncharged: true,
    ok: true,
  });
  await output("restart-jump-proof.json", {
    perHourEqualsCompleteTape: true,
    restarts: rows,
    finalSha256: digest(unguarded),
    ok: true,
  });
  await output("conservation-proof.json", {
    initialCashCents: g.initialCash,
    finalCashIncludingSinkCents: cashTotal(unguarded),
    cashResidual: cashTotal(unguarded) - g.initialCash,
    sinkCents: unguarded.sink,
    ok: cashTotal(unguarded) === g.initialCash,
  });
  await output("fail-closed-proof.json", {
    missingSessionNoMutation: true,
    crossAccountNoMutation: true,
    forgedContextNoMutation: true,
    clonedContextNoMutation: true,
    objectCreateAndProxyNoMutation: true,
    loggedOutPreviewRejected: true,
    loggedOutSessionNoMutation: true,
    receiptsUnchanged: true,
    feeUnchargedOnReject: true,
    ok: true,
  });
  await output("summary.json", {
    defaultOff: true,
    legitimateByteIdentical: true,
    restartJump: true,
    conservationResidual: 0,
    failClosed: true,
    noRuntimeMounting: true,
    ok: true,
  });
  console.log(`meme-actor proofs passed: ${evidence}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
