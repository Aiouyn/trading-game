import { Draws } from "../meme";
import { majorStockShocks } from "../crises";
import { shockHalfLifeDays } from "../shockFeed";
import { catalogDecisions, chooseMajor, executableKind, isKind, majorHazard, type CrisisKind } from "./catalog";
import { BLOCS, fresh, hasFields, integer, isPlainJson, live, object, parseInputs, text, type Bloc, type CatalogInputs } from "./inputs";

export type ProgramKind = "ENERGY_SUBSIDY" | "FISCAL_SUPPORT";
export interface Wallet { id: string; cents: number }
export interface Program { kind: ProgramKind; source: string; recipient: string; limitCents: number }
export interface Response { kind: ProgramKind | "CB_EMERGENCY"; hour: number; paidCents: number; status: "FIRED" | "EXHAUSTED"; reference: string }
type CalmDay = { kind: "MISSING"; day: number } | { kind: "OBSERVED"; day: number; hours: number; maxFear: number; maxFsi: number };
export type Phase = { kind: "PRECURSOR" | "TRIGGER" | "CONTAGION" | "POLICY"; sinceHour: number }
  | { kind: "RECOVERY"; sinceHour: number; calmDays: number; day: CalmDay | null }
  | { kind: "ENDED"; sinceHour: number; reason: "CALM" | "TIMEOUT" };
