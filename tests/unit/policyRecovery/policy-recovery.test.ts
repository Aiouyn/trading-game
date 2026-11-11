import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BLOCS, missingInputs, observed, parseInputs } from "@/server/market/policyRecovery/inputs";
import { catalogDecisions, chooseMajor, majorHazard } from "@/server/market/policyRecovery/catalog";
import { advancePolicy, assertPolicyConservation, canonical, createPolicyState, parsePolicyState, proposeMajor, publicPolicy, residualLog, scheduledBlock } from "@/server/market/policyRecovery/engine";
import { FilePolicyStore, PolicyRecoveryEngine, type PolicyStore } from "@/server/market/policyRecovery/store";
import { resetListingsForTests } from "@/market/listings";
import { policyLiveFixture } from "../../fixtures/policyLive";
import { frame, frames, genesis, scenario, TEST_EPOCH } from "../../fixtures/policyRecovery";

afterEach(() => { resetListingsForTests(); });
describe("live catalog eligibility and weighting (04:994,1015-1029)", () => {
  it("does not label genesis/absent FSI, tension, valuation or crypto zero as live", () => {
    const x = missingInputs(TEST_EPOCH, 0), decisions = catalogDecisions(x);
    expect(decisions).toHaveLength(15);
    expect(chooseMajor(x, 0)).toBeNull(); expect(majorHazard(x)).toBe(0);
    for (const k of ["EQUITY_BUBBLE_BURST", "BANKING_PANIC", "CRYPTO_WINTER", "OIL_SHOCK", "TRADE_WAR", "STAGFLATION"]) expect(decisions.find((d) => d.kind === k)?.status).toBe("MISSING");
    expect(decisions.find((d) => d.kind === "CYBER_PANDEMIC")?.status).toBe("EMERGENT_ONLY");
  });
  it("matches hand weights, weighted bucket boundaries and V/3 hazard", () => {
    const x = missingInputs(TEST_EPOCH, 0);
    x.fear = observed(50, 0, "fixture"); x.cryptoHype = observed(.5, 0, "fixture");
    const ds = catalogDecisions(x), flash = .6 * Math.E, crypto = .8;
    expect(ds.find((d) => d.kind === "FLASH_CRASH")?.weight).toBeCloseTo(flash, 14);
    expect(ds.find((d) => d.kind === "CRYPTO_WINTER")?.weight).toBe(.8);
    expect(majorHazard(x)).toBeCloseTo(3.6e-4 * (flash + crypto) / 3, 16);
    expect(majorHazard(x, true)).toBeCloseTo(majorHazard(x) * 1.5, 16);
    expect(chooseMajor(x, 0)?.kind).toBe("CRYPTO_WINTER");
    expect(chooseMajor(x, crypto / (flash + crypto) + 1e-10)?.kind).toBe("FLASH_CRASH");
    expect(() => chooseMajor(x, 1)).toThrow("INVALID_KIND_DRAW");
  });
  it("uses strict eligibility boundaries and blocks stale inputs", () => {
    const x = frame(5); x.cryptoHype = observed(.499999, 5, "fixture");
    expect(catalogDecisions(x).find((d) => d.kind === "CRYPTO_WINTER")?.status).toBe("INELIGIBLE");
    x.minStablecoinBacking = observed(1.019, 5, "fixture");
    expect(catalogDecisions(x).find((d) => d.kind === "CRYPTO_WINTER")?.status).toBe("READY");
    x.fear = observed(50, 4, "stale");
    expect(catalogDecisions(x).find((d) => d.kind === "FLASH_CRASH")?.status).toBe("MISSING");
    x.worldHeadlineInflation = observed(.035, 5, "fixture");
    expect(catalogDecisions(x).find((d) => d.kind === "STAGFLATION")?.weight).toBe(0);
    x.worldHeadlineInflation = observed(.035001, 5, "fixture");
    expect(catalogDecisions(x).find((d) => d.kind === "STAGFLATION")?.weight).toBeGreaterThan(0);
  });
  it("evaluates all missing-engine catalog definitions but cannot schedule unsupported targets", () => {
    const x = frame(0); x.valuation = observed(BLOCS.map((bloc) => ({ bloc, z: 1, gdpShare: .2 })), 0, "fixture");
    x.credit = observed(BLOCS.map((bloc) => ({ bloc, z: .5 })), 0, "fixture"); x.defaultRateRising = observed(false, 0, "fixture");
    x.banks = observed(BLOCS.map((bloc) => ({ bloc, below12x: 1 })), 0, "fixture");
    x.fx = observed(BLOCS.map((bloc) => ({ bloc, reserveCover: 8, currentAccount: -.03 })), 0, "fixture");
    x.sovereign = observed(BLOCS.map((bloc) => ({ bloc, hazard: .01 })), 0, "fixture");
    x.housing = observed(BLOCS.map((bloc) => ({ bloc, z: 1, gap: .15 })), 0, "fixture");
    x.aiRace = observed(70, 0, "fixture"); x.semisValuationZ = observed(1, 0, "fixture");
    x.poolUnderwritingQuality = observed(.6, 0, "fixture"); x.repoLeverageIndex = observed(1.2, 0, "fixture");
    const ds = catalogDecisions(x);
    expect(ds.find((d) => d.kind === "EQUITY_BUBBLE_BURST")).toMatchObject({ status: "READY", blocs: ["FDL"], weight: Math.E });
    for (const kind of ["CREDIT_CRUNCH", "BANKING_PANIC", "CURRENCY_CRISIS", "SOVEREIGN_DEBT_CRISIS", "AI_BUBBLE", "HOUSING_CRASH", "SECURITIZATION_CRISIS", "FUNDING_RUN"]) {
      expect(ds.find((d) => d.kind === kind)).toMatchObject({ status: "UNSUPPORTED", weight: 0 });
      expect(ds.find((d) => d.kind === kind)?.rawWeight).toBeGreaterThan(0);
    }
  });
  it("rejects impossible or future observations, malformed blocs and unknown shapes", () => {
    const x = frame(0); expect(() => parseInputs({ ...x, fear: observed(NaN, 0, "bad") })).toThrow();
    expect(() => parseInputs({ ...x, fsi: observed(-1, 0, "bad") })).toThrow();
    expect(() => parseInputs({ ...x, fear: observed(20, 1, "future") })).toThrow();
    expect(() => parseInputs({ ...x, credit: observed([{ bloc: "FDL", z: 1 }], 0, "partial") })).toThrow();
    expect(() => parseInputs({ ...x, privateWallet: 3 })).toThrow();
    expect(() => parseInputs({ ...x, emergencies: observed([{ id: "future", hour: 1, blocs: ["FDL"] }], 0, "bad") })).toThrow();
  });
});

