import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { placeOrder } from '@/engine';
import { applyCommand } from '../game';
import { TPD, today } from '../core';
import type { GameState } from '../types';
import { advanceTo, BUYER_A, BUYER_B, companyOf, FOUNDER, founded, THREE_FILINGS_DAY, totalMoney, YOUNG } from './b1fixture';
import { allocateIpo, listIpo, orderIpo } from './ipo';
import { configSeq, marketFrame, mirrorWorld } from '../view';
import type { IpoBook } from './types';

// The IPO (quant v1.7 section 5.1): eligibility, the book, the allocation, the listing through the engine and the lockup.

/** A founder at R3 with three filed quarters and a value above the floor: the state an IPO request needs. */
function eligible(seed: string): { g: GameState; c: ReturnType<typeof companyOf> } {
  const { g } = founded(seed);
  advanceTo(g, THREE_FILINGS_DAY);
  const c = companyOf(g);
  c.filedV = 100_000_000;
  g.players[FOUNDER]!.rankId = 'R3';
  return { g, c };
}

function req(g: GameState, floatPct: number) {
  return applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: companyOf(g).id, floatPct });
}

describe('IPO eligibility (section 5, Ledger 2 and 3)', () => {
  it('refuses an IPO before three filed quarters', () => {
    const { g } = founded('ipo-filings');
    const r = req(g, 0.2);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ipoFilings');
  });

  it('refuses an IPO below the engine value floor', () => {
    const { g, c } = eligible('ipo-value');
    c.filedV = 10_000_000;
    expect(req(g, 0.2).error).toBe('ipoValue');
  });

  it('refuses an IPO below the Operator rank', () => {
    const { g } = eligible('ipo-rank');
    g.players[FOUNDER]!.rankId = 'R2';
    expect(req(g, 0.2).error).toBe('ipoRank');
  });

  it('refuses an IPO while a covenant is in cure', () => {
    const { g, c } = eligible('ipo-covenant');
    c.covenant = { status: 'cure', cureUntilDay: 999 };
    expect(req(g, 0.2).error).toBe('ipoCovenant');
  });

  it('refuses a float outside 15% to 49%', () => {
    const { g } = eligible('ipo-float');
    expect(req(g, 0.10).error).toBe('ipoFloatOutOfBand');
    expect(req(g, 0.50).error).toBe('ipoFloatOutOfBand');
  });
});

describe('the book and the price', () => {
  it('prices at 0.9 x V over the shares after the IPO, fixed at the request', () => {
    const { g, c } = eligible('ipo-price');
    const r = req(g, 0.2);
    expect(r.ok).toBe(true);
    const book = c.ipo as IpoBook;
    const sharesPost = c.shares + book.ipoShares;
    expect(book.sharesPost).toBe(sharesPost);
    expect(book.ipoShares).toBe(Math.round((c.shares * 0.2) / 0.8));
    expect(book.price).toBeCloseTo((0.9 * 100_000_000) / sharesPost, 9);
    expect(book.listDay).toBe(today(g) + COMPANY.ipo.bookDays);
  });

  it('refuses a second request while a book is open', () => {
    const { g } = eligible('ipo-twice');
    expect(req(g, 0.2).ok).toBe(true);
    expect(req(g, 0.3).error).toBe('ipoAlreadyRequested');
  });

  it('keeps the founder and the owner set out of the book, and young accounts too', () => {
    const { g, c } = eligible('ipo-owner');
    req(g, 0.2);
    const own = applyCommand(g, FOUNDER, { type: 'company.ipoOrder', companyId: c.id, shares: 100 });
    expect(own.error).toBe('ipoOwnerSet');
    g.players[YOUNG]!.joinedTick = g.market.tick - 2 * TPD;
    const young = applyCommand(g, YOUNG, { type: 'company.ipoOrder', companyId: c.id, shares: 100 });
    expect(young.error).toBe('ipoAccountTooYoung');
    const ok = applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 100 });
    expect(ok.ok).toBe(true);
  });
});