export interface PolicyEvent {
  id: string; kind: CrisisKind; origin: "SCHEDULED" | "EMERGENT" | "PLAYER_CAUSED"; severity: number; blocs: Bloc[];
  startHour: number; triggerHour: number; contagionHour: number; recoveryHour: number; phase: Phase; responses: Response[];
  attached: { kind: CrisisKind; hour: number }[];
}
export interface Residual { eventId: string; assetId: string; initialLog: number; startHour: number; halfLifeDays: number }
export interface PolicyState {
  v: 2; epoch: string; seed: number; startHour: number; hour: number; genesisCents: number; wallets: Wallet[]; programs: Program[];
  events: PolicyEvent[]; residuals: Residual[]; gxHistory: { hour: number; mark: number }[]; gxCrash: "CLEAR" | "LATCHED"; suppressUntilHour: number | null; lastInputs: CatalogInputs | null;
}
export interface Proposal { kind: CrisisKind; origin: PolicyEvent["origin"]; severity: number; precursorDays: number; contagionDays: number }
const H = 24, CHAPTER = 1344 * H, GX_WINDOW_HOURS = 21 * H;
const tradingHour = (hour: number) => {
  const day = Math.floor(hour / H), weekday = day % 7;
  return (Math.floor(day / 7) * 5 + Math.min(weekday, 5)) * H + (weekday < 5 ? hour % H : 0);
};
// 21 trading days span at most 31 calendar days, including boundary weekends.
const GX_HISTORY_LIMIT = 31 * H + 1;
const sumCash = (wallets: readonly Wallet[]): bigint => wallets.reduce((n, w) => n + BigInt(w.cents), BigInt(0));
const walletOk = (w: unknown): w is Wallet => object(w) && hasFields(w, ["id", "cents"]) && text(w.id) && /^[a-zA-Z0-9:_-]+$/.test(w.id) && integer(w.cents);
const programOk = (p: unknown): p is Program => object(p) && hasFields(p, ["kind", "source", "recipient", "limitCents"]) && (p.kind === "ENERGY_SUBSIDY" || p.kind === "FISCAL_SUPPORT") && text(p.source) && text(p.recipient) && p.source !== p.recipient && integer(p.limitCents) && p.limitCents > 0;
export function createPolicyState(config: { epoch: string; seed: number; startHour?: number; wallets: Wallet[]; programs?: Program[] }): PolicyState {
  if (!isPlainJson(config)) throw new Error("INVALID_GENESIS");
  const startHour = config.startHour ?? 0, wallets = structuredClone(config.wallets), programs = structuredClone(config.programs ?? []);
  if (!text(config.epoch) || !integer(config.seed) || !integer(startHour) || !wallets.every(walletOk) || !programs.every(programOk)) throw new Error("INVALID_GENESIS");
  const total = sumCash(wallets);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("GENESIS_OVERFLOW");
  const s: PolicyState = { v: 2, epoch: config.epoch, seed: config.seed, startHour, hour: startHour - 1, genesisCents: Number(total), wallets, programs,
    events: [], residuals: [], gxHistory: [], gxCrash: "CLEAR", suppressUntilHour: null, lastInputs: null };
  return parsePolicyState(s);
}
export function assertPolicyConservation(s: PolicyState): void {
  if (!s.wallets.every(walletOk) || sumCash(s.wallets) !== BigInt(s.genesisCents)) throw new Error("CASH_CONSERVATION");
}
export function scheduledBlock(s: PolicyState, triggerHour: number): "ACTIVE" | "GAP" | "FIRST_24" | "FINAL_48" | "PLAYER_SUPPRESS" | null {
  if (s.events.some((e) => e.phase.kind !== "ENDED")) return "ACTIVE";
  const last = s.events.at(-1);
  if (last && triggerHour - last.triggerHour < 504 * H) return "GAP";
  const start = Math.floor((s.hour + 1) / CHAPTER) * CHAPTER;
  if (s.hour + 1 < start + 24 * H) return "FIRST_24";
  if (triggerHour >= start + CHAPTER - 48 * H) return "FINAL_48";
  if (s.suppressUntilHour !== null && s.hour < s.suppressUntilHour) return "PLAYER_SUPPRESS";
  return null;
}
function addEvent(s: PolicyState, p: Proposal, inputs: CatalogInputs): void {
  const existing = s.events.find((e) => e.phase.kind !== "ENDED");
  if (p.origin !== "SCHEDULED" && existing) {
    if (!existing.attached.some((c) => c.kind === p.kind)) existing.attached.push({ kind: p.kind, hour: s.hour });
    if (p.origin === "PLAYER_CAUSED") s.suppressUntilHour = s.hour + 336 * H;
    return;
  }
  const startHour = s.hour + 1, triggerHour = startHour + p.precursorDays * H;
  if (p.origin === "SCHEDULED") {
    const block = scheduledBlock(s, triggerHour);
    if (block) throw new Error(`SCHEDULE_BLOCK:${block}`);
    if (!catalogDecisions(inputs).some((d) => d.kind === p.kind && d.status === "READY")) throw new Error("KIND_NOT_LIVE_EXECUTABLE");
  }
  const id = `policy:${s.epoch}:${startHour}:${p.kind}`;
  const e: PolicyEvent = { id, kind: p.kind, origin: p.origin, severity: p.severity, startHour, triggerHour, contagionHour: triggerHour + H,
    recoveryHour: triggerHour + H + p.contagionDays * H, blocs: catalogDecisions(inputs).find((d) => d.kind === p.kind)?.blocs ?? [],
    phase: { kind: "PRECURSOR", sinceHour: startHour }, responses: [], attached: [] };
  if (!e.blocs.length) e.blocs = [...BLOCS];
  s.events.push(e);
  if (p.origin === "PLAYER_CAUSED") s.suppressUntilHour = triggerHour + 336 * H;
}
function proposalOk(p: Proposal): boolean {
  return isPlainJson(p) && hasFields(p, ["kind", "origin", "severity", "precursorDays", "contagionDays"]) && isKind(p.kind) && (p.origin === "SCHEDULED" || p.origin === "EMERGENT" || p.origin === "PLAYER_CAUSED") && Number.isFinite(p.severity) && p.severity >= .6 && p.severity <= 1.4
    && integer(p.precursorDays) && p.precursorDays <= 16 && (p.origin !== "SCHEDULED" || p.precursorDays >= 8) && Number.isFinite(p.contagionDays)
    && p.contagionDays >= 5 && p.contagionDays <= 30 && integer(p.contagionDays * H);
}
/** Harness / trusted producer door; scheduled proposals still obey eligibility and constraints, but bypass the onset draw. */
export function proposeMajor(state: PolicyState, p: Proposal, raw: CatalogInputs): PolicyState {
  if (!proposalOk(p)) throw new Error("INVALID_PROPOSAL");
  const inputs = parseInputs(raw);
  if (inputs.epoch !== state.epoch || inputs.hour !== state.hour) throw new Error("PROPOSAL_INPUT_TIME");
  if (state.lastInputs && canonical(inputs) !== canonical(state.lastInputs)) throw new Error("PROPOSAL_OBSERVATION_CONFLICT");
  const s = structuredClone(state); addEvent(s, p, inputs); return parsePolicyState(s);
}
function firePrograms(s: PolicyState, e: PolicyEvent): void {
  const wanted = e.kind === "OIL_SHOCK" ? "ENERGY_SUBSIDY" : e.kind === "TRADE_WAR" ? "FISCAL_SUPPORT" : null;
  if (!wanted) return;
  for (const [i, p] of s.programs.entries()) {
    if (p.kind !== wanted) continue;
    const source = s.wallets.find((w) => w.id === p.source), recipient = s.wallets.find((w) => w.id === p.recipient);
    if (!source || !recipient) throw new Error("PROGRAM_WALLET_MISSING");
    const paidCents = Math.min(p.limitCents, source.cents);
    source.cents -= paidCents; recipient.cents += paidCents;
    e.responses.push({ kind: p.kind, hour: s.hour, paidCents, status: paidCents > 0 ? "FIRED" : "EXHAUSTED", reference: `program:${i}` });
  }
}
function observeEmergency(s: PolicyState, e: PolicyEvent, inputs: CatalogInputs): void {
  if (e.kind === "CRYPTO_WINTER" || !fresh(inputs, "emergencies")) return;
  for (const r of live(inputs, "emergencies")) {
    if (r.hour < e.triggerHour || r.hour > s.hour || !r.blocs.some((b) => e.blocs.includes(b)) || e.responses.some((x) => x.kind === "CB_EMERGENCY" && x.reference === r.id)) continue;
    e.responses.push({ kind: "CB_EMERGENCY", hour: s.hour, paidCents: 0, status: "FIRED", reference: r.id });
  }
}
function observeCalm(e: PolicyEvent, s: PolicyState, inputs: CatalogInputs): void {
  const p = e.phase;
  if (p.kind !== "RECOVERY") return;
  const day = Math.floor(s.hour / H), known = fresh(inputs, "fear") && fresh(inputs, "fsi");
  if (!known) p.day = { kind: "MISSING", day };
  else {
    const f = live(inputs, "fear"), fsi = live(inputs, "fsi");
    if (!p.day || p.day.day !== day) p.day = { kind: "OBSERVED", day, hours: 1, maxFear: f, maxFsi: fsi };
    else if (p.day.kind === "OBSERVED") { p.day.hours++; p.day.maxFear = Math.max(p.day.maxFear, f); p.day.maxFsi = Math.max(p.day.maxFsi, fsi); }
  }
  if (s.hour % H === H - 1 && day % 7 < 5) {
    p.calmDays = p.day?.kind === "OBSERVED" && p.day.hours === H && p.day.maxFear < 40 && p.day.maxFsi < .3 ? p.calmDays + 1 : 0;
    if (p.calmDays >= 10) e.phase = { kind: "ENDED", sinceHour: s.hour, reason: "CALM" };
  }
  if (e.phase.kind === "RECOVERY" && s.hour - p.sinceHour >= 180 * H) e.phase = { kind: "ENDED", sinceHour: s.hour, reason: "TIMEOUT" };
}
function step(s: PolicyState, inputs: CatalogInputs): void {
  s.hour = inputs.hour;
  for (const e of s.events) {
    if (e.phase.kind === "ENDED") continue;
    if (e.phase.kind === "PRECURSOR" && s.hour >= e.triggerHour) {
      e.phase = { kind: "TRIGGER", sinceHour: e.triggerHour };
      if (e.origin === "SCHEDULED" && executableKind(e.kind)) for (const shock of majorStockShocks(e.kind, e.severity)) {
        s.residuals.push({ eventId: e.id, assetId: shock.assetId, initialLog: Math.log(1 + shock.bp / 10000), startHour: e.triggerHour, halfLifeDays: shockHalfLifeDays(e.kind) });
      }
      firePrograms(s, e);
    }
    if (s.hour >= e.triggerHour && s.hour < e.recoveryHour) observeEmergency(s, e, inputs);
    if (e.phase.kind === "TRIGGER" && s.hour >= e.contagionHour) e.phase = { kind: "CONTAGION", sinceHour: e.contagionHour };
    if (e.phase.kind === "CONTAGION" && e.responses.some((r) => r.status === "FIRED")) e.phase = { kind: "POLICY", sinceHour: s.hour };
    if (s.hour >= e.recoveryHour && e.phase.kind !== "RECOVERY") e.phase = { kind: "RECOVERY", sinceHour: e.recoveryHour, calmDays: 0, day: null };
    observeCalm(e, s, inputs);
  }
  s.gxHistory = s.gxHistory.filter((r) => tradingHour(s.hour) - tradingHour(r.hour) <= GX_WINDOW_HOURS);
  if (fresh(inputs, "gx")) {
    const gx = live(inputs, "gx");
    // Monotone deque retains every still-relevant hourly peak and its actual expiry hour.
    while (s.gxHistory.length && s.gxHistory.at(-1)!.mark <= gx) s.gxHistory.pop();
    s.gxHistory.push({ hour: s.hour, mark: gx });
    const peak = s.gxHistory[0]!.mark, crash = 1 - gx / peak >= .2 - 1e-12;
    if (crash && s.gxCrash === "CLEAR") addEvent(s, { kind: "EQUITY_BUBBLE_BURST", origin: "EMERGENT", severity: 1, precursorDays: 0, contagionDays: 17.5 }, inputs);
    s.gxCrash = crash ? "LATCHED" : "CLEAR";
  }
  if (s.hour % H === H - 1) {
    const day = Math.floor(s.hour / H), r = new Draws(`sys:policy:${s.seed}:${day}`);
    const start = r.uniform(), kind = r.uniform(), severity = .6 + .8 * r.uniform(), precursorDays = 8 + Math.floor(9 * r.uniform()), contagionDays = 5 + Math.floor(26 * r.uniform());
    const trigger = s.hour + 1 + precursorDays * H;
    if (!scheduledBlock(s, trigger) && fresh(inputs, "crisisWeek") && start < 1 - Math.exp(-majorHazard(inputs, live(inputs, "crisisWeek")))) {
      const d = chooseMajor(inputs, kind);
      if (d) addEvent(s, { kind: d.kind, origin: "SCHEDULED", severity, precursorDays, contagionDays }, inputs);
    }
  }
  s.lastInputs = inputs;
  assertPolicyConservation(s);
}
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (object(v)) return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",")}}`;
  const scalar = JSON.stringify(v);
  if (scalar === undefined) throw new Error("NON_JSON_VALUE");
  return scalar;
}
export function advancePolicy(state: PolicyState, frames: readonly CatalogInputs[]): PolicyState {
  if (!isPlainJson(frames)) throw new Error("INVALID_CATALOG_INPUTS");
  const s = structuredClone(state);
  for (const raw of frames) {
    const inputs = parseInputs(raw);
    if (inputs.epoch !== s.epoch) throw new Error("EPOCH_MISMATCH");
    if (inputs.hour === s.hour && s.lastInputs && canonical(inputs) === canonical(s.lastInputs)) continue;
    if (inputs.hour !== s.hour + 1) throw new Error(inputs.hour <= s.hour ? "OBSERVATION_CONFLICT" : "HOURLY_INPUT_GAP");
    step(s, inputs);
  }
  return parsePolicyState(s);
}
export function residualLog(s: PolicyState, assetId: string, hour = s.hour): number {
  if (!integer(hour) || hour < s.hour) throw new Error("INVALID_PROJECTION_TIME");
  return s.residuals.filter((r) => r.assetId === assetId && hour >= r.startHour).reduce((n, r) => n + r.initialLog * 2 ** (-(hour - r.startHour) / (24 * r.halfLifeDays)), 0);
}
export function publicPolicy(s: PolicyState) {
  return s.events.filter((e) => e.phase.kind !== "PRECURSOR").map((e) => ({ id: e.id, kind: e.kind, phase: e.phase.kind, sinceHour: e.phase.sinceHour,
    policyStartedHour: e.responses.find((r) => r.status === "FIRED")?.hour ?? null,
    endReason: e.phase.kind === "ENDED" ? e.phase.reason : null,
    responses: e.responses.map((r) => ({ kind: r.kind, status: r.status, paidCents: r.paidCents })) }));
}

function phaseOk(p: unknown, hour: number): p is Phase {
  if (!object(p) || !integer(p.sinceHour) || p.sinceHour > hour + 1) return false;
  if (p.kind === "RECOVERY") return hasFields(p, ["kind", "sinceHour", "calmDays", "day"]) && integer(p.calmDays) && p.calmDays < 10 && (p.day === null || object(p.day) && integer(p.day.day)
    && p.day.day === Math.floor(hour / 24) && (p.day.kind === "MISSING" && hasFields(p.day, ["kind", "day"]) || p.day.kind === "OBSERVED" && hasFields(p.day, ["kind", "day", "hours", "maxFear", "maxFsi"]) && integer(p.day.hours) && p.day.hours >= 1 && p.day.hours <= 24
    && typeof p.day.maxFear === "number" && Number.isFinite(p.day.maxFear) && p.day.maxFear >= 0 && p.day.maxFear <= 100
    && typeof p.day.maxFsi === "number" && Number.isFinite(p.day.maxFsi) && p.day.maxFsi >= 0 && p.day.maxFsi <= 1));
  if (p.kind === "ENDED") return hasFields(p, ["kind", "sinceHour", "reason"]) && (p.reason === "CALM" || p.reason === "TIMEOUT");
  return hasFields(p, ["kind", "sinceHour"]) && (p.kind === "PRECURSOR" || p.kind === "TRIGGER" || p.kind === "CONTAGION" || p.kind === "POLICY");
}
function eventOk(e: unknown, hour: number): e is PolicyEvent {
  if (!object(e) || !hasFields(e, ["id", "kind", "origin", "severity", "blocs", "startHour", "triggerHour", "contagionHour", "recoveryHour", "phase", "responses", "attached"]) || !text(e.id) || !isKind(e.kind) || (e.origin !== "SCHEDULED" && e.origin !== "EMERGENT" && e.origin !== "PLAYER_CAUSED")
    || typeof e.severity !== "number" || !Number.isFinite(e.severity) || e.severity < .6 || e.severity > 1.4 || !Array.isArray(e.blocs) || !e.blocs.length
    || new Set(e.blocs).size !== e.blocs.length || !e.blocs.every((b) => BLOCS.some((x) => x === b))
    || !integer(e.startHour) || !integer(e.triggerHour) || !integer(e.contagionHour) || !integer(e.recoveryHour) || e.startHour > hour + 1 || e.triggerHour < e.startHour
    || e.contagionHour !== e.triggerHour + H || e.recoveryHour < e.contagionHour + 5 * H || e.recoveryHour > e.contagionHour + 30 * H || !phaseOk(e.phase, hour)) return false;
  const trigger = e.triggerHour, recovery = e.recoveryHour;
  if (!Array.isArray(e.responses) || !e.responses.every((r) => object(r) && hasFields(r, ["kind", "hour", "paidCents", "status", "reference"]) && (r.kind === "ENERGY_SUBSIDY" || r.kind === "FISCAL_SUPPORT" || r.kind === "CB_EMERGENCY")
    && integer(r.hour) && r.hour >= trigger && r.hour <= hour && r.hour < recovery && integer(r.paidCents) && (r.status === "FIRED" || r.status === "EXHAUSTED") && text(r.reference)
    && (r.kind === "CB_EMERGENCY" ? r.status === "FIRED" && r.paidCents === 0 && e.kind !== "CRYPTO_WINTER" : r.hour === trigger && (r.status === "FIRED" ? r.paidCents > 0 : r.paidCents === 0)
      && (r.kind === "ENERGY_SUBSIDY" ? e.kind === "OIL_SHOCK" : e.kind === "TRADE_WAR"))) || new Set(e.responses.map((r) => `${r.kind}:${r.reference}`)).size !== e.responses.length
    || !Array.isArray(e.attached) || !e.attached.every((c) => object(c) && hasFields(c, ["kind", "hour"]) && isKind(c.kind) && integer(c.hour) && c.hour <= hour)) return false;
  const p = e.phase, fired = e.responses.some((r) => r.status === "FIRED");
  switch (p.kind) {
    case "PRECURSOR": return hour < trigger && p.sinceHour === e.startHour && e.responses.length === 0;
    case "TRIGGER": return hour >= trigger && hour < e.contagionHour && p.sinceHour === trigger;
    case "CONTAGION": return hour >= e.contagionHour && hour < recovery && p.sinceHour === e.contagionHour && !fired;
    case "POLICY": return hour >= e.contagionHour && hour < recovery && p.sinceHour >= e.contagionHour && p.sinceHour <= hour && fired;
    case "RECOVERY": return hour >= recovery && hour - recovery < 180 * H && p.sinceHour === recovery;
    case "ENDED": return p.sinceHour >= recovery && p.sinceHour <= hour && (p.reason === "TIMEOUT" ? p.sinceHour === recovery + 180 * H
      : p.sinceHour % H === H - 1 && Math.floor(p.sinceHour / H) % 7 < 5 && p.sinceHour >= recovery + 10 * H - 1);
  }
}
function isState(v: unknown): v is PolicyState {
  if (!object(v) || !hasFields(v, ["v", "epoch", "seed", "startHour", "hour", "genesisCents", "wallets", "programs", "events", "residuals", "gxHistory", "gxCrash", "suppressUntilHour", "lastInputs"]) || v.v !== 2 || !text(v.epoch) || v.epoch.length > 64 || !integer(v.seed) || !integer(v.startHour) || typeof v.hour !== "number" || !Number.isSafeInteger(v.hour)
    || v.hour < v.startHour - 1 || !integer(v.genesisCents) || !Array.isArray(v.wallets) || !v.wallets.every(walletOk) || new Set(v.wallets.map((w) => w.id)).size !== v.wallets.length
    || !Array.isArray(v.programs) || !v.programs.every(programOk)) return false;
  const hour = v.hour, startHour = v.startHour, wallets = v.wallets, programs = v.programs, epoch = v.epoch;
  if (!programs.every((p) => wallets.some((w) => w.id === p.source) && wallets.some((w) => w.id === p.recipient)) || !Array.isArray(v.events) || !v.events.every((e) => eventOk(e, hour))
    || v.events.filter((e) => e.phase.kind !== "ENDED").length > 1 || new Set(v.events.map((e) => e.id)).size !== v.events.length
    || !(v.suppressUntilHour === null || integer(v.suppressUntilHour)) || !Array.isArray(v.residuals)
    || (v.gxCrash !== "CLEAR" && v.gxCrash !== "LATCHED") || !Array.isArray(v.gxHistory) || v.gxHistory.length > GX_HISTORY_LIMIT
    || !v.gxHistory.every((r) => object(r) && hasFields(r, ["hour", "mark"]) && integer(r.hour) && r.hour >= startHour && r.hour <= hour && tradingHour(hour) - tradingHour(r.hour) <= GX_WINDOW_HOURS && integer(r.mark) && r.mark > 0)
    || !v.gxHistory.every((r, i, a) => i === 0 || r.hour > a[i - 1].hour && r.mark < a[i - 1].mark)) return false;
  const events = v.events;
  if (!events.every((e, i) => e.id === `policy:${epoch}:${e.startHour}:${e.kind}` && (i === 0 || e.startHour > events[i - 1].startHour))) return false;
  for (const e of events) for (const r of e.responses) if (r.kind !== "CB_EMERGENCY") {
    const i = Number(r.reference.replace(/^program:/, "")), p = programs[i];
    if (r.reference !== `program:${i}` || !p || p.kind !== r.kind || r.paidCents > p.limitCents) return false;
  }
  if (!v.residuals.every((r) => object(r) && hasFields(r, ["eventId", "assetId", "initialLog", "startHour", "halfLifeDays"]) && text(r.eventId) && text(r.assetId) && typeof r.initialLog === "number" && Number.isFinite(r.initialLog)
    && integer(r.startHour) && r.startHour <= hour && typeof r.halfLifeDays === "number" && Number.isFinite(r.halfLifeDays) && r.halfLifeDays > 0
    && events.some((e) => e.id === r.eventId && e.origin === "SCHEDULED" && e.triggerHour === r.startHour))) return false;
  for (const e of events) {
    const wanted = e.kind === "OIL_SHOCK" ? "ENERGY_SUBSIDY" : e.kind === "TRADE_WAR" ? "FISCAL_SUPPORT" : null;
    const expectedPrograms = hour >= e.triggerHour ? programs.filter((p) => p.kind === wanted).length : 0;
    if (e.responses.filter((r) => r.kind !== "CB_EMERGENCY").length !== expectedPrograms) return false;
    const got = v.residuals.filter((r) => r.eventId === e.id);
    const shocks = e.origin === "SCHEDULED" && hour >= e.triggerHour && executableKind(e.kind) ? majorStockShocks(e.kind, e.severity) : [];
    if (got.length !== shocks.length || new Set(got.map((r) => r.assetId)).size !== got.length) return false;
    if (!shocks.every((r) => got.some((g) => g.assetId === r.assetId && g.initialLog === Math.log(1 + r.bp / 10000) && g.halfLifeDays === shockHalfLifeDays(e.kind)))) return false;
  }
  if (v.lastInputs === null) return hour === v.startHour - 1 && events.length === 0 && v.residuals.length === 0;
  try { const last = parseInputs(v.lastInputs); return last.hour === hour && last.epoch === v.epoch; } catch { return false; }
}
export function parsePolicyState(v: unknown): PolicyState {
  if (!isPlainJson(v) || !isState(v)) throw new Error("INVALID_POLICY_CHECKPOINT");
  assertPolicyConservation(v);
  return structuredClone(v);
}
