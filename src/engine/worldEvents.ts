import { Rng, seedStream } from './rng';
import type { AssetDef, RegimeId, StepEvent, WorldConfig, WorldState } from './types';

/**
 * Shared world events (specs/quant-world-events.md, velvet-world-events.md): crashes and bubbles (majors), crisis
 * weeks and flash crashes (storms). One world, so an event hits every asset together. Seeded on 'macro:events', checked
 * once per game day, at most one at a time. Moves are drift spread over the window (a slide, not a jump), applied to
 * value AND price like any news, so the market ecology's value pool carries them instead of erasing them.
 *
 * No leaks from the future: the app only ever gets worldEventView() (id, kind, headline, elapsed days, today's share
 * per asset). The end tick, the planned moves and any give-back stay in here. A bubble's give-back is a separate
 * hidden drift scheduled AFTER the event ends, random in size and timing and sometimes absent (Ledger), so an active
 * banner never hints that a reversal is still to come.
 */
export type WorldEventKind = 'crash' | 'bubble' | 'crisis' | 'flash';

export interface WorldEventsConfig {
  /** chance per game day of each kind starting (or, for majors and crisis weeks, being scheduled) */
  odds: Record<WorldEventKind, number>;
  /** the longest crisis-week lead, in whole game days (its announcement, 2 = 2 real hours) */
  leadDays: number;
  /** the shortest crisis-week lead, in whole game days */
  crisisLeadMinDays: number;
  /**
   * the shortest major lead, in game days: 8 (= 8 real hours, 720 ticks a game day), so every timezone gets a waking window
   * (ROADMAP §2.8, M39). The lead is drawn from the seed between this and majorLeadMaxDays, in whole hours, so the Wire
   * timestamp plus the window never gives the exact onset (velvet-world-events.md, section 1).
   */
  majorLeadDays: number;
  /** the longest major lead, in game days (16) */
  majorLeadMaxDays: number;
}

export const DEFAULT_WORLD_EVENTS: WorldEventsConfig = {
  // majors 0.05% a game day combined (~37% a season), storms 1.3% (spec numbers)
  odds: { crash: 0.0003, bubble: 0.0002, crisis: 0.008, flash: 0.005 },
  leadDays: 2,
  crisisLeadMinDays: 1,
  majorLeadDays: 8,
  majorLeadMaxDays: 16,
};

export interface WorldEvent {
  id: string;
  kind: WorldEventKind;
  headline: string;
  /** precursor / announcement tick (majors and crisis weeks) */
  announcedTick: number;
  startTick: number;
  endTick: number;
  /** total planned log move per asset over the window (internal) */
  shocks: Record<string, number>;
  /** flash only: share of the drop given back intraday (0 = none), and when the give-back runs */
  giveBack?: { frac: number; dropEnd: number; fromTick: number; toTick: number };
  /** GX level when the event began (for "GX −18.4% since it began"); unset until it starts */
  gxStart?: number;
  /** log move applied so far today per asset, and the day it belongs to (the event panel's "share of today") */
  today: { day: number; moves: Record<string, number> };
}

/** A hidden drift after a bubble: never shown, never announced. */
export interface EventDrift {
  fromTick: number;
  toTick: number;
  shocks: Record<string, number>;
}

export interface WorldEventsState {
  rng: import('./rng').RngState;
  seq: number;
  active?: WorldEvent;
  drifts: EventDrift[];
  /** the last ended event, for the aftermath line (one game day) */
  ended?: { id: string; kind: WorldEventKind; headline: string; endTick: number; lastedDays: number; gxMove?: number };
}

export interface WorldEventView {
  id: string;
  /** null for an announced major: its kind is not shown before the onset (no-reveal, velvet-world-events.md) */
  kind: WorldEventKind | null;
  /** the engine's English headline; null for an announced major. The app translates headlineKey instead. */
  headline: string | null;
  /** the en.json / fr.json key of the headline ('event.headline.<kind>.<n>'); null when the headline is hidden */
  headlineKey: string | null;
  /** 'announced' (precursors / crisis-week card) or 'live' */
  phase: 'announced' | 'live';
  elapsedDays: number;
  /**
   * announced only: the onset is within this many real hours, rounded UP to the next 8-hour band (8, 16, 24 ...). Never the
   * exact onset and never the length. Absent once live.
   */
  windowHours?: number;
  /** log move the event put into each asset so far today (past only) */
  todayShare: Record<string, number>;
  /** live only: the onset tick, so the charts can shade the window from its start (never the end) */
  sinceTick?: number;
}

