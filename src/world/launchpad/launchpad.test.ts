import { describe, expect, it } from 'vitest';
import { TPD, cashOf } from '../core';
import { bookedNet, netWorldMoney } from '../company/exploits/sequences';
import { LP, curveAccountId } from './constants';
import { quoteBuy } from './curve';
import { applyCommand } from '../game';
import { lpWorld, run, launch, jumpDays, CREATOR, TRADER, HOLDER } from './fixture';
import { lpTick } from './flow';
import { lockedEngineSell } from './graduate';
import { dayOf } from './state';
import { vestCliffDay, vestEndDay, vestFraction } from './vest';
import { liquidateCohort } from './trade';

const refusal = (r: { ok: boolean; data?: unknown }) => (r.data as { refusal?: string } | undefined)?.refusal;

describe('launch gates (L2)', () => {
  it('refuses a player below Hustler, and an account younger than three real days', () => {
    const g = lpWorld('gate-rank');
    g.players[TRADER]!.rankId = 'R0';
    expect(refusal(launch(g, TRADER, 'ABCD'))).toBe('rank');
    const h = lpWorld('gate-age');
    h.players[TRADER]!.joinedTick = h.market.tick - 10 * TPD;
    expect(refusal(launch(h, TRADER, 'ABCD'))).toBe('age');
  });

  it('launches a live token: the fee is a booked sink, the curve opens, and the creator holds the allocation', () => {
    const g = lpWorld('gate-ok');
    const cash0 = cashOf(g, CREATOR);
    const r = launch(g, CREATOR, 'PANC', { allocation: 10_000_000 });
    expect(r.ok).toBe(true);
    const t = g.launchpad!.tokens.PANC!;
    expect(t.status).toBe('live');
    // the launch's own buzz is bought by the cohort in the launch tick (L6.4): the curve is at or below its start
    expect(t.y).toBeLessThanOrEqual(LP.Y0);
    expect(t.bal[CREATOR]).toBe(10_000_000);
    expect(cashOf(g, CREATOR)).toBeCloseTo(cash0 - LP.LAUNCH_FEE + t.creatorFees, 6);
    expect(g.economy.sinks.lpLaunchFee).toBe(LP.LAUNCH_FEE);
    expect(g.market.accounts[curveAccountId('PANC')]?.cash ?? 0).toBeCloseTo(t.flows.npcBuy - t.flows.fee, 6);
  });

  it('refuses a second launch inside 24 real hours, and a fourth live token', () => {
    const g = lpWorld('gate-cool');
    expect(launch(g, CREATOR, 'AAAB').ok).toBe(true);
    expect(refusal(launch(g, CREATOR, 'AAAC'))).toBe('cooldown');
    jumpDays(g, 24);
    expect(launch(g, CREATOR, 'AAAD').ok).toBe(true);
    jumpDays(g, 24);
    expect(launch(g, CREATOR, 'AAAE').ok).toBe(true);
    jumpDays(g, 24);
    expect(refusal(launch(g, CREATOR, 'AAAF'))).toBe('live');
  });

  it('refuses a bad allocation, ticker, tagline and name, and says why in three parts', () => {
    const g = lpWorld('gate-input');
    expect(refusal(launch(g, CREATOR, 'ABCD', { allocation: 50_000_001 }))).toBe('allocation');
    expect(refusal(launch(g, CREATOR, 'AB'))).toBe('tickerFormat');
    expect(refusal(launch(g, CREATOR, 'ABCD', { tagline: 'free text here' }))).toBe('tagline');
    expect(refusal(launch(g, CREATOR, 'DOGE'))).toBe('tickerCrypto');
    expect(refusal(launch(g, CREATOR, 'ABCD', { name: 'Bitcoin Pals' }))).toBe('nameCrypto');
    expect(refusal(launch(g, CREATOR, 'ABCD', { name: 'Frogcoin' }))).toBe('nameTaken');
    expect(refusal(launch(g, CREATOR, 'FROG'))).toBe('tickerTaken');
    const r = launch(g, CREATOR, 'ABCD', { name: 'Bitcoin Pals' });
    const parts = (r.data as { parts: { key: string }[] }).parts.map((p) => p.key);
    // the first part is the moderator's line (txt.mod.crypto.N); the other two are the refusal's own copy
    expect(parts[0]).toMatch(/^txt\.mod\.crypto\.\d$/);
    expect(parts.slice(1)).toEqual(['lp.refuse.nameCrypto.why', 'lp.refuse.nameCrypto.do']);
  });

  it('a refused launch changes nothing: no fee, no state, no account', () => {
    const g = lpWorld('gate-nothing');
    const cash0 = cashOf(g, CREATOR);
    const money0 = netWorldMoney(g);
    expect(refusal(launch(g, CREATOR, 'DOGE'))).toBe('tickerCrypto');
    expect(cashOf(g, CREATOR)).toBe(cash0);
    expect(netWorldMoney(g)).toBe(money0);
    expect(Object.keys(g.launchpad?.tokens ?? {})).toHaveLength(0);
    expect(g.economy.sinks.lpLaunchFee ?? 0).toBe(0);
  });

  it('a ticker a token has used is taken for good: no token is ever replaced (live, cancelled, dead or graduated)', () => {
    const g = lpWorld('gate-reuse');
    expect(launch(g, CREATOR, 'SNAL').ok).toBe(true);
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'SNAL', spendCents: 10_000 }).ok).toBe(true);
    // a live token with a holder: the same ticker is refused, and the holder's balance and the creator are untouched
    expect(refusal(launch(g, TRADER, 'SNAL', { name: 'Snail Party' }))).toBe('tickerTaken');
    const held = g.launchpad!.tokens.SNAL!.bal[TRADER];
    jumpDays(g, 40);
    expect(refusal(launch(g, HOLDER, 'SNAL', { name: 'Snail Party' }))).toBe('tickerTaken');
    expect(g.launchpad!.tokens.SNAL!.bal[TRADER]).toBe(held);
    expect(g.launchpad!.tokens.SNAL!.creatorId).toBe(CREATOR);
    expect(g.launchpad!.order.filter((k) => k === 'SNAL')).toHaveLength(1);
  });

  it('a cancelled ticker stays taken too, and a fresh ticker still launches', () => {
    const g = lpWorld('gate-cancel');
    expect(launch(g, CREATOR, 'CNCL').ok).toBe(true);
    expect(run(g, CREATOR, { type: 'lp.cancel', ticker: 'CNCL' }).ok).toBe(true);
    jumpDays(g, 40);
    expect(refusal(launch(g, TRADER, 'CNCL', { name: 'Cancel Club' }))).toBe('tickerTaken');
    expect(launch(g, TRADER, 'CNEW', { name: 'Cancel Fresh' }).ok).toBe(true);
  });
});

