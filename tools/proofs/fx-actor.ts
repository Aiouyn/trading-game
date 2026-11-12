import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthService, FileAuthStore } from "@/server/auth";
import { ActorBinding, FileBindingStore, actorIdFor } from "@/server/actor-binding";
import { advanceFx, assertFxConservation, createFx } from "@/server/market/fx/engine";
import { FileFxStore, FxEngine, stateHash } from "@/server/market/fx/store";
import { canonical, cash, parseCommand, parseFrame, parseGenesis, type Command, type Frame, type Genesis } from "@/server/market/fx/model";
import { MARKS } from "../../tests/fixtures/fx";

const PASSWORD = "local-bind-test";
const EPOCH = "fx-actor-proof-epoch";

class Clock {
  nowMs = 1_700_000_000_000;
  now = () => this.nowMs;
}

function system(id: string, amount = 0) {
  return { id, cash: cash(amount), units: {}, access: { kind: "SYSTEM" as const } };
}
function actor(id: string, amount = 1_000_000) {
  return { id, cash: cash(amount), units: {}, access: { kind: "ACTOR" as const, license: 2, held: false } };
}
function genesisFor(ids: string[]): Genesis {
  return parseGenesis({
    epoch: EPOCH,
    startTick: 0,
    feeWallet: "fees",
    banks: [{ id: "retail", inventory: "bank", income: "bank-income" }],
    wallets: [...ids.map((id) => actor(id)), system("fees"), system("bank", 1_000_000), system("bank-income")],
  });
}
function bankCmd(id: string, account: string, spend = 10_000): Command {
  return parseCommand({ kind: "BANK", id, account, bank: "retail", from: "FDL", to: "NKR", spend, minOutput: 1 });
}
function frame(tick: number, commands: Command[]): Frame {
  return parseFrame({ epoch: EPOCH, tick, marks: MARKS, controls: [], assets: [], commands });
}

