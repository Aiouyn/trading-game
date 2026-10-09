import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { delist, delistAsset, spinOff } from './listings';
import { openAccount, placeOrder, setAccountPermissions, settleAsset, tradeOption } from './trading';
import { contractId, DEFAULT_OPTIONS, listedExpiries, optionChain } from './options';
import type { AssetDef, StepEvent, WorldState } from './types';

const TPD = 24;
const PARENT = 'OSTV';

function world(seed = 'listings', odds = { ipo: 0.3, bankruptcy: 0.1, merger: 0.1, spinoff: 0.1 }): WorldState {
  return createWorld(seed, universeConfig({ ticksPerDay: TPD, listings: { odds } }));
}

function run(s: WorldState, days: number): { state: WorldState; events: StepEvent[] } {
  const events: StepEvent[] = [];
  let st = s;
  for (let d = 0; d < days; d++) {
    const r = stepMany(st, TPD);
    st = r.state;
    for (const e of r.events) if (e.type === 'listing') events.push(e);
  }
  return { state: st, events };
}

describe('the evolving universe', () => {
  it('keeps config, asset state and ecology aligned through many listings', () => {
    const { state, events } = run(world(), 90);
    expect(events.length).toBeGreaterThan(3);
    expect(state.assets.length).toBe(state.config.assets.length);
    expect(state.ecology!.assets.length).toBe(state.config.assets.length);
    expect(state.assets.every((a) => Number.isFinite(a.lnP))).toBe(true);
  });

  it('an IPO adds a fictional stock that then trades', () => {
    const s0 = world('ipo-check', { ipo: 1, bankruptcy: 0, merger: 0, spinoff: 0 });
    const n0 = s0.config.assets.length;
    const { state, events } = run(s0, 3);
    const ipo = events.find((e) => e.type === 'listing' && e.kind === 'ipo');
    expect(ipo).toBeDefined();
    expect(state.config.assets.length).toBe(n0 + events.filter((e) => e.type === 'listing').length);
    const added = state.config.assets[n0]!;
    expect(added.assetClass).toBe('stock');
    expect(added.listed).toBeUndefined();
    const before = state.assets[n0]!.lnP;
    const after = stepMany(state, TPD * 2).state.assets[n0]!.lnP;
    expect(after).not.toBe(before);
  });

  it('is deterministic: the same seed replays byte-identical', () => {
    const a = run(world('replay'), 40).state;
    const b = run(world('replay'), 40).state;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('settlement and delisting', () => {
  it('a long settles in cash at the settlement price, with the realized loss booked', () => {
    let s = openAccount(createWorld('settle', universeConfig({ ticksPerDay: TPD })), 'p1');
    s = { ...s, accounts: { ...s.accounts, p1: { ...s.accounts.p1!, cash: 0, positions: { [PARENT]: { qty: 100, avgCost: 50, realizedPnl: 0 } } } } };
    const after = settleAsset(s, PARENT, 10);
    expect(after.accounts.p1!.cash).toBeCloseTo(1000, 9);
    expect(after.accounts.p1!.positions[PARENT]).toBeUndefined();
    expect(after.accounts.p1!.realizedPnl).toBeCloseTo(-4000, 9);
  });

  it('a short is closed at the settlement price, with the gain booked', () => {
    let s = openAccount(createWorld('settle', universeConfig({ ticksPerDay: TPD })), 'p1');
    s = { ...s, accounts: { ...s.accounts, p1: { ...s.accounts.p1!, cash: 0, positions: { [PARENT]: { qty: -100, avgCost: 50, realizedPnl: 0 } } } } };
    const after = settleAsset(s, PARENT, 10);
    expect(after.accounts.p1!.cash).toBeCloseTo(-1000, 9);
    expect(after.accounts.p1!.realizedPnl).toBeCloseTo(4000, 9);
  });

  it('a delisted name cannot be traded and its price stays frozen', () => {
    const s0 = world('freeze', { ipo: 0, bankruptcy: 0, merger: 0, spinoff: 0 });
    const i = s0.config.assets.findIndex((a) => a.id === PARENT);
    const s1 = delist(s0, i, 20);
    const frozen = stepMany(s1, TPD * 5).state;
    expect(frozen.assets[i]!.lnP).toBe(s1.assets[i]!.lnP);
    expect(frozen.config.assets[i]!.delisted).toBe(true);
    const r = placeOrder(openAccount(frozen, 'p2'), { playerId: 'p2', assetId: PARENT, side: 'buy', type: 'market', qty: 1 });
    expect(r.order.status).toBe('rejected');
    expect(r.order.rejectReason).toBe('not tradable');
  });

  it('a spin-off conserves the holder\'s value: parent shares fall, child shares make up the difference', () => {
    const s0 = world('spin', { ipo: 0, bankruptcy: 0, merger: 0, spinoff: 0 });
    const i = s0.config.assets.findIndex((a) => a.id === PARENT);
    const pDef = s0.config.assets[i]!;
    const pPrice = Math.exp(s0.assets[i]!.lnP);
    const cPrice = 30;
    const child: AssetDef = { ...pDef, id: 'SPUN', name: 'Spun Holdings', initialPrice: cPrice, listed: undefined, delisted: undefined };
    let s = openAccount(s0, 'p1');
    s = { ...s, accounts: { ...s.accounts, p1: { ...s.accounts.p1!, positions: { [PARENT]: { qty: 1000, avgCost: pPrice, realizedPnl: 0 } } } } };
    const after = spinOff(s, i, child);
    const parentQty = after.accounts.p1!.positions[PARENT]!.qty;
    const childQty = after.accounts.p1!.positions.SPUN!.qty;
    expect(parentQty).toBe(1000);
    expect(childQty).toBe(100);
    const newParent = Math.exp(after.assets[i]!.lnP);
    const before = 1000 * pPrice;
    const afterValue = parentQty * newParent + childQty * cPrice;
    expect(afterValue).toBeCloseTo(before, 6);
  });
});

describe('listed options on a delisted name', () => {
  const OPT = { ...DEFAULT_OPTIONS, underlyings: [PARENT] };
  const EXP = 4;
  const callId = contractId({ underlying: PARENT, expiryDay: EXP, kind: 'call', strike: 20 });
  const putId = contractId({ underlying: PARENT, expiryDay: EXP, kind: 'put', strike: 30 });

  /** A world with options on PARENT, and p1 holding a long call and a short put on it. */
  function withPositions(seed: string): WorldState {
    const s0 = createWorld(seed, universeConfig({ ticksPerDay: TPD, options: OPT }));
    const s = setAccountPermissions(openAccount(s0, 'p1'), 'p1', { canOptions: true });
    return {
      ...s,
      accounts: {
        ...s.accounts,
        p1: {
          ...s.accounts.p1!,
          options: {
            [callId]: { qty: 2, avgCost: 1.5 },
            [putId]: { qty: -3, avgCost: 0.5 },
          },
          realizedPnl: 0,
        },
      },
    };
  }

  const idx = (s: WorldState) => s.config.assets.findIndex((a) => a.id === PARENT);

  it('a long call and a short put settle at intrinsic on a bankruptcy: cash and realized P&L booked, positions removed', () => {
    const s0 = withPositions('opt-settle');
    const cash0 = s0.accounts.p1!.cash;
    const s1 = delist(s0, idx(s0), 25);
    const p1 = s1.accounts.p1!;
    // call 20 vs 25: intrinsic 5 x 100 x 2 long = +1000; put 30 vs 25: intrinsic 5 x 100 x -3 short = -1500
    expect(p1.cash).toBeCloseTo(cash0 - 500, 9);
    // realized: call 1000 - 1.5 x 100 x 2 = 700; put -1500 - 0.5 x 100 x (-3) = -1350
    expect(p1.realizedPnl).toBeCloseTo(-650, 9);
    expect(p1.options).toEqual({});
    expect(s1.config.assets[idx(s1)]!.delisted).toBe(true);
  });

  it('emits one option_expiry event per settled position, tagged as a delisting, with the payout', () => {
    const s0 = withPositions('opt-events');
    const { events } = delistAsset(s0, idx(s0), 25, 7);
    const ex = events.filter((e) => e.type === 'option_expiry');
    expect(ex).toHaveLength(2);
    expect(ex).toContainEqual({ type: 'option_expiry', tick: 7, playerId: 'p1', contractId: callId, qty: 2, payout: 1000, reason: 'delisting' });
    expect(ex).toContainEqual({ type: 'option_expiry', tick: 7, playerId: 'p1', contractId: putId, qty: -3, payout: -1500, reason: 'delisting' });
  });

  it('refuses a trade on a contract whose underlying is delisted, buy or sell; the same contract trades before', () => {
    const s0 = withPositions('opt-refuse');
    expect(tradeOption(s0, 'p1', callId, 'buy', 1).error).toBeUndefined();
    const s1 = delist(s0, idx(s0), 25);
    const buy = tradeOption(s1, 'p1', callId, 'buy', 1);
    expect(buy.error).toMatch(/delisted/);
    expect(buy.state).toBe(s1);
    expect(tradeOption(s1, 'p1', callId, 'sell', 1).error).toMatch(/delisted/);
  });

  it('lists no chain and no expiries for a delisted underlying', () => {
    const s0 = withPositions('opt-chain');
    expect(listedExpiries(s0, PARENT)).toHaveLength(4);
    expect(optionChain(s0, PARENT, EXP).length).toBeGreaterThan(0);
    const s1 = delist(s0, idx(s0), 25);
    expect(listedExpiries(s1, PARENT)).toEqual([]);
    expect(listedExpiries(s1)).toEqual([]);
    expect(optionChain(s1, PARENT, EXP)).toEqual([]);
  });

  it('is deterministic: the same settlement replays byte-identical, through the following days too', () => {
    const a = stepMany(delist(withPositions('opt-det'), idx(withPositions('opt-det')), 25), TPD * 2).state;
    const b = stepMany(delist(withPositions('opt-det'), idx(withPositions('opt-det')), 25), TPD * 2).state;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
