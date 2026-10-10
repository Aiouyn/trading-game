import {
  assetIndex, cancelOrder, createWorld, equityOf, indexLevel, openAccount, openOrders, placeOrder,
  portfolio, step as engineStep, universeConfig,
} from '@/engine';
import type {
  AssetClass, Fill, Order, OrderRequest, PortfolioView, RegimeId, StepEvent, WorldState,
} from '@/engine';
import { SANDBOX } from './config';
import { challengeSeed, weekNumberOf } from './calendar';
import { SCENARIOS, scenarioById, type Scenario } from './scenarios';

/** the practice account's id inside the sandbox world (never a live player id) */
export const PRACTICE_ID = 'practice';

export type SandboxErrorCode =
  | 'bad-spec' | 'bad-id' | 'unknown-scenario' | 'bad-command' | 'bad-ticks' | 'bad-version' | 'bad-run'
  | 'run-too-large' | 'run-too-long' | 'digest-mismatch' | 'replay-rejected' | 'not-ranked' | 'not-complete'
  | 'already-attempted' | 'internal' | 'worker-failed' | 'disposed';

/** a sandbox failure with a stable code (the UI maps codes to copy; codes are never shown raw) */
export class SandboxError extends Error {
  constructor(readonly code: SandboxErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SandboxError';
  }
}

export type SandboxSpec =
  | { kind: 'practice'; id: string }
  | { kind: 'scenario'; scenarioId: string }
  | { kind: 'challenge'; weekKey: string };

export type PlaceOrder = Omit<OrderRequest, 'playerId'>;
export type SandboxCommand = { type: 'place'; order: PlaceOrder } | { type: 'cancel'; orderId: string };

export interface RunEntry { tick: number; command: SandboxCommand }

export interface ActResult { ok: boolean; reason: string | null; orderId: string | null }

export interface StepResult {
  tick: number;
  fills: Fill[];
  /** public market announcements in the stepped ticks (events about accounts are left out) */
  announcements: StepEvent[];
}

export interface SandboxView {
  tick: number;
  day: number;
  targetTicks: number | null;
  /** the tick the run stops at: its target, or the run cap for open practice */
  limitTicks: number;
  complete: boolean;
  startingCash: number;
  equity: number;
  returnPct: number;
  portfolio: PortfolioView;
  openOrders: Order[];
}

export interface MarketSnapshot {
  tick: number;
  gx: number;
  crypto: number;
  prices: Record<string, number>;
}

/** what a sandbox is built from: the plan is a pure function of the spec, so a run file can be re-derived and checked */
export interface SandboxPlan {
  kind: 'practice' | 'scenario' | 'challenge';
  seed: string;
  initialRegime: RegimeId;
  cash: number;
  scenarioId: string | null;
  weekKey: string | null;
  /** game days the run is for, or null for open practice */
  days: number | null;
}

const PUBLIC_EVENTS = new Set<StepEvent['type']>([
  'regime', 'jump', 'auction', 'index', 'squeeze', 'halt', 'reopen', 'preview', 'rumor', 'earnings', 'rates', 'macro',
  'world', 'listing',
]);

const PLACE_KEYS = [
  'assetId', 'side', 'type', 'qty', 'limitPrice', 'stopPrice', 'tif', 'trailPct', 'takeProfit', 'stopLoss', 'reduceOnly',
] as const;
const SIDES = ['buy', 'sell'];
const ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit', 'trailing'];
const TIFS = ['day', 'gtc'];
const ASSET_ID = /^[A-Za-z0-9_-]{1,40}$/;
const ORDER_ID = new RegExp(`^${PRACTICE_ID}-\\d{1,12}$`);
const WEEK_KEY = /^\d{4}-W\d{2}$/;
const PRACTICE_NAME = /^[a-z0-9-]{1,40}$/;

