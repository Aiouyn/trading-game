import { describe, expect, it } from 'vitest';
import { isTradingDay, tradingDaysBetween, type ParamsView } from '@tycoon/engine-core';
import { auctionsCountInQuarter, auctionsInQuarter, meetingPlan, meetingsInRange, monthStartDay, nthTradingDay, previousTradingDay, quarterStartDay,
  releasesInRange, tradingDayIndexInMonth, tradingDayIndexInQuarter, tradingDayIndexInYear, tradingDaysOfPeriod, utcBandOf, utcHourOfTick,
  writeQuarterSchedule } from './calendar';
import { BLOC_ORDER, type BlocId } from '../schema';

const P: Record<string, number> = { macro_cb_meetings_per_year: 4, macro_cb_decision_tick: 420, macro_auction_tick: 330, macro_auction_announce_tick: 420 };
const params = (o: Record<string, number> = {}): ParamsView => {
  const m = { ...P, ...o };
  return { num: (k) => { if (!(k in m)) throw new Error(k); return m[k]!; }, int: (k) => { if (!(k in m)) throw new Error(k); return m[k]!; } };
};
const pv = params();
const MODES = [false, true] as const;   // D071 default (no holidays) and the D016 table

describe('period helpers', () => {
  it('quarter and month starts (28/28/35)', () => {
    expect([0, 90, 91, 181, 182, 363, 364, 455].map(quarterStartDay)).toEqual([0, 0, 91, 91, 182, 273, 364, 455]);
    expect([0, 27, 28, 55, 56, 90, 91, 119, 147, 364 + 60].map(monthStartDay)).toEqual([0, 0, 28, 28, 56, 56, 91, 119, 147, 364 + 56]);
  });
  it('nthTradingDay: Monday-start formula, clamp, n ≥ 1', () => {
    for (const n of [1, 5, 6, 15, 39, 63, 65]) expect(nthTradingDay('NKR', 0, 91, n)).toBe(7 * Math.floor((n - 1) / 5) + ((n - 1) % 5));
    expect(tradingDaysOfPeriod('FDL', 0, 91).length).toBe(65);
    expect(nthTradingDay('FDL', 0, 91, 70)).toBe(88);   // last trading day (Fri of week 13)
    expect(nthTradingDay('FDL', 0, 91, 70, true)).toBe(88);
    expect(() => nthTradingDay('FDL', 0, 91, 0)).toThrow(); expect(() => nthTradingDay('FDL', 5, 2, 1)).toThrow(/no trading day/);
  });
  it('indices and previousTradingDay; D016 shifts them', () => {
    expect(tradingDayIndexInQuarter('FDL', 52)).toBe(39); expect(tradingDayIndexInQuarter('FDL', 5)).toBeNull();
    expect(tradingDayIndexInQuarter('FDL', 91 + 7)).toBe(6);
    expect(tradingDayIndexInMonth('FDL', 28)).toBe(1); expect(tradingDayIndexInMonth('FDL', 60)).toBe(5);
    expect(tradingDayIndexInYear('FDL', 364 + 1)).toBe(2); expect(tradingDayIndexInYear('FDL', 364 + 1, true)).toBe(1);   // Genesis Day closed
    expect(tradingDayIndexInYear('FDL', 182)).toBe(131);
    expect(previousTradingDay('FDL', 7)).toBe(4); expect(previousTradingDay('FDL', 60, true)).toBe(58);   // Charter Day 59
    expect(previousTradingDay('FDL', 0)).toBe(-3);   // before genesis: weekday rule only
  });
});

