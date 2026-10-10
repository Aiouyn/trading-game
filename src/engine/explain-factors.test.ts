import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { dayRows, ecoArchive, ecologyLog, explainMove, EXPLAIN_ROWS, legacyArchive } from './ecology';
import { openAccount, placeOrder } from './trading';
import type { EcoArchiveAsset, EcoCause, LnVParts, WorldState } from './types';

const TPD = 8;

/** A world run for `days` game days; each trader buys a little of OSTV every day. */
function run(seed: string, days: number, traders: string[] = [], tpd = TPD, cfg: Partial<Parameters<typeof universeConfig>[0]> = {}): WorldState {
  let s = createWorld(seed, universeConfig({ ticksPerDay: tpd, ...cfg }));
  for (const p of traders) s = openAccount(s, p);
  for (let d = 0; d < days; d++) {
    for (const p of traders) s = placeOrder(s, { playerId: p, assetId: 'OSTV', side: 'buy', type: 'market', qty: 3 }).state;
    s = stepMany(s, tpd).state;
  }
  return s;
}

const ZERO_CAUSE: Record<EcoCause, number> = { value: 0, trend: 0, retail: 0, pension: 0, maker: 0, news: 0, event: 0, own: 0, shock: 0 };
const NO_PARTS: LnVParts = { drift: 0, market: 0, sector: 0, idio: 0, news: 0, event: 0 };

function day(cause: Partial<Record<EcoCause, number>>, parts?: Partial<LnVParts>, players?: { accounts: number; maxShare: number }): EcoArchiveAsset {
  return {
    id: 'X', lnS: 0, lnV: 0, cause: { ...ZERO_CAUSE, ...cause },
    ...(parts ? { lnVParts: { ...NO_PARTS, ...parts } } : {}),
    ...(players ? { players } : {}),
  };
}

const sumParts = (p: Partial<Record<string, number>>) => Object.values(p).reduce((a, b) => (a ?? 0) + (b ?? 0), 0) as number;

describe('lnV split by source (D-1): the factor components', () => {
  it('the six parts sum to each day change in lnV, for every asset, across 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = run(`split-${seed}`, 4, ['p0', 'p1']);
      const arc = ecoArchive(s);
      expect(arc.length).toBe(4);
      for (let k = 1; k < arc.length; k++) {
        arc[k]!.assets.forEach((a, i) => {
          const p = a.lnVParts!;
          expect(p).toBeDefined();
          const sum = p.drift + p.market + p.sector + p.idio + p.news + p.event;
          expect(sum).toBeCloseTo(a.lnV - arc[k - 1]!.assets[i]!.lnV, 10);
        });
      }
    }
  });

  it('the archive and the detailed log agree on each closed day cause and close', () => {
    const s = run('agree', 5, ['p0']);
    const arc = ecoArchive(s);
    for (const d of ecologyLog(s)) {
      const a = arc.find((x) => x.day === d.day)!;
      d.assets.forEach((la, i) => {
        expect(a.assets[i]!.lnS).toBe(la.lnS);
        expect(a.assets[i]!.cause).toEqual(la.cause);
      });
    }
  });
});

describe('explainMove parts (D-1): exact over many windows', () => {
  it('the parts sum to the move exactly, and the move is the printed close-to-close change, across 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = run(`window-${seed}`, 10, ['p0', 'p1', 'p2']);
      const arc = ecoArchive(s);
      const first = arc[0]!.day;
      const last = arc[arc.length - 1]!.day;
      for (const idx of [0, 5, 10, 20]) {
        const id = s.config.assets[idx]!.id;
        for (let from = first; from <= last; from += 2) {
          for (let to = from; to <= last; to += 3) {
            const e = explainMove(s, id, from, to);
            expect(sumParts(e.parts)).toBeCloseTo(e.totalLog, 12);
            expect(sumParts(e.flow)).toBeCloseTo(e.parts.flow ?? 0, 12);
            expect(Object.keys(e.parts).every((k) => (EXPLAIN_ROWS as readonly string[]).includes(k))).toBe(true);
            if (from > first) {
              const prev = arc.find((x) => x.day === from - 1)!.assets[idx]!.lnS;
              const end = arc.find((x) => x.day === to)!.assets[idx]!.lnS;
              expect(e.totalLog).toBeCloseTo(end - prev, 10);
            }
          }
        }
      }
    }
  });
});