/** Derive what a spec runs. Pure: the same spec always gives the same plan. */
export function planFor(spec: SandboxSpec): SandboxPlan {
  if (spec.kind === 'practice') {
    if (!PRACTICE_NAME.test(spec.id)) throw new SandboxError('bad-id');
    return { kind: 'practice', seed: `${SANDBOX.seedPrefix}practice:${spec.id}`, initialRegime: 'expansion', cash: SANDBOX.practiceCash, scenarioId: null, weekKey: null, days: null };
  }
  if (spec.kind === 'scenario') {
    const s = scenarioById(spec.scenarioId);
    if (!s) throw new SandboxError('unknown-scenario');
    return planForScenario(s);
  }
  if (spec.kind === 'challenge') {
    if (!WEEK_KEY.test(spec.weekKey)) throw new SandboxError('bad-spec', 'week key');
    // DECISIONS section 3: the week seed is the ISO week plus the public salt. The scenario supplies only the opening
    // regime and the length, so its headline condition is not re-checked on the challenge market.
    const s = SCENARIOS[weekNumberOf(spec.weekKey) % SCENARIOS.length]!;
    return { kind: 'challenge', seed: challengeSeed(spec.weekKey), initialRegime: s.startRegime, cash: SANDBOX.scenarioCash, scenarioId: s.id, weekKey: spec.weekKey, days: s.days };
  }
  throw new SandboxError('bad-spec');
}

function planForScenario(s: Scenario): SandboxPlan {
  return { kind: 'scenario', seed: s.seed, initialRegime: s.startRegime, cash: SANDBOX.scenarioCash, scenarioId: s.id, weekKey: null, days: s.days };
}

/**
 * One sandbox: the bundled engine on its own seed, with one paper-money account. Everything here is pure engine
 * calls, so two sandboxes with the same plan and the same commands end in the same state.
 */
export class Sandbox {
  private state: WorldState;
  private readonly log: RunEntry[] = [];
  readonly plan: SandboxPlan;
  /** game ticks per game day in this world (the bundled universe runs 720) */
  readonly ticksPerDay: number;
  /** 'live' for a run this client started, 'imported' for a run file; imported runs are never ranked */
  readonly origin: 'live' | 'imported';

  private constructor(plan: SandboxPlan, origin: 'live' | 'imported') {
    this.plan = plan;
    this.origin = origin;
    const world = createWorld(plan.seed, universeConfig({ initialRegime: plan.initialRegime }));
    this.ticksPerDay = world.config.ticksPerDay;
    this.state = openAccount(world, PRACTICE_ID, plan.cash);
  }

  /** A fresh sandbox for a spec. */
  static create(spec: SandboxSpec): Sandbox {
    return new Sandbox(planFor(spec), 'live');
  }

  /** A fresh sandbox for a scenario object (the search and the scenario tests use this; the table is `SCENARIOS`). */
  static fromScenario(s: Scenario): Sandbox {
    return new Sandbox(planForScenario(s), 'live');
  }

  /** Used by the run-file importer only: a sandbox with the imported origin. */
  static forImport(plan: SandboxPlan): Sandbox {
    return new Sandbox(plan, 'imported');
  }

  /** the engine state version this sandbox was built with (a run file from another engine is refused) */
  get engineVersion(): number {
    return this.state.version;
  }

  get tick(): number {
    return this.state.tick;
  }

  /** the tick a scenario or challenge ends at, or null for open practice */
  get targetTicks(): number | null {
    return this.plan.days === null ? null : this.plan.days * this.state.config.ticksPerDay;
  }

  /** the tick the run stops at: its target, or the run cap for open practice (so every run can be exported) */
  get limitTicks(): number {
    return this.targetTicks ?? SANDBOX.maxRunDays * this.ticksPerDay;
  }

  get complete(): boolean {
    return this.state.tick >= this.limitTicks;
  }

  /** The commands applied so far, in order, each with the tick it was applied at. */
  get commands(): readonly RunEntry[] {
    return this.log;
  }

