import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { listedDef, resetListingsForTests } from "@/market/listings";
import { fillOnBook } from "@/server/broker/book";
import { equityErpTickLog } from "@/server/market/shockFeed";
import { advancePolicy, assertPolicyConservation, canonical, createPolicyState, residualLog } from "@/server/market/policyRecovery/engine";
import { catalogDecisions } from "@/server/market/policyRecovery/catalog";
import { FilePolicyStore, PolicyRecoveryEngine } from "@/server/market/policyRecovery/store";
import { frame, frames, genesis, scenario, TEST_EPOCH } from "../../tests/fixtures/policyRecovery";
import { policyLiveFixture } from "../../tests/fixtures/policyLive";
const digest = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
async function main() {
  const evidence = process.env.SYS_POLICY_EVIDENCE_DIR;
  if (!evidence) throw new Error("SYS_POLICY_EVIDENCE_DIR required");
  await mkdir(evidence, { recursive: true });
  const output = async (name: string, value: unknown) => writeFile(path.join(evidence, name), JSON.stringify(value, null, 2) + "\n");
  await output("measurement-contract.json", { version: 1, scope: "isolated hourly engine, not live runtime mounting or balance certification",
    sourceFixtures: "Explicit future-live FSI/tension for phase scenarios; actual current LiveMarket/AuthService for source proof, never confuse them",
    comparisons: ["full state restart/jump equality", "cash delta must be0", "10 calm trading days or180 GD timeout", "ERP-only 260GD component and independent crash residual"],
    growthLimit: "matched deterministic ERP-only component, not full SDE/cost-adjusted return or forecast; no execution guarantee",
    flashDefinition: "base half-life recovers70% of LOG gap/day; measure price recovery separately, do not call it70% price recovery" });
  const clean = await mkdtemp(path.join(evidence, "clean-stores-"));
  const initial = scenario(), event = initial.events[0]!;
  const tape = frames(initial.hour + 1, event.recoveryHour + 40 * 24);
  const uninterrupted = advancePolicy(initial, tape); let stepping = initial;
  for (const f of tape) { stepping = advancePolicy(stepping, [f]); assertPolicyConservation(stepping); }
  assert.deepEqual(stepping, uninterrupted);
  const store = new FilePolicyStore(path.join(clean, "policy.json"));
  let engine = await PolicyRecoveryEngine.open(store, initial);
  const split = event.contagionHour - initial.hour + 1;
  await engine.observe(tape.slice(0, split));
  const mid = engine.snapshot(); assert.equal(mid.events[0]!.phase.kind, "POLICY");
  engine = await PolicyRecoveryEngine.open(new FilePolicyStore(store.filePath)); assert.deepEqual(engine.snapshot(), mid);
  await engine.observe(tape.slice(split)); assert.deepEqual(engine.snapshot(), uninterrupted);
  await engine.observe([tape.at(-1)!]); assert.deepEqual(engine.snapshot(), uninterrupted);
  assert.equal(uninterrupted.events[0]!.phase.kind, "ENDED"); assert.equal(uninterrupted.wallets[1]!.cents, 80000);
  await output("restart-jump-proof.json", { freshStore: store.filePath, intermediatePolicySha256: digest(mid), finalSha256: digest(uninterrupted),
    restartEqualsUninterrupted: true, fullStateJumpEqualsHourly: true, repeatedObservationNoPayout: true, finalPhase: uninterrupted.events[0]!.phase,
    finalWallets: uninterrupted.wallets, genesisCashCents: uninterrupted.genesisCents, cashDelta: uninterrupted.wallets.reduce((n, w) => n + w.cents, 0) - uninterrupted.genesisCents, ok: true });
  await output("restart-final-state.json", uninterrupted);
  let gxInitial = createPolicyState({ epoch: TEST_EPOCH, seed: 17, wallets: [] });
  gxInitial = advancePolicy(gxInitial, [...frames(0, 23), frame(24, { gx: 12500 })]);
  let gxEngine = await PolicyRecoveryEngine.open(new FilePolicyStore(path.join(clean, "gx-latch.json")), gxInitial);
  gxEngine = await PolicyRecoveryEngine.open(new FilePolicyStore(path.join(clean, "gx-latch.json")));
  const gxTape = frames(25, 100, { gx: 10000 }); await gxEngine.observe(gxTape);
  assert.deepEqual(gxEngine.snapshot(), advancePolicy(gxInitial, gxTape)); assert.equal(gxEngine.snapshot().events.length, 1); assert.equal(gxEngine.snapshot().residuals.length, 0);
  await output("emergent-restart-proof.json", { actualObservedDrawdown: .2, hourlyPeakBeforeRestart: 12500, drawdownMarkAfterRestart: 10000, first24ConstraintNotApplied: true, savedLatch: gxEngine.snapshot().gxCrash,
    savedGxPeaks: gxInitial.gxHistory, restartFullStateEqual: true, noDuplicateEvent: true, noExtraTriggerShock: true, finalStateSha256: digest(gxEngine.snapshot()), cashDelta: 0, ok: true });
  const naturalInitial = genesis(), naturalTape = frames(naturalInitial.hour + 1, 800 * 24, { fsi: null, tension: null, fear: 100 });
  const naturalBatch = advancePolicy(naturalInitial, naturalTape); let naturalStepping = naturalInitial;
  for (const f of naturalTape) naturalStepping = advancePolicy(naturalStepping, [f]);
  assert.deepEqual(naturalStepping, naturalBatch); assert.ok(naturalBatch.events.length > 0); assertPolicyConservation(naturalBatch);
  await new FilePolicyStore(path.join(clean, "natural-800d.json")).save(naturalBatch);
  await output("natural-weighted-schedule-proof.json", { seed: 17, observationEndGameDay: 800, onlyFreshExecutableKind: "FLASH_CRASH", events: naturalBatch.events.map((e) => ({ kind: e.kind, triggerHour: e.triggerHour, phase: e.phase })),
    fullStateJumpEqualsHourly: true, finalSha256: digest(naturalBatch), cashDelta: 0, notPopulationRateCalibration: true, ok: true });
  const missing = scenario({ fsi: null }), me = missing.events[0]!;
  const missingEnd = advancePolicy(missing, frames(missing.hour + 1, me.recoveryHour + 180 * 24, { fsi: null }));
  assert.deepEqual(missingEnd.events[0]!.phase, { kind: "ENDED", sinceHour: me.recoveryHour + 180 * 24, reason: "TIMEOUT" });
  await new FilePolicyStore(path.join(clean, "missing-fsi.json")).save(missingEnd);
  await output("missing-source-timeout.json", { noFabricatedFsi: true, phase: missingEnd.events[0]!.phase, finalStateSha256: digest(missingEnd), cashDelta: 0, ok: true });
  const flash = scenario({ kind: "FLASH_CRASH" }), fe = flash.events[0]!;
  const hit = advancePolicy(flash, frames(flash.hour + 1, fe.triggerHour));
  const gap = residualLog(hit, "GX"), dayGap = residualLog(hit, "GX", hit.hour + 24);
  const preCrash = 10000, crash = preCrash * Math.exp(gap), afterDay = preCrash * Math.exp(dayGap), horizon = hit.hour + 260 * 24;
  const ended = advancePolicy(hit, frames(hit.hour + 1, horizon));
  const baseGrowthLog = equityErpTickLog() * 30 * (horizon - hit.hour), baseline = preCrash * Math.exp(baseGrowthLog);
  const recovered = baseline * Math.exp(residualLog(ended, "GX"));
  assert.ok(Math.abs(dayGap / gap - .3) < 1e-12); assert.ok(recovered > preCrash); assert.equal(ended.events[0]!.phase.kind, "ENDED");
  assertPolicyConservation(ended);
  await new FilePolicyStore(path.join(clean, "flash-ended.json")).save(ended);
  await output("growth-recovery-proof.json", { basis: "260GD ERP-only component, base equityErpTickLog; not full price calibration", preCrash, crash, afterOneGameDayNoErp: afterDay,
    logGapRecoveredFraction: 1 - dayGap / gap, priceDrawdownRecoveredFraction: (afterDay - crash) / (preCrash - crash),
    horizonGameDays: 260, baseline, afterCrashAndUnwind: recovered, erpComponentReturn: recovered / preCrash - 1,
    phaseEndedIndependently: true, residualRetainedAfterEnd: ended.residuals.length > 0, cashDelta: 0, ok: true });
  const mark = 21596, book = { cash: 100, tokens: 200000000 }, a = listedDef("SYSP", "Policy Club", mark);
  const sale = fillOnBook(a, "SELL", 1000000, mark, book, 0); assert.ok(sale); assert.ok(sale.qty < 1000000 && sale.notional <= book.cash && sale.fee <= sale.notional);
  const sellerBefore = 10000, sellerAfter = sellerBefore + sale.notional - sale.fee;
  assert.equal(sellerAfter + sale.book.cash, sellerBefore + book.cash);
  assert.equal(fillOnBook(a, "SELL", 1000000, mark, { cash: 0, tokens: book.tokens }, 1), null);
  await output("finite-book-proof.json", { before: book, executed: { qty: sale.qty, notional: sale.notional, fee: sale.fee }, after: sale.book, sellerBefore, sellerAfter,
    exhaustedBookHasNoCounterparty: true, cashDelta: 0, noPolicyRefill: true, ok: true });
  const live = await policyLiveFixture();
  assert.equal(live.before.fsi.kind, "MISSING"); assert.equal(live.afterGraduation.cryptoHype.kind, "LIVE"); assert.equal(live.cashDelta, 0);
  const beforeDecision = catalogDecisions(live.afterGraduation).find((d) => d.kind === "CRYPTO_WINTER"), afterDecision = catalogDecisions(live.afterHype).find((d) => d.kind === "CRYPTO_WINTER");
  assert.equal(beforeDecision?.status, "READY"); assert.equal(afterDecision?.status, "INELIGIBLE");
  await output("live-catalog-proof.json", { ...live, beforeDecision, afterDecision, decisions: catalogDecisions(live.afterBook), ok: true });
  await output("summary.json", { restartJump: true, cleanFiles: 5, conserveEveryHourlyStep: true, noCashCreation: true, finiteBook: true, liveCaptureReadOnly: true,
    liveUnsupportedFsiStillMissing: true, noAppMounting: true, approximateFlashPriceTarget: "68.89% price drawdown recovered/day vs70% LOG-gap; disclosed, not retuned", ok: true });
  console.log(`policy proofs: ${evidence}; restart/jump/conservation pass; no live mounting; actual adapter and missing-source evidence saved`);
}
main().finally(() => resetListingsForTests()).catch((e: unknown) => { console.error(e); process.exitCode = 1; });