describe('the curve (L3)', () => {
  it('a buy moves the trader’s cash, the curve’s cash net of the fee, and the creator’s half of the fee', () => {
    const g = lpWorld('curve-buy');
    launch(g, CREATOR, 'CURV');
    const cashT0 = cashOf(g, TRADER);
    const cashC0 = cashOf(g, CREATOR);
    const curve0 = g.market.accounts[curveAccountId('CURV')]!.cash;
    const sink0 = g.economy.sinks.lpTradeFee ?? 0;
    const y0 = g.launchpad!.tokens.CURV!.y;
    const r = run(g, TRADER, { type: 'lp.buy', ticker: 'CURV', spendCents: 10_000 });
    expect(r.ok).toBe(true);
    const d = r.data as { tokens: number; feeCents: number };
    expect(d.feeCents).toBe(100);
    expect(cashOf(g, TRADER)).toBeCloseTo(cashT0 - 100, 6);
    expect(cashOf(g, CREATOR)).toBeCloseTo(cashC0 + 0.5, 6);
    expect(g.market.accounts[curveAccountId('CURV')]!.cash).toBeCloseTo(curve0 + 99, 6);
    expect((g.economy.sinks.lpTradeFee ?? 0) - sink0).toBeCloseTo(0.5, 6);
    expect(g.launchpad!.tokens.CURV!.bal[TRADER]).toBe(d.tokens);
    expect(g.launchpad!.tokens.CURV!.y).toBe(y0 - d.tokens);
  });

  it('a sell pays the trader the formula cash less the fee, and FIFO books the realised P&L', () => {
    const g = lpWorld('curve-sell');
    launch(g, CREATOR, 'SELL');
    const b = run(g, TRADER, { type: 'lp.buy', ticker: 'SELL', spendCents: 10_000 });
    const tokens = (b.data as { tokens: number }).tokens;
    const cash1 = cashOf(g, TRADER);
    const s = run(g, TRADER, { type: 'lp.sell', ticker: 'SELL', tokens: Math.floor(tokens / 2) });
    expect(s.ok).toBe(true);
    expect(cashOf(g, TRADER)).toBeGreaterThan(cash1);
    const t = g.launchpad!.tokens.SELL!;
    expect(t.bal[TRADER]).toBe(tokens - Math.floor(tokens / 2));
    expect(t.realized[TRADER]).toBeLessThan(0);
  });

  it('refuses a buy over the slippage limit, a sell over the holdings, a zero size, and a sell that breaks the vesting lock', () => {
    const g = lpWorld('curve-refuse');
    launch(g, CREATOR, 'REFU', { allocation: 10_000_000 });
    expect(refusal(run(g, TRADER, { type: 'lp.buy', ticker: 'REFU', spendCents: 500_000 }))).toBe('slippage');
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'REFU', spendCents: 500_000, maxSlip: 0.5 }).ok).toBe(true);
    expect(refusal(run(g, TRADER, { type: 'lp.sell', ticker: 'REFU', tokens: 10 ** 12 }))).toBe('holdings');
    expect(refusal(run(g, TRADER, { type: 'lp.sell', ticker: 'REFU', tokens: 0 }))).toBe('zero');
    expect(refusal(run(g, CREATOR, { type: 'lp.sell', ticker: 'REFU', tokens: 1 }))).toBe('lockedGrad');
    // a poor trader cannot buy, whatever the size: the cash check reads the fill the curve would take
    const poor = g.market.accounts[HOLDER]!;
    g.market = { ...g.market, accounts: { ...g.market.accounts, [HOLDER]: { ...poor, cash: 0.5 } } };
    expect(refusal(run(g, HOLDER, { type: 'lp.buy', ticker: 'REFU', spendCents: 10_000 }))).toBe('cash');
  });

  it('caps the creator and linked accounts at 10% of supply on the curve, allocation included', () => {
    const g = lpWorld('curve-cap');
    // a 50M allocation (ALLOC_MAX) leaves 50M of the 100M cap for the creator's curve buys
    launch(g, CREATOR, 'CAPS', { allocation: LP.ALLOC_MAX });
    const q = quoteBuy(LP.Y0, 50_000);
    expect(q.ok).toBe(true);
    // the first buy (about 35M tokens) fits inside the room; a second buy past the cap (about 60M more) is refused
    const first = run(g, CREATOR, { type: 'lp.buy', ticker: 'CAPS', spendCents: 50_000, maxSlip: 0.5 });
    expect(first.ok).toBe(true);
    expect(g.launchpad!.tokens.CAPS!.creatorBought).toBe((first.data as { tokens: number }).tokens);
    expect(g.launchpad!.tokens.CAPS!.creatorBought).toBeLessThan(LP.CREATOR_CAP - LP.ALLOC_MAX);
    const big = run(g, CREATOR, { type: 'lp.buy', ticker: 'CAPS', spendCents: 100_000, maxSlip: 0.5 });
    expect(refusal(big)).toBe('creatorCap');
  });

  it('a graduated or unknown token refuses the curve', () => {
    const g = lpWorld('curve-none');
    expect(refusal(run(g, TRADER, { type: 'lp.buy', ticker: 'NOPE', spendCents: 1000 }))).toBe('noToken');
  });
});

