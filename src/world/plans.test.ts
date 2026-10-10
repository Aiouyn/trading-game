import { describe, expect, it, vi } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { credit, cashOf } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { ledgerOf, tradesOf } from './ledger';
import { cancelBlock, refusal, startBlock } from './plans';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import type { GameState, Command } from './types';

const TPD = 720;

// Each case warms a live world (63 game days) and runs it through ticks: under a full parallel run that outgrows the 5 s default.
vi.setConfig({ testTimeout: 30_000 });

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  return g;
}

function boost(g: GameState, pid: string, amount: number) {
  credit(g, pid, amount, 'test');
  const p = g.players[pid]!;
  refreshNetWorth(g, p);
  applyRank(g, p, null);
}

function setCash(g: GameState, pid: string, cash: number) {
  g.market.accounts[pid] = { ...g.market.accounts[pid]!, cash };
}

/** Step until the tick is at or past `tick`; returns the notes the world wrote to the inbox meanwhile. */
function runTo(g: GameState, tick: number): void {
  while (g.market.tick < tick) stepGame(g);
}

function reasons(g: GameState, pid: string): string[] {
  return tradesOf(g, pid).fills.map((f) => f.reason);
}

describe('recurring buys', () => {
  it('buys the dollar amount on each due day, from cash, coded as a recurring buy', () => {
    const g = joined('plan-rec');
    const r = cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 300, everyDays: 1 });
    expect(r.ok).toBe(true);
    runTo(g, 2 * TPD + 1); // the day-2 boundary: the plan is due, and its order fills on the next tick
    stepGame(g);
    expect(reasons(g, 'u1')).toContain('recurring_buy');
    const row = tradesOf(g, 'u1').fills.find((f) => f.reason === 'recurring_buy')!;
    expect(row.side).toBe('buy');
    // whole shares: $300 buys one share at about $180, and never more than the dollars given
    expect(row.qty).toBe(1);
    expect(row.qty * row.price).toBeLessThan(300);
  });

  it('skips with one line when cash is short, and keeps the plan', () => {
    const g = joined('plan-rec-skip');
    cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 300, everyDays: 1 });
    setCash(g, 'u1', 50);
    runTo(g, 2 * TPD + 1);
    const notes = g.players.u1!.inbox.filter((n) => n.msg?.key.startsWith('work.recurring.skipped'));
    expect(notes.length).toBe(1);
    expect(notes[0]!.msg!.key).toBe('work.recurring.skipped.cash');
    expect(ledgerOf(g, 'u1')!.plans.recurring.length).toBe(1);
    expect(reasons(g, 'u1')).not.toContain('recurring_buy');
  });

  it('validates the dollars, the cadence and the number of plans, and can cancel one', () => {
    const g = joined('plan-rec-valid');
    expect(cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 5, everyDays: 1 }).ok).toBe(false);
    expect(cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 100, everyDays: 0 }).ok).toBe(false);
    expect(cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 100, everyDays: 91 }).ok).toBe(false);
    expect(cmd(g, 'u1', { type: 'recurring.add', assetId: 'NOPE', dollars: 100, everyDays: 7 }).ok).toBe(false);
    for (let k = 0; k < 5; k++) expect(cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 100, everyDays: 7 }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 100, everyDays: 7 }).ok).toBe(false);
    const id = ledgerOf(g, 'u1')!.plans.recurring[0]!.id;
    expect(cmd(g, 'u1', { type: 'recurring.cancel', planId: id }).ok).toBe(true);
    expect(ledgerOf(g, 'u1')!.plans.recurring.length).toBe(4);
  });
});

