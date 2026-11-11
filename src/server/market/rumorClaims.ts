// First playable slice of 15/16 claims: catalog RUMOR Wire stories resolve; TRUE moves lnV, FALSE reverts belief.
// Specs: 05:324, 05:847–871, 05:1010–1011; 16:188–193, 16:562–565, 16:772.
// Horizon is V1-compressed onto the existing 12-tick Wire quartet (STORY_EVERY×2), U(1,5) units (16:564).
import { STORY_EVERY } from "@/market/wireStories";
import { TICKS_PER_DAY } from "@/server/market/meme";
import type { SourceBand } from "@/shell/contracts/channels";

export const RUMOR = {
  sourceId: "wire-desk",
  /** PARAM.mkt_belief_spread_ticks (23 / 05:867). */
  spreadTicks: 30,
  /** PARAM.mkt_belief_hl_days (5) in ticks, while unresolved. */
  hlTicks: 5 * TICKS_PER_DAY,
  /** PARAM.mkt_belief_handoff_ticks. */
  handoffTicks: 15,
  /** False-claim release half-life in ticks (05:871). */
  falseHlTicks: 60,
  /** One Wire crisis quartet (watch→outcome); V1 compression of one game day. */
  horizonUnit: STORY_EVERY * 2,
  horizonMin: 1,
  horizonMax: 5,
  accMin: 0.40,
  accMax: 0.70,
  fizzleGivenFalse: 0.70,
  cap: 0.5,
  reach: 1,
} as const;

export type RumorResolution = "PENDING" | "CONFIRMED" | "FIZZLED" | "DENIED";

export interface RumorClaim {
  id: string;
  defId: string;
  assetId: string;
  headlineKey: string;
  slots: Record<string, string>;
  causeKey: string;
  publishTick: number;
  resolvesByTick: number;
  bp: number;
  a: number;
  cr: number;
  reach: number;
  isTrue: boolean;
  resolution: RumorResolution;
  /** Printed integer marks at confirmation; absent until CONFIRMED. */
  effect?: { assetId: string; from: number; to: number };
}

export interface RumorSource {
  sourceId: string;
  hiddenAccuracy: number;
  hits: number;
  resolved: number;
}

export interface BeliefPos {
  assetId: string;
  log: number;
  mode: "pending" | "handoff" | "falseRelease";
  startLog?: number;
  ticksLeft?: number;
}

export interface RumorSnapshot {
  source: RumorSource;
  claims: RumorClaim[];
  belief: BeliefPos[];
  lnV: { assetId: string; log: number }[];
  valueApplied: { assetId: string; log: number }[];
  lastTick: number | null;
}

export interface RumorOpenInput {
  id: string;
  defId: string;
  assetId: string;
  headlineKey: string;
  slots: Record<string, string>;
  causeKey: string;
  publishTick: number;
  bp: number;
}

export interface RumorStepEvent {
  claim: RumorClaim;
}

