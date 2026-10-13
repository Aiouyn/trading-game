import { describe, expect, it, vi } from 'vitest';
import { touchLinks } from '../collusion';
import { applyCommand, createGame } from '../game';
import { newOutput, priceOf, TPD } from '../core';
import { courtTick } from '../court';
import { equityOf, grossExposure, openAccount, Rng, seedStream, step, universeConfig, type Fill, type WorldConfig } from '@/engine';
import { shockPrice } from '@/engine/sim';
import type { GameState, Player } from '../types';
import { applyFundCommand, fundsBeforeStep, fundsDay, fundsFills } from './index';
import { fundClaimsOf, fundEquity, navOf, controllerOf, isFundAccount, unitsOf } from './state';
import { linked } from './link';
import { mandateAt } from './rules';
import type { Fund, FundMandate } from './types';

/**
 * The funds property test (ROADMAP 2.2 acceptance): 10,000 seeded random action sequences over a manager, three investors,
 * and a reduced market. Every engine step goes through the world's pre-step guard (funds/guard.ts), as the game's does. After
 * every action the test checks the custody and accounting invariants:
 *   1. no negative units, payables, fees or requests, and the reserved units equal the redemption requests;
 *   2. NAV accounting is conserved: the claims of every holder (units at NAV, deposits waiting, payouts owed, the manager's
 *      fees) add up to the fund's equity;
 *   3. the manager's cash rises only by what the fund paid him (his own redemption and crystallized fees), never by investor
 *      money: an action that is not a personal trade or a market tick may raise his cash by no more than the fund's payouts
 *      to him. A fund fill never matches a linked account (the related-party rule), so no fill can pay him from the fund;
 *   4. an investor's cash rises only by what the fund owes them (or a victim-fund credit from a verdict);
 *   5. the mandate caps hold for every accepted buy: the position (open buys included) at most the mandate's share of NAV, and
 *      gross exposure (open buys included) at most the leverage limit;
 *   6. related party: before every engine step no open fund order stands opposite an open order of a linked controller;
 *   7. cash conservation: a command that only moves money between accounts (open, deposit, redeem, mandate, orders) leaves the
 *      total cash of every account unchanged.
 * A fixed subset of sequences is replayed and must give the same state (the replay rule).
 */

vi.setConfig({ testTimeout: 600_000 });

const SEQUENCES = 10_000;
const ACTIONS = 12;
const REPLAYS = 200;
const EPS = 1e-6;
const TOL = 1e-4;
const IDS = ['m', 'i1', 'i2', 'i3'];
const ALLY = 'AL-PROP';

/** A reduced market: four stocks and one each of crypto, bond and commodity. The fund's rules do not depend on the count. */
const SMALL: WorldConfig = (() => {
  const full = universeConfig({});
  const pick = (cls: string, n: number) => full.assets.filter((a) => a.assetClass === cls && a.listed !== false).slice(0, n);
  return { ...full, assets: [...pick('stock', 4), ...pick('crypto', 1), ...pick('bond', 1), ...pick('commodity', 1)], indices: [] };
})();

