import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthService, FileAuthStore, SESSION_IDLE_MS } from "@/server/auth";
import {
  ACTOR_BINDING_DEFAULT_ENABLED,
  ActorBinding,
  BindingError,
  FileBindingStore,
  actorIdFor,
  type BindingErrorCode,
} from "@/server/actor-binding";

const PASSWORD = "local-bind-test";

class Clock {
  nowMs = 1_700_000_000_000;
  now = () => this.nowMs;
  advance(ms: number): void {
    this.nowMs += ms;
  }
}

function code(err: unknown): BindingErrorCode | string {
  return err instanceof BindingError ? err.code : err instanceof Error ? err.message : String(err);
}

async function expectCode(run: () => Promise<unknown>, expected: BindingErrorCode): Promise<void> {
  try {
    await run();
    throw new Error(`expected ${expected}`);
  } catch (err) {
    assert.equal(code(err), expected, String(err));
  }
}

async function main() {
  const evidence = process.env.SYS_ACTOR_BINDING_EVIDENCE_DIR;
  if (!evidence) throw new Error("SYS_ACTOR_BINDING_EVIDENCE_DIR required");
  await mkdir(evidence, { recursive: true });
  const output = async (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const gitStatus = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  await output("measurement-contract.json", {
    version: 1,
    head,
    gitStatus,
    zone: "Europe/Paris",
    scope: "isolated default-off session-to-actor adapter; no route mount, no auth edits",
    checks: [
      "one account id maps to one actor id",
      "restart and reopen of auth+binding stores keep the same actor and byte-identical binding checkpoints",
      "two-account jump versus stepwise bind produce the same checkpoint bytes",
      "fail-closed matrix for missing, malformed, unknown, expired and revoked sessions",
      "spoofed, missing and cross-account claimed actors are rejected",
    ],
    limits: [
      "resolveSession/peekSession collapse expired/unknown/revoked/missing-account into null, reported as SESSION_REJECTED",
      "engines are not wired; adoption is documented only",
    ],
  });

  assert.equal(ACTOR_BINDING_DEFAULT_ENABLED, false);

  const clean = await mkdtemp(path.join(evidence, "clean-stores-"));
  const clock = new Clock();
  const authPath = path.join(clean, "auth.json");
  const bindPath = path.join(clean, "bind.json");
  const auth = new AuthService({ store: new FileAuthStore(authPath), now: clock.now });
  const a = await auth.register({ handle: "BindA", password: PASSWORD });
  const b = await auth.register({ handle: "BindB", password: PASSWORD });
  const first = await ActorBinding.open(auth, new FileBindingStore(bindPath), { enabled: true, now: clock.now });
  const ctxA = await first.bindToken(a.rawToken);
  const ctxB = await first.bindToken(b.rawToken);
  assert.equal(ctxA.actorId, actorIdFor(a.view.account.accountId));
  assert.equal(ctxB.actorId, actorIdFor(b.view.account.accountId));
  assert.notEqual(ctxA.actorId, ctxB.actorId);
  const loginA = await auth.login({ handle: "BindA", password: PASSWORD });
  const againA = await first.bindToken(loginA.rawToken);
  assert.equal(againA.actorId, ctxA.actorId);
  assert.equal(againA.boundAtMs, ctxA.boundAtMs);
  assert.notEqual(againA.sessionId, ctxA.sessionId);
  const afterBoth = await readFile(bindPath);
  const afterBothSnapshot = first.snapshot();

  const restartedAuth = new AuthService({ store: new FileAuthStore(authPath), now: clock.now });
  const restarted = await ActorBinding.open(restartedAuth, new FileBindingStore(bindPath), { enabled: true, now: clock.now });
  const reboundA = await restarted.bindToken(a.rawToken);
  const reboundB = await restarted.bindToken(b.rawToken);
  assert.deepEqual(restarted.snapshot(), afterBothSnapshot);
  assert.equal(reboundA.actorId, ctxA.actorId);
  assert.equal(reboundB.actorId, ctxB.actorId);
  assert.equal(reboundA.boundAtMs, ctxA.boundAtMs);
  assert.equal(reboundB.boundAtMs, ctxB.boundAtMs);
  const afterRestart = await readFile(bindPath);
  assert.deepEqual(afterRestart, afterBoth);

  const stepFile = path.join(clean, "step", "bind.json");
  const jumpFile = path.join(clean, "jump", "bind.json");
  let step = await ActorBinding.open(auth, new FileBindingStore(stepFile), { enabled: true, now: clock.now });
  await step.bindToken(a.rawToken);
  step = await ActorBinding.open(auth, new FileBindingStore(stepFile), { enabled: true, now: clock.now });
  await step.bindToken(b.rawToken);
  const jump = await ActorBinding.open(auth, new FileBindingStore(jumpFile), { enabled: true, now: clock.now });
  await jump.bindToken(a.rawToken);
  await jump.bindToken(b.rawToken);
  const stepBytes = await readFile(stepFile);
  const jumpBytes = await readFile(jumpFile);
  assert.deepEqual(stepBytes, jumpBytes);
  assert.deepEqual(step.snapshot(), jump.snapshot());

  await output("restart-reopen-proof.json", {
    actorA: ctxA.actorId,
    actorB: ctxB.actorId,
    sameAccountSecondSession: againA.actorId,
    restartActorA: reboundA.actorId,
    restartActorB: reboundB.actorId,
    boundAtMsUnchanged: reboundA.boundAtMs === ctxA.boundAtMs && reboundB.boundAtMs === ctxB.boundAtMs,
    checkpointBytesEqualAfterRestart: afterRestart.equals(afterBoth),
    snapshotEqualAfterRestart: true,
    stepEqualsJumpBytes: stepBytes.equals(jumpBytes),
    ok: true,
  });

  // Fail-closed matrix on a fresh enabled engine with no pre-existing bindings.
  const matrixClock = new Clock();
  const matrixAuth = new AuthService({ store: new FileAuthStore(path.join(clean, "matrix", "auth.json")), now: matrixClock.now });
  const matrix = await ActorBinding.open(matrixAuth, new FileBindingStore(path.join(clean, "matrix", "bind.json")), {
    enabled: true,
    now: matrixClock.now,
  });
  const live = await matrixAuth.register({ handle: "BindLive", password: PASSWORD });
  const rows: { name: string; code: BindingErrorCode; createdBinding: boolean }[] = [];
  const cases: [string, BindingErrorCode, () => Promise<unknown>][] = [
    ["missing-null", "MISSING_SESSION", () => matrix.bindToken(null)],
    ["missing-empty", "MISSING_SESSION", () => matrix.bindToken("")],
    ["malformed-object", "MALFORMED_SESSION", () => matrix.bindToken({ token: live.rawToken })],
    ["malformed-spaces", "MALFORMED_SESSION", () => matrix.bindToken(" " + live.rawToken)],
    ["unknown-token", "SESSION_REJECTED", () => matrix.bindToken("A".repeat(43))],
  ];
  for (const [name, expected, run] of cases) {
    await expectCode(run, expected);
    rows.push({ name, code: expected, createdBinding: matrix.snapshot().bindings.length !== 0 });
  }
  const exp = await matrixAuth.register({ handle: "BindExp", password: PASSWORD });
  matrixClock.advance(SESSION_IDLE_MS + 1);
  await expectCode(() => matrix.bindToken(exp.rawToken), "SESSION_REJECTED");
  rows.push({ name: "expired-idle", code: "SESSION_REJECTED", createdBinding: matrix.snapshot().bindings.length !== 0 });
  matrixClock.advance(-(SESSION_IDLE_MS + 1));
  const toRevoke = await matrixAuth.register({ handle: "BindRev", password: PASSWORD });
  await matrixAuth.logout(toRevoke.rawToken);
  await expectCode(() => matrix.bindToken(toRevoke.rawToken), "SESSION_REJECTED");
  rows.push({ name: "revoked", code: "SESSION_REJECTED", createdBinding: matrix.snapshot().bindings.length !== 0 });
  assert.equal(matrix.snapshot().bindings.length, 0);

  const other = await matrixAuth.register({ handle: "BindOth", password: PASSWORD });
  const ctxLive = await matrix.bindToken(live.rawToken);
  const ctxOther = await matrix.bindToken(other.rawToken);
  await expectCode(() => matrix.authorizeCommand(null, { actor: ctxLive.actorId }), "MISSING_SESSION");
  await expectCode(() => matrix.authorizeCommand(live.rawToken, {}), "CLAIM_MISSING");
  await expectCode(() => matrix.authorizeCommand(live.rawToken, { actor: 1 }), "CLAIM_MALFORMED");
  await expectCode(() => matrix.authorizeCommand(live.rawToken, { actor: `chr_${"0".repeat(32)}` }), "ACTOR_MISMATCH");
  await expectCode(() => matrix.authorizeCommand(live.rawToken, { actor: ctxOther.actorId }), "ACTOR_MISMATCH");
  const allowed = await matrix.authorizeCommand(live.rawToken, { actor: ctxLive.actorId });
  assert.equal(allowed.actorId, ctxLive.actorId);

  await output("fail-closed-proof.json", {
    matrix: rows,
    spoofRejected: true,
    crossAccountRejected: true,
    missingSessionRejected: true,
    noBindingOnRejectionBeforeSuccess: rows.every((row) => row.createdBinding === false),
    ok: true,
  });

  await output("summary.json", {
    defaultOff: true,
    oneAccountOneActor: true,
    secondSessionSameActor: true,
    restartReopenIdentical: true,
    checkpointBytesEqualAfterRestart: true,
    failClosed: true,
    noRuntimeMounting: true,
    ok: true,
  });
  console.log(`actor-binding proofs passed: ${evidence}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