describe("policy, conservation and crisis phases", () => {
  it("keeps precursor hidden, trigger exactly24h, and POLICY only after an executed response", () => {
    let s = scenario(); const e = s.events[0]!;
    expect(publicPolicy(s)).toEqual([]);
    s = advancePolicy(s, frames(s.hour + 1, e.triggerHour));
    expect(s.events[0]!.phase).toEqual({ kind: "TRIGGER", sinceHour: e.triggerHour });
    expect(s.wallets).toEqual([{ id: "treasury", cents: 20000 }, { id: "households", cents: 80000 }]);
    expect(publicPolicy(s)[0]?.policyStartedHour).toBe(e.triggerHour);
    s = advancePolicy(s, frames(s.hour + 1, e.contagionHour - 1)); expect(s.events[0]!.phase.kind).toBe("TRIGGER");
    s = advancePolicy(s, [frame(e.contagionHour)]); expect(s.events[0]!.phase.kind).toBe("POLICY");
    expect(publicPolicy(s)[0]?.responses).toEqual([{ kind: "ENERGY_SUBSIDY", status: "FIRED", paidCents: 80000 }]);
    expect(canonical(publicPolicy(s))).not.toContain("treasury"); assertPolicyConservation(s);
  });
  it.each([0, 700])("never promises unfunded response, supports exact finite partial budget %i", (cash) => {
    let s = scenario({ cash }); const e = s.events[0]!;
    s = advancePolicy(s, frames(s.hour + 1, e.contagionHour));
    expect(s.events[0]!.phase.kind).toBe(cash ? "POLICY" : "CONTAGION");
    expect(s.events[0]!.responses[0]).toMatchObject({ paidCents: cash, status: cash ? "FIRED" : "EXHAUSTED" });
    expect(s.wallets.reduce((n, w) => n + w.cents, 0)).toBe(cash);
  });
  it("counts ten complete calm trading days, ignores weekends, and resets on one stressed hour", () => {
    let s = scenario(); const e = s.events[0]!;
    s = advancePolicy(s, frames(s.hour + 1, e.recoveryHour)); expect(s.events[0]!.phase.kind).toBe("RECOVERY");
    let n = 0, stressed = false;
    while (s.events[0]!.phase.kind !== "ENDED" && n++ < 50 * 24) {
      const hour = s.hour + 1, day = Math.floor(hour / 24);
      const p = s.events[0]!.phase;
      const stress = p.kind === "RECOVERY" && p.calmDays === 4 && day % 7 < 5 && hour % 24 === 10 && !stressed;
      if (stress) stressed = true;
      s = advancePolicy(s, [frame(hour, { fear: stress ? 40 : 20 })]);
    }
    expect(stressed).toBe(true); expect(s.events[0]!.phase).toMatchObject({ kind: "ENDED", reason: "CALM" });
    expect(s.hour).toBeGreaterThan(e.recoveryHour + 14 * 24);
  });
  it.each([{ fsi: null }, { fsi: .3 }, { fear: 40 }])("missing or equal-threshold stress cannot fake recovery: %j", (opts) => {
    let s = scenario({ fsi: opts.fsi }); const e = s.events[0]!;
    s = advancePolicy(s, frames(s.hour + 1, e.recoveryHour + 20 * 24, opts)); expect(s.events[0]!.phase.kind).toBe("RECOVERY");
    s = advancePolicy(s, frames(s.hour + 1, e.recoveryHour + 180 * 24, opts)); expect(s.events[0]!.phase).toMatchObject({ kind: "ENDED", reason: "TIMEOUT" });
  });
  it("one missing intraday FSI observation invalidates the entire calm trading day", () => {
    let s = scenario(); const e = s.events[0]!;
    s = advancePolicy(s, frames(s.hour + 1, e.recoveryHour));
    while (true) {
      const hour = s.hour + 1, p = s.events[0]!.phase;
      if (p.kind === "RECOVERY" && p.calmDays >= 2 && Math.floor(hour / 24) % 7 < 5 && hour % 24 === 10) {
        s = advancePolicy(s, [frame(hour, { fsi: null })]);
        s = advancePolicy(s, frames(s.hour + 1, Math.floor(hour / 24) * 24 + 23));
        expect(s.events[0]!.phase).toMatchObject({ kind: "RECOVERY", calmDays: 0, day: { kind: "MISSING" } }); break;
      }
      s = advancePolicy(s, [frame(hour)]);
    }
  });
  it("does not create a crypto backstop or count unsupported bank settings as FIRED", () => {
    let s = genesis(); const x = frame(s.hour + 1); x.cryptoHype = observed(.6, x.hour, "fixture"); s = advancePolicy(s, [x]);
    s = proposeMajor(s, { kind: "CRYPTO_WINTER", origin: "SCHEDULED", severity: 1, precursorDays: 8, contagionDays: 5 }, x);
    const e = s.events[0]!;
    const fs = frames(s.hour + 1, e.contagionHour); for (const f of fs) f.emergencies = observed(f.hour >= e.triggerHour ? [{ id: "actual-emergency", hour: e.triggerHour, blocs: ["FDL"] }] : [], f.hour, "fixture");
    s = advancePolicy(s, fs); expect(s.events[0]!.phase.kind).toBe("CONTAGION"); expect(s.events[0]!.responses).toEqual([]);
    expect(s.wallets).toEqual(genesis().wallets);
  });
  it("observes a real supplied emergency once without pretending to execute bank machinery", () => {
    let s = scenario({ kind: "FLASH_CRASH" }); const e = s.events[0]!;
    const fs = frames(s.hour + 1, e.contagionHour + 2);
    for (const f of fs) f.emergencies = observed(f.hour >= e.triggerHour ? [{ id: "cb:one", hour: e.triggerHour, blocs: ["FDL"] }] : [], f.hour, "fixture:published-emergency");
    s = advancePolicy(s, fs); expect(s.events[0]!.responses).toHaveLength(1); expect(s.events[0]!.phase.kind).toBe("POLICY");
    expect(s.wallets).toEqual(genesis().wallets);
  });
  it("keeps shock residual decay independent of phase end (no money or guaranteed buyer)", () => {
    let s = scenario({ kind: "FLASH_CRASH" }); const e = s.events[0]!;
    s = advancePolicy(s, frames(s.hour + 1, e.triggerHour));
    const gap0 = residualLog(s, "GX"), gap1 = residualLog(s, "GX", s.hour + 24);
    expect(gap1 / gap0).toBeCloseTo(.3, 14);
    s = advancePolicy(s, frames(s.hour + 1, e.recoveryHour + 40 * 24));
    expect(s.events[0]!.phase.kind).toBe("ENDED"); expect(residualLog(s, "GX", s.hour + 24)).toBeGreaterThanOrEqual(residualLog(s, "GX"));
    expect(s.wallets).toEqual(genesis().wallets);
  });
});