describe('allocation (N8: at most 5% of the float per buyer, pro rata when oversubscribed)', () => {
  it('caps each buyer at 5% of the float and gives the rest to the NPC book', () => {
    const { g, c } = eligible('ipo-cap');
    req(g, 0.2);
    applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 1_000_000_000 });
    applyCommand(g, BUYER_B, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
    const book = c.ipo as IpoBook;
    const cap = Math.floor(COMPANY.ipo.allocCapOfFloat * book.ipoShares);
    const alloc = allocateIpo(g, book, new Set([FOUNDER]));
    expect(alloc[BUYER_A]).toBe(cap);
    expect(alloc[BUYER_B]).toBe(10_000);
  });

  it('is pro rata when the book is oversubscribed, and never exceeds the float', () => {
    const { g, c } = eligible('ipo-pro');
    req(g, 0.2);
    const book = c.ipo as IpoBook;
    book.ipoShares = 100;
    book.price = 1;
    for (let i = 0; i < 30; i++) {
      const id = `x${i}`;
      g.market.accounts[id] = { ...g.market.accounts[BUYER_A]!, playerId: id, cash: 1e9 };
      book.orders[id] = 100;
    }
    const alloc = allocateIpo(g, book, new Set());
    const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
    expect(Object.values(alloc).every((q) => q === 3)).toBe(true);
    expect(sum).toBeLessThanOrEqual(book.ipoShares);
  });

  it('allocates only what the buyer can pay at the price', () => {
    const { g, c } = eligible('ipo-cash');
    req(g, 0.2);
    applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 5_000 });
    const book = c.ipo as IpoBook;
    g.market.accounts[BUYER_A] = { ...g.market.accounts[BUYER_A]!, cash: book.price * 100 };
    expect(allocateIpo(g, book, new Set())[BUYER_A]).toBe(100);
  });
});