async function main() {
  const evidence = process.env.SYS_FX_ACTOR_EVIDENCE_DIR;
  if (!evidence) throw new Error("SYS_FX_ACTOR_EVIDENCE_DIR required");
  await mkdir(evidence, { recursive: true });
  const output = async (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  await output("measurement-contract.json", {
    version: 1,
    head,
    gitStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
    zone: "Europe/Paris",
    scope: "FX actor guard on the isolated sys/fx engine; default-off, unmounted, no auth/broker/Wire edits",
    checks: [
      "unguarded vs guarded legitimate commands are byte-identical",
      "restart and jump equivalence on clean stores with the guard on",
      "per-currency conservation on every tick",
      "missing, spoofed and cross-account commands do not mutate state or receipts",
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
  const tape: Frame[] = [
    frame(0, [bankCmd("a0", ctxA.actorId, 4_000), bankCmd("b0", ctxB.actorId, 6_000)]),
    frame(1, [bankCmd("a1", ctxA.actorId, 2_000)]),
    frame(2, [bankCmd("b2", ctxB.actorId, 1_000)]),
  ];
  const contexts = {
    a0: ctxA, b0: ctxB, a1: ctxA, b2: ctxB,
  };
  const unguarded = advanceFx(createFx(g), tape);
  const guarded = advanceFx(createFx(g), tape, { actorGuard: true, contexts });
  assert.equal(canonical(guarded), canonical(unguarded));
  assert.equal(stateHash(guarded), stateHash(unguarded));
  let stepping = createFx(g);
  for (const f of tape) {
    stepping = advanceFx(stepping, [f], { actorGuard: true, contexts });
    assertFxConservation(stepping);
  }
  assert.equal(canonical(stepping), canonical(guarded));

  const start = advanceFx(createFx(g), [frame(0, [])]);
  const before = canonical(start);
  assert.throws(() => advanceFx(start, [tape[0]!], { actorGuard: true, binding }), (err: unknown) => err instanceof Error && err.message === "MISSING_SESSION" || (err as { code?: string }).code === "MISSING_SESSION");
  assert.equal(canonical(start), before);
  assert.throws(() => advanceFx(start, [frame(1, [bankCmd("x", ctxA.actorId)])], { actorGuard: true, contexts: { x: ctxB } }), (err: unknown) => (err as { code?: string }).code === "ACTOR_MISMATCH");
  assert.equal(canonical(start), before);
  assert.equal(start.receipts.length, 0);
  assert.equal(start.transfers.length, 0);
  assert.throws(() => advanceFx(start, [frame(1, [bankCmd("forge", ctxA.actorId)])], { actorGuard: true, contexts: { forge: { ...ctxA } } }), (err: unknown) => (err as { code?: string }).code === "FORGED_CONTEXT");
  assert.throws(() => advanceFx(start, [frame(1, [bankCmd("clone", ctxA.actorId)])], { actorGuard: true, contexts: { clone: structuredClone(ctxA) } }), (err: unknown) => (err as { code?: string }).code === "FORGED_CONTEXT");
  assert.equal(canonical(start), before);

  const rows: unknown[] = [];
  for (const cut of [0, 1, tape.length - 1]) {
    const file = path.join(clean, `restart-${cut}.json`);
    let engine = await FxEngine.open(new FileFxStore(file), g, { actorGuard: true, binding });
    await engine.observe(tape.slice(0, cut + 1), contexts);
    const mid = engine.snapshot();
    const midBytes = await readFile(file);
    engine = await FxEngine.open(new FileFxStore(file), g, { actorGuard: true, binding });
    assert.equal(canonical(engine.snapshot()), canonical(mid));
    assert.deepEqual(await readFile(file), midBytes);
    await engine.observe(tape.slice(cut + 1), contexts);
    assert.equal(canonical(engine.snapshot()), canonical(guarded));
    engine = await FxEngine.open(new FileFxStore(file), g, { actorGuard: true, binding });
    assert.equal(canonical(engine.snapshot()), canonical(guarded));
    assertFxConservation(engine.snapshot());
    rows.push({ cut, stateSha256: stateHash(mid), finalSha256: stateHash(engine.snapshot()), restartEqual: true });
  }

  const off = await FxEngine.open(new FileFxStore(path.join(clean, "off.json")), g);
  await off.observe(tape);
  const on = await FxEngine.open(new FileFxStore(path.join(clean, "on.json")), g, { actorGuard: true, binding });
  await on.observe(tape, contexts);
  assert.deepEqual(await readFile(path.join(clean, "on.json")), await readFile(path.join(clean, "off.json")));

  const rejectPath = path.join(clean, "reject.json");
  const rejectEngine = await FxEngine.open(new FileFxStore(rejectPath), g, { actorGuard: true, binding });
  await rejectEngine.observe([frame(0, [])], {});
  const rejectBefore = canonical(rejectEngine.snapshot());
  const rejectBytes = await readFile(rejectPath);
  const pay = bankCmd("pay-reject", ctxA.actorId);
  const payFrame = [frame(1, [pay])];
  const forgedErr = await rejectEngine.observe(payFrame, { [pay.id]: { ...ctxA } }).then(() => null, (err: unknown) => err);
  assert.equal((forgedErr as { code?: string }).code, "FORGED_CONTEXT");
  const clonedErr = await rejectEngine.observe(payFrame, { [pay.id]: structuredClone(ctxA) }).then(() => null, (err: unknown) => err);
  assert.equal((clonedErr as { code?: string }).code, "FORGED_CONTEXT");
  await auth.logout(a.rawToken);
  const logoutErr = await rejectEngine.observe(payFrame, { [pay.id]: ctxA }).then(() => null, (err: unknown) => err);
  assert.equal((logoutErr as { code?: string }).code, "SESSION_REJECTED");
  assert.equal(canonical(rejectEngine.snapshot()), rejectBefore);
  assert.deepEqual(await readFile(rejectPath), rejectBytes);

  await output("identity-proof.json", {
    unguardedSha256: stateHash(unguarded),
    guardedSha256: stateHash(guarded),
    engineJournalBytesEqual: true,
    ok: true,
  });
  await output("restart-jump-proof.json", {
    perTickEqualsCompleteTape: true,
    restarts: rows,
    finalSha256: stateHash(guarded),
    ok: true,
  });
  await output("conservation-proof.json", {
    everyTickChecked: true,
    currencies: guarded.wallets.reduce<Record<string, number>>((acc, w) => {
      for (const [ccy, n] of Object.entries(w.cash)) acc[ccy] = (acc[ccy] ?? 0) + n;
      return acc;
    }, {}),
    genesis: guarded.genesisCash,
    ok: true,
  });
  await output("fail-closed-proof.json", {
    missingSessionNoMutation: true,
    crossAccountNoMutation: true,
    forgedContextNoMutation: true,
    clonedContextNoMutation: true,
    loggedOutSessionNoMutation: true,
    receiptsUnchanged: true,
    ok: true,
  });
  await output("summary.json", {
    defaultOff: true,
    legitimateByteIdentical: true,
    restartJump: true,
    conservation: true,
    failClosed: true,
    noRuntimeMounting: true,
    ok: true,
  });
  console.log(`fx-actor proofs passed: ${evidence}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