describe('vesting (L5, v1.4)', () => {
  it('the creator’s allocation is locked until graduation, then vests linearly from the graduation tick to all of it at 14 game days', () => {
    const g = lpWorld('vest');
    launch(g, CREATOR, 'VEST', { allocation: 10_000_000 });
    expect(refusal(run(g, CREATOR, { type: 'lp.sell', ticker: 'VEST', tokens: 1 }))).toBe('lockedGrad');
    // the curve must have sold tokens for the creator to sell into it: a trader buys first
    run(g, TRADER, { type: 'lp.buy', ticker: 'VEST', spendCents: 10_000 });
    // before graduation nothing is unlocked and there is no unlock day to show (null), however long the token lives
    expect(vestEndDay(g.launchpad!.tokens.VEST!)).toBeNull();
    expect(vestCliffDay(g.launchpad!.tokens.VEST!)).toBeNull();
    jumpDays(g, 20);
    expect(vestFraction(g.launchpad!.tokens.VEST!, g.market.tick)).toBe(0);
    expect(refusal(run(g, CREATOR, { type: 'lp.sell', ticker: 'VEST', tokens: 1 }))).toBe('lockedGrad');
    expect(applyCommand(g, 'admin', { type: 'admin.lpFill', ticker: 'VEST' }).ok).toBe(true);
    const t = g.launchpad!.tokens.VEST!;
    expect(t.gradTick).toBe(g.market.tick);
    expect(vestCliffDay(t)).toBe(dayOf(t.gradTick!) + LP.VEST_CLIFF_DAYS);
    expect(vestEndDay(t)).toBe(dayOf(t.gradTick!) + LP.VEST_END_DAYS);
    // from the graduation tick: nothing before the cliff (2 game days), then linear to all of it at 14
    expect(lockedEngineSell(g, CREATOR, 'VEST', 10_000_000)).toBe(true);
    jumpDays(g, 1.9);
    expect(lockedEngineSell(g, CREATOR, 'VEST', 1)).toBe(true);
    jumpDays(g, 6.1); // 8 game days: halfway through the 12-day linear unlock
    expect(lockedEngineSell(g, CREATOR, 'VEST', 5_000_000)).toBe(false);
    expect(lockedEngineSell(g, CREATOR, 'VEST', 5_000_001)).toBe(true);
    jumpDays(g, 6);
    expect(lockedEngineSell(g, CREATOR, 'VEST', 10_000_000)).toBe(false);
  });

  it('a token that never graduates keeps the allocation locked for good (L5.1 v1.4: locked, not burned): the balance stays, the lock stays after its death', () => {
    const g = lpWorld('vest-dead');
    launch(g, CREATOR, 'VDED', { allocation: 10_000_000 });
    const t = g.launchpad!.tokens.VDED!;
    jumpDays(g, 25);
    lpTick(g, null);
    expect(t.status).toBe('dead');
    expect(t.gradTick).toBeUndefined();
    expect(t.bal[CREATOR]).toBe(10_000_000);
    jumpDays(g, 200);
    expect(vestFraction(t, g.market.tick)).toBe(0);
    expect(refusal(run(g, CREATOR, { type: 'lp.sell', ticker: 'VDED', tokens: 1 }))).toBe('lockedGrad');
    expect(t.bal[CREATOR]).toBe(10_000_000);
  });
});