/** Stable 32-bit FNV-1a (same family as wireStories; drawing it never touches the quote RNG). */
export function rumorHash(key: string): number {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const unit = (key: string) => rumorHash(key) / 0x1_0000_0000;

export function hiddenAccuracyFor(seed: number): number {
  return RUMOR.accMin + (RUMOR.accMax - RUMOR.accMin) * unit(`rumor:${seed}:acc`);
}

export function resolvesByTick(seed: number, id: string, publishTick: number): number {
  const span = RUMOR.horizonMax - RUMOR.horizonMin + 1;
  const n = RUMOR.horizonMin + (rumorHash(`rumor:${seed}:hz:${id}`) % span);
  return publishTick + RUMOR.horizonUnit * n;
}

export function drawIsTrue(seed: number, id: string, acc: number): boolean {
  return unit(`rumor:${seed}:true:${id}`) < acc;
}

export function drawFalseKind(seed: number, id: string): "FIZZLED" | "DENIED" {
  return unit(`rumor:${seed}:false:${id}`) < RUMOR.fizzleGivenFalse ? "FIZZLED" : "DENIED";
}

/** Beta(2,2) public track record (05:857): (hits+2)/(resolved+4). */
export function srcRecord(hits: number, resolved: number): number {
  return (hits + 2) / (resolved + 4);
}

/** 05:854 credibility with only the source-record term (no evidence/prestige/rebuttal in this slice). */
export function claimCredibility(hits: number, resolved: number): number {
  return Math.min(1, Math.max(0, 0.15 + 0.45 * srcRecord(hits, resolved)));
}

/** Catalog bp as the owner-module asserted log move, capped (05:851 / 05:867). */
export function assertedLog(bp: number): number {
  if (!Number.isFinite(bp) || bp === 0) return 0;
  const a = Math.log(1 + bp / 10_000);
  return Math.min(RUMOR.cap, Math.max(-RUMOR.cap, a));
}

/** Discrete half-life coefficient so (1-k)^hlTicks = 1/2 exactly (same family as shockFeed.halfLifeK). */
export function ticksHalfLifeK(hlTicks: number): number {
  if (!(hlTicks > 0)) return 1;
  return 1 - Math.pow(2, -1 / hlTicks);
}

export function claimContribution(c: Pick<RumorClaim, "a" | "cr" | "reach" | "publishTick">, tick: number): number {
  const age = Math.max(0, tick - c.publishTick);
  if (age === 0) return 0;
  const spread = 1 - Math.exp(-age / RUMOR.spreadTicks);
  const decay = Math.pow(0.5, age / RUMOR.hlTicks);
  return c.a * c.cr * c.reach * spread * decay;
}

export function pendingBelief(claims: readonly RumorClaim[], tick: number): Map<string, number> {
  const raw = new Map<string, number>();
  for (const c of claims) {
    if (c.resolution !== "PENDING") continue;
    raw.set(c.assetId, (raw.get(c.assetId) ?? 0) + claimContribution(c, tick));
  }
  for (const [id, v] of raw) raw.set(id, Math.min(RUMOR.cap, Math.max(-RUMOR.cap, v)));
  return raw;
}

/** Public band from hits/resolved. Matches existing fixtures: 0/2 low, 3/7 mixed, 9/10 solid. */
export function sourceBand(hits: number, resolved: number): SourceBand {
  if (!(resolved > 0)) return "mixed";
  const r = hits / resolved;
  if (r < 1 / 3) return "low";
  if (r >= 2 / 3) return "solid";
  return "mixed";
}

export function publicRecord(s: RumorSource): { hits: number; resolved: number } {
  return { hits: s.hits, resolved: s.resolved };
}

const cloneClaim = (c: RumorClaim): RumorClaim => ({
  ...c,
  slots: { ...c.slots },
  effect: c.effect ? { ...c.effect } : undefined,
});

export function emptyRumorSnapshot(seed: number): RumorSnapshot {
  return {
    source: { sourceId: RUMOR.sourceId, hiddenAccuracy: hiddenAccuracyFor(seed), hits: 0, resolved: 0 },
    claims: [],
    belief: [],
    lnV: [],
    valueApplied: [],
    lastTick: null,
  };
}

export class RumorBook {
  private source: RumorSource;
  private claims: RumorClaim[] = [];
  private belief = new Map<string, BeliefPos>();
  private lnV = new Map<string, number>();
  private valueApplied = new Map<string, number>();
  private lastTick: number | null = null;
  constructor(private readonly seed: number, snap?: RumorSnapshot) {
    this.source = { sourceId: RUMOR.sourceId, hiddenAccuracy: hiddenAccuracyFor(seed), hits: 0, resolved: 0 };
    if (snap) this.hydrate(snap);
  }

  snapshot(): RumorSnapshot {
    return {
      source: { ...this.source },
      claims: this.claims.map(cloneClaim),
      belief: [...this.belief.values()].map((b) => ({ ...b })),
      lnV: [...this.lnV.entries()].map(([assetId, log]) => ({ assetId, log })),
      valueApplied: [...this.valueApplied.entries()].map(([assetId, log]) => ({ assetId, log })),
      lastTick: this.lastTick,
    };
  }

  hydrate(snap: RumorSnapshot | null | undefined): void {
    if (!snap) {
      this.source = { sourceId: RUMOR.sourceId, hiddenAccuracy: hiddenAccuracyFor(this.seed), hits: 0, resolved: 0 };
      this.claims = [];
      this.belief.clear();
      this.lnV.clear();
      this.valueApplied.clear();
      this.lastTick = null;
      return;
    }
    this.source = { ...snap.source };
    this.claims = snap.claims.map(cloneClaim);
    this.belief = new Map(snap.belief.map((b) => [b.assetId, { ...b }]));
    this.lnV = new Map(snap.lnV.map((r) => [r.assetId, r.log]));
    this.valueApplied = new Map(snap.valueApplied.map((r) => [r.assetId, r.log]));
    this.lastTick = snap.lastTick;
  }

  lnVOf(assetId: string): number | undefined { return this.lnV.get(assetId); }
  beliefLog(assetId: string): number { return this.belief.get(assetId)?.log ?? 0; }
  valueLog(assetId: string): number { return this.valueApplied.get(assetId) ?? 0; }
  sourceState(): RumorSource { return { ...this.source }; }
  claim(id: string): RumorClaim | undefined { return this.claims.find((c) => c.id === id); }
  allClaims(): readonly RumorClaim[] { return this.claims; }

  /** Add a permanent confirmed-or-NEWS log to lnV (caller already moved marks for NEWS). */
  addConfirmedValue(assetId: string, log: number): void {
    if (!Number.isFinite(log) || log === 0) return;
    this.lnV.set(assetId, (this.lnV.get(assetId) ?? 0) + log);
    this.valueApplied.set(assetId, (this.valueApplied.get(assetId) ?? 0) + log);
  }

  /**
   * Open a pending claim. Idempotent on id. Returns the claim (existing or new).
   * isTrue is sealed on the book; it is not for the Wire item until resolution.
   */
  open(input: RumorOpenInput): RumorClaim {
    const existing = this.claims.find((c) => c.id === input.id);
    if (existing) return existing;
    const acc = this.source.hiddenAccuracy;
    const isTrue = drawIsTrue(this.seed, input.id, acc);
    const claim: RumorClaim = {
      id: input.id,
      defId: input.defId,
      assetId: input.assetId,
      headlineKey: input.headlineKey,
      slots: { ...input.slots },
      causeKey: input.causeKey,
      publishTick: input.publishTick,
      resolvesByTick: resolvesByTick(this.seed, input.id, input.publishTick),
      bp: input.bp,
      a: assertedLog(input.bp),
      cr: claimCredibility(this.source.hits, this.source.resolved),
      reach: RUMOR.reach,
      isTrue,
      resolution: "PENDING",
    };
    this.claims.push(claim);
    return claim;
  }

  /**
   * Advance from lastTick (or stay) through `tick` inclusive. Applies pending belief, then resolutions
   * due at each t, then handoff / false release. `applyLog` moves the mark by a log delta;
   * `applyConfirmed` prints the integer bp shock (shockedMinor) so lnV matches the mark.
   */
  advanceTo(
    tick: number,
    applyLog: (assetId: string, log: number) => { from: number; to: number } | null,
    applyConfirmed?: (assetId: string, bp: number) => { from: number; to: number } | null,
  ): RumorStepEvent[] {
    const out: RumorStepEvent[] = [];
    if (!Number.isSafeInteger(tick)) return out;
    let start: number;
    if (this.lastTick == null) {
      if (this.claims.length === 0) { this.lastTick = tick; return out; }
      start = Math.min(...this.claims.map((c) => c.publishTick));
    } else {
      start = this.lastTick + 1;
    }
    for (let t = start; t <= tick; t++) {
      this.stepPendingBelief(t, applyLog);
      for (const ev of this.resolveDue(t, applyLog, applyConfirmed)) out.push(ev);
      this.stepRelease(applyLog);
    }
    this.lastTick = tick;
    return out;
  }

  private stepPendingBelief(
    tick: number,
    applyLog: (assetId: string, log: number) => { from: number; to: number } | null,
  ): void {
    const target = pendingBelief(this.claims, tick);
    const ids = new Set([...target.keys(), ...[...this.belief.values()].filter((b) => b.mode === "pending").map((b) => b.assetId)]);
    for (const id of ids) {
      const pos = this.belief.get(id);
      if (pos && pos.mode !== "pending") continue;
      const want = target.get(id) ?? 0;
      const have = pos?.log ?? 0;
      const d = want - have;
      if (d !== 0) applyLog(id, d);
      if (want === 0) this.belief.delete(id);
      else this.belief.set(id, { assetId: id, log: want, mode: "pending" });
    }
  }

  private resolveDue(
    tick: number,
    applyLog: (assetId: string, log: number) => { from: number; to: number } | null,
    applyConfirmed?: (assetId: string, bp: number) => { from: number; to: number } | null,
  ): RumorStepEvent[] {
    const evs: RumorStepEvent[] = [];
    for (const c of this.claims) {
      if (c.resolution !== "PENDING" || tick !== c.resolvesByTick) continue;
      if (c.isTrue) {
        c.resolution = "CONFIRMED";
        const printed = applyConfirmed
          ? applyConfirmed(c.assetId, c.bp)
          : applyLog(c.assetId, Math.log(1 + c.bp / 10_000));
        if (printed && printed.from > 0) {
          const log = Math.log(printed.to / printed.from);
          this.addConfirmedValue(c.assetId, log);
          c.effect = { assetId: c.assetId, from: printed.from, to: printed.to };
        } else {
          this.addConfirmedValue(c.assetId, assertedLog(c.bp));
        }
        const have = this.belief.get(c.assetId)?.log ?? 0;
        if (have !== 0) {
          this.belief.set(c.assetId, { assetId: c.assetId, log: have, mode: "handoff", startLog: have, ticksLeft: RUMOR.handoffTicks });
        } else this.belief.delete(c.assetId);
        this.source.hits += 1;
        this.source.resolved += 1;
        evs.push({ claim: cloneClaim(c) });
      } else {
        c.resolution = drawFalseKind(this.seed, c.id);
        const have = this.belief.get(c.assetId)?.log ?? 0;
        if (have !== 0) {
          this.belief.set(c.assetId, { assetId: c.assetId, log: have, mode: "falseRelease", startLog: have });
        } else this.belief.delete(c.assetId);
        this.source.resolved += 1;
        evs.push({ claim: cloneClaim(c) });
      }
    }
    return evs;
  }

  private stepRelease(applyLog: (assetId: string, log: number) => { from: number; to: number } | null): void {
    for (const [id, pos] of [...this.belief.entries()]) {
      if (pos.mode === "pending") continue;
      if (pos.mode === "handoff") {
        const left = (pos.ticksLeft ?? 1) - 1;
        const start = pos.startLog ?? pos.log;
        const want = left <= 0 ? 0 : start * (left / RUMOR.handoffTicks);
        const d = want - pos.log;
        if (d !== 0) applyLog(id, d);
        if (left <= 0 || want === 0) this.belief.delete(id);
        else this.belief.set(id, { assetId: id, log: want, mode: "handoff", startLog: start, ticksLeft: left });
        continue;
      }
      // falseRelease: half-life 60 ticks toward 0 ((1-k)^60 = 1/2)
      const k = ticksHalfLifeK(RUMOR.falseHlTicks);
      const dec = k * pos.log;
      const next = pos.log - dec;
      if (dec !== 0) applyLog(id, -dec);
      if (Math.abs(next) < 1e-12) this.belief.delete(id);
      else this.belief.set(id, { assetId: id, log: next, mode: "falseRelease", startLog: pos.startLog });
    }
  }
}

export function claimPhase(c: Pick<RumorClaim, "resolution">): "forecast" | "realized" | "eased" {
  if (c.resolution === "PENDING") return "forecast";
  if (c.resolution === "CONFIRMED") return "realized";
  return "eased";
}

export function claimCauseKey(c: Pick<RumorClaim, "causeKey" | "resolution">): string {
  if (c.resolution === "PENDING") return c.causeKey;
  if (c.resolution === "CONFIRMED") return `${c.causeKey}-confirmed`;
  if (c.resolution === "FIZZLED") return `${c.causeKey}-fizzled`;
  return `${c.causeKey}-denied`;
}

export function cloneRumorSnapshot(s: RumorSnapshot): RumorSnapshot {
  return {
    source: { ...s.source },
    claims: s.claims.map(cloneClaim),
    belief: s.belief.map((b) => ({ ...b })),
    lnV: s.lnV.map((r) => ({ ...r })),
    valueApplied: s.valueApplied.map((r) => ({ ...r })),
    lastTick: s.lastTick,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : null;
}

/** Older / missing / garbage snapshots start empty (caller hydrates nothing). */
export function normalizeRumorSnapshot(raw: unknown): RumorSnapshot | undefined {
  if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const srcRaw = o.source && typeof o.source === "object" ? o.source as Record<string, unknown> : null;
  if (!srcRaw || typeof srcRaw.sourceId !== "string") return undefined;
  const acc = num(srcRaw.hiddenAccuracy);
  const hits = int(srcRaw.hits);
  const resolved = int(srcRaw.resolved);
  if (acc == null || hits == null || resolved == null || hits < 0 || resolved < 0 || hits > resolved) return undefined;
  const claims: RumorClaim[] = [];
  if (!Array.isArray(o.claims)) return undefined;
  for (const row of o.claims) {
    if (!row || typeof row !== "object") continue;
    const c = row as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.defId !== "string" || typeof c.assetId !== "string") continue;
    if (typeof c.headlineKey !== "string" || typeof c.causeKey !== "string") continue;
    const publishTick = int(c.publishTick), resolvesByTickN = int(c.resolvesByTick);
    const bp = num(c.bp), a = num(c.a), cr = num(c.cr), reach = num(c.reach);
    if (publishTick == null || resolvesByTickN == null || bp == null || a == null || cr == null || reach == null) continue;
    if (typeof c.isTrue !== "boolean") continue;
    const resolution = c.resolution;
    if (resolution !== "PENDING" && resolution !== "CONFIRMED" && resolution !== "FIZZLED" && resolution !== "DENIED") continue;
    const slots: Record<string, string> = {};
    if (c.slots && typeof c.slots === "object") {
      for (const [k, v] of Object.entries(c.slots as Record<string, unknown>)) {
        if (typeof v === "string") slots[k] = v;
      }
    }
    let effect: RumorClaim["effect"];
    if (c.effect && typeof c.effect === "object") {
      const e = c.effect as Record<string, unknown>;
      const from = num(e.from), to = num(e.to);
      if (typeof e.assetId === "string" && from != null && to != null && from > 0 && to > 0) {
        effect = { assetId: e.assetId, from, to };
      }
    }
    claims.push({
      id: c.id, defId: c.defId, assetId: c.assetId, headlineKey: c.headlineKey, slots, causeKey: c.causeKey,
      publishTick, resolvesByTick: resolvesByTickN, bp, a, cr, reach, isTrue: c.isTrue, resolution, effect,
    });
  }
  const belief: BeliefPos[] = [];
  if (Array.isArray(o.belief)) {
    for (const row of o.belief) {
      if (!row || typeof row !== "object") continue;
      const b = row as Record<string, unknown>;
      if (typeof b.assetId !== "string") continue;
      const log = num(b.log);
      if (log == null) continue;
      const mode = b.mode;
      if (mode !== "pending" && mode !== "handoff" && mode !== "falseRelease") continue;
      const startLog = b.startLog === undefined ? undefined : num(b.startLog) ?? undefined;
      const ticksLeft = b.ticksLeft === undefined ? undefined : int(b.ticksLeft) ?? undefined;
      belief.push({ assetId: b.assetId, log, mode, startLog, ticksLeft });
    }
  }
  const rows = (rawRows: unknown): { assetId: string; log: number }[] => {
    const out: { assetId: string; log: number }[] = [];
    if (!Array.isArray(rawRows)) return out;
    for (const row of rawRows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const log = num(r.log);
      if (typeof r.assetId !== "string" || log == null) continue;
      out.push({ assetId: r.assetId, log });
    }
    return out;
  };
  const lastTick = o.lastTick === null ? null : int(o.lastTick);
  if (o.lastTick !== null && o.lastTick !== undefined && lastTick == null) return undefined;
  return {
    source: { sourceId: srcRaw.sourceId, hiddenAccuracy: acc, hits, resolved },
    claims, belief, lnV: rows(o.lnV), valueApplied: rows(o.valueApplied), lastTick: lastTick ?? null,
  };
}
