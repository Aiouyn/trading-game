// complete/04:994,1015-1029; reference macro/rules/crisisCatalog.ts:160-161.
import { BLOCS, fresh, live, type Bloc, type CatalogInputs, type CatalogKey } from "./inputs";
import type { MajorKindV1 } from "../crises";

interface Candidate { eligible: boolean; vulnerability: number; blocs: Bloc[] }
interface Definition { base: number; executable: boolean; requires: readonly CatalogKey[]; evaluate(s: CatalogInputs): Candidate }
const all = (vulnerability: number, eligible = true): Candidate => ({ eligible, vulnerability, blocs: [...BLOCS] });
const ranked = <T extends { bloc: Bloc }>(xs: T[], score: (x: T) => number): T[] => [...xs].sort((a, b) => score(b) - score(a) || BLOCS.indexOf(a.bloc) - BLOCS.indexOf(b.bloc));
const first = <T extends { bloc: Bloc }>(xs: T[], score: (x: T) => number): Candidate => {
  const r = ranked(xs, score)[0]; return r ? { eligible: true, vulnerability: score(r), blocs: [r.bloc] } : all(0, false);
};
export const CATALOG = {
  EQUITY_BUBBLE_BURST: { base: 1, executable: true, requires: ["valuation"], evaluate: (s) => first(live(s, "valuation").filter((r) => r.z >= 1 && r.gdpShare >= .2), (r) => r.z) },
  CREDIT_CRUNCH: { base: 1, executable: false, requires: ["credit", "defaultRateRising"], evaluate: (s) => first(live(s, "credit").filter((r) => r.z >= .5 || live(s, "defaultRateRising")), (r) => r.z) },
  BANKING_PANIC: { base: .6, executable: false, requires: ["banks", "fsi", "credit"], evaluate: (s) => {
    const fsi = live(s, "fsi"), weak = ranked(live(s, "banks").filter((r) => r.below12x >= 1), (r) => r.below12x);
    return { eligible: weak.length > 0 || fsi >= .4, vulnerability: (fsi - .3) / .1, blocs: weak[0] ? [weak[0].bloc] : first(live(s, "credit"), (r) => r.z).blocs };
  } },
  CRYPTO_WINTER: { base: .8, executable: true, requires: [], evaluate: (s) => {
    const h = fresh(s, "cryptoHype") ? live(s, "cryptoHype") : null, b = fresh(s, "minStablecoinBacking") ? live(s, "minStablecoinBacking") : null;
    return all(h === null ? 0 : 4 * (h - .5), (h !== null && h >= .5) || (b !== null && b < 1.02));
  } },
  OIL_SHOCK: { base: .8, executable: true, requires: ["tension"], evaluate: (s) => all((live(s, "tension") - 40) / 20) },
  CURRENCY_CRISIS: { base: .8, executable: false, requires: ["fx"], evaluate: (s) => first(live(s, "fx").filter((r) => (r.bloc === "SRL" || r.bloc === "PYN") && (r.reserveCover < 9 || r.currentAccount < -.02)), (r) => (9 - r.reserveCover) / 3) },
  SOVEREIGN_DEBT_CRISIS: { base: .6, executable: false, requires: ["sovereign"], evaluate: (s) => first(live(s, "sovereign").filter((r) => r.hazard >= .01), (r) => Math.log(r.hazard / .01)) },
  AI_BUBBLE: { base: .7, executable: false, requires: ["aiRace", "semisValuationZ"], evaluate: (s) => all((live(s, "aiRace") - 70) / 10, live(s, "aiRace") >= 70 && live(s, "semisValuationZ") >= 1) },
  CYBER_PANDEMIC: { base: 0, executable: false, requires: [], evaluate: () => all(0, false) },
  FLASH_CRASH: { base: .6, executable: true, requires: ["fear"], evaluate: (s) => all(live(s, "fear") / 50) },
  HOUSING_CRASH: { base: .7, executable: false, requires: ["housing"], evaluate: (s) => first(live(s, "housing").filter((r) => r.gap >= .15), (r) => r.z) },
  STAGFLATION: { base: .5, executable: true, requires: ["worldHeadlineInflation"], evaluate: (s) => all((live(s, "worldHeadlineInflation") - .035) / .01, live(s, "worldHeadlineInflation") > .035) },
  SECURITIZATION_CRISIS: { base: .5, executable: false, requires: ["poolUnderwritingQuality"], evaluate: (s) => all((.7 - live(s, "poolUnderwritingQuality")) / .1, live(s, "poolUnderwritingQuality") <= .6) },
  FUNDING_RUN: { base: .5, executable: false, requires: ["repoLeverageIndex"], evaluate: (s) => all((live(s, "repoLeverageIndex") - 1.2) / .2, live(s, "repoLeverageIndex") >= 1.2) },
  TRADE_WAR: { base: .5, executable: true, requires: ["tension"], evaluate: (s) => ({ eligible: live(s, "tension") >= 50, vulnerability: (live(s, "tension") - 50) / 15, blocs: ["FDL", "PYN"] }) },
} satisfies Record<string, Definition>;
export type CrisisKind = keyof typeof CATALOG;
export function isKind(v: unknown): v is CrisisKind { return typeof v === "string" && Object.hasOwn(CATALOG, v); }
export function executableKind(v: CrisisKind): v is MajorKindV1 { return CATALOG[v].executable; }
export interface CatalogDecision { kind: CrisisKind; status: "READY" | "MISSING" | "INELIGIBLE" | "UNSUPPORTED" | "EMERGENT_ONLY"; missing: string[]; rawWeight: number; weight: number; blocs: Bloc[] }
export function catalogDecisions(s: CatalogInputs): CatalogDecision[] {
  return Object.keys(CATALOG).filter(isKind).map((kind) => {
    const def: Definition = CATALOG[kind];
    const missingKeys = def.requires.filter((k) => !fresh(s, k));
    if (kind === "CRYPTO_WINTER" && !fresh(s, "cryptoHype") && !fresh(s, "minStablecoinBacking")) missingKeys.push("cryptoHype", "minStablecoinBacking");
    if (missingKeys.length) return { kind, status: "MISSING", missing: missingKeys, rawWeight: 0, weight: 0, blocs: [] };
    const c = def.evaluate(s), rawWeight = c.eligible ? def.base * Math.exp(Math.max(-3, Math.min(4, c.vulnerability))) : 0;
    const status = kind === "CYBER_PANDEMIC" ? "EMERGENT_ONLY" : !c.eligible ? "INELIGIBLE" : def.executable ? "READY" : "UNSUPPORTED";
    return { kind, status, missing: [], rawWeight, weight: status === "READY" ? rawWeight : 0, blocs: c.eligible ? c.blocs : [] };
  });
}
export function chooseMajor(s: CatalogInputs, u: number): CatalogDecision | null {
  if (!Number.isFinite(u) || u < 0 || u >= 1) throw new Error("INVALID_KIND_DRAW");
  const ds = catalogDecisions(s), total = ds.reduce((n, r) => n + r.weight, 0);
  let target = u * total;
  for (const d of ds) { if (target < d.weight) return d; target -= d.weight; }
  return null;
}
export const majorHazard = (s: CatalogInputs, crisisWeek = false): number => 3.6e-4 * catalogDecisions(s).reduce((n, r) => n + r.weight, 0) / 3 * (crisisWeek ? 1.5 : 1);