describe('listing through the engine (section 5.1, hook 2) and the founder lockup', () => {
  function listed(seed: string) {
    const { g, c } = eligible(seed);
    req(g, 0.2);
    applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
    applyCommand(g, BUYER_B, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
    const book = c.ipo as IpoBook;
    const listDay = book.listDay;
    advanceTo(g, listDay);
    return { g, c, book, listDay };
  }

  it('appends a company stock with the value source and the print share (G21)', () => {
    const { g, c, book } = listed('ipo-engine');
    expect(c.listed).not.toBeNull();
    const id = c.listed!.assetId;
    const def = g.market.config.assets.find((a) => a.id === id)!;
    expect(def.valueSource).toBe('company');
    expect(def.companyPrintShare).toBe(1);
    expect(c.listed!.floatShares).toBe(book.ipoShares);
    expect(c.listed!.sharesOut).toBe(book.sharesPost);
    expect(c.shares).toBe(book.sharesPost);
    expect(Math.exp(g.market.assets[g.market.config.assets.indexOf(def)]!.lnP)).toBeCloseTo(book.price, 6);
  });

  it('prints the weekly signal into the engine for the listed stock (the company print, G21)', () => {
    const { g, c, listDay } = listed('ipo-print');
    // day 205 is a signal day (every 5 game days): the signal's lnV step is printed on the stock
    expect(listDay).toBeLessThan(205);
    advanceTo(g, 205);
    const i = g.market.config.assets.findIndex((a) => a.id === c.listed!.assetId);
    expect(g.market.assets[i]!.pendingPrint).toBeDefined();
    expect(Number.isFinite(g.market.assets[i]!.pendingPrint!)).toBe(true);
  });

  it('locks the founder shares for 168 game days from listing', () => {
    const { g, c, listDay } = listed('ipo-lock');
    const id = c.listed!.assetId;
    const pos = g.market.accounts[FOUNDER]!.positions[id];
    expect(pos?.qty).toBe(c.capTable[`founder:${FOUNDER}`]);
    // the engine's lockup runs to listDay + 168 (sells before that day are refused)
    expect(g.market.restrictions?.lockups[id]?.[FOUNDER]).toBe(listDay + COMPANY.ipo.lockupDays);
    const sell = placeOrder(g.market, { playerId: FOUNDER, assetId: id, side: 'sell', type: 'market', qty: 1 });
    expect(sell.order.status).toBe('rejected');
    expect(sell.order.rejectReason).toBe('lockup');
  });

  it('gives each buyer their allocation and the NPC book the rest of the float', () => {
    const { g, c, book } = listed('ipo-alloc');
    const id = c.listed!.assetId;
    const qa = g.market.accounts[BUYER_A]!.positions[id]?.qty ?? 0;
    const qb = g.market.accounts[BUYER_B]!.positions[id]?.qty ?? 0;
    expect(qa).toBe(10_000);
    expect(qb).toBe(10_000);
    const book2 = g.market.accounts[`npc:book:${id}`]!.positions[id]?.qty ?? 0;
    expect(book2).toBe(book.ipoShares - 20_000);
  });

  it('moves the buyers cash at the price and conserves the money of the listing day', () => {
    // measured across the listing day only: the world is built to the request, then the listing day is advanced
    const f = founded('ipo-money-measure');
    advanceTo(f.g, THREE_FILINGS_DAY);
    const cc = companyOf(f.g);
    cc.filedV = 100_000_000;
    f.g.players[FOUNDER]!.rankId = 'R3';
    applyCommand(f.g, FOUNDER, { type: 'company.ipo', companyId: cc.id, floatPct: 0.2 });
    applyCommand(f.g, BUYER_A, { type: 'company.ipoOrder', companyId: cc.id, shares: 10_000 });
    const b2 = cc.ipo as IpoBook;
    const cashBefore = f.g.market.accounts[BUYER_A]!.cash;
    const totalBefore = totalMoney(f.g);
    const faucetBefore = f.g.companies!.flows.faucet;
    const sinkBefore = f.g.companies!.flows.sink;
    advanceTo(f.g, b2.listDay);
    const paid = cashBefore - f.g.market.accounts[BUYER_A]!.cash;
    expect(paid).toBeCloseTo(10_000 * b2.price, 6);
    const dFaucet = f.g.companies!.flows.faucet - faucetBefore;
    const dSink = f.g.companies!.flows.sink - sinkBefore;
    // every dollar that moved is either a transfer between real parties or a booked faucet (the NPC book's shares)
    expect(totalMoney(f.g) - totalBefore).toBeCloseTo(dFaucet - dSink, 4);
    // and the NPC book's float was paid for as a faucet at the IPO price
    expect(dFaucet).toBeGreaterThanOrEqual((b2.ipoShares - 20_000) * b2.price - 1e-6);
  });

  it('lists only once: the book is cleared at listing', () => {
    const { c } = listed('ipo-once');
    expect(c.ipo).toBeNull();
    expect(c.listed).not.toBeNull();
  });
});

describe('a listing the day is not due does nothing', () => {
  it('listIpo is a no-op without a book', () => {
    const { g, c } = eligible('ipo-noop');
    listIpo(g, c, null);
    expect(c.listed).toBeNull();
    expect(orderIpo(g, BUYER_A, c, 5).ok).toBe(false);
  });
});

describe('admin.ipoReady (the e2e seam for the filed history)', () => {
  it('pads the filed quarters and raises the filed value, so the founder can request an IPO; the request stays the world\'s own', () => {
    const { g, c } = founded('ipo-seam');
    expect(c.filings.length).toBe(0);
    expect(req(g, 0.2).error).toBe('ipoFilings');
    expect(applyCommand(g, FOUNDER, { type: 'admin.ipoReady', playerId: FOUNDER }).ok).toBe(true);
    expect(c.filings.length).toBeGreaterThanOrEqual(COMPANY.ipo.minFiledQuarters);
    expect(new Set(c.filings.map((f) => f.hash)).size).toBe(c.filings.length);
    expect(c.filings.map((f) => f.quarter)).toEqual(c.filings.map((_, i) => i));
    expect(c.filedV).toBeGreaterThanOrEqual(COMPANY.ipo.minValue);
    // the rank is still the world's: an Owner is refused on rank, not on the seam
    expect(req(g, 0.2).error).toBe('ipoRank');
    g.players[FOUNDER]!.rankId = 'R3';
    expect(req(g, 0.2).ok).toBe(true);
  });

  it('refuses a player with no unlisted company, and an already listed company', () => {
    const { g } = founded('ipo-seam-none');
    expect(applyCommand(g, BUYER_A, { type: 'admin.ipoReady', playerId: BUYER_A }).ok).toBe(false);
    applyCommand(g, FOUNDER, { type: 'admin.ipoReady', playerId: FOUNDER });
    g.players[FOUNDER]!.rankId = 'R3';
    expect(req(g, 0.2).ok).toBe(true);
    // a second seam on a company whose book is open is refused: the seam only prepares a company that has no book yet
    expect(applyCommand(g, FOUNDER, { type: 'admin.ipoReady', playerId: FOUNDER }).ok).toBe(false);
  });
});

describe('the list version follows a company listing (the client config must see the new asset)', () => {
  it('a listing moves configSeq, and the frame of that tick carries the defs so a client mirror has every asset', () => {
    const { g, c } = eligible('list-version');
    const before = configSeq(g);
    const assetsBefore = g.market.config.assets.length;
    applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 });
    applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
    advanceTo(g, (c.ipo as IpoBook).listDay);
    expect(c.listed).not.toBeNull();
    expect(g.market.config.assets.length).toBe(assetsBefore + 1);
    expect(configSeq(g)).toBeGreaterThan(before);
    const frame = marketFrame(g, false, true);
    expect(frame.cfgSeq).toBe(configSeq(g));
    expect(frame.defs?.length).toBe(g.market.config.assets.length);
    // the client mirror keeps every asset the frame carries, so a holding in the new stock prices
    const mirror = mirrorWorld(g.market.config, frame, { id: BUYER_A, account: g.market.accounts[BUYER_A] ?? null, orders: [] });
    expect(mirror.assets.length).toBe(g.market.config.assets.length);
  });
});
