import { describe, expect, it } from 'vitest';
import { cbRow, cbWorld, M, stubPorts } from '../testkit/cbWorld';
import { fiscalWorld, putBloc } from '../testkit/fiscalWorld';
import { macroTables } from '../schema';
import { fxReservesFdl, importsMonthFdl, reserveCover } from './fxReserves';

describe('T04-14 reserve cover', () => {
  it('SRL GDP 15e12 FDL, openness 0.4 → imports 461,538,461,538.461538/month; reserves 1.5e12 → 3.25 months', () => {
    const w = fiscalWorld(0);
    putBloc(w, 'SRL', { gdp: 15e12 });
    w.put(macroTables.publicView.name, { id: 'SRL', fx: { spotVsFdl: 1 } } as never);
    const im = importsMonthFdl(w.ctx.store, 'SRL');
    expect(im).toBe(461_538_461_538_461_538n);
    expect(reserveCover(M(1.5e12), im)).toBe(3.25);
    expect(reserveCover(M(1), 0n)).toBe(1e9);
  });
});

describe('T04-14 fxReservesFdl', () => {
  it('FDL cash + other FX at spot', () => {
    const w = cbWorld([cbRow('SRL', { reserves: { fdl: M(1), gold: 0n, otherFx: { EUN: M(100) } } } as never)]);
    const p = stubPorts();
    const ports = { ...p, markets: { ...p.markets, fxSpot: (_s: unknown, c: string) => (c === 'EUN' ? 1.1 : null) }, assets: { ...p.assets, commodityClose: () => null } } as never;
    expect(fxReservesFdl(w.ctx.store, 'SRL', ports)).toBe(M(111));
  });
});