describe('dayRows: the value cause is split by the lnV change, exactly', () => {
  it('a move that is all market is all Market', () => {
    const r = dayRows(day({ value: 0.02 }, { market: 0.01 }), true);
    expect(r.parts.market).toBeCloseTo(0.02, 14);
    expect(r.parts.company).toBe(0);
  });

  it('opposing components (net zero) still sum exactly, and the parts keep their own signs', () => {
    const r = dayRows(day({ value: 0.02 }, { market: 0.01, idio: -0.01 }), true);
    expect(r.parts.market).toBeCloseTo(0.05, 12);
    expect(r.parts.company).toBeCloseTo(-0.03, 12);
    expect(sumParts(r.parts)).toBeCloseTo(0.02, 14);
  });

  it('with no split (a save from before it, or no lnV change) the value cause is company noise', () => {
    const r = dayRows(day({ value: 0.02 }), true);
    expect(r.parts.company).toBe(0.02);
    expect(r.parts.market).toBe(0);
    const z = dayRows(day({ value: 0.02 }, {}), true);
    expect(z.parts.company).toBe(0.02);
  });

  it('the news and rate shocks are News, and the value-line share of them is News too', () => {
    const r = dayRows(day({ value: 0.02, news: 0.01 }, { news: 0.01 }), true);
    expect(r.parts.news).toBeCloseTo(0.03, 14);
    expect(r.parts.company ?? 0).toBeCloseTo(0, 14);
  });

  it('the flow pools form the Flow row, and a folded player flow goes to Retail', () => {
    const shown = dayRows(day({ trend: 0.001, retail: 0.002, pension: 0.003, maker: -0.001, own: 0.004 }, undefined, { accounts: 5, maxShare: 0.2 }), false);
    expect(shown.parts.flow).toBeCloseTo(0.005, 14);
    expect(shown.parts.players).toBe(0.004);
    expect(shown.folded).toBe(false);
    const folded = dayRows(day({ retail: 0.002, own: 0.004 }, undefined, { accounts: 4, maxShare: 0.2 }), false);
    expect(folded.flow.retail).toBeCloseTo(0.006, 14);
    expect(folded.parts.players).toBe(0);
    expect(folded.folded).toBe(true);
    const solo = dayRows(day({ own: 0.004 }, undefined, { accounts: 1, maxShare: 1 }), true);
    expect(solo.parts.you).toBe(0.004);
    expect(solo.parts.players ?? 0).toBe(0);
  });

  it('the parts always sum to the day total', () => {
    const r = dayRows(day({ value: 0.02, news: -0.01, event: 0.03, trend: 0.001, retail: -0.002, pension: 0.0005, maker: 0.0002, own: 0.004 }, { market: 0.01, sector: -0.004, idio: 0.002, news: 0.003, event: 0.02, drift: 0.001 }, { accounts: 5, maxShare: 0.2 }), false);
    expect(sumParts(r.parts)).toBeCloseTo(r.total, 14);
  });
});

describe('Event row (D-18): world-event moves are Event, not News', () => {
  it('an event print is its own row, and the event share of the value line too', () => {
    const r = dayRows(day({ value: 0.02, event: 0.03, news: 0.01 }, { market: 0, event: 0.01 }), true);
    expect(r.parts.event).toBeCloseTo(0.05, 12);
    expect(r.parts.news).toBeCloseTo(0.01, 12);
    expect(r.parts.market ?? 0).toBe(0);
  });

  it('a window with world-event moves shows the Event row, and it carries no end or duration', () => {
    let seen = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = run(`event-${seed}`, 30, [], TPD, { worldEvents: { odds: { crash: 0.25, bubble: 0.25, crisis: 0.25, flash: 0.25 } } });
      const last = ecoArchive(s).at(-1)!.day;
      for (const a of s.config.assets.slice(0, 20)) {
        const e = explainMove(s, a.id, 0, last);
        if (e.parts.event !== undefined) seen++;
        expect(Object.keys(e.parts).every((k) => (EXPLAIN_ROWS as readonly string[]).includes(k))).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('explain archive (D-16): 252 days kept, 21 detailed', () => {
  it('keeps 252 archive days and 21 detailed days, and explains a window past the detailed log', () => {
    const s = run('archive', 260, [], 4);
    const arc = ecoArchive(s);
    expect(ecologyLog(s).length).toBe(21);
    expect(arc.length).toBe(252);
    expect(arc[0]!.day).toBe(8);
    expect(arc.at(-1)!.day).toBe(259);
    const id = s.config.assets[0]!.id;
    expect(explainMove(s, id, 0, 259).from).toBe(8);
    const e = explainMove(s, id, 200, 259);
    expect(e.from).toBe(200);
    expect(sumParts(e.parts)).toBeCloseTo(e.totalLog, 12);
    expect(() => explainMove(s, id, 200, 260)).toThrow(/open or not closed/);
  });

  it('a save from before the archive still explains: its value cause is company noise, and the next close writes the archive', () => {
    const fresh = run('legacy', 5, ['p0', 'p1']);
    const old: WorldState = JSON.parse(JSON.stringify(fresh));
    delete old.ecology!.archive;
    old.ecology!.log = old.ecology!.log.map((d) => ({
      ...d, assets: d.assets.map((a) => { const b = { ...a }; delete b.lnVParts; return b; }),
    }));
    old.assets = old.assets.map((a) => { const b = { ...a }; delete b.dayLnV; delete b.dayEvent; return b; });
    const id = old.config.assets[0]!.id;
    const e = explainMove(old, id, 0, 4);
    expect(e.parts.market).toBeUndefined();
    expect(e.parts.sector).toBeUndefined();
    expect(e.totalLog).toBeCloseTo(explainMove(fresh, id, 0, 4).totalLog, 12);
    expect(sumParts(e.parts)).toBeCloseTo(e.totalLog, 12);
    expect(legacyArchive(old.ecology!.log).length).toBe(5);
    const next = stepMany(old, TPD).state;
    expect(next.ecology!.archive!.length).toBe(6);
  });
});