export function worldEventsConfig(cfg: WorldConfig): WorldEventsConfig | null {
  return cfg.worldEvents ? { ...DEFAULT_WORLD_EVENTS, ...cfg.worldEvents, odds: { ...DEFAULT_WORLD_EVENTS.odds, ...cfg.worldEvents.odds } } : null;
}

const HEADLINES: Record<WorldEventKind, string[]> = {
  crash: ['Markets in freefall.', 'Panic grips Port Avalon.', 'The floor gives way.'],
  bubble: ['Everyone is a genius now.', 'Euphoria sweeps the exchange.', 'The melt-up is on.'],
  crisis: ['Crisis week.', 'Credit seizes up across the Union.', 'A week the desks won’t forget.'],
  flash: ['Flash crash.', 'Liquidity vanishes in minutes.'],
};
const PRECURSORS: Record<'crash' | 'bubble' | 'crisis', string[]> = {
  crash: ['Margin debt hits a record as leverage piles up', 'A mid-size lender quietly halts withdrawals', 'Insiders sell at the fastest pace in years'],
  bubble: ['Retail sign-ups at brokers triple in a month', 'Analysts scramble to raise every target', 'Taxi drivers trade stock tips at the port'],
  crisis: ['The Union finance council calls an emergency session for next week', 'Interbank lending rates spike overnight'],
};

/** The variants of an event line in each locale (en.json / fr.json: event.headline.<kind>.0 .. .7, event.pre.<kind>.0 .. .7). */
const EVENT_VARIANTS = 8;

/**
 * The variant of an event line, by a stable hash of its id (FNV-1a). No RNG stream is read, so the copy never moves a price,
 * a draw or a fingerprint: the engine's English line is still picked by its stream, and only the viewer's copy varies.
 */
function eventVariant(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % EVENT_VARIANTS;
}

/**
 * The i18n key of an engine headline (en.json / fr.json), chosen among its eight variants by the event's id. The app shows the
 * translated line; the English stays for the log and the replay. Null for a line the lists do not hold.
 */
export function headlineKey(kind: WorldEventKind, text: string, id: string): string | null {
  return HEADLINES[kind].includes(text) ? `event.headline.${kind}.${eventVariant(id)}` : null;
}
/** The i18n key of a precursor line, chosen among its eight variants by the event's id and the line. */
export function precursorKey(kind: 'crash' | 'bubble' | 'crisis', text: string, id: string): string | null {
  return PRECURSORS[kind].includes(text) ? `event.pre.${kind}.${eventVariant(`${id}:${text}`)}` : null;
}
/** How many headline and precursor lines each kind has (the copy check in the i18n tests reads these). */
export const EVENT_COPY_COUNTS = {
  headline: { crash: HEADLINES.crash.length, bubble: HEADLINES.bubble.length, crisis: HEADLINES.crisis.length, flash: HEADLINES.flash.length },
  precursor: { crash: PRECURSORS.crash.length, bubble: PRECURSORS.bubble.length, crisis: PRECURSORS.crisis.length },
} as const;

const pick = <T>(rng: Rng, xs: T[]): T => xs[Math.floor(rng.uniform() * xs.length) % xs.length]!;
const U = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.uniform();

/**
 * The telegraph lead of a scheduled event, in whole game days (= real hours): a major between majorLeadDays and
 * majorLeadMaxDays, a crisis week between crisisLeadMinDays and leadDays. Whole days keep the onset on a day boundary, so the
 * engine's own start path runs. One seeded draw, so the lead is replayable and never shows in the app.
 */