/** A player record to clone (the join command makes it on the full universe, which has the index the join needs). */
const TEMPLATE: Player = (() => {
  const g = createGame('funds-template', { warmupDays: 0, npcs: false });
  const r = applyCommand(g, 'tpl', { type: 'join', handle: 'template_one', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  return g.players.tpl!;
})();

type Kind = 'create' | 'deposit' | 'redeem' | 'fundTrade' | 'ptrade' | 'mandate' | 'tick' | 'day' | 'shock' | 'crash' | 'longAway'
  | 'present' | 'ally' | 'allyOrder' | 'fundRest';
const KINDS: { kind: Kind; weight: number }[] = [
  { kind: 'create', weight: 12 }, { kind: 'deposit', weight: 20 }, { kind: 'redeem', weight: 12 }, { kind: 'fundTrade', weight: 15 },
  { kind: 'ptrade', weight: 10 }, { kind: 'mandate', weight: 4 }, { kind: 'tick', weight: 10 }, { kind: 'day', weight: 10 },
  { kind: 'shock', weight: 5 }, { kind: 'crash', weight: 2 }, { kind: 'longAway', weight: 3 }, { kind: 'present', weight: 3 },
  { kind: 'ally', weight: 3 }, { kind: 'allyOrder', weight: 6 }, { kind: 'fundRest', weight: 5 },
];
const TOTAL = KINDS.reduce((s, k) => s + k.weight, 0);

/** The actions that only move money between accounts (no engine step, no day close): their cash must balance exactly. */
const COMMAND_KINDS: ReadonlySet<Kind> = new Set<Kind>(['create', 'deposit', 'redeem', 'mandate', 'ptrade', 'ally', 'allyOrder', 'fundRest']);

function pickKind(rng: Rng): Kind {
  let x = rng.uniform() * TOTAL;
  for (const k of KINDS) {
    if (x < k.weight) return k.kind;
    x -= k.weight;
  }
  return 'tick';
}

function randomMandate(rng: Rng): FundMandate {
  const all = ['stock', 'crypto', 'bond', 'commodity'];
  const classes = all.filter(() => rng.uniform() < 0.6);
  return {
    classes: classes.length ? classes : ['stock'],
    maxLeverage: [1, 1.25, 1.5][Math.floor(rng.uniform() * 3)]!,
    maxPositionPct: [0.1, 0.2][Math.floor(rng.uniform() * 2)]!,
  };
}

/** One sequence: a fresh market, the accounts, and ACTIONS random actions, each followed by the invariant checks. */
export function runSequence(seq: number, tally: Tally | null): string {
  const rng = new Rng(seedStream('funds-property', `seq-${seq}`));
  const g: GameState = createGame(`pf-${seq}`, { warmupDays: 0, npcs: false, config: SMALL });
  g.market = { ...g.market, tick: 1 };
  for (const id of IDS) {
    g.market = openAccount(g.market, id, id === 'm' ? 3_000_000 : 300_000);
    g.players[id] = { ...structuredClone(TEMPLATE), id, handle: `p_${id}`, joinedTick: -1000 * TPD, lastSeenTick: 1, rankId: id === 'm' ? 'R3' : 'R0', allianceId: null };
    touchLinks(g);
  }
  const assets = g.market.config.assets.map((a) => a.id);
  const fundOf = (): Fund | undefined => {
    const all = Object.values(g.funds?.funds ?? {});
    return all.find((f) => f.status !== 'closed') ?? all[all.length - 1];
  };

  opening(g, seq, tally);
  for (let a = 0; a < ACTIONS; a++) {
    const kind = pickKind(rng);
    const snap = snapshot(g);
    const cashBefore = cashSum(g);
    let ok: boolean | null = null;

    switch (kind) {
      case 'create': {
        const r = applyFundCommand(g, 'm', {
          type: 'fund.create', name: 'Prop Fund', mandate: randomMandate(rng),
          fees: { mgmt: [0, 0.01, 0.02][Math.floor(rng.uniform() * 3)]!, perf: [0, 0.1, 0.2][Math.floor(rng.uniform() * 3)]! },
          stake: [250_000, 300_000, 400_000][Math.floor(rng.uniform() * 3)]!,
        }, null);
        ok = r.ok;
        if (r.ok && tally) tally.created++;
        break;
      }
      case 'deposit': {
        const f = fundOf();
        if (!f) break;
        const pid = IDS[Math.floor(rng.uniform() * IDS.length)]!;
        const r = applyFundCommand(g, pid, { type: 'fund.deposit', fundId: f.id, amount: 100 + rng.uniform() * 150_000 }, null);
        ok = r.ok;
        break;
      }
      case 'redeem': {
        const f = fundOf();
        if (!f) break;
        const pid = IDS[Math.floor(rng.uniform() * IDS.length)]!;
        const held = f.holders[pid] ?? 0;
        if (held <= 0) break;
        const r = applyFundCommand(g, pid, { type: 'fund.redeem', fundId: f.id, units: held * (rng.chance(0.3) ? 1 : rng.uniform()) }, null);
        ok = r.ok;
        break;
      }
      case 'fundTrade': {
        const f = fundOf();
        if (!f) break;
        const assetId = assets[Math.floor(rng.uniform() * assets.length)]!;
        const isStock = g.market.config.assets.find((x) => x.id === assetId)!.assetClass === 'stock';
        const qty = isStock ? 1 + Math.floor(rng.uniform() * 800) : 0.001 + rng.uniform() * 40;
        const limit = rng.chance(0.2);
        const side = rng.chance(0.6) ? 'buy' : 'sell';
        const px = priceOf(g, assetId);
        const r = applyFundCommand(g, 'm', {
          type: 'fund.trade', fundId: f.id, assetId, side, qty,
          ...(limit ? { orderType: 'limit' as const, limitPrice: px * (0.97 + rng.uniform() * 0.06) } : {}),
        }, null);
        ok = r.ok;
        if (r.ok) {
          if (side === 'buy') checkCaps(g, f, assetId);
          // the order is queued: no money has moved yet, and the step below is the engine's own
          must(Math.abs(cashSum(g) - cashBefore) < EPS, `${kind}: the queued order moved cash`);
          worldTick(g);
          // the engine's own cash moves (the manager's personal dividends and fills) are not fund payouts: re-baseline him
          snap.cash0.m = g.market.accounts.m!.cash;
        }
        break;
      }
      case 'ptrade': {
        const assetId = assets[Math.floor(rng.uniform() * assets.length)]!;
        const isStock = g.market.config.assets.find((x) => x.id === assetId)!.assetClass === 'stock';
        const r = applyCommand(g, 'm', { type: 'order.place', order: { assetId, side: rng.chance(0.5) ? 'buy' : 'sell', type: 'market', qty: isStock ? 1 + Math.floor(rng.uniform() * 20) : 0.01 } });
        ok = r.ok;
        break;
      }
      case 'mandate': {
        const f = fundOf();
        if (!f) break;
        const r = applyFundCommand(g, 'm', { type: 'fund.mandate', fundId: f.id, mandate: randomMandate(rng) }, null);
        ok = r.ok;
        break;
      }
      case 'tick': {
        const n = 1 + Math.floor(rng.uniform() * 3);
        for (let k = 0; k < n; k++) worldTick(g);
        break;
      }
      case 'day': {
        const n = 1 + Math.floor(rng.uniform() * 2);
        for (let k = 0; k < n; k++) advanceDay(g, rng.chance(0.85));
        break;
      }
      case 'shock': {
        const assetId = assets[Math.floor(rng.uniform() * assets.length)]!;
        g.market = shockPrice(g.market, assetId, (rng.uniform() - 0.5) * 0.4);
        break;
      }
      case 'crash': {
        // a stress crash (a test scenario, not a forecast): every asset drops by 45% to 70%
        for (const assetId of assets) g.market = shockPrice(g.market, assetId, -(0.45 + 0.25 * rng.uniform()));
        break;
      }
      case 'longAway': {
        const n = 60 + Math.floor(rng.uniform() * 30);
        for (let k = 0; k < n; k++) advanceDay(g, false);
        break;
      }
      case 'present': {
        g.players.m!.lastSeenTick = g.market.tick; // the presence command runs contract rolls, which need the full index
        break;
      }
      case 'ally': {
        // the manager and the investor i3 become alliance mates, or part again: the rule must hold across the change
        const al = g.players.m!.allianceId ? null : ALLY;
        g.players.m!.allianceId = al;
        touchLinks(g);
        g.players.i3!.allianceId = al;
        touchLinks(g);
        ok = true;
        break;
      }
      case 'fundRest': {
        // the fund rests a sell of a held position far above the market: it stays open, so a linked order can meet it
        const f = fundOf();
        if (!f) break;
        const held = Object.entries(g.market.accounts[f.accountId]?.positions ?? {}).filter(([, p]) => p.qty > 0);
        if (held.length === 0) break;
        const [assetId, pos] = held[Math.floor(rng.uniform() * held.length)]!;
        const r = applyFundCommand(g, 'm', {
          type: 'fund.trade', fundId: f.id, assetId, side: 'sell', qty: pos.qty, orderType: 'limit', limitPrice: priceOf(g, assetId) * (3 + rng.uniform()),
        }, null);
        ok = r.ok;
        break;
      }
      case 'allyOrder': {
        // i3 rests a buy far below the market (it never fills); when linked to the manager it may not stand opposite a fund order
        const assetId = assets[Math.floor(rng.uniform() * assets.length)]!;
        const isStock = g.market.config.assets.find((x) => x.id === assetId)!.assetClass === 'stock';
        const px = priceOf(g, assetId);
        const r = applyCommand(g, 'i3', {
          type: 'order.place', order: { assetId, side: 'buy', type: 'limit', qty: isStock ? 1 : 0.01, limitPrice: px * 0.01 },
        });
        ok = r.ok;
        if (tally && !r.ok && r.error === 'fundSelfMatch') tally.refusedLinked++;
        break;
      }
    }
    if (tally && ok !== null) tally.ok[kind] = (tally.ok[kind] ?? 0) + (ok ? 1 : 0);
    if (COMMAND_KINDS.has(kind)) must(Math.abs(cashSum(g) - cashBefore) < EPS, `action ${kind}: total cash moved by a transfer-only command`);

    check(g, kind, snap);
  }

  if (tally) {
    for (const f of Object.values(g.funds?.funds ?? {})) {
      if (f.status === 'frozen') tally.frozen++;
      if (f.status === 'winding' || f.status === 'closed') tally.winding++;
      if (f.breakerUntil > 0) tally.breakers++;
      if (f.caseId) tally.cases++;
      if (f.managerReceived > 0) tally.managerPaid++;
      if (Object.values(f.holders).some((u) => u > 0)) tally.depositsHeld++;
    }
  }
  return JSON.stringify({ funds: g.funds ?? null, cash: IDS.map((id) => g.market.accounts[id]!.cash), victim: g.economy.faucets['victim fund'] ?? 0 });
}

/** The total cash of every account in the market (investors, the manager, and every fund's custody account). */
function cashSum(g: GameState): number {
  return Object.values(g.market.accounts).reduce((s, a) => s + a.cash, 0);
}

/** One engine tick the way the game runs it: the pre-step guard first (after its own check), then the step and the fund fill hook. */
function worldTick(g: GameState): Fill[] {
  fundsBeforeStep(g, null);
  checkNoLinkedCross(g);
  const t = step(g.market);
  g.market = t.state;
  fundsFills(g, t.fills, null);
  return t.fills;
}

/** Invariant 6: no open fund order stands opposite an open order of a controller linked to the fund's manager. */
function checkNoLinkedCross(g: GameState): void {
  for (const o of g.market.orders) {
    if (o.status !== 'open' || !isFundAccount(o.playerId)) continue;
    const f = Object.values(g.funds?.funds ?? {}).find((x) => x.accountId === o.playerId);
    if (!f) continue;
    for (const p of g.market.orders) {
      if (p.status !== 'open' || p.assetId !== o.assetId || p.side === o.side || p.playerId === o.playerId) continue;
      must(!linked(g, controllerOf(g, p.playerId), f.managerId), `related party: fund ${f.id} order ${o.id} opposite linked order ${p.id}`);
    }
  }
}

/** Invariant 5, after an accepted buy: the position and the gross exposure, with every open buy of the fund counted. */
function checkCaps(g: GameState, f: Fund, assetId: string): void {
  const mandate = mandateAt(f, g.market.tick);
  const acct = g.market.accounts[f.accountId]!;
  const px = priceOf(g, assetId);
  const held = acct.positions[assetId]?.qty ?? 0;
  let openBuy = 0;
  let grossBuy = 0;
  for (const o of g.market.orders) {
    if (o.status !== 'open' || o.playerId !== f.accountId || o.side !== 'buy') continue;
    const rem = Math.max(0, o.qty - o.filledQty);
    grossBuy += rem * priceOf(g, o.assetId);
    if (o.assetId === assetId) openBuy += rem;
  }
  const nav = Math.max(0, navOf(g, f));
  must((held + openBuy) * px <= mandate.maxPositionPct * nav + TOL, `caps: ${assetId} at ${(held + openBuy) * px} above ${mandate.maxPositionPct} of NAV ${nav}`);
  const gross = grossExposure(g.market, acct) + grossBuy;
  must(gross <= mandate.maxLeverage * equityOf(g.market, acct) + TOL, `caps: gross ${gross} above ${mandate.maxLeverage}x equity`);
}

/** A snapshot of the baselines the checks compare against (taken before a step, checked after it). */
function snapshot(g: GameState): Snapshot {
  return {
    cash0: Object.fromEntries(IDS.map((id) => [id, g.market.accounts[id]!.cash])),
    received0: sumOf(g, (f) => f.managerReceived),
    paid0: Object.fromEntries(IDS.map((id) => [id, sumOf(g, (f) => f.paidOut[id] ?? 0)])),
    victim0: g.economy.faucets['victim fund'] ?? 0,
  };
}

/** One scripted step of an opening, checked like a random action. */
function scripted(g: GameState, kind: Kind, run: (snap: Snapshot) => void): void {
  const snap = snapshot(g);
  run(snap);
  check(g, kind, snap);
}

/** An accepted fund order, then one market tick so it can fill (the manager's cash is re-baselined past the engine's own moves). */
function fillFundOrder(g: GameState, snap: Snapshot, fundId: string, assetId: string, qty: number, side: 'buy' | 'sell'): boolean {
  const r = applyFundCommand(g, 'm', { type: 'fund.trade', fundId, assetId, side, qty }, null);
  if (!r.ok) return false;
  worldTick(g);
  snap.cash0.m = g.market.accounts.m!.cash;
  return true;
}

/**
 * The two scripted openings. Random play alone rarely builds a fund with heavy positions or a front-running pattern, so
 * every 20th sequence opens with a stress crash on a 1.5x stock fund (the breaker), and every 25th with a manager who trades
 * ahead of his fund (front-running). Each step is checked the same way as a random action.
 */
function opening(g: GameState, seq: number, tally: Tally | null): void {
  if (seq % 20 === 0) {
    scripted(g, 'create', () => applyFundCommand(g, 'm', {
      type: 'fund.create', name: 'Stress Fund', mandate: { classes: ['stock'], maxLeverage: 1.5, maxPositionPct: 0.2 },
      fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000,
    }, null));
    const f = Object.values(g.funds?.funds ?? {})[0];
    if (!f) return;
    scripted(g, 'deposit', () => applyFundCommand(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 50_000 }, null));
    scripted(g, 'day', () => advanceDay(g, true));
    const stocks = g.market.config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false).slice(0, 4).map((a) => a.id);
    for (const s of stocks) {
      scripted(g, 'fundTrade', (snap) => {
        const nav = navOf(g, f);
        fillFundOrder(g, snap, f.id, s, Math.max(1, Math.floor((0.19 * nav) / priceOf(g, s))), 'buy');
      });
    }
    scripted(g, 'crash', () => { for (const a of g.market.config.assets.map((x) => x.id)) g.market = shockPrice(g.market, a, -0.55); });
    scripted(g, 'day', () => advanceDay(g, true));
  } else if (seq % 25 === 1) {
    scripted(g, 'create', () => applyFundCommand(g, 'm', {
      type: 'fund.create', name: 'Ahead Fund', mandate: { classes: ['stock'], maxLeverage: 1, maxPositionPct: 0.2 },
      fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000,
    }, null));
    const f = Object.values(g.funds?.funds ?? {})[0];
    if (!f) return;
    scripted(g, 'deposit', () => applyFundCommand(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 50_000 }, null));
    scripted(g, 'day', () => advanceDay(g, true));
    const s = g.market.config.assets.find((a) => a.assetClass === 'stock' && a.listed !== false)!.id;
    for (let k = 0; k < 2; k++) {
      scripted(g, 'ptrade', () => {
        applyCommand(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } });
        worldTick(g);
      });
      scripted(g, 'shock', () => { g.market = shockPrice(g.market, s, 0.05); });
      scripted(g, 'fundTrade', (snap) => { fillFundOrder(g, snap, f.id, s, 1, 'buy'); });
    }
  } else if (seq % 9 === 4) {
    // a resting fund sell, then an alliance with the investor i3, whose resting buy is refused at entry; the next tick cancels
    // the fund's sell before the engine can match it
    scripted(g, 'create', () => applyFundCommand(g, 'm', {
      type: 'fund.create', name: 'Linked Fund', mandate: { classes: ['stock'], maxLeverage: 1, maxPositionPct: 0.2 },
      fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000,
    }, null));
    const f = Object.values(g.funds?.funds ?? {})[0];
    if (!f) return;
    scripted(g, 'deposit', () => applyFundCommand(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 50_000 }, null));
    scripted(g, 'day', () => advanceDay(g, true));
    const s = g.market.config.assets.find((a) => a.assetClass === 'stock' && a.listed !== false)!.id;
    scripted(g, 'fundTrade', (snap) => { fillFundOrder(g, snap, f.id, s, 1, 'buy'); });
    // i3 rests a buy while unlinked; the fund rests a sell opposite it (allowed: not linked yet)
    scripted(g, 'allyOrder', () => { applyCommand(g, 'i3', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'limit', qty: 1, limitPrice: priceOf(g, s) * 0.01 } }); });
    scripted(g, 'fundRest', () => { applyFundCommand(g, 'm', {
      type: 'fund.trade', fundId: f.id, assetId: s, side: 'sell', qty: 1, orderType: 'limit', limitPrice: priceOf(g, s) * 5,
    }, null); });
    scripted(g, 'ally', () => { g.players.m!.allianceId = ALLY; g.players.i3!.allianceId = ALLY; touchLinks(g); });
    // a second buy from the newly linked investor is refused at entry while the fund's sell stands
    scripted(g, 'allyOrder', () => {
      const r = applyCommand(g, 'i3', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'limit', qty: 1, limitPrice: priceOf(g, s) * 0.02 } });
      if (!r.ok && r.error === 'fundSelfMatch' && tally) tally.refusedLinked++;
    });
    // the next tick cancels the fund's sell (it stands opposite i3's resting buy, now linked) before the engine can match them
    scripted(g, 'tick', () => {
      worldTick(g);
      must(!g.market.orders.some((o) => o.playerId === f.accountId && o.side === 'sell' && o.status === 'open'), 'the pre-step guard left a linked fund sell open');
    });
  }
}