describe('DRIP', () => {
  it('reinvests a dividend in the same asset at the next tick, coded as a dividend reinvest', () => {
    const g = joined('plan-drip');
    boost(g, 'u1', 20_000);
    const def = g.market.config.assets.find((a) => a.assetClass === 'stock' && (a.dividendYield ?? 0) > 0.02 && a.listed !== false)!;
    const px = Math.exp(g.market.assets[g.market.config.assets.indexOf(def)]!.lnP);
    expect(cmd(g, 'u1', { type: 'order.place', order: { assetId: def.id, side: 'buy', type: 'market', qty: Math.floor(800 / px) } }).ok).toBe(true);
    stepGame(g);
    expect(cmd(g, 'u1', { type: 'drip.set', assetId: def.id, on: true }).ok).toBe(true);
    // a day's dividend on 16 shares is cents; the carry stands in for the cash of several days
    ledgerOf(g, 'u1')!.plans.carry[def.id] = 1000;
    runTo(g, TPD * 2 + 1); // the dividend is credited on the day boundary; DRIP places its buy then
    stepGame(g); // and the buy fills on the next tick
    expect(reasons(g, 'u1')).toContain('dividend_reinvest');
    const row = tradesOf(g, 'u1').fills.find((f) => f.reason === 'dividend_reinvest')!;
    expect(row.assetId).toBe(def.id);
    expect(row.side).toBe('buy');
  });

  it('carries exactly the dividend the engine credits that day (no re-derived amount)', () => {
    const g = joined('plan-drip-exact');
    boost(g, 'u1', 20_000);
    const def = g.market.config.assets.find((a) => a.assetClass === 'stock' && (a.dividendYield ?? 0) > 0.02 && a.listed !== false)!;
    cmd(g, 'u1', { type: 'order.place', order: { assetId: def.id, side: 'buy', type: 'market', qty: 2 } });
    stepGame(g);
    cmd(g, 'u1', { type: 'drip.set', assetId: def.id, on: true });
    runTo(g, TPD * 2);
    const before = g.market.accounts.u1!.dividends ?? 0;
    const carry0 = ledgerOf(g, 'u1')!.plans.carry[def.id] ?? 0;
    stepGame(g); // the day boundary credits the dividend, and DRIP runs on the same step
    const credited = (g.market.accounts.u1!.dividends ?? 0) - before;
    const carried = (ledgerOf(g, 'u1')!.plans.carry[def.id] ?? 0) - carry0;
    expect(credited).toBeGreaterThan(0);
    expect(carried).toBeCloseTo(credited, 9);
  });

  it('a dividend on a small holding is carried, not spent on a fraction of a share', () => {
    const g = joined('plan-drip-carry');
    boost(g, 'u1', 20_000);
    const def = g.market.config.assets.find((a) => a.assetClass === 'stock' && (a.dividendYield ?? 0) > 0.02 && a.listed !== false)!;
    const px = Math.exp(g.market.assets[g.market.config.assets.indexOf(def)]!.lnP);
    cmd(g, 'u1', { type: 'order.place', order: { assetId: def.id, side: 'buy', type: 'market', qty: 2 } });
    stepGame(g);
    cmd(g, 'u1', { type: 'drip.set', assetId: def.id, on: true });
    runTo(g, TPD * 2);
    stepGame(g);
    expect(reasons(g, 'u1')).not.toContain('dividend_reinvest');
    const carry = ledgerOf(g, 'u1')!.plans.carry[def.id] ?? 0;
    expect(carry).toBeGreaterThan(0);
    expect(carry).toBeLessThan(px);
  });

  it('needs a long position to turn on, and can be turned off', () => {
    const g = joined('plan-drip-opt');
    expect(cmd(g, 'u1', { type: 'drip.set', assetId: 'HLCN', on: true }).ok).toBe(false);
    cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } });
    stepGame(g);
    expect(cmd(g, 'u1', { type: 'drip.set', assetId: 'HLCN', on: true }).ok).toBe(true);
    expect(ledgerOf(g, 'u1')!.plans.drip).toEqual(['HLCN']);
    expect(cmd(g, 'u1', { type: 'drip.set', assetId: 'HLCN', on: false }).ok).toBe(true);
    expect(ledgerOf(g, 'u1')!.plans.drip).toEqual([]);
  });
});

describe('block trades (a TWAP of normal orders)', () => {
  it('needs the Institutional license (R4)', () => {
    const g = joined('plan-block-gate');
    const r = cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 8, slices: 4 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Institutional/);
  });

  it('slices the block over its ticks, with a preview, and every slice is reason-coded', () => {
    const g = joined('plan-block');
    boost(g, 'u1', 100_000_000);
    const r = cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 8, slices: 4 });
    expect(r.ok).toBe(true);
    const data = r.data as { expectedTotal: number; slice: number };
    expect(data.slice).toBe(2);
    expect(data.expectedTotal).toBeGreaterThan(0);
    runTo(g, g.market.tick + 14);
    const slices = tradesOf(g, 'u1').fills.filter((f) => f.reason === 'block_slice');
    expect(slices.length).toBe(4);
    expect(slices.reduce((s, f) => s + f.qty, 0)).toBe(8);
    expect(ledgerOf(g, 'u1')!.plans.blocks.length).toBe(0);
    expect(g.players.u1!.inbox.some((n) => n.msg?.key === 'work.block.done')).toBe(true);
  });

  it('validates the slices and the quantity, and checks a sell against the holding', () => {
    const g = joined('plan-block-valid');
    boost(g, 'u1', 100_000_000);
    expect(cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 8, slices: 1 }).ok).toBe(false);
    expect(cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 2, slices: 4 }).ok).toBe(false);
    expect(cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'sell', qty: 8, slices: 4 }).error).toMatch(/fewer units/);
    expect(cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 8, slices: 4 }).ok).toBe(true);
    const id = ledgerOf(g, 'u1')!.plans.blocks[0]!.id;
    expect(startBlock(g, g.players.u1!, 'HLCN', 'buy', 8, 4).ok).toBe(true);
    expect(cancelBlock(g, g.players.u1!, id).ok).toBe(true);
    expect(ledgerOf(g, 'u1')!.plans.blocks.length).toBe(1);
  });
});