describe('the money identity (L8)', () => {
  it('buys, sells and the creator’s fees close to the cent against the booked lines', () => {
    const g = lpWorld('identity');
    const m0 = netWorldMoney(g);
    const b0 = bookedNet(g);
    launch(g, CREATOR, 'IDEN', { allocation: 5_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'IDEN', spendCents: 12_345 });
    run(g, HOLDER, { type: 'lp.buy', ticker: 'IDEN', spendCents: 2_222 });
    run(g, TRADER, { type: 'lp.sell', ticker: 'IDEN', tokens: 1_000_000 });
    run(g, CREATOR, { type: 'lp.buy', ticker: 'IDEN', spendCents: 999, maxSlip: 0.5 });
    expect(Math.abs((netWorldMoney(g) - m0) - (bookedNet(g) - b0))).toBeLessThan(0.005);
  });
});

describe('cancel and buzz (L2, L6)', () => {
  it('cancels an untraded launch for a refund, and refuses once someone has traded', () => {
    const g = lpWorld('cancel');
    launch(g, CREATOR, 'CANC');
    const cash = cashOf(g, CREATOR);
    const fees0 = g.launchpad!.tokens.CANC!.creatorFees;
    expect(run(g, CREATOR, { type: 'lp.cancel', ticker: 'CANC' }).ok).toBe(true);
    // the sniper entered in the launch, so the cancel sells its tokens back to the curve: the creator's half of that fee is theirs
    const cancelFees = g.launchpad!.tokens.CANC!.creatorFees - fees0;
    expect(cancelFees).toBeGreaterThan(0);
    // half the fee comes back; the other half stays a sink (v1.1)
    expect(cashOf(g, CREATOR)).toBeCloseTo(cash + LP.LAUNCH_FEE / 2 + cancelFees, 6);
    expect(g.economy.sinks.lpLaunchFee).toBe(LP.LAUNCH_FEE);
    expect(g.launchpad!.tokens.CANC!.status).toBe('dead');
    jumpDays(g, 25);
    launch(g, CREATOR, 'TRAD', { name: 'Trade Fest' });
    run(g, TRADER, { type: 'lp.buy', ticker: 'TRAD', spendCents: 1000 });
    jumpDays(g, 1);
    expect(refusal(run(g, CREATOR, { type: 'lp.cancel', ticker: 'TRAD' }))).toBe('traded');
  });

  it('buzz items are sinks, capped at three a token per game day, and the billboard is cheaper than the promo', () => {
    const g = lpWorld('buzz');
    launch(g, CREATOR, 'BUZZ');
    const sink0 = g.economy.sinks.lpBuzz ?? 0;
    const r1 = run(g, TRADER, { type: 'lp.buzz', ticker: 'BUZZ', kind: 'board' });
    expect(r1.ok).toBe(true);
    expect(run(g, TRADER, { type: 'lp.buzz', ticker: 'BUZZ', kind: 'wire' }).ok).toBe(true);
    expect(run(g, TRADER, { type: 'lp.buzz', ticker: 'BUZZ', kind: 'board' }).ok).toBe(true);
    expect(refusal(run(g, TRADER, { type: 'lp.buzz', ticker: 'BUZZ', kind: 'board' }))).toBe('buzzCap');
    expect((g.economy.sinks.lpBuzz ?? 0) - sink0).toBeCloseTo(LP.BOARD_COST * 2 + LP.WIRE_PROMO_COST, 6);
    expect(g.launchpad!.tokens.BUZZ!.promos).toHaveLength(3);
    jumpDays(g, 1);
    expect(run(g, TRADER, { type: 'lp.buzz', ticker: 'BUZZ', kind: 'board' }).ok).toBe(true);
  });
});

