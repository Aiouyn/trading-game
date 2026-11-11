import { missingInputs, observed, type CatalogInputs } from "@/server/market/policyRecovery/inputs";
import { advancePolicy, createPolicyState, proposeMajor, type PolicyState, type Proposal } from "@/server/market/policyRecovery/engine";
export const TEST_EPOCH = "policy-proof";
export function frame(hour: number, opts: { fear?: number; fsi?: number | null; tension?: number | null; gx?: number } = {}): CatalogInputs {
  const s = missingInputs(TEST_EPOCH, hour);
  s.fear = observed(opts.fear ?? 20, hour, "fixture:explicit-fear");
  s.crisisWeek = observed(false, hour, "fixture:explicit-no-Crisis-Week");
  s.gx = observed(opts.gx ?? 10000, hour, "fixture:explicit-GX");
  s.regime = observed("RECOVERY", hour, "fixture:explicit-regime");
  if (opts.fsi !== null) s.fsi = observed(opts.fsi ?? .1, hour, "fixture:explicit-live-FSI; NOT available on base");
  if (opts.tension !== null) s.tension = observed(opts.tension ?? 60, hour, "fixture:explicit-live-tension; NOT available on base");
  return s;
}
export function genesis(cash = 100000, startHour = 24 * 24): PolicyState {
  return createPolicyState({ epoch: TEST_EPOCH, seed: 17, startHour, wallets: [{ id: "treasury", cents: cash }, { id: "households", cents: 0 }],
    programs: [{ kind: "ENERGY_SUBSIDY", source: "treasury", recipient: "households", limitCents: 80000 },
      { kind: "FISCAL_SUPPORT", source: "treasury", recipient: "households", limitCents: 80000 }] });
}
export function scenario(opts: { cash?: number; fsi?: number | null; kind?: Proposal["kind"]; origin?: Proposal["origin"] } = {}): PolicyState {
  let s = genesis(opts.cash ?? 100000);
  const input = frame(s.hour + 1, { fsi: opts.fsi });
  s = advancePolicy(s, [input]);
  return proposeMajor(s, { kind: opts.kind ?? "OIL_SHOCK", origin: opts.origin ?? "SCHEDULED", severity: 1, precursorDays: opts.origin && opts.origin !== "SCHEDULED" ? 0 : 8, contagionDays: 5 }, input);
}
export function frames(from: number, to: number, opts: Parameters<typeof frame>[1] = {}): CatalogInputs[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => frame(from + i, opts));
}