describe('CB meetings (§3.6.1, D056)', () => {
  it('worked example (day 0 Monday, no holiday in quarter 0)', () => {
    const n = meetingPlan('NKR', 0, pv);
    expect(n.meetingTick).toBe(13_380); expect(n.guidanceTick).toBe(-6 * 720 + 420);   // before genesis: T04-06 skips it
    const f = meetingPlan('FDL', 0, pv);
    expect([f.meetingTick, f.guidanceTick, f.minutesTick]).toEqual([37_860, 20_580, 47_940]);
    expect([meetingPlan('SRL', 0, pv), meetingPlan('EUN', 0, pv), meetingPlan('PYN', 0, pv)].map((p) => (p.meetingTick - 420) / 720))
      .toEqual([7 * 5 + 1, 7 * 10 + 0, 7 * 12 + 2]);   // n = 27, 51, 63
  });
  it('guidance moves to the previous and minutes to the next trading day on weekends', () => {
    const e = meetingPlan('EUN', 0, pv);   // day 70 (Mon): guidance 46 (Thu), minutes 84 (Mon)
    expect([e.guidanceTick, e.minutesTick].map((t) => (t - 420) / 720)).toEqual([46, 84]);
    const s = meetingPlan('SRL', 0, pv);   // day 36 (Tue): guidance 12 Sat → 11 Fri; minutes 50 (Tue)
    expect((s.guidanceTick - 420) / 720).toBe(11);
    const p = meetingPlan('PYN', 0, pv);   // day 86 (Wed): guidance 62 Sun → 60 Fri; minutes 100 (Fri)
    expect([p.guidanceTick, p.minutesTick].map((t) => (t - 420) / 720)).toEqual([60, 100]);
    const k = meetingPlan('NKR', 91, pv);   // day 109 (Fri... ) minutes 123 → weekday check
    expect(isTradingDay('NKR', (k.minutesTick - 420) / 720)).toBe(true);
    for (const b of BLOC_ORDER) for (let q = 0; q < 8 * 91; q += 91) {
      const m = meetingPlan(b, q, pv, true);
      for (const t of [m.guidanceTick, m.minutesTick]) if (t >= 0 && !isTradingDay(b, (t - 420) / 720, true)) throw new Error(`${b} ${q}`);
      if (!isTradingDay(b, (m.meetingTick - 420) / 720, true)) throw new Error(`meeting ${b} ${q}`);
    }
  });
  it('D016 on: EUN Q2 minutes land on Midsummer Fair (doy 177) and move to the next trading day', () => {
    const e = meetingPlan('EUN', 91, pv, true);
    expect((e.meetingTick - 420) / 720).toBe(162);
    expect((e.minutesTick - 420) / 720).toBe(177);   // 176 is the holiday (dayIndex 176 = doy 177) → Wed 177
    expect(isTradingDay('EUN', 176, true)).toBe(false);
  });
  it('meetings/year param must be 4; decision tick is the param', () => {
    expect(() => meetingPlan('FDL', 0, params({ macro_cb_meetings_per_year: 6 }))).toThrow(/must be 4/);
    expect(meetingPlan('FDL', 0, params({ macro_cb_decision_tick: 400 })).meetingTick).toBe(52 * 720 + 400);
  });
  for (const h of MODES) {
    it(`04#44 quarterly per bloc, staggered, never the ~6-real-day cadence (holidays ${h})`, () => {
      const all = meetingsInRange(0, 10 * 364 * 720, pv, h);
      for (const b of BLOC_ORDER) {
        const mine = all.filter((m) => m.bloc === b);
        for (let y = 0; y < 10; y++) {
          const inY = mine.filter((m) => Math.floor(m.meetingTick / 720 / 364) === y);
          expect(inY.length).toBe(4);
          expect(inY.map((m) => Math.floor((m.meetingTick / 720) % 364 / 91))).toEqual([0, 1, 2, 3]);
        }
        for (let i = 1; i < mine.length; i++) {
          const gap = (mine[i]!.meetingTick - mine[i - 1]!.meetingTick) / 720;
          expect(gap).toBeGreaterThanOrEqual(77); expect(gap).toBeLessThanOrEqual(105); expect(gap).not.toBe(144);
        }
      }
      const days = all.map((m) => Math.floor(m.meetingTick / 720));
      expect(new Set(days).size).toBe(days.length);
      for (let q = 0; q < 40; q++) expect(all.filter((m) => m.quarterStartDay === q * 91).map((m) => m.bloc)).toEqual(['NKR', 'SRL', 'FDL', 'EUN', 'PYN']);
      for (let i = 1; i < all.length; i++) expect(all[i]!.meetingTick).toBeGreaterThan(all[i - 1]!.meetingTick);
    });
  }
  it('meetingsInRange is half-open', () => {
    expect(meetingsInRange(13_380, 13_381, pv).map((m) => m.bloc)).toEqual(['NKR']);
    expect(meetingsInRange(0, 13_380, pv)).toEqual([]);
  });
});