describe("scheduler constraints and emergent actual damage labels", () => {
  it("enforces first24/final48, one active,504day gap, suppression and executable input door", () => {
    expect(scheduledBlock(genesis(0, 0), 8 * 24)).toBe("FIRST_24");
    expect(scheduledBlock(genesis(0, (1344 - 55) * 24), (1344 - 47) * 24)).toBe("FINAL_48");
    const active = scenario(); expect(scheduledBlock(active, active.hour + 1000)).toBe("ACTIVE");
    let ended = advancePolicy(active, frames(active.hour + 1, active.events[0]!.recoveryHour + 40 * 24));
    expect(scheduledBlock(ended, ended.hour + 8 * 24)).toBe("GAP");
    ended = { ...ended, events: [], residuals: [], suppressUntilHour: ended.hour + 1 }; expect(scheduledBlock(ended, ended.hour + 8 * 24)).toBe("PLAYER_SUPPRESS");
  });
  it("labels a live GX20% drawdown without adding a second trigger shock or blocking on first24", () => {
    let s = createPolicyState({ epoch: TEST_EPOCH, seed: 17, wallets: [] });
    s = advancePolicy(s, frames(0, 23)); s = advancePolicy(s, [frame(24, { gx: 8000 })]);
    expect(s.events[0]).toMatchObject({ kind: "EQUITY_BUBBLE_BURST", origin: "EMERGENT" }); expect(s.residuals).toEqual([]);
    s = advancePolicy(s, frames(25, 72, { gx: 8000 })); expect(s.events).toHaveLength(1); expect(s.residuals).toEqual([]);
  });
  it("attaches emergent/player-caused labels to the active event and extends suppression only", () => {
    let s = scenario(); const before = s.events[0]!.id;
    s = proposeMajor(s, { kind: "CYBER_PANDEMIC", origin: "PLAYER_CAUSED", severity: 1, precursorDays: 0, contagionDays: 17.5 }, frame(s.hour));
    expect(s.events).toHaveLength(1); expect(s.events[0]!.id).toBe(before); expect(s.events[0]!.attached).toHaveLength(1);
    expect(s.suppressUntilHour).toBe(s.hour + 336 * 24); expect(s.residuals).toEqual([]);
  });
  it("uses real weighted day draws deterministically instead of forced failure/recovery quotas", () => {
    const a = advancePolicy(genesis(), frames(genesis().hour + 1, 800 * 24, { fsi: null, tension: null, fear: 100 }));
    const b = advancePolicy(genesis(), frames(genesis().hour + 1, 800 * 24, { fsi: null, tension: null, fear: 100 }));
    expect(a).toEqual(b); expect(a.events.length).toBeGreaterThan(0);
    expect(a.events.every((e) => e.kind === "FLASH_CRASH")).toBe(true); assertPolicyConservation(a);
  });
});