function drawLead(rng: Rng, kind: 'crash' | 'bubble' | 'crisis', wc: WorldEventsConfig): number {
  const lo = kind === 'crisis' ? wc.crisisLeadMinDays : wc.majorLeadDays;
  const hi = kind === 'crisis' ? wc.leadDays : wc.majorLeadMaxDays;
  const span = Math.max(1, Math.floor(hi) - Math.floor(lo) + 1);
  return Math.floor(lo) + Math.min(span - 1, Math.floor(rng.uniform() * span));
}

/** Sector multipliers for a crash (spec): tech and discretionary 1.4, staples 0.4. */
function crashMult(def: AssetDef): number {
  if (def.sector === 'tech' || def.sector === 'semis' || def.sector === 'discretionary' || def.sector === 'consumer') return 1.4;
  if (def.sector === 'staples') return 0.4;
  return 1;
}

/** Planned total log move per asset for a kind. Pure given the draws. */
function planShocks(cfg: WorldConfig, kind: WorldEventKind, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {};
  const stockMove = kind === 'crash' ? -U(rng, 0.25, 0.4) : kind === 'bubble' ? U(rng, 0.2, 0.35) : kind === 'flash' ? -0.08 : 0;
  for (const def of cfg.assets) {
    if (def.listed === false) continue;
    let m = 0;
    if (kind === 'crash') {
      if (def.assetClass === 'stock') m = stockMove * crashMult(def);
      else if (def.assetClass === 'crypto') m = def.id === 'AUSD' || def.id === 'FLUX' ? 0 : -0.3;
      else if (def.id === 'GOLD') m = 0.1;
      else if (def.assetClass === 'bond') m = def.id === 'HYLD' ? -0.08 : 0.04;
      else if (def.assetClass === 'realestate') m = stockMove * 0.6;
      else if (def.assetClass === 'commodity') m = def.sector === 'metals' ? 0.02 : -0.12;
    } else if (kind === 'bubble') {
      if (def.assetClass === 'stock') m = stockMove * (crashMult(def) > 1 ? 1.3 : 1);
      else if (def.assetClass === 'crypto') m = def.id === 'AUSD' || def.id === 'FLUX' ? 0 : 0.5;
      else if (def.assetClass === 'realestate') m = stockMove * 0.5;
    } else if (kind === 'flash') {
      if (def.assetClass === 'stock') m = stockMove * (0.6 + 0.8 * rng.uniform());
      else if (def.assetClass === 'crypto' && def.id !== 'AUSD' && def.id !== 'FLUX') m = -0.1;
    }
    if (m !== 0) out[def.id] = Math.log1p(m);
  }
  return out;
}

export function initWorldEvents(state: WorldState): WorldEventsState {
  return { rng: seedStream(state.seed, 'macro:events'), seq: 0, drifts: [] };
}

/** One publication from the event layer: what the Wire may show (never the end tick or the planned moves). */
export interface WorldEventPublish {
  phase: 'announced' | 'start' | 'end';
  ev: WorldEvent;
  precursors?: string[];
  /** end only: game days it lasted (0 for a flash) and the GX move since it began */
  lastedDays?: number;
  gxMove?: number;
}

export interface WorldEventStep {
  state: WorldEventsState;
  events: WorldEventPublish[];
}

/**
 * The regime the market trades under at `tick`. A crisis week trades as contraction for its days only: the macro
 * chain (state.regime) is not touched, so the economy resumes its normal path after the week. (A permanent switch
 * per crisis week held contraction for months and cut GX by half in a 2-year run; see docs/V1.md.)
 */
export function tradingRegime(we: WorldEventsState | undefined, tick: number, regime: RegimeId): RegimeId {
  const a = we?.active;
  return a && a.kind === 'crisis' && tick >= a.startTick && tick < a.endTick ? 'contraction' : regime;
}

/**
 * Day-boundary update: end the active event, start a scheduled one, roll for a new one. `day` is the day opening with
 * `tick`. Pure: returns the next state.
 */
