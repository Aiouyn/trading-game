import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthService, FileAuthStore } from "@/server/auth";
import { ActorBinding, FileBindingStore, actorIdFor } from "@/server/actor-binding";
import {
  BANKING_CORE_ACTOR_DEFAULT_ENABLED,
  BankingCoreEngine,
  FileBankingCoreStore,
  assertCoreAccounting,
} from "../../src/server/banking-core/engine";
import { coreFingerprint } from "../../src/server/banking-core/boundary";
import * as F from "../../tests/unit/banking-core/fixture";

const PASSWORD = "local-bind-test";

class Clock {
  nowMs = 1_700_000_000_000;
  now = () => this.nowMs;
}

function remapOwners<T>(value: T, map: Record<string, string>): T {
  const next = structuredClone(value) as T;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    for (const key of ["owner", "group", "id", "actor", "clientId", "holderId"]) {
      const current = rec[key];
      if (typeof current === "string" && map[current]) rec[key] = map[current];
    }
    for (const child of Object.values(rec)) visit(child);
  };
  visit(next);
  return next;
}

function loanWorld(map: Record<string, string>) {
  const g = F.bankingFixture();
  g.credit = [F.creditBook("bankA", ["business", "company-wallet"], "other")];
  return remapOwners(g, map);
}

function facts(companyId: string) {
  return F.creditFacts([F.companyProfile(companyId, 2000000000)]);
}

function tape(alice: string, company: string, target = 719): F.Frame[] {
  return F.frames(target, (f) => {
    if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
    if (f.tick === 0) {
      f.banking = F.bankFrame(0, [
        { id: "open-s", actor: alice, kind: "OPEN", depositId: "alice-save", bankId: "bankA", product: "SAVINGS" },
      ], null);
      f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [F.apply(company, 1000, "business", F.term("BULLET"))], facts(company)) }];
    }
    if (f.tick === 1) {
      f.banking = F.bankFrame(1, [
        { id: "dep-s", actor: alice, kind: "DEPOSIT", depositId: "alice-save", amount: F.usd(1000) },
      ], null);
      f.credit = [{ bankId: "bankA", frame: F.creditFrame(1, [F.accept(company)], facts(company)) }];
    }
    if (f.tick % 720 === 719) {
      const row = f.credit.find((c) => c.bankId === "bankA");
      if (row) (row.frame as { facts: unknown }).facts = facts(company);
      else f.credit.push({ bankId: "bankA", frame: F.creditFrame(f.tick, [], facts(company)) });
    }
  }, () => false);
}