/** One game day: the clock crosses a day boundary, the day close runs, and the court hears what is due. */
function advanceDay(g: GameState, managerOnline: boolean): void {
  g.market = { ...g.market, tick: g.market.tick + TPD };
  if (managerOnline) g.players.m!.lastSeenTick = g.market.tick;
  const out = newOutput();
  fundsDay(g, out);
  courtTick(g, out);
}

interface Snapshot {
  cash0: Record<string, number>;
  received0: number;
  paid0: Record<string, number>;
  victim0: number;
}

/** The sum of a per-fund figure over every fund of this market (a manager may open a new fund after a closed one). */
function sumOf(g: GameState, pick: (f: Fund) => number): number {
  return Object.values(g.funds?.funds ?? {}).reduce((t, f) => t + pick(f), 0);
}

/** A plain assertion for the hot loop (the vitest expect is too slow for ~120,000 checks): throws with the context. */
function must(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}

/** The invariant checks after one action. Throws (with the action named) on a violation. */
function check(g: GameState, kind: Kind, s: Snapshot): void {
  const tag = `action ${kind}`;
  for (const f of Object.values(g.funds?.funds ?? {})) {
    const units = unitsOf(f);
    const eq = fundEquity(g.market, f);
    for (const [pid, u] of Object.entries(f.holders)) must(u > -EPS, `${tag}: holder ${pid} units ${u}`);
    for (const [pid, u] of Object.entries(f.reserved)) must(u > -EPS, `${tag}: reserved ${pid} ${u}`);
    for (const [pid, v] of Object.entries(f.payable)) must(v > -EPS, `${tag}: payable ${pid} ${v}`);
    must(f.feeAccrued > -EPS, `${tag}: fee accrued ${f.feeAccrued}`);
    must(f.feePayable > -EPS, `${tag}: fee payable ${f.feePayable}`);
    for (const r of f.requests) must(r.units > -EPS && r.amount > -EPS, `${tag}: request ${r.id}`);
    // 1. the reserved units are exactly the redemption requests still open
    const perPid: Record<string, number> = {};
    for (const r of f.requests) if (r.kind === 'redeem') perPid[r.investorId] = (perPid[r.investorId] ?? 0) + r.units;
    for (const pid of new Set([...Object.keys(f.reserved), ...Object.keys(perPid)])) {
      must(Math.abs((f.reserved[pid] ?? 0) - (perPid[pid] ?? 0)) < EPS, `${tag}: reserved ${pid} ${f.reserved[pid]} vs requests ${perPid[pid]}`);
    }
    // 2. NAV accounting is conserved: every claim on the fund adds up to its equity (when units are outstanding)
    if (units > 0) {
      const claims = IDS.reduce((sum, pid) => sum + fundClaimsOf(g, pid), 0);
      must(Math.abs(claims - eq) <= 1e-6 * Math.max(1, Math.abs(eq)), `${tag}: claims ${claims} vs equity ${eq}`);
    }
  }
  // 3. the manager's cash rises only by fund payouts to him; a personal trade or a market tick may move it otherwise
  if (kind !== 'ptrade' && kind !== 'tick') {
    const rise = g.market.accounts.m!.cash - s.cash0.m!;
    const paid = sumOf(g, (x) => x.managerReceived) - s.received0;
    must(rise <= paid + EPS, `${tag}: manager cash rose ${rise} against fund payouts ${paid}`);
  }
  // 3b. the manager is paid no more than the fund owes him: his own redemption value and his crystallized fees
  for (const f of Object.values(g.funds?.funds ?? {})) must(f.managerReceived <= f.managerEntitled + EPS, `${tag}: manager received ${f.managerReceived} above entitled ${f.managerEntitled}`);
  // 4. an investor is paid no more than the fund credited as owed to them, and their cash rises only by what the fund paid
  //    them (or a victim-fund credit from a verdict)
  const victimCredit = (g.economy.faucets['victim fund'] ?? 0) - s.victim0;
  for (const pid of IDS.filter((x) => x !== 'm')) {
    const paidNow = sumOf(g, (x) => x.paidOut[pid] ?? 0);
    must(paidNow <= sumOf(g, (x) => x.credited[pid] ?? 0) + EPS, `${tag}: ${pid} paid ${paidNow} above what was credited`);
    const rise = g.market.accounts[pid]!.cash - s.cash0[pid]!;
    const paidInAction = paidNow - (s.paid0[pid] ?? 0);
    must(rise <= paidInAction + victimCredit + EPS, `${tag}: ${pid} cash rose ${rise} against payouts ${paidInAction}`);
    // the investors place no trades that fill in this market except i3's resting buys, which never fill
    if (pid !== 'i3') must(Object.keys(g.market.accounts[pid]!.positions).length === 0, `${tag}: ${pid} holds a position`);
  }
}

