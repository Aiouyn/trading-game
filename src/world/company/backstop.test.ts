import { describe, expect, it, vi } from 'vitest';
import { applyCommand, createGame } from '../game';
import { credit, newOutput, TPD } from '../core';
import { courtTick } from '../court';
import { companyDay } from './bridge';
import { insiderBackstop } from './backstop';
import { addSurveillance } from './failure';
import { linkOwner } from './owners';
import { COMPANY } from '@/content/company';
import type { GameState } from '../types';

// Each case runs the day step and the court: give them room under a parallel run.
vi.setConfig({ testTimeout: 60_000 });

/** A world with a founder (R3, funded) and a victim who holds the stock of the company's listed asset. */
function world(seed: string): { g: GameState; assetId: string; companyId: string } {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const [id, handle] of [['m', 'founder_one'], ['v', 'victim_one']]) {
    const r = applyCommand(g, id, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  g.market = { ...g.market, tick: 1 };
  for (const id of ['m', 'v']) {
    g.players[id]!.joinedTick = -1000 * TPD;
    g.players[id]!.lastSeenTick = 1;
  }
  g.players.m!.rankId = 'R3';
  credit(g, 'm', 2_000_000, 'test');
  credit(g, 'v', 500_000, 'test');
  const r = applyCommand(g, 'm', { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(r.error);
  const companyId = (r.data as { id: string }).id;
  // the listed stock is a company stock (valueSource company), as the listing makes it; the engine settles it on delisting
  const first = g.market.config.assets[0]!;
  const assetId = first.id;
  g.market.config = { ...g.market.config, assets: [{ ...first, valueSource: 'company' }, ...g.market.config.assets.slice(1)] };
  g.companies!.companies[companyId]!.listed = { assetId, ipoDay: 0, sharesOut: 1_000_000, floatShares: 500_000 };
  g.market.accounts.v!.positions[assetId] = { qty: 100, avgCost: 10, realizedPnl: 0 };
  return { g, assetId, companyId };
}

/** The first tick of a game day (today() is floor((tick - 1) / TPD)). */
function atDay(g: GameState, day: number): void {
  g.market = { ...g.market, tick: day * TPD + 1 };
}

describe('the insider backstop (spec 6.2, the court insider case)', () => {
  it('below the civil bar nothing is filed', () => {
    const { g, companyId } = world('backstop-low');
    addSurveillance(g.companies!, 'm', companyId, COMPANY.failure.insiderBar - 1, 'window');
    for (let d = 2; d < 40; d++) {
      atDay(g, d);
      insiderBackstop(g, newOutput());
    }
    expect(Object.values(g.court.cases)).toHaveLength(0);
  });

  it('above the bar, odds rise with the points and a case is filed on a keyed draw, against the insider, by the victim', () => {
    const { g, companyId } = world('backstop-open');
    addSurveillance(g.companies!, 'm', companyId, 60, 'related supply priced out of band');
    let opened = 0;
    for (let d = 2; d < 80 && opened === 0; d++) {
      atDay(g, d);
      insiderBackstop(g, newOutput());
      opened = Object.keys(g.court.cases).length;
    }
    expect(opened).toBe(1);
    const c = Object.values(g.court.cases)[0]!;
    expect(c.kind).toBe('insider');
    expect(c.plaintiffId).toBe('v');
    expect(c.defendantId).toBe('m');
    expect(c.evidence).toBe(60);
    expect(c.bar).toBe(40);
    expect(g.companies!.insider?.m?.points).toBe(0);
  });

  it('with no victim holding the stock, the backstop waits and files nothing', () => {
    const { g, assetId, companyId } = world('backstop-novictim');
    delete g.market.accounts.v!.positions[assetId];
    addSurveillance(g.companies!, 'm', companyId, 80, 'plan abuse');
    for (let d = 2; d < 60; d++) {
      atDay(g, d);
      insiderBackstop(g, newOutput());
    }
    expect(Object.values(g.court.cases)).toHaveLength(0);
    expect(g.companies!.insider?.m?.points).toBe(80);
  });

  it('a filed insider case runs through the court to a verdict at its hearing', () => {
    const { g, companyId } = world('backstop-verdict');
    addSurveillance(g.companies!, 'm', companyId, 80, 'related supply priced out of band');
    const out = newOutput();
    let c: GameState['court']['cases'][string] | undefined;
    for (let d = 2; d < 80 && !c; d++) {
      atDay(g, d);
      insiderBackstop(g, out);
      c = Object.values(g.court.cases)[0];
    }
    expect(c).toBeDefined();
    g.market = { ...g.market, tick: c!.hearingTick };
    courtTick(g, out);
    expect(['won', 'lost', 'dismissed']).toContain(g.court.cases[c!.id]!.status);
  });
});

describe('the bridge: the CEO freeze, the bid route and the bankruptcy delisting', () => {
  it('a CEO change freezes the departing CEO and every account of its owner set (spec 9.1), and no other', () => {
    const { g, companyId } = world('bridge-freeze');
    // an alt of the founder (linked) and an unrelated account
    linkOwner(g.companies!, 'alt', 'm');
    atDay(g, 5);
    const r = applyCommand(g, 'm', { type: 'company.act', companyId, action: { kind: 'changeCEO', successor: { kind: 'npc' } } });
    expect(r.ok).toBe(true);
    // announced on day 5, effective on day 15, and the departing CEO is frozen to day 5 + 10 + 21
    expect(g.market.restrictions?.freezes?.m).toBe(36);
    expect(g.market.restrictions?.freezes?.alt).toBe(36);
    expect(g.market.restrictions?.freezes?.v).toBeUndefined();
  });

  it('a linked alt that holds the largest long is never the plaintiff: the victim is outside the insider owner set', () => {
    const { g, assetId, companyId } = world('backstop-alt');
    // the alt is a player of the founder's owner set, and it holds more of the stock than the real victim
    const alt = applyCommand(g, 'a', { type: 'join', handle: 'alt_one', country: 'AV' });
    expect(alt.ok).toBe(true);
    g.players.a!.joinedTick = -1000 * TPD;
    g.players.a!.lastSeenTick = 1;
    g.market.accounts.a!.positions[assetId] = { qty: 900, avgCost: 10, realizedPnl: 0 };
    linkOwner(g.companies!, 'a', 'm');
    addSurveillance(g.companies!, 'm', companyId, 80, 'related supply priced out of band');
    let c: GameState['court']['cases'][string] | undefined;
    for (let d = 2; d < 80 && !c; d++) {
      atDay(g, d);
      insiderBackstop(g, newOutput());
      c = Object.values(g.court.cases)[0];
    }
    expect(c).toBeDefined();
    expect(c!.plaintiffId).toBe('v');
  });

  it('a bid on a company that is not listed returns the structured refusal (code and copy keys)', () => {
    const { g, companyId } = world('bridge-bid');
    g.companies!.companies[companyId]!.listed = null;
    const r = applyCommand(g, 'v', { type: 'company.bid', companyId, price: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('takeoverNotListed');
      expect(r.data).toEqual({ code: 'takeoverNotListed' });
    }
  });

  it('the daily tape keeps the engine bar of the day that just closed, once per day (the pre-attack floor reads it)', () => {
    const { g, assetId, companyId } = world('bridge-tape');
    const idx = g.market.assets.findIndex((a) => a.id === assetId);
    g.market.assets[idx] = { ...g.market.assets[idx]!, bars: [{ c: 7, n: 0, u: 300 }] };
    atDay(g, 5);
    companyDay(g, newOutput());
    expect(g.companies!.tape?.[companyId]).toEqual([{ day: 4, c: 7, u: 300 }]);
    companyDay(g, newOutput());
    expect(g.companies!.tape?.[companyId]).toHaveLength(1);
  });

  it('a default on a listed company delists its stock through the engine and closes its book', () => {
    const { g, assetId, companyId } = world('bridge-default');
    const c = g.companies!.companies[companyId]!;
    c.cash = -1_000_000_000;
    const out = newOutput();
    let delisted = false;
    for (let d = 1; d <= 40 && !delisted; d++) {
      atDay(g, d);
      companyDay(g, out);
      delisted = g.market.config.assets.find((a) => a.id === assetId)?.delisted === true;
    }
    expect(c.bankrupt).not.toBeNull();
    expect(c.listed).toBeNull();
    expect(delisted).toBe(true);
    expect(g.market.accounts.v!.positions[assetId]?.qty ?? 0).toBe(0);
  });
});