  /**
   * Advance the market by at most one call's worth (SANDBOX.maxStepDays game days; more is refused, so one call never
   * holds the worker). A run stops at its limit tick. Pure engine steps; the account's fills and the public
   * announcements come back.
   */
  step(ticks: number): StepResult {
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > SANDBOX.maxStepDays * this.ticksPerDay) {
      throw new SandboxError('bad-ticks');
    }
    const n = Math.min(ticks, Math.max(0, this.limitTicks - this.state.tick));
    const fills: Fill[] = [];
    const announcements: StepEvent[] = [];
    for (let k = 0; k < n; k++) {
      const r = engineStep(this.state);
      this.state = r.state;
      for (const f of r.fills) if (f.playerId === PRACTICE_ID) fills.push(f);
      for (const e of r.events) if (PUBLIC_EVENTS.has(e.type)) announcements.push(e);
    }
    return { tick: this.state.tick, fills, announcements };
  }

  /** Step through as many calls as it takes to reach `ticks` more ticks (or the limit). Returns the tick reached. */
  advance(ticks: number): number {
    if (!Number.isInteger(ticks) || ticks < 0) throw new SandboxError('bad-ticks');
    const chunk = SANDBOX.maxStepDays * this.ticksPerDay;
    let left = ticks;
    while (left > 0 && !this.complete) {
      const n = Math.min(left, chunk);
      this.step(n);
      left -= n;
    }
    return this.tick;
  }

  /**
   * Apply one order command at the current tick. Place orders are always logged (they are accepted or rejected
   * by the engine, and either way they change the book). A cancel is logged only when it cancels an open order.
   */
  act(raw: unknown): ActResult {
    const cmd = parseCommand(raw);
    if (this.complete) return { ok: false, reason: 'run-complete', orderId: null };
    if (cmd.type === 'place') {
      const r = placeOrder(this.state, { ...cmd.order, playerId: PRACTICE_ID });
      this.state = r.state;
      this.log.push({ tick: this.state.tick, command: cmd });
      return { ok: r.order.status !== 'rejected', reason: r.order.rejectReason ?? null, orderId: r.order.id };
    }
    const before = this.state;
    try {
      this.state = cancelOrder(before, PRACTICE_ID, cmd.orderId);
    } catch {
      return { ok: false, reason: 'unknown-order', orderId: cmd.orderId };
    }
    if (this.state === before) return { ok: false, reason: 'not-open', orderId: cmd.orderId };
    this.log.push({ tick: this.state.tick, command: cmd });
    return { ok: true, reason: null, orderId: cmd.orderId };
  }

  /** What the practice account sees. */
  view(): SandboxView {
    const p = portfolio(this.state, PRACTICE_ID);
    const acct = this.state.accounts[PRACTICE_ID]!;
    const equity = equityOf(this.state, acct);
    return {
      tick: this.state.tick,
      day: Math.floor(this.state.tick / this.state.config.ticksPerDay),
      targetTicks: this.targetTicks,
      limitTicks: this.limitTicks,
      complete: this.complete,
      startingCash: acct.startingCash,
      equity,
      returnPct: acct.startingCash > 0 ? equity / acct.startingCash - 1 : 0,
      portfolio: p,
      openOrders: openOrders(this.state, PRACTICE_ID),
    };
  }

  /** Public market: the two index levels and every listed price. Same numbers every player sees. */
  market(): MarketSnapshot {
    const prices: Record<string, number> = {};
    for (const a of this.state.config.assets) {
      if (a.delisted) continue;
      const i = assetIndex(this.state, a.id);
      if (i >= 0) prices[a.id] = Math.exp(this.state.assets[i]!.lnP);
    }
    return {
      tick: this.state.tick,
      gx: indexLevel(this.state, SANDBOX.indexGx),
      crypto: indexLevel(this.state, SANDBOX.indexCrypto),
      prices,
    };
  }

  /** Listed assets with their class, for the scenario checks and the UI's asset list. */
  listAssets(): { id: string; assetClass: AssetClass }[] {
    return this.state.config.assets.filter((a) => !a.delisted).map((a) => ({ id: a.id, assetClass: a.assetClass }));
  }

  /** A digest of the whole sandbox world. Equal digests mean equal states (replay checks use it). */
  digest(): string {
    // the config is fixed by the engine version and the plan, so it is left out of the state text
    const rest: Partial<WorldState> = { ...this.state };
    delete rest.config;
    return hash16(JSON.stringify(rest));
  }

  /** The run's commands and the digest at its last tick, as plain data (see runfile.ts for the file format). */
  snapshotLog(): { ticks: number; commands: RunEntry[]; digest: string } {
    return { ticks: this.state.tick, commands: this.log.map((e) => ({ tick: e.tick, command: e.command })), digest: this.digest() };
  }

  /** Replay step used by the importer: steps exactly `ticks` ticks, ignoring the target cap. */
  replayStep(ticks: number): void {
    for (let k = 0; k < ticks; k++) this.state = engineStep(this.state).state;
  }

  /** Replay apply used by the importer: the command must be logged (a rejected place still is; see act). */
  replayAct(entry: RunEntry): void {
    const logged = this.log.length;
    const r = this.act(entry.command);
    if (this.log.length !== logged + 1) throw new SandboxError('replay-rejected', r.reason ?? 'not logged');
  }
}