export function worldEventsDay(cfg: WorldConfig, we: WorldEventsState, day: number, tick: number, regime: RegimeId, gx: number): WorldEventStep {
  const wc = worldEventsConfig(cfg)!;
  const tpd = cfg.ticksPerDay;
  const rng = new Rng(we.rng);
  let next: WorldEventsState = { ...we, drifts: we.drifts.filter((d) => d.toTick > tick) };
  const out: WorldEventStep['events'] = [];

  // end
  const a = next.active;
  if (a && tick >= a.endTick) {
    const lastedDays = Math.round((a.endTick - a.startTick) / tpd);
    const gxMove = a.gxStart ? gx / a.gxStart - 1 : undefined;
    next = { ...next, active: undefined, ended: { id: a.id, kind: a.kind, headline: a.headline, endTick: a.endTick, lastedDays, gxMove } };
    out.push({ phase: 'end', ev: a, lastedDays, gxMove });
    if (a.kind === 'bubble' && !rng.chance(0.25)) {
      // the give-back: random share of the run-up, starting 0–20 days later, over 5–25 days; sometimes never
      const frac = U(rng, 0.2, 0.8);
      const from = tick + Math.floor(U(rng, 0, 20)) * tpd;
      const len = Math.floor(U(rng, 5, 25)) * tpd;
      const shocks: Record<string, number> = {};
      for (const [id, m] of Object.entries(a.shocks)) shocks[id] = -frac * m;
      next.drifts = [...next.drifts, { fromTick: from, toTick: from + len, shocks }];
    }
  }
  // start a scheduled event
  const s = next.active;
  if (s && s.startTick === tick && s.gxStart === undefined) {
    out.push({ phase: 'start', ev: s });
    next = { ...next, active: { ...s, gxStart: gx } };
  }
  // roll (one event at a time; nothing while one is scheduled or live)
  if (!next.active) {
    const o = wc.odds;
    const u = rng.uniform();
    let kind: WorldEventKind | null = null;
    let acc = 0;
    for (const k of ['crash', 'bubble', 'crisis', 'flash'] as const) {
      acc += o[k];
      if (u < acc) { kind = k; break; }
    }
    if (kind === 'crash' && day < 21) kind = null;
    if (kind === 'bubble' && regime === 'contraction') kind = null;
    if (kind) {
      next.seq = (next.seq ?? 0) + 1;
      const id = `ev${next.seq}`;
      const shocks = planShocks(cfg, kind, rng);
      const headline = pick(rng, HEADLINES[kind]);
      if (kind === 'flash') {
        // today, starting at a random point in the first half of the session: −8% over the first sixth of a day
        const start = tick + Math.floor(U(rng, 0, 0.5) * tpd);
        const end = start + Math.ceil(tpd / 6);
        const frac = rng.chance(0.2) ? 0 : U(rng, 0.3, 1);
        const gbFrom = end + Math.floor(U(rng, 0, 0.3) * tpd);
        const gbTo = Math.min(gbFrom + Math.ceil(U(rng, 0.1, 0.3) * tpd), tick + tpd - 1);
        const ev: WorldEvent = { id, kind, headline, announcedTick: start, startTick: start, endTick: Math.max(end, gbTo), shocks, giveBack: { frac, dropEnd: end, fromTick: gbFrom, toTick: Math.max(gbFrom + 1, gbTo) }, today: { day, moves: {} } };
        // a flash starts intra-day: it goes live on its own start tick (see worldEventIntraday), not at a day boundary
        next = { ...next, active: ev };
      } else {
        const len = kind === 'crash' ? Math.floor(U(rng, 10, 31)) : kind === 'bubble' ? Math.floor(U(rng, 15, 41)) : 5;
        const lead = drawLead(rng, kind, wc);
        const startTick = tick + lead * tpd;
        const ev: WorldEvent = { id, kind, headline, announcedTick: tick, startTick, endTick: startTick + len * tpd, shocks, today: { day, moves: {} } };
        const pre = kind === 'crisis' ? [pick(rng, PRECURSORS.crisis)] : [pick(rng, PRECURSORS[kind]), pick(rng, PRECURSORS[kind])];
        next = { ...next, active: ev };
        out.push({ phase: 'announced', ev, precursors: [...new Set(pre)] });
      }
    }
  }
  return { state: { ...next, rng: rng.state() }, events: out };
}

