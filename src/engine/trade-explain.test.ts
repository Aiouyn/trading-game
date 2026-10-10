import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { EXPLAIN_ROWS } from './ecology';
import { explainTrade, gameDayOfTick, TRADE_REALIZED_TOLERANCE } from './trade-explain';
import { openAccount } from './trading';
import type { RoundTrip, TradeLedgerReader } from './ledger-types';
import type { WorldState } from './types';

const TPD = 8;
const ASSET = 'OSTV';

function ledgerOf(...trips: RoundTrip[]): TradeLedgerReader {
  return { roundTrip: (pid, id) => trips.find((t) => t.playerId === pid && t.id === id) };
}

/** A closed trip whose figures are consistent: realized = mid + slippage - fees (unless the test sets realized). */
function trip(over: Partial<RoundTrip> = {}): RoundTrip {
  const base: RoundTrip = {
    id: 'rt1', playerId: 'p0', assetId: ASSET, side: 'long', qty: 10, openTick: 1, closeTick: 2 * TPD + 3,
    realizedPnl: 0, midPnl: 123.45, slippagePnl: -2.1, feesPaid: 1.3,
  };
  const t = { ...base, ...over };
  return { ...t, realizedPnl: over.realizedPnl ?? t.midPnl + t.slippagePnl - t.feesPaid };
}

/** A world with `days` closed game days and one account. */
function world(seed: string, days: number): WorldState {
  let s = createWorld(seed, universeConfig({ ticksPerDay: TPD }));
  s = openAccount(s, 'p0');
  return stepMany(s, days * TPD).state;
}

describe('explainTrade: the rows of a closed round trip', () => {
  it('the rows sum to the ledger realized P&L within a cent, and fees and slippage are one row', () => {
    const s = world('trade', 5);
    const r = explainTrade(s, 'p0', 'rt1', ledgerOf(trip()));
    expect(Math.abs(r.total - r.realized)).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    expect(r.realized).toBeCloseTo(123.45 - 2.1 - 1.3, 12);
    expect(r.rows.fees).toBeCloseTo(-2.1 - 1.3, 12);
    expect(Object.keys(r.rows).every((k) => k === 'fees' || (EXPLAIN_ROWS as readonly string[]).includes(k))).toBe(true);
  });

  it('the desk rows carry the trip mid P&L exactly, spread over the window', () => {
    const s = world('trade-mid', 5);
    const r = explainTrade(s, 'p0', 'rt1', ledgerOf(trip()));
    const desk = Object.entries(r.rows).filter(([k]) => k !== 'fees').reduce((a, [, v]) => a + (v ?? 0), 0);
    expect(desk).toBeCloseTo(123.45, 9);
    expect(r.openDay).toBe(0);
    expect(r.closeDay).toBe(2);
  });

  it('a close on the still-open day is rejected, and so is a trip that opened before the archive', () => {
    const s = world('trade-open', 5);
    expect(() => explainTrade(s, 'p0', 'rt1', ledgerOf(trip({ closeTick: 5 * TPD + 1 })))).toThrow(/open or not closed/);
    expect(() => explainTrade(s, 'p0', 'rt1', ledgerOf(trip({ openTick: 0 })))).toThrow(/before the explain archive/);
  });

  it('an unknown trip, or a trip that closes before it opens, is rejected', () => {
    const s = world('trade-unknown', 5);
    expect(() => explainTrade(s, 'p0', 'nope', ledgerOf(trip()))).toThrow(/no closed round trip/);
    expect(() => explainTrade(s, 'p0', 'rt1', ledgerOf(trip({ openTick: 30, closeTick: 10 })))).toThrow(/closes before it opens/);
  });

  it('the spec call (state, playerId, roundTripId) is valid before the ledger lands: it throws for every trip', () => {
    const s = world('trade-noledger', 5);
    expect(() => explainTrade(s, 'p0', 'rt1')).toThrow(/no closed round trip rt1/);
  });

  it('a ledger whose figures do not add up is caught, not explained away', () => {
    const s = world('trade-bad', 5);
    expect(() => explainTrade(s, 'p0', 'rt1', ledgerOf(trip({ realizedPnl: 999 })))).toThrow(/rows sum to/);
  });

  it('across 20 seeds and many trips, the rows sum to the ledger realized P&L within a cent', () => {
    let checked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = world(`trips-${seed}`, 6);
      for (let k = 0; k < 8; k++) {
        const open = 1 + ((seed * 7 + k * 3) % 30);
        const close = open + ((seed + k * 5) % 20) + 1;
        if (gameDayOfTick(close, TPD) > 5) continue;
        const t = trip({
          id: `t${k}`, openTick: open, closeTick: close,
          midPnl: Math.sin(seed * 13 + k) * 900,
          slippagePnl: -Math.abs(Math.cos(seed + k * 2)) * 15,
          feesPaid: 0.5 + ((seed + k) % 7),
        });
        const r = explainTrade(s, 'p0', `t${k}`, ledgerOf(t));
        expect(Math.abs(r.total - t.realizedPnl)).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('gameDayOfTick', () => {
  it('a day closes at its last tick, the same rule the ecology close uses', () => {
    expect(gameDayOfTick(1, TPD)).toBe(0);
    expect(gameDayOfTick(TPD, TPD)).toBe(0);
    expect(gameDayOfTick(TPD + 1, TPD)).toBe(1);
  });
});
