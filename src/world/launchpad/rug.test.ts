import { describe, expect, it } from 'vitest';
import { applyCommand } from '../game';
import { TPD, cashOf } from '../core';
import type { CourtCase } from '../types';
import { LP } from './constants';
import { spotAt } from './curve';
import { fileRugCase, lpFills, recordCreatorSale, rugVerdict } from './rug';
import { launchGate } from './launch';
import { CREATOR, HOLDER, TRADER, jumpDays, launch, lpWorld, run } from './fixture';
import type { LpToken } from './types';

const grad = (g: ReturnType<typeof lpWorld>, ticker: string) => applyCommand(g, 'admin', { type: 'admin.lpFill', ticker });
const tok = (g: ReturnType<typeof lpWorld>, ticker: string): LpToken => g.launchpad!.tokens[ticker]!;

describe('the rug flag (L5)', () => {
  it('an honest creator who sells on the vesting pace is never flagged', () => {
    const g = lpWorld('rug-honest');
    launch(g, CREATOR, 'HONE', { allocation: 10_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'HONE', spendCents: 10_000 });
    expect(grad(g, 'HONE').ok).toBe(true);
    const t = tok(g, 'HONE');
    const price = t.gradPrice!;
    // the creator's allocation unlocks from the cliff to day 14: sell exactly the unlocked share every day, for 14 days
    // the loop's first jump is the first day after graduation, so the elapsed days at loop index `day` are day - 1
    for (let day = 2; day <= 15; day++) {
      jumpDays(g, 1);
      const elapsed = day - 1;
      const due = Math.floor(10_000_000 * Math.max(0, Math.min(1, (elapsed - 2) / 12))) - t.allocSold;
      if (due > 0) lpFills(g, [{ playerId: CREATOR, assetId: 'HONE', side: 'sell', qty: due, price, fee: 0 }], null);
    }
    expect(t.flag).toBeUndefined();
    expect(t.creatorSoldSinceGrad).toBe(0);
  });

  it('a creator who sells half their holding within 24 game days after graduation is flagged for a dump, publicly', () => {
    const g = lpWorld('rug-dump');
    launch(g, CREATOR, 'DUMP', { allocation: 0 });
    run(g, CREATOR, { type: 'lp.buy', ticker: 'DUMP', spendCents: 90_000, maxSlip: 0.5 });
    expect(grad(g, 'DUMP').ok).toBe(true);
    const t = tok(g, 'DUMP');
    const held = t.creatorHeldAtGrad!;
    expect(held).toBeGreaterThan(0);
    jumpDays(g, 1);
    lpFills(g, [{ playerId: CREATOR, assetId: 'DUMP', side: 'sell', qty: Math.ceil(held * 0.6), price: t.gradPrice!, fee: 0 }], null);
    expect(t.flag?.reason).toBe('dump');
    expect(t.flag?.tick).toBe(g.market.tick);
  });

  it('a one-day sweep of 3% of supply while the price falls 40% is flagged as a sweep', () => {
    const g = lpWorld('rug-sweep');
    launch(g, CREATOR, 'SWEP');
    const t = tok(g, 'SWEP');
    t.y = t.y - 1_000_000; // the curve has sold a million (the sweep reads the price, not the cause)
    // the day opened at three times today's price, so the price has fallen by two thirds
    t.creatorDay = { day: Math.floor((g.market.tick - 1) / TPD), qty: 0, proceeds: 0, startPrice: spotAt(t.y) * 3, wired: false };
    recordCreatorSale(g, t, CREATOR, LP.SUPPLY * 0.035, 1000, null);
    expect(t.flag?.reason).toBe('sweep');
  });

  it('a flag needs its rule: a 10% price fall or a 1% sell day raises nothing', () => {
    const g = lpWorld('rug-quiet');
    launch(g, CREATOR, 'QUIT');
    const t = tok(g, 'QUIT');
    t.creatorDay = { day: Math.floor((g.market.tick - 1) / TPD), qty: 0, proceeds: 0, startPrice: spotAt(t.y) * 1.1, wired: false };
    recordCreatorSale(g, t, CREATOR, LP.SUPPLY * 0.01, 1000, null);
    expect(t.flag).toBeUndefined();
  });
});