describe('releases (§3.15.1)', () => {
  const q0 = releasesInRange(0, 91, pv);
  const at = (b: BlocId, k: string, list = q0) => list.filter((r) => r.bloc === b && r.kind === k);
  it('monthly days with bloc offsets and ticks; CPI EUN is one trading day after FDL', () => {
    const cpiF = at('FDL', 'CPI'), cpiE = at('EUN', 'CPI');
    expect(cpiF.map((r) => (r.tick - 45) / 720)).toEqual([35, 63]);   // trading day 6; month 0's print would measure a pre-genesis month
    expect(cpiE.map((r) => (r.tick - 45) / 720)).toEqual([36, 64]);
    expect(at('SRL', 'PMI').map((r) => (r.tick - 45) / 720)).toEqual([32, 60]);   // 1 + 4
    expect(at('FDL', 'RESERVES')[0]!.tick).toBe((28 + 3) * 720 + 300);
    expect(at('FDL', 'CREDIT')[1]!.tick).toBe((56 + 21) * 720 + 300);   // trading day 16 of a 35-day month
    expect(at('SRL', 'CREDIT')[0]!.tick).toBe((28 + 25) * 720 + 300);   // 16 + 4 = 20 = the last trading day of a 28-day month
    expect(at('SRL', 'CREDIT')[1]!.tick).toBe((56 + 25) * 720 + 300);   // day 20 exists in a 35-day month
    expect(at('FDL', 'JOBS').map((r) => r.referencePeriod)).toEqual([{ kind: 'MONTH', index: 0 }, { kind: 'MONTH', index: 1 }]);
  });
  it('monthly prints measure the previous month (none before genesis)', () => {
    const y1 = releasesInRange(0, 364, pv);
    expect(at('FDL', 'CPI', y1).map((r) => r.referencePeriod.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(at('FDL', 'CPI', y1)[0]!.tick).toBe(35 * 720 + 45);
    expect(at('FDL', 'CPI', y1).every((r) => r.referencePeriod.kind === 'MONTH')).toBe(true);
  });
  it('quarterly: GDP_ADV td 10 of the next quarter, REV1/REV2 +20/+40 trading days, FISCAL td 15; reference q−1', () => {
    const q1 = releasesInRange(91, 182, pv);
    expect(at('FDL', 'GDP_ADV', q0)).toEqual([]);
    const adv = at('FDL', 'GDP_ADV', q1)[0]!;
    expect(adv.tick).toBe((91 + 7 + 4) * 720 + 45); expect(adv.referencePeriod).toEqual({ kind: 'QUARTER', index: 0 });
    const advDay = (adv.tick - 45) / 720;
    expect(tradingDaysBetween('FDL', advDay + 1, (at('FDL', 'GDP_REV1', q1)[0]!.tick - 45) / 720 + 1)).toBe(20);
    expect(tradingDaysBetween('FDL', advDay + 1, (at('FDL', 'GDP_REV2', q1)[0]!.tick - 45) / 720 + 1)).toBe(40);
    expect(at('PYN', 'FISCAL', q1)[0]!.tick).toBe((91 + 7 * 3 + 1) * 720 + 300);   // td 17
    expect(at('PYN', 'GDP_ADV', q1)[0]!.tick).toBe((91 + 7 * 2 + 1) * 720 + 45);   // td 12
  });
  it('SENTIMENT weekly on Friday at 300 (current week); on a Friday holiday the last trading day of that week', () => {
    expect(at('FDL', 'SENTIMENT').map((r) => r.tick)).toEqual(Array.from({ length: 13 }, (_, w) => (7 * w + 4) * 720 + 300));
    expect(at('FDL', 'SENTIMENT')[3]!.referencePeriod).toEqual({ kind: 'WEEK', index: 3 });
    const h = releasesInRange(229, 236 + 1, pv, true).filter((r) => r.bloc === 'FDL' && r.kind === 'SENTIMENT');   // Harvest Day Fri doy 236
    expect(h.map((r) => (r.tick - 300) / 720)).toEqual([234]);
  });
  it('consensusTick = previous trading day at t = 420', () => {
    expect(at('FDL', 'CPI')[0]!.consensusTick).toBe(32 * 720 + 420);   // day 35 (Mon) → Fri 32
    expect(at('FDL', 'PMI')[1]!.consensusTick).toBe(53 * 720 + 420);   // Mon day 56 → Fri 53
    expect(at('FDL', 'JOBS')[0]!.consensusTick).toBe(28 * 720 + 420);   // Tue 29 → Mon 28
  });
  for (const h of MODES) {
    it(`releases never fall on weekends or bloc holidays; sorted (holidays ${h})`, () => {
      const all = releasesInRange(0, 3 * 364, pv, h);
      for (const r of all) {
        const d = Math.floor(r.tick / 720);
        if (!isTradingDay(r.bloc, d, h)) throw new Error(`${r.bloc} ${r.kind} ${d}`);
        if (!isTradingDay(r.bloc, Math.floor(r.consensusTick / 720), h) || r.consensusTick >= r.tick) throw new Error('consensus');
        if (r.kind.startsWith('CB_')) throw new Error('CB rows come from meetingPlan');
      }
      for (let i = 1; i < all.length; i++) expect(all[i]!.tick >= all[i - 1]!.tick).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  }
  it('range is half-open on release day', () => {
    expect(releasesInRange(35, 36, pv).filter((r) => r.bloc === 'FDL').map((r) => r.kind)).toEqual(['CPI']);
    expect(releasesInRange(35, 35, pv)).toEqual([]);
  });
});

describe('auctions (§3.10.2)', () => {
  it('SRL has no N30Y and no L10Y, but a quarterly SRL Global FDL 10Y syndication on td 20 of month 1', () => {
    const s = auctionsInQuarter('SRL', 0, pv);
    expect(s.filter((a) => a.tenor === 'N30Y' || a.tenor === 'L10Y')).toEqual([]);
    const g = s.filter((a) => a.fxDenominated);
    expect(g.length).toBe(1); expect(g[0]).toMatchObject({ tenor: 'N10Y', syndicated: true, newLine: true, dayIndex: 25 });
    expect(auctionsCountInQuarter('SRL', 91, 'N30Y', pv)).toBe(0);
  });
  it('FDL: N10Y new line in month 1, reopenings in months 2 and 3; N2Y/N5Y td 8; L10Y td 12 month 3; N30Y reopening td 12 month 2', () => {
    const f = auctionsInQuarter('FDL', 91, pv);
    expect(f.filter((a) => a.tenor === 'N10Y').map((a) => [a.dayIndex - 91, a.newLine])).toEqual([[11, true], [28 + 11, false], [56 + 11, false]]);
    expect(f.filter((a) => a.tenor === 'N2Y').map((a) => a.dayIndex - 91)).toEqual([9, 37, 65]);
    expect(f.filter((a) => a.tenor === 'L10Y').map((a) => a.dayIndex - 91)).toEqual([56 + 15]);
    expect(f.filter((a) => a.tenor === 'N30Y').map((a) => [a.dayIndex - 91, a.newLine, a.syndicated])).toEqual([[28 + 15, false, false]]);
    expect(f.every((a) => !a.fxDenominated)).toBe(true);
    expect(auctionsInQuarter('NKR', 0, pv).filter((a) => a.tenor === 'N2Y').map((a) => a.dayIndex)).toEqual([14, 42, 70]);   // 8 + 3
  });
  it('N30Y syndicated new line once per game year: Q1, trading day 20 (card DEFAULT)', () => {
    for (let q = 0; q < 8; q++) {
      const n = auctionsInQuarter('EUN', q * 91, pv).filter((a) => a.tenor === 'N30Y' && a.syndicated);
      expect(n.length).toBe(q % 4 === 0 ? 1 : 0);
      if (n.length) expect(n[0]!.dayIndex).toBe(q * 91 + 25);
    }
  });
  it('bills: B3M/B6M every Monday, B1Y every fourth Monday (week of year ≡ 0 mod 4)', () => {
    const f = auctionsInQuarter('FDL', 0, pv);
    expect(f.filter((a) => a.tenor === 'B3M').map((a) => a.dayIndex)).toEqual(Array.from({ length: 13 }, (_, w) => 7 * w));
    expect(auctionsCountInQuarter('FDL', 0, 'B6M', pv)).toBe(13);
    expect(f.filter((a) => a.tenor === 'B1Y').map((a) => a.dayIndex)).toEqual([21, 49, 77]);
    expect(auctionsInQuarter('FDL', 0, pv, true).filter((a) => a.tenor === 'B3M')[0]!.dayIndex).toBe(1);   // Genesis Day → next trading day
  });
  for (const h of MODES) {
    it(`announce 3 bloc trading days before at t=420; bidOpen = announce; auction at t=330; sorted (holidays ${h})`, () => {
      for (const b of BLOC_ORDER) for (let q = 91; q < 5 * 91; q += 91) {
        const list = auctionsInQuarter(b, q, pv, h);
        for (const a of list) {
          const ad = (a.announceTick - 420) / 720;
          expect(a.auctionTick).toBe(a.dayIndex * 720 + 330); expect(a.bidOpenTick).toBe(a.announceTick);
          expect(tradingDaysBetween(b, ad, a.dayIndex, h)).toBe(3); expect(isTradingDay(b, ad, h)).toBe(true);
          expect(isTradingDay(b, a.dayIndex, h)).toBe(true);
        }
        for (let i = 1; i < list.length; i++) expect(list[i]!.auctionTick >= list[i - 1]!.auctionTick).toBe(true);
      }
    });
  }
  it('auction tick is the param', () => {
    expect(auctionsInQuarter('FDL', 0, params({ macro_auction_tick: 300 }))[0]!.auctionTick).toBe(300);
  });
});

describe('UTC bands', () => {
  it('utcHourOfTick and bands', () => {
    const hd = { tick: 0, sealUtcMs: 0n };
    expect(utcHourOfTick(hd, 720)).toBe(1); expect(utcHourOfTick(hd, 17_280)).toBe(0); expect(utcHourOfTick(hd, 17_280 - 1)).toBe(23);
    expect(utcHourOfTick({ tick: 100, sealUtcMs: 3_600_000n * 5n }, 100 + 720 * 3)).toBe(8);
    expect(utcHourOfTick({ tick: 720, sealUtcMs: 0n }, 0)).toBe(23);   // planned map backwards wraps
    expect([0, 7, 8, 15, 16, 23].map(utcBandOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('writeQuarterSchedule', () => {
  const mkCtx = () => {
    const rows = new Map<string, unknown>(); let puts = 0;
    const store = { get: (_t: string, id: string) => rows.get(id), put: (t: string, e: { id: string }) => { expect(t).toBe('mac.schedule'); puts++; rows.set(e.id, e); },
      del: () => undefined, iter: () => [], range: () => [], index: () => [], count: () => rows.size };
    return { ctx: { newId: () => 'x', params: pv, store } as never, rows, puts: () => puts };
  };
  it('rows per (bloc, kind, tick) incl. CB rows, idempotent', () => {
    const { ctx, rows, puts } = mkCtx();
    writeQuarterSchedule(ctx, 91);
    const n = rows.size; expect(n).toBe(puts());
    const expected = releasesInRange(91, 182, pv).length + 5 * 3;
    expect(n).toBe(expected);
    expect(rows.get('FDL:CB_DECISION:' + meetingPlan('FDL', 91, pv).meetingTick)).toMatchObject({ bloc: 'FDL', kind: 'CB_DECISION', rule: 'QUARTERLY_DAY', tickOfDay: 420 });
    const cpi = releasesInRange(91, 182, pv).find((r) => r.bloc === 'EUN' && r.kind === 'CPI')!;
    expect(rows.get(`EUN:CPI:${cpi.tick}`)).toMatchObject({ rule: 'MONTHLY_DAY', tickOfDay: 45, dayOffset: (cpi.tick - 45) / 720 - 91 });
    writeQuarterSchedule(ctx, 91);
    expect(puts()).toBe(n);
  });
  it('quarter 0 skips the pre-genesis NKR guidance', () => {
    const { ctx, rows } = mkCtx();
    writeQuarterSchedule(ctx, 0);
    expect([...rows.keys()].filter((k) => k.startsWith('NKR:CB_GUIDANCE'))).toEqual([]);
    expect([...rows.keys()].filter((k) => k.startsWith('FDL:CB_GUIDANCE'))).toEqual(['FDL:CB_GUIDANCE:20580']);
  });
});

describe('E-51 acceptance criteria', () => {
  it('AC-04-02-ANNOUNCE: announcements use macro_auction_announce_tick; retuning macro_cb_decision_tick moves neither auctions nor consensus', () => {
    const base = auctionsInQuarter('FDL', 91, pv), moved = auctionsInQuarter('FDL', 91, params({ macro_cb_decision_tick: 400 }));
    expect(moved).toEqual(base);
    expect(base.every((a) => a.announceTick % 720 === 420)).toBe(true);
    expect(auctionsInQuarter('FDL', 91, params({ macro_auction_announce_tick: 400 })).every((a) => a.announceTick % 720 === 400 && a.bidOpenTick === a.announceTick)).toBe(true);
    const r0 = releasesInRange(91, 182, pv), r1 = releasesInRange(91, 182, params({ macro_cb_decision_tick: 400 }));
    expect(r1).toEqual(r0); expect(r0.every((r) => r.consensusTick % 720 === 420)).toBe(true);
    expect(releasesInRange(91, 182, params({ macro_auction_announce_tick: 400 }))).toEqual(r0);   // consensus stays literal t = 420
  });
  it('AC-04-02-REFPERIOD: first PMI (referencePeriod.index 0) lands in month 1; no month-0 monthly; no quarter-0 GDP/FISCAL print', () => {
    const y = releasesInRange(0, 364, pv);
    const pmi = y.filter((r) => r.bloc === 'FDL' && r.kind === 'PMI');
    expect(pmi[0]!.referencePeriod).toEqual({ kind: 'MONTH', index: 0 }); expect(monthStartDay(Math.floor(pmi[0]!.tick / 720))).toBe(28);
    expect(y.filter((r) => r.referencePeriod.kind === 'MONTH' && Math.floor(r.tick / 720) < 28)).toEqual([]);
    expect(y.filter((r) => ['GDP_ADV', 'GDP_REV1', 'GDP_REV2', 'FISCAL'].includes(r.kind) && Math.floor(r.tick / 720) < 91)).toEqual([]);
    expect(y.every((r) => r.referencePeriod.index >= 0)).toBe(true);
  });
  it('AC-04-02-OFFSET: no bloc offset for N30Y, L10Y and the SRL Global FDL 10Y', () => {
    for (const b of ['FDL', 'EUN', 'PYN', 'NKR'] as const) {
      const a = auctionsInQuarter(b, 0, pv);
      expect(a.filter((x) => x.tenor === 'N30Y' && !x.syndicated).map((x) => x.dayIndex)).toEqual([28 + 15]);   // td 12 of month 2
      expect(a.filter((x) => x.tenor === 'N30Y' && x.syndicated).map((x) => x.dayIndex)).toEqual([25]);         // td 20 of Q1
      expect(a.filter((x) => x.tenor === 'L10Y').map((x) => x.dayIndex)).toEqual([56 + 15]);                    // td 12 of month 3
    }
    expect(auctionsInQuarter('SRL', 0, pv).filter((x) => x.fxDenominated).map((x) => x.dayIndex)).toEqual([25]);   // td 20 of month 1, no +4
  });
  it('AC-04-02-ZEROSHARE: stub until T04-11 (AC-04-11-MIXSTUB) - only SRL N30Y and L10Y are absent', () => {
    for (const b of BLOC_ORDER) for (const t of ['N30Y', 'L10Y'] as const) expect(auctionsCountInQuarter(b, 0, t, pv) === 0).toBe(b === 'SRL');
    for (const b of BLOC_ORDER) for (const t of ['B3M', 'B6M', 'B1Y', 'N2Y', 'N5Y', 'N10Y'] as const) expect(auctionsCountInQuarter(b, 0, t, pv)).toBeGreaterThan(0);
  });
  it('AC-04-02-PREGENESIS: NKR guidance on day −6 is skipped; no negative tick is written', () => {
    expect(meetingPlan('NKR', 0, pv).guidanceTick).toBe(-6 * 720 + 420);
    const rows = new Map<string, { id: string }>();
    const store = { get: (_t: string, id: string) => rows.get(id), put: (_t: string, e: { id: string }) => { rows.set(e.id, e); }, del: () => undefined,
      iter: () => [], range: () => [], index: () => [], count: () => rows.size };
    writeQuarterSchedule({ newId: () => 'x', params: pv, store } as never, 0);
    const ticks = [...rows.keys()].map((k) => Number(k.split(':')[2]));
    expect(ticks.every((t) => t >= 0)).toBe(true);
    expect([...rows.keys()].some((k) => k.startsWith('NKR:CB_GUIDANCE:'))).toBe(false);
    expect(releasesInRange(-91, 91, pv).every((r) => r.tick >= 0 && r.consensusTick >= 0)).toBe(true);
  });
  it('AC-04-02-RANGE: releasesInRange and meetingsInRange are [from, to)', () => {
    const fdlCpi = releasesInRange(0, 364, pv).find((r) => r.bloc === 'FDL' && r.kind === 'CPI')!;
    const d = Math.floor(fdlCpi.tick / 720);
    expect(releasesInRange(d, d + 1, pv).some((r) => r.tick === fdlCpi.tick)).toBe(true);
    expect(releasesInRange(d + 1, d + 2, pv).some((r) => r.tick === fdlCpi.tick)).toBe(false);
    expect(releasesInRange(d - 1, d, pv).some((r) => r.tick === fdlCpi.tick)).toBe(false);
    const m = meetingPlan('FDL', 0, pv).meetingTick;
    expect(meetingsInRange(m, m + 1, pv).map((x) => x.bloc)).toEqual(['FDL']);
    expect(meetingsInRange(m - 1, m, pv)).toEqual([]);
  });
  it('AC-04-02-SCHEDULE: auctions are not written to mac.schedule (readers use auctionsInQuarter)', () => {
    const rows = new Map<string, { id: string; kind: string }>();
    const store = { get: (_t: string, id: string) => rows.get(id), put: (_t: string, e: { id: string; kind: string }) => { rows.set(e.id, e); }, del: () => undefined,
      iter: () => [], range: () => [], index: () => [], count: () => rows.size };
    writeQuarterSchedule({ newId: () => 'x', params: pv, store } as never, 91);
    const kinds = [...rows.values()].map((r) => r.kind);
    for (const t of TENORS_ALL) expect(kinds).not.toContain(t);
    const auctionTicks = BLOC_ORDER.flatMap((b) => auctionsInQuarter(b, 91, pv).map((a) => `${b}:${a.tenor}:${a.auctionTick}`));
    for (const k of auctionTicks) expect(rows.has(k)).toBe(false);
    expect(auctionTicks.length).toBeGreaterThan(0);
  });
});
const TENORS_ALL = ['B3M', 'B6M', 'B1Y', 'N2Y', 'N5Y', 'N10Y', 'N30Y', 'L10Y'];