/**
 * Validate one command from the UI or a run file. Strict: unknown keys, a player id, or an out-of-range number are
 * refused, and the result is a fresh object built from the accepted fields only.
 */
export function parseCommand(raw: unknown): SandboxCommand {
  const o = plainObject(raw, 'bad-command');
  if (o.type === 'cancel') {
    onlyKeys(o, ['type', 'orderId'], 'bad-command');
    if (typeof o.orderId !== 'string' || !ORDER_ID.test(o.orderId)) throw new SandboxError('bad-command', 'order id');
    return { type: 'cancel', orderId: o.orderId };
  }
  if (o.type === 'place') {
    onlyKeys(o, ['type', 'order'], 'bad-command');
    return { type: 'place', order: parseOrder(o.order) };
  }
  throw new SandboxError('bad-command', 'type');
}

function parseOrder(raw: unknown): PlaceOrder {
  const o = plainObject(raw, 'bad-command');
  onlyKeys(o, PLACE_KEYS, 'bad-command');
  if (typeof o.assetId !== 'string' || !ASSET_ID.test(o.assetId)) throw new SandboxError('bad-command', 'asset');
  if (typeof o.side !== 'string' || !SIDES.includes(o.side)) throw new SandboxError('bad-command', 'side');
  if (typeof o.type !== 'string' || !ORDER_TYPES.includes(o.type)) throw new SandboxError('bad-command', 'type');
  const qty = num(o.qty, 'qty', SANDBOX.minOrderQty, SANDBOX.maxOrderQty);
  const out: PlaceOrder = {
    assetId: o.assetId,
    side: o.side as PlaceOrder['side'],
    type: o.type as PlaceOrder['type'],
    qty,
  };
  const price = (v: unknown, field: string) => num(v, field, SANDBOX.minOrderPrice, SANDBOX.maxOrderPrice);
  if (o.limitPrice !== undefined) out.limitPrice = price(o.limitPrice, 'limitPrice');
  if (o.stopPrice !== undefined) out.stopPrice = price(o.stopPrice, 'stopPrice');
  if (o.trailPct !== undefined) out.trailPct = num(o.trailPct, 'trailPct', SANDBOX.minTrailPct, SANDBOX.maxTrailPct);
  if (o.takeProfit !== undefined) out.takeProfit = num(o.takeProfit, 'takeProfit', SANDBOX.minOrderPrice, SANDBOX.maxTakeProfitOrStop);
  if (o.stopLoss !== undefined) out.stopLoss = num(o.stopLoss, 'stopLoss', SANDBOX.minOrderPrice, SANDBOX.maxTakeProfitOrStop);
  if (o.tif !== undefined) {
    if (typeof o.tif !== 'string' || !TIFS.includes(o.tif)) throw new SandboxError('bad-command', 'tif');
    out.tif = o.tif as 'day' | 'gtc';
  }
  if (o.reduceOnly !== undefined) {
    if (typeof o.reduceOnly !== 'boolean') throw new SandboxError('bad-command', 'reduceOnly');
    out.reduceOnly = o.reduceOnly;
  }
  return out;
}

function num(v: unknown, field: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new SandboxError('bad-command', field);
  return v;
}

/** A plain JSON object (not an array, not null, no class prototype). */
export function plainObject(raw: unknown, code: SandboxErrorCode): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SandboxError(code);
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) throw new SandboxError(code);
  return raw as Record<string, unknown>;
}

/** Refuse any key outside `allowed` (this is also what stops a file from smuggling a player id or a prototype key). */
export function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], code: SandboxErrorCode): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new SandboxError(code, `field ${k}`);
}

/**
 * 16 hex digits from two 32-bit string hashes (cyrb53-style mixing). It detects edits and accidental corruption of a
 * run file. It is not a signature: a forged file that is re-run gets a matching digest.
 */
export function hash16(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h2 >>> 15), 2246822507) ^ Math.imul(h2 ^ (h1 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h2 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