describe('the rug case (L5)', () => {
  it('a holder who bought in the seven days before a flagged dump may file; nobody else; once per token', () => {
    const g = lpWorld('rug-file');
    launch(g, CREATOR, 'FILE', { allocation: 0 });
    run(g, CREATOR, { type: 'lp.buy', ticker: 'FILE', spendCents: 90_000, maxSlip: 0.5 });
    run(g, HOLDER, { type: 'lp.buy', ticker: 'FILE', spendCents: 2_000 });
    expect(grad(g, 'FILE').ok).toBe(true);
    const t = tok(g, 'FILE');
    expect(fileRugCase(g, HOLDER, 'FILE', null).error).toMatch(/no public flag|rug flag/);
    jumpDays(g, 1);
    lpFills(g, [{ playerId: CREATOR, assetId: 'FILE', side: 'sell', qty: Math.ceil(t.creatorHeldAtGrad! * 0.6), price: t.gradPrice!, fee: 0 }], null);
    expect(t.flag?.reason).toBe('dump');
    const r = fileRugCase(g, TRADER, 'FILE', null);
    expect((r.data as { refusal?: string }).refusal).toBe('notEligible');
    const cash0 = cashOf(g, HOLDER);
    const ok = fileRugCase(g, HOLDER, 'FILE', null);
    expect(ok.ok).toBe(true);
    expect(cashOf(g, HOLDER)).toBeCloseTo(cash0 - 2_000, 6);
    const c = g.court.cases[(ok.data as { id: string }).id] as CourtCase;
    expect(c.kind).toBe('rug');
    expect(c.defendantId).toBe(CREATOR);
    expect(c.tokenId).toBe('FILE');
    expect((fileRugCase(g, HOLDER, 'FILE', null).data as { refusal?: string }).refusal).toBe('alreadySued');
    expect((fileRugCase(g, CREATOR, 'FILE', null).data as { refusal?: string }).refusal).toBe('ownFlag');
  });

  it('the verdict pays the realised loss, capped at the dump proceeds, and bans the creator from launching for 8 weeks', () => {
    const g = lpWorld('rug-verdict');
    launch(g, CREATOR, 'VERD', { allocation: 0 });
    run(g, HOLDER, { type: 'lp.buy', ticker: 'VERD', spendCents: 2_000 });
    const t = tok(g, 'VERD');
    t.flag = { tick: g.market.tick, reason: 'dump', proceeds: 10_000, window: 0, buyers: { [HOLDER]: 1_000 } };
    t.buyLog.push({ pid: HOLDER, tick: g.market.tick, qty: 1_000 });
    t.realized[HOLDER] = -800;
    const c: CourtCase = {
      id: 'caseX', plaintiffId: HOLDER, defendantId: CREATOR, kind: 'rug', tokenId: 'VERD', evidence: 60, bar: 40,
      counselPlaintiff: 0, counselDefendant: 0, filedTick: g.market.tick, hearingTick: g.market.tick, status: 'won', damages: 0, fine: 0,
    };
    const c0 = cashOf(g, CREATOR);
    const h0 = cashOf(g, HOLDER);
    rugVerdict(g, c, null, g.players[CREATOR]!);
    expect(c.damages).toBe(800);
    expect(cashOf(g, HOLDER) - h0).toBeCloseTo(800, 6);
    expect(c0 - cashOf(g, CREATOR)).toBeGreaterThanOrEqual(800);
    expect(g.launchpad!.bans[CREATOR]).toBe(g.market.tick + LP.RUG_BAN_TICKS);
    expect(launchGate(g, CREATOR)?.data).toMatchObject({ refusal: 'ban' });
    expect(LP.RUG_BAN_TICKS).toBe(8 * 7 * 24 * TPD);
  });

  it('the damages are capped by the creator’s proceeds, and a holder with no loss gets none', () => {
    const g = lpWorld('rug-cap');
    launch(g, CREATOR, 'CAPR', { allocation: 0 });
    run(g, HOLDER, { type: 'lp.buy', ticker: 'CAPR', spendCents: 2_000 });
    const t = tok(g, 'CAPR');
    t.flag = { tick: g.market.tick, reason: 'sweep', proceeds: 100, window: 0, buyers: { [HOLDER]: 1_000 } };
    t.buyLog.push({ pid: HOLDER, tick: g.market.tick, qty: 1_000 });
    t.realized[HOLDER] = -800;
    const mk = (id: string): CourtCase => ({
      id, plaintiffId: HOLDER, defendantId: CREATOR, kind: 'rug', tokenId: 'CAPR', evidence: 60, bar: 40,
      counselPlaintiff: 0, counselDefendant: 0, filedTick: 0, hearingTick: 0, status: 'won', damages: 0, fine: 0,
    });
    const c = mk('caseA');
    rugVerdict(g, c, null, g.players[CREATOR]!);
    expect(c.damages).toBe(100);
    t.realized[HOLDER] = 50;
    const d = mk('caseB');
    rugVerdict(g, d, null, g.players[CREATOR]!);
    expect(d.damages).toBe(0);
  });
});