/** Counts of what the sequences reached, so the run is known to exercise the rules (not only the refusals). */
export interface Tally {
  created: number;
  ok: Partial<Record<Kind, number>>;
  frozen: number;
  winding: number;
  breakers: number;
  cases: number;
  managerPaid: number;
  depositsHeld: number;
  refusedLinked: number;
}

describe('funds property test: 10,000 seeded action sequences', () => {
  it('keeps the custody, accounting, cap, related-party and cash invariants after every action, and replays exactly', () => {
    const tally: Tally = { created: 0, ok: {}, frozen: 0, winding: 0, breakers: 0, cases: 0, managerPaid: 0, depositsHeld: 0, refusedLinked: 0 };
    for (let s = 0; s < SEQUENCES; s++) {
      const fingerprint = runSequence(s, tally);
      if (s < REPLAYS) expect(runSequence(s, null), `replay of sequence ${s}`).toBe(fingerprint);
    }
    // the run reached the rules it is meant to test, not only the refusals
    expect(tally.created).toBeGreaterThan(3_000);
    expect(tally.ok.deposit ?? 0).toBeGreaterThan(1_000);
    expect(tally.ok.redeem ?? 0).toBeGreaterThan(500);
    expect(tally.ok.fundTrade ?? 0).toBeGreaterThan(500);
    expect(tally.ok.allyOrder ?? 0).toBeGreaterThan(200);
    expect(tally.refusedLinked).toBeGreaterThan(20);
    expect(tally.frozen).toBeGreaterThan(20);
    expect(tally.winding).toBeGreaterThan(5);
    expect(tally.breakers).toBeGreaterThan(0);
    expect(tally.cases).toBeGreaterThan(0);
    expect(tally.managerPaid).toBeGreaterThan(500);
    expect(tally.depositsHeld).toBeGreaterThan(1_000);
  });
});