describe('death (L3)', () => {
  it('a token under the cash line dies at the seventh game-day close counted from day 3 (the close of day 9, tick 10 TPD), not before', () => {
    const g = lpWorld('death-cash');
    launch(g, CREATOR, 'QUIE');
    const t = g.launchpad!.tokens.QUIE!;
    liquidateCohort(g, t, null); // the launch cohort sells back, so the curve's cash is what the death line reads (v1.4)
    t.buzz.base = 0;
    t.npcPending = 0; // no arrivals either: the launch buzz would fund a cohort buy above the cash line (L6.1)
    t.sniperDone = true; // no sniper: its buy would hold the curve above the cash line
    // L3.1 (v1.3): the clock counts the closes of days 3 to 9, the seventh close is the close of day 9 (tick 10 * TPD)
    for (let d = 3; d <= 8; d++) {
      g.market = { ...g.market, tick: (d + 1) * TPD };
      lpTick(g, null);
      expect(t.status).toBe('live');
    }
    g.market = { ...g.market, tick: 10 * TPD };
    lpTick(g, null);
    expect(t.status).toBe('dead');
    expect(t.deadReason).toBe('cash');
    expect(t.deadTick).toBe(10 * TPD);
    const h = lpWorld('death-none');
    launch(h, CREATOR, 'SLOW');
    jumpDays(h, 25);
    lpTick(h, null);
    expect(h.launchpad!.tokens.SLOW!.status).toBe('dead');
  });
});