async function main() {
  const outIdx = process.argv.indexOf("--out");
  if (outIdx < 0 || !process.argv[outIdx + 1]) throw new Error("usage: banking-core-actor.ts --out <dir>");
  const evidence = path.resolve(process.argv[outIdx + 1]!);
  await mkdir(evidence, { recursive: true });
  const output = async (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(BANKING_CORE_ACTOR_DEFAULT_ENABLED, false);
  await output("measurement-contract.json", {
    version: 1,
    head,
    gitStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
    zone: "Europe/Paris",
    scope: "banking-core actor guard on the isolated unified ledger; default-off, unmounted, no auth/broker/Wire edits",
    checks: [
      "unguarded vs guarded legitimate commands are byte-identical",
      "restart and jump equivalence on clean stores with the guard on",
      "zero residuals: base money identity and credit source identity after every jump",
      "missing, spoofed and cross-account commands do not mutate state, receipts or audit",
      "tick-driven interest runs under the guard without an ActorContext",
    ],
    limits: ["no live route mount", "player owners under the guard are bound chr_ actor ids"],
  });

  const clean = await mkdtemp(path.join(evidence, "clean-stores-"));
  const clock = new Clock();
  const auth = new AuthService({ store: new FileAuthStore(path.join(clean, "auth.json")), now: clock.now });
  const binding = await ActorBinding.open(auth, new FileBindingStore(path.join(clean, "bind.json")), { enabled: true, now: clock.now });
  const a = await auth.register({ handle: "BindA", password: PASSWORD });
  const b = await auth.register({ handle: "BindB", password: PASSWORD });
  const c = await auth.register({ handle: "BindC", password: PASSWORD });
  const ctxA = await binding.bindToken(a.rawToken);
  const ctxB = await binding.bindToken(b.rawToken);
  const ctxC = await binding.bindToken(c.rawToken);
  assert.equal(ctxA.actorId, actorIdFor(a.view.account.accountId));
  const map = { alice: ctxA.actorId, bob: ctxB.actorId, company: ctxC.actorId };
  const g = loanWorld(map);
  const frames = tape(ctxA.actorId, ctxC.actorId, 719);
  const contexts = { "open-s": ctxA, "dep-s": ctxA, apply: ctxC, accept: ctxC };

  const offPath = path.join(clean, "off.json");
  const onPath = path.join(clean, "on.json");
  const off = await BankingCoreEngine.open(new FileBankingCoreStore(offPath), g, true);
  const on = await BankingCoreEngine.open(new FileBankingCoreStore(onPath), g, true, { actorGuard: true, binding });
  const unguarded = await off.advance(719, frames);
  const guarded = await on.advance(719, frames, contexts);
  assertCoreAccounting(unguarded);
  assertCoreAccounting(guarded);
  assert.equal(coreFingerprint(guarded), coreFingerprint(unguarded));
  assert.deepEqual(await readFile(onPath), await readFile(offPath));
  const interestPaid = guarded.bankingMeta!.movements.filter((m) => m.kind === "DEPOSIT_INTEREST" && m.depositId === "alice-save").reduce((n, m) => n + m.amount, BigInt(0));
  assert.ok(interestPaid > BigInt(0), "expected tick-driven savings interest");
  assert.ok(guarded.creditBooks[0]!.loans.length > 0, "expected accepted loan");

  let stepping = await BankingCoreEngine.open(new FileBankingCoreStore(path.join(clean, "step.json")), g, true, { actorGuard: true, binding });
  const cuts = [...new Set(frames.map((f) => f.tick))].sort((x, y) => x - y);
  for (const tick of cuts) {
    stepping = Object.assign(stepping, {}) && stepping;
    await stepping.advance(tick, frames.filter((f) => f.tick <= tick), contexts);
    assertCoreAccounting(stepping.snapshot());
  }
  assert.equal(coreFingerprint(stepping.snapshot()), coreFingerprint(guarded));

  const rows: unknown[] = [];
  for (const cut of [0, 1, 59, 719]) {
    const file = path.join(clean, `restart-${cut}.json`);
    let engine = await BankingCoreEngine.open(new FileBankingCoreStore(file), g, true, { actorGuard: true, binding });
    await engine.advance(cut, frames.filter((f) => f.tick <= cut), contexts);
    const mid = engine.snapshot();
    const midBytes = await readFile(file);
    assertCoreAccounting(mid);
    engine = await BankingCoreEngine.open(new FileBankingCoreStore(file), g, true, { actorGuard: true, binding });
    assert.equal(coreFingerprint(engine.snapshot()), coreFingerprint(mid));
    assert.deepEqual(await readFile(file), midBytes);
    if (cut < 719) {
      await engine.advance(719, frames, contexts);
      assert.equal(coreFingerprint(engine.snapshot()), coreFingerprint(guarded));
    }
    engine = await BankingCoreEngine.open(new FileBankingCoreStore(file), g, true, { actorGuard: true, binding });
    assert.equal(coreFingerprint(engine.snapshot()), coreFingerprint(cut === 719 ? mid : guarded));
    assertCoreAccounting(engine.snapshot());
    rows.push({ cut, midSha256: coreFingerprint(mid), finalSha256: coreFingerprint(engine.snapshot()), restartEqual: true, zeroResidual: true });
  }

  const rejectEngine = await BankingCoreEngine.open(new FileBankingCoreStore(path.join(clean, "reject.json")), g, true, { actorGuard: true, binding });
  const before = coreFingerprint(rejectEngine.snapshot());
  const beforeReceipts = rejectEngine.snapshot().creditBooks.reduce((n, book) => n + book.receipts.length, 0)
    + (rejectEngine.snapshot().bankingMeta?.receipts.length ?? 0);
  const beforeAudit = rejectEngine.snapshot().audit.length;
  const beforeBytes = await readFile(path.join(clean, "reject.json"));
  const applyOnly = frames.filter((f) => f.tick === 0);
  const missing = await rejectEngine.advance(0, applyOnly).then(() => null, (err: unknown) => err);
  assert.equal((missing as { code?: string }).code, "MISSING_SESSION");
  const spoof = await rejectEngine.advance(0, applyOnly, { "open-s": ctxA, apply: ctxA, "dep-s": ctxA }).then(() => null, (err: unknown) => err);
  assert.equal((spoof as { code?: string }).code, "ACTOR_MISMATCH");
  const forged = await rejectEngine.advance(0, applyOnly, { "open-s": ctxA, apply: { ...ctxC }, "dep-s": ctxA }).then(() => null, (err: unknown) => err);
  assert.equal((forged as { code?: string }).code, "FORGED_CONTEXT");
  const cloned = await rejectEngine.advance(0, applyOnly, { "open-s": ctxA, apply: structuredClone(ctxC), "dep-s": ctxA }).then(() => null, (err: unknown) => err);
  assert.equal((cloned as { code?: string }).code, "FORGED_CONTEXT");
  const withdraw = F.frames(1, (f) => {
    if (f.tick === 1) f.banking = F.bankFrame(1, [{ id: "wd", actor: ctxB.actorId, kind: "WITHDRAW", depositId: "alice-save", amount: F.usd(1) }], null);
  }, () => false);
  // deposit does not exist yet at tick -1; cross-account is proven after a legitimate open on a fresh engine below
  assert.equal(coreFingerprint(rejectEngine.snapshot()), before);
  assert.equal(rejectEngine.snapshot().creditBooks.reduce((n, book) => n + book.receipts.length, 0) + (rejectEngine.snapshot().bankingMeta?.receipts.length ?? 0), beforeReceipts);
  assert.equal(rejectEngine.snapshot().audit.length, beforeAudit);
  assert.deepEqual(await readFile(path.join(clean, "reject.json")), beforeBytes);

  const cross = await BankingCoreEngine.open(new FileBankingCoreStore(path.join(clean, "cross.json")), g, true, { actorGuard: true, binding });
  await cross.advance(0, applyOnly, contexts);
  const midCross = coreFingerprint(cross.snapshot());
  const midReceipts = cross.snapshot().bankingMeta!.receipts.length;
  const midAudit = cross.snapshot().audit.length;
  const crossErr = await cross.advance(1, withdraw, { wd: ctxB }).then(() => null, (err: unknown) => err);
  assert.equal((crossErr as { code?: string }).code, "ACTOR_MISMATCH");
  assert.equal(coreFingerprint(cross.snapshot()), midCross);
  assert.equal(cross.snapshot().bankingMeta!.receipts.length, midReceipts);
  assert.equal(cross.snapshot().audit.length, midAudit);

  const logged = await BankingCoreEngine.open(new FileBankingCoreStore(path.join(clean, "logout.json")), g, true, { actorGuard: true, binding });
  const beforeLogout = coreFingerprint(logged.snapshot());
  const beforeLogoutBytes = await readFile(path.join(clean, "logout.json"));
  await auth.logout(c.rawToken);
  const afterLogout = await logged.advance(0, applyOnly, contexts).then(() => null, (err: unknown) => err);
  assert.equal((afterLogout as { code?: string }).code, "SESSION_REJECTED");
  assert.equal(coreFingerprint(logged.snapshot()), beforeLogout);
  assert.deepEqual(await readFile(path.join(clean, "logout.json")), beforeLogoutBytes);


  await output("identity-proof.json", {
    unguardedSha256: coreFingerprint(unguarded),
    guardedSha256: coreFingerprint(guarded),
    engineJournalBytesEqual: true,
    ok: true,
  });
  await output("restart-jump-proof.json", {
    perRequiredTickEqualsCompleteTape: true,
    restarts: rows,
    finalSha256: coreFingerprint(guarded),
    ok: true,
  });
  await output("zero-residual-proof.json", {
    assertCoreAccountingEveryJumpAndStep: true,
    savingsInterestPaid: interestPaid.toString(),
    acceptedLoans: guarded.creditBooks[0]!.loans.length,
    openingM0: guarded.openingM0.toString(),
    ok: true,
  });
  await output("fail-closed-proof.json", {
    missingSessionNoMutation: true,
    spoofedActorNoMutation: true,
    forgedContextNoMutation: true,
    clonedContextNoMutation: true,
    loggedOutSessionNoMutation: true,
    crossAccountNoMutation: true,
    receiptsUnchanged: true,
    auditUnchanged: true,
    ok: true,
  });
  await output("summary.json", {
    defaultOff: true,
    legitimateByteIdentical: true,
    restartJump: true,
    zeroResiduals: true,
    failClosed: true,
    tickDrivenWithoutActor: interestPaid > BigInt(0),
    noRuntimeMounting: true,
    ok: true,
  });
  console.log(`banking-core-actor proofs passed: ${evidence}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