/**
 * Intraday transitions of an event that does not start or end on a day boundary: a flash crash (inside a day), and an admin
 * event started one tick after a request (forceWorldEvent with `now`). A start publishes once (the day path sets gxStart when it
 * starts an event on a boundary, so this skips it). `gx` is read lazily: it is only needed at the two transitions. Pure.
 */
export function worldEventIntraday(we: WorldEventsState | undefined, tick: number, tpd: number, gx: () => number): { state: WorldEventsState | undefined; events: WorldEventPublish[] } {
  const a = we?.active;
  if (!we || !a) return { state: we, events: [] };
  if (tick === a.startTick && a.gxStart === undefined) {
    return { state: { ...we, active: { ...a, gxStart: gx() } }, events: [{ phase: 'start', ev: a }] };
  }
  if (tick >= a.endTick && a.gxStart !== undefined) {
    const gxMove = a.gxStart ? gx() / a.gxStart - 1 : undefined;
    const lastedDays = a.kind === 'flash' ? 0 : Math.round((a.endTick - a.startTick) / tpd);
    const ended = { id: a.id, kind: a.kind, headline: a.headline, endTick: a.endTick, lastedDays, gxMove };
    return { state: { ...we, active: undefined, ended }, events: [{ phase: 'end', ev: a, lastedDays, gxMove }] };
  }
  return { state: we, events: [] };
}

/**
 * Adds this tick's event moves (price, per asset) to the active event's tally for its game day: the event panel's
 * "share of today". Only the event's own moves go in, so the tally never reveals the planned length or the rest of
 * the move.
 */
export function worldEventAccrue(we: WorldEventsState, tick: number, ticksPerDay: number, moves: Record<string, number>): WorldEventsState {
  const a = we.active;
  if (!a) return we;
  const day = Math.floor((tick - 1) / ticksPerDay);
  const next: Record<string, number> = a.today.day === day ? { ...a.today.moves } : {};
  for (const [id, m] of Object.entries(moves)) next[id] = (next[id] ?? 0) + m;
  return { ...we, active: { ...a, today: { day, moves: next } } };
}

/** The engine event the Wire and the replay log record for a publication. */
export function worldEventStepEvent(p: WorldEventPublish, tick: number): StepEvent {
  return {
    type: 'world', tick, phase: p.phase, kind: p.ev.kind, id: p.ev.id, headline: p.ev.headline,
    ...(p.precursors ? { precursors: p.precursors } : {}),
    ...(p.lastedDays !== undefined ? { lastedDays: p.lastedDays } : {}),
    ...(p.gxMove !== undefined ? { gxMove: p.gxMove } : {}),
  };
}

/**
 * Per-tick log moves the active event and any hidden drift add to asset `id` at `tick`: `price` and `value`. They are
 * equal (news) except in a flash crash, which is liquidity: the price takes the whole drop and gives back `frac` of
 * it, while value only takes the part that is never given back (so the closing auction keeps it, and only it).
 */
export function worldEventMove(we: WorldEventsState | undefined, id: string, tick: number): { price: number; value: number } {
  let price = 0, value = 0;
  if (!we) return { price, value };
  const a = we.active;
  if (a && tick >= a.startTick && tick < a.endTick) {
    const total = a.shocks[id];
    if (total) {
      const g = a.giveBack;
      if (a.kind === 'flash' && g) {
        if (tick < g.dropEnd) {
          const per = total / (g.dropEnd - a.startTick);
          price += per;
          value += (1 - g.frac) * per;
        } else if (tick >= g.fromTick && tick < g.toTick) {
          price -= (g.frac * total) / (g.toTick - g.fromTick);
        }
      } else {
        const per = total / (a.endTick - a.startTick);
        price += per;
        value += per;
      }
    }
  }
  for (const d of we.drifts) {
    if (tick >= d.fromTick && tick < d.toTick) {
      const x = d.shocks[id];
      if (x) { price += x / (d.toTick - d.fromTick); value += x / (d.toTick - d.fromTick); }
    }
  }
  return { price, value };
}

/** Jump intensity multiplier while a crisis week is live. */
export function worldEventJumpMult(we: WorldEventsState | undefined, tick: number): number {
  const a = we?.active;
  return a && a.kind === 'crisis' && tick >= a.startTick && tick < a.endTick ? 1.5 : 1;
}