describe('cash that a plan cannot touch', () => {
  it('spendable cash excludes restricted cash for recurring buys', () => {
    const g = joined('plan-restricted');
    cmd(g, 'u1', { type: 'recurring.add', assetId: 'HLCN', dollars: 300, everyDays: 1 });
    g.players.u1!.restrictedCash = cashOf(g, 'u1') - 100;
    runTo(g, 2 * TPD + 1);
    expect(g.players.u1!.inbox.some((n) => n.msg?.key.startsWith('work.recurring.skipped'))).toBe(true);
    expect(reasons(g, 'u1')).not.toContain('recurring_buy');
  });
});

describe('block accounting follows the fills (a slice the engine cuts short leaves the rest to the next slice)', () => {
  /** Close the block's last slice as the engine would leave it: `filled` units traded, the rest cancelled. */
  function closeLastSlice(g: GameState, filled: number) {
    const id = ledgerOf(g, 'u1')!.plans.blocks[0]!.lastOrderId!;
    const o = g.market.orders.find((x) => x.id === id)!;
    Object.assign(o, { status: 'cancelled', filledQty: filled, closedTick: g.market.tick, rejectReason: 'insufficient cash' });
  }

  it('a partial slice comes off the block by what it filled, and the next slices trade the rest', () => {
    const g = joined('plan-block-part');
    boost(g, 'u1', 100_000_000);
    expect(cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 8, slices: 4 }).ok).toBe(true);
    stepGame(g); // slice 1 (2 units) is placed
    closeLastSlice(g, 1); // the engine traded 1 unit of it and cancelled the rest
    stepGame(g);
    expect(ledgerOf(g, 'u1')!.plans.blocks[0]!.remaining).toBe(7);
    runTo(g, g.market.tick + 30);
    const slices = tradesOf(g, 'u1').fills.filter((f) => f.reason === 'block_slice');
    // only real fills are booked: the 7 units the rest of the block traded, never the 8 it was given
    expect(slices.reduce((s, f) => s + f.qty, 0)).toBe(7);
    expect(ledgerOf(g, 'u1')!.plans.blocks.length).toBe(0);
    expect(g.players.u1!.inbox.some((n) => n.msg?.key === 'work.block.done')).toBe(true);
  });

  it('a slice that fills nothing is retried, and the block stops with its unfilled units after the retries', () => {
    const g = joined('plan-block-none');
    boost(g, 'u1', 100_000_000);
    expect(cmd(g, 'u1', { type: 'block.start', assetId: 'HLCN', side: 'buy', qty: 4, slices: 2 }).ok).toBe(true);
    for (let k = 0; k < 40 && ledgerOf(g, 'u1')!.plans.blocks.length; k++) {
      if (ledgerOf(g, 'u1')!.plans.blocks[0]!.lastOrderId) closeLastSlice(g, 0);
      stepGame(g);
    }
    expect(ledgerOf(g, 'u1')!.plans.blocks.length).toBe(0);
    const partial = g.players.u1!.inbox.find((n) => n.msg?.key === 'work.block.partial');
    expect(partial?.msg?.vars?.unfilled).toBe(4);
    expect(tradesOf(g, 'u1').fills.filter((f) => f.reason === 'block_slice').length).toBe(0);
  });
});

describe('plan refusal reasons (each reason has its own line in both languages)', () => {
  it('maps every known refusal to a reason, and anything else to the generic one', () => {
    expect(refusal('Simple mode caps a buy at 20% of cash until Hustler.')).toBe('cap');
    expect(refusal('your assets are held by the court')).toBe('court');
    expect(refusal('Owner needs the Pro license (Owner, $250k)')).toBe('license');
    expect(refusal('insufficient cash')).toBe('cash');
    expect(refusal('insufficient position')).toBe('position');
    expect(refusal('delisted')).toBe('delisted');
    expect(refusal(undefined)).toBe('refused');
    expect(refusal('unknown asset')).toBe('refused');
    expect(refusal('something the engine never says')).toBe('refused');
  });

  it('has copy in en and fr for every reason on both plan lines', () => {
    const shared = ['cash', 'cap', 'court', 'license', 'delisted', 'refused'];
    const keys = [
      ...shared.map((r) => `work.recurring.skipped.${r}`),
      ...shared.map((r) => `work.block.stopped.${r}`),
      'work.recurring.skipped.unit',
      'work.block.stopped.position',
    ];
    for (const k of keys) {
      expect(en[k as keyof typeof en], `en ${k}`).toBeTruthy();
      expect(fr[k as keyof typeof fr], `fr ${k}`).toBeTruthy();
    }
  });
});