describe("persistence, parsing and replay", () => {
  it("real fresh file restart equals uninterrupted state, repeat no payout, full batch jump equals stepping", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sys-policy-test-")), store = new FilePolicyStore(path.join(dir, "policy.json"));
    const initial = scenario(), e = initial.events[0]!, fs = frames(initial.hour + 1, e.recoveryHour + 40 * 24);
    const uninterrupted = advancePolicy(initial, fs); let stepped = initial;
    for (const f of fs) stepped = advancePolicy(stepped, [f]); expect(stepped).toEqual(uninterrupted);
    let engine = await PolicyRecoveryEngine.open(store, initial);
    await engine.observe(fs.slice(0, 200)); engine = await PolicyRecoveryEngine.open(new FilePolicyStore(store.filePath));
    await engine.observe(fs.slice(200)); expect(engine.snapshot()).toEqual(uninterrupted);
    await engine.observe([fs.at(-1)!]); expect(engine.snapshot()).toEqual(uninterrupted);
    expect(await store.load()).toEqual(uninterrupted); assertPolicyConservation(engine.snapshot());
  });
  it("serializes copied inputs, rolls back failed saves and continues after failure", async () => {
    let saved = scenario(), fail = false;
    const store: PolicyStore = { load: async () => saved, save: async (s) => { if (fail) throw new Error("disk full"); saved = structuredClone(s); } };
    const engine = await PolicyRecoveryEngine.open(store), f = frame(saved.hour + 1), old = engine.snapshot();
    fail = true; await expect(engine.observe([f])).rejects.toThrow("disk full"); expect(engine.snapshot()).toEqual(old);
    fail = false; const p = engine.observe([f]); f.fear = observed(99, f.hour, "mutated-after-call"); await p;
    expect(engine.snapshot().lastInputs?.fear).toMatchObject({ value: 20 });
    const next = engine.snapshot().hour + 1; await Promise.all([engine.observe([frame(next)]), engine.observe([frame(next + 1)])]);
    expect(engine.snapshot().hour).toBe(next + 1);
  });
  it("preserves corrupt files, refuses bad versions/balances/times/duplicate payouts and nonfinite paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sys-policy-corrupt-")), file = path.join(dir, "policy.json"), original = '{"v":99}';
    await writeFile(file, original); await expect(PolicyRecoveryEngine.open(new FilePolicyStore(file), genesis())).rejects.toThrow(); expect(await readFile(file, "utf8")).toBe(original);
    const s = scenario(); expect(() => parsePolicyState({ ...s, v: 99 })).toThrow();
    expect(() => parsePolicyState({ ...s, genesisCents: 1 })).toThrow("CASH_CONSERVATION");
    expect(() => parsePolicyState({ ...s, wallets: [...s.wallets, s.wallets[0]] })).toThrow();
    const paid = advancePolicy(s, frames(s.hour + 1, s.events[0]!.contagionHour));
    const duplicate = structuredClone(paid); duplicate.events[0]!.responses.push(duplicate.events[0]!.responses[0]!); expect(() => parsePolicyState(duplicate)).toThrow();
    const wrong = structuredClone(paid); wrong.events[0]!.phase = { kind: "PRECURSOR", sinceHour: wrong.events[0]!.startHour }; expect(() => parsePolicyState(wrong)).toThrow();
    const nan = structuredClone(paid); nan.residuals[0]!.initialLog = NaN; expect(() => parsePolicyState(nan)).toThrow();
  });
  it("persists the GX crash latch/history and never adds an extra emergent shock on restart", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sys-policy-gx-")), file = path.join(dir, "policy.json");
    let initial = createPolicyState({ epoch: TEST_EPOCH, seed: 17, wallets: [] });
    initial = advancePolicy(initial, [...frames(0, 23), frame(24, { gx: 8000 })]);
    let engine = await PolicyRecoveryEngine.open(new FilePolicyStore(file), initial);
    engine = await PolicyRecoveryEngine.open(new FilePolicyStore(file));
    const fs = frames(25, 100, { gx: 8000 }); await engine.observe(fs);
    expect(engine.snapshot()).toEqual(advancePolicy(initial, fs)); expect(engine.snapshot().events).toHaveLength(1); expect(engine.snapshot().residuals).toEqual([]);
  });
  it("rejects hour gaps, conflicting repeats and epoch switches without changing caller state", () => {
    const s = scenario(), before = canonical(s);
    expect(() => advancePolicy(s, [frame(s.hour + 2)])).toThrow("HOURLY_INPUT_GAP");
    expect(() => advancePolicy(s, [frame(s.hour, { fear: 30 })])).toThrow("OBSERVATION_CONFLICT");
    expect(() => advancePolicy(s, [{ ...frame(s.hour + 1), epoch: "new-process" }])).toThrow("EPOCH_MISMATCH"); expect(canonical(s)).toBe(before);
  });
});

it("reads actual live clock and locked committed Launchpad updates, no writes or private data", async () => {
  const r = await policyLiveFixture();
  expect(r.before.cryptoHype.kind).toBe("MISSING"); expect(r.before.fsi.kind).toBe("MISSING");
  expect(r.afterGraduation.cryptoHype).toMatchObject({ kind: "LIVE", value: .6 });
  expect(r.afterGraduation.launchpad).toMatchObject({ kind: "LIVE", value: { graduated: 1, cashCents: 4329671 } });
  expect(r.afterHype.cryptoHype).toMatchObject({ kind: "LIVE", value: .1 });
  expect(catalogDecisions(r.afterHype).find((d) => d.kind === "CRYPTO_WINTER")?.status).toBe("INELIGIBLE");
  expect(r.afterBook.launchpad).not.toEqual(r.afterHype.launchpad);
  expect(r.readOnlyCapture).toBe(true); expect(r.cashDelta).toBe(0);
  expect(canonical(r)).not.toMatch(/acc_|password|holdings|receipts|creatorId|sessionId/);
});