/** The only shape the app gets: no end tick, no remaining length, no planned move. An announced major shows no kind or headline. */
export function worldEventView(state: WorldState): WorldEventView | null {
  const a = state.worldEvents?.active;
  if (!a) return null;
  const tpd = state.config.ticksPerDay;
  const live = state.tick >= a.startTick;
  if (!live && a.kind === 'flash') return null; // a flash has no warning
  const hidden = !live && (a.kind === 'crash' || a.kind === 'bubble');
  const today = Math.floor((state.tick - 1) / tpd);
  const hoursLeft = (a.startTick - state.tick) / tpd; // one game day is one real hour
  return {
    id: a.id,
    kind: hidden ? null : a.kind,
    headline: hidden ? null : a.headline,
    headlineKey: hidden ? null : headlineKey(a.kind, a.headline, a.id),
    phase: live ? 'live' : 'announced',
    elapsedDays: live ? Math.floor((state.tick - a.startTick) / tpd) : 0,
    todayShare: a.today.day === today ? { ...a.today.moves } : {},
    ...(live ? { sinceTick: a.startTick } : { windowHours: telegraphBand(hoursLeft) }),
  };
}

/** The 8-hour band an announced onset falls in: the hours left, rounded up to a multiple of 8 (at least 8). */
export function telegraphBand(hoursLeft: number): number {
  return Math.max(1, Math.ceil(hoursLeft / 8)) * 8;
}

/** The first tick after `tick` that opens a game day (the engine checks events there: tick - 1 divisible by tpd). */
export function nextDayBoundary(tick: number, tpd: number): number {
  return (Math.floor((tick - 1) / tpd) + 1) * tpd + 1;
}

/**
 * An admin-forced event (the e2e seam and the dev console; never a player action). By default a major or a crisis week starts
 * at the next day boundary, so the engine's own start path runs; `now` starts it one tick later instead (the e2e seam: no
 * waiting for a day), and a flash always starts one tick later. A forced event that does not start on a boundary is started and
 * ended by worldEventIntraday, every tick, so it runs whatever the request's tick. Its moves come from the same planner on its
 * own seed stream. Returns the next event state, or null when an event is already active.
 */
export function forceWorldEvent(state: WorldState, kind: WorldEventKind, days?: number, now = false): WorldEventsState | null {
  const tpd = state.config.ticksPerDay;
  const base = state.worldEvents ?? initWorldEvents(state);
  if (base.active) return null;
  const seq = (base.seq ?? 0) + 1;
  const rng = new Rng(seedStream(state.seed, `macro:events:admin:${seq}`));
  const id = `ev${seq}`;
  const shocks = planShocks(state.config, kind, rng);
  const headline = pick(rng, HEADLINES[kind]);
  const tick = state.tick;
  const today: WorldEvent["today"] = { day: Math.floor((tick - 1) / tpd), moves: {} };
  if (kind === 'flash') {
    const start = tick + 1;
    const end = start + Math.ceil(tpd / 6);
    const ev: WorldEvent = { id, kind, headline, announcedTick: tick, startTick: start, endTick: end, shocks, giveBack: { frac: 0, dropEnd: end, fromTick: end, toTick: end + 1 }, today };
    return { ...base, seq, active: ev };
  }
  const startTick = now ? tick + 1 : nextDayBoundary(tick, tpd);
  const drawn = kind === 'crash' ? Math.floor(U(rng, 10, 31)) : kind === 'bubble' ? Math.floor(U(rng, 15, 41)) : 5;
  const len = days !== undefined && days >= 1 ? Math.floor(days) : drawn;
  const ev: WorldEvent = { id, kind, headline, announcedTick: tick, startTick, endTick: startTick + len * tpd, shocks, today };
  return { ...base, seq, active: ev };
}

/** The aftermath line for one game day after an event ends ("Crash ended · lasted 18 days · GX −31.0%"). */
export function worldEventAftermath(state: WorldState): WorldEventsState['ended'] | null {
  const e = state.worldEvents?.ended;
  if (!e || state.tick - e.endTick > state.config.ticksPerDay) return null;
  return e;
}
