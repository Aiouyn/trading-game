import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import {
  adjustCash, createWorld, defaultConfig, grantLockedShares, listCompanyStock, normalizeLoadings, openAccount,
  type AssetDef, type WorldState,
} from '@/engine';
import { foundCompany, emptyCompanyWorld, type CompanyEnv } from './company';
import { bid, marketShareOf, observeStakes, t0Of, tenderFloor, type BidArgs } from './takeover';
import type { Company, CompanyWorld } from './types';

const TPD = 10;

function coStock(id: string): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'tech', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 1e-7, drift: 0, cycleBeta: 0, wMarket: 0.5, wSector: 0.5, wCrypto: 0,
    halfLifeDays: 1e9, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 1e9, qtyStep: 1, valueSource: 'company',
  } as AssetDef);
}

interface Setup { eng: WorldState; w: CompanyWorld; env: CompanyEnv; target: Company }

/** A listed tech company owned by `founder`, its stock at $1, the founder holding 100 shares and a rival 50. */
function setup(): Setup {
  let eng = createWorld('takeover', defaultConfig({ ticksPerDay: TPD, assets: [], indices: [] }));
  for (const p of ['founder', 'rival', 'bidder', 'npcacq']) eng = openAccount(eng, p, 1_000_000);
  eng = listCompanyStock(eng, coStock('CO'), 1, 1);
  eng = grantLockedShares(eng, 'founder', 'CO', 100, 1, 0);
  eng = grantLockedShares(eng, 'rival', 'CO', 50, 1, 0);
  const money: Record<string, number> = { founder: 1_000_000, rival: 1_000_000, bidder: 1_000_000 };
  const env: CompanyEnv = {
    seed: 'takeover', day: 100, regime: 'expansion', oilLog: 0, rankOf: () => 'R3',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
    },
  };
  const w = emptyCompanyWorld('takeover');
  const r = foundCompany(w, env, 'founder', { name: 'Target', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  const target = w.companies[r.value.id]!;
  target.capTable = { 'founder:founder': 100 };
  target.shares = 100;
  target.listed = { assetId: 'CO', ipoDay: 0, sharesOut: 100, floatShares: 50 };
  return { eng, w, env, target };
}

function args(over: Partial<BidArgs> = {}): BidArgs {
  return {
    companyId: 'co1', bidderId: 'bidder', bidder: { kind: 'player', playerId: 'bidder', sector: 'staples', share: 0 },
    price: 1.5, founderVote: 'yes', covered: ['bidder'], ...over,
  };
}

function totalCash(eng: WorldState): number {
  return Object.values(eng.accounts).reduce((s, a) => s + a.cash, 0);
}

describe('takeover pre-attack T0 and the floor (spec 9.2, X8)', () => {
  it('T0 is the earliest of 63 gd before the announcement, the first net short and the first big sell', () => {
    const { w, target } = setup();
    expect(t0Of(w, target, 'bidder', 100)).toBe(37);
    w.watch = { [target.id]: { bidder: { lastQty: 0, firstShort: 60, bigSell: 45 } } };
    expect(t0Of(w, target, 'bidder', 100)).toBe(37);
    w.watch[target.id]!.bidder = { lastQty: 0, firstShort: 30, bigSell: 45 };
    expect(t0Of(w, target, 'bidder', 100)).toBe(30);
    w.watch[target.id]!.bidder = { lastQty: 0, firstShort: 60, bigSell: 20 };
    expect(t0Of(w, target, 'bidder', 100)).toBe(20);
  });

  it('the watch records the first net short and a sell of over 0.5% of float in one day', () => {
    const { w, target } = setup();
    observeStakes(w, target, { bidder: 0 }, 1000, 10);
    observeStakes(w, target, { bidder: -5 }, 1000, 11);
    expect(w.watch![target.id]!.bidder!.firstShort).toBe(11);
    observeStakes(w, target, { bidder: -5 }, 1000, 12);
    expect(w.watch![target.id]!.bidder!.firstShort).toBe(11);
    // a rise is no sell; a 4-share drop is under 0.5% of a 1,000 float (5 shares); a 60-share drop is over it
    observeStakes(w, target, { bidder: 40 }, 1000, 13);
    expect(w.watch![target.id]!.bidder!.bigSell).toBeUndefined();
    observeStakes(w, target, { bidder: 36 }, 1000, 14);
    expect(w.watch![target.id]!.bidder!.bigSell).toBeUndefined();
    observeStakes(w, target, { bidder: -24 }, 1000, 15);
    expect(w.watch![target.id]!.bidder!.bigSell).toBe(15);
  });

  it('the floor is 1.2 x VWAP30 ending on T0 - 1, not on the latest close', () => {
    const { eng } = setup();
    const i = eng.config.assets.findIndex((a) => a.id === 'CO');
    // 40 closed days: $10 on days 0 to 34 (the window ending on T0 - 1 = 34), $100 after
    const bars = Array.from({ length: 40 }, (_, d) => ({ c: d <= 34 ? 10 : 100, n: 0, u: 100 }));
    const withBars: WorldState = { ...eng, assets: eng.assets.map((a, k) => (k === i ? { ...a, bars } : a)) };
    expect(tenderFloor(withBars, 'CO', 35, 40)).toBeCloseTo(12, 9);
    // the same window on T0 = 40 is the last 30 days, which include the $100 days
    expect(tenderFloor(withBars, 'CO', 40, 40)).toBeGreaterThan(12);
  });
});

describe('takeover bids (spec 9.2, DECISIONS C4)', () => {
  it('refuses a company that is not listed, a self-dealing bidder and a bidder with no account', () => {
    const { eng, w, target } = setup();
    expect(bid(w, eng, 100, args({ companyId: 'nope' }))).toEqual({ ok: false, reject: { code: 'unknownCompany' } });
    target.listed = null;
    expect(bid(w, eng, 100, args())).toEqual({ ok: false, reject: { code: 'takeoverNotListed' } });
    target.listed = { assetId: 'CO', ipoDay: 0, sharesOut: 100, floatShares: 50 };
    expect(bid(w, eng, 100, args({ covered: ['bidder', 'founder'] }))).toEqual({ ok: false, reject: { code: 'takeoverSelfDeal' } });
    expect(bid(w, eng, 100, args({ bidderId: 'nobody' }))).toEqual({ ok: false, reject: { code: 'takeoverNoBidder' } });
  });

  it('antitrust refuses a combined sector share above 60%, and allows it at or below', () => {
    const { eng, w, target } = setup();
    target.products[0]!.lastShare = 0.2;
    expect(marketShareOf(target)).toBeCloseTo(0.2, 9);
    const same = (share: number) => args({ bidder: { kind: 'player', playerId: 'bidder', sector: 'tech', share } });
    expect(bid(w, eng, 100, same(0.45))).toEqual({ ok: false, reject: { code: 'antitrustBlock', share: 65 } });
    // the same share in another sector is no overlap at all: the floor and vote decide
    const other = bid(w, eng, 100, args({ bidder: { kind: 'player', playerId: 'bidder', sector: 'staples', share: 0.9 } }));
    expect(other.ok).toBe(true);
  });

  it('the price must clear the floor from T0, and the board must approve it', () => {
    const { eng, w, target } = setup();
    const floor = tenderFloor(eng, 'CO', t0Of(w, target, 'bidder', 100), 100);
    expect(bid(w, eng, 100, args({ price: floor - 0.01 }))).toEqual({ ok: false, reject: { code: 'takeoverBelowFloor', floor } });
    expect(bid(w, eng, 100, args({ price: floor + 0.01, founderVote: 'no' }))).toEqual({
      ok: false, reject: { code: 'boardRejected', yes: 0, no: 100 },
    });
  });

  it('an unfunded bidder cannot pay the whole tender', () => {
    const { eng, w } = setup();
    const poor = adjustCash(eng, 'bidder', -eng.accounts.bidder!.cash);
    const r = bid(w, poor, 100, args({ price: 1.5 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reject.code).toBe('takeoverUnfunded');
  });

  it('a player bid settles every holder at one price, conserves cash across all accounts, and moves the company to the bidder', () => {
    const { eng, w, target } = setup();
    const cash0 = totalCash(eng);
    const r = bid(w, eng, 100, args({ price: 1.5 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(totalCash(r.engine)).toBeCloseTo(cash0, 6);
    expect(r.engine.accounts.founder!.cash - eng.accounts.founder!.cash).toBeCloseTo(150, 6);
    expect(r.engine.accounts.rival!.cash - eng.accounts.rival!.cash).toBeCloseTo(75, 6);
    expect(r.engine.accounts.bidder!.cash - eng.accounts.bidder!.cash).toBeCloseTo(-225, 6);
    expect(r.engine.config.assets.find((a) => a.id === 'CO')!.delisted).toBe(true);
    expect(target.ownerId).toBe('bidder');
    expect(target.capTable).toEqual({ 'founder:bidder': 100 });
    expect(target.listed).toBeNull();
  });

  it('an NPC acquirer bids through its own account and the company goes to the NPC', () => {
    const { eng, w, target } = setup();
    const r = bid(w, eng, 100, args({
      bidderId: 'npcacq', bidder: { kind: 'npc', sector: 'staples', share: 0.1 }, price: 2, covered: [],
    }));
    expect(r.ok).toBe(true);
    expect(target.ownerId).toBe('npc:acq:npcacq');
    expect(target.capTable).toEqual({ 'npc:acq:npcacq': 100 });
  });

  it('the constants are the spec numbers: floor 1.2, 63 gd pre-attack, 0.5% of float, antitrust 60%', () => {
    expect(COMPANY.takeover.floorRatio).toBe(1.2);
    expect(COMPANY.takeover.preAttackDays).toBe(63);
    expect(COMPANY.takeover.bigSellShare).toBe(0.005);
    expect(COMPANY.npc.antitrustShare).toBe(0.6);
  });
});
