// T04-20 nightly harness (04#4, 04#6, 04#24, 04#27, 04#32): no players, defaultMacroPorts() + the reference 16 political-stability stub (E-108 (7)), 200 seeds × 3640 game days.
// One seed = startSeed + stepSeed (day by day, so callers can yield) + finishSeed → SeedResult (plain JSON). aggregate() pools seeds and
// checks every band. Readings: inversion "precedes" = a run of ≥ 63 consecutive bloc trading days with y10 < y3m that is ongoing at the
// CONTRACTION entry or ended ≤ 364 game days before it; durations pool the global chain and the five blocs, completed spells only;
// carry = long SRL funded in FDL at both policy rates, daily r = (1 + i_SRL/364)·S_t/S_{t−1} − (1 + i_FDL/364) (spotVsFdl = FDL per SRL);
// calm-expansion day = global EXPANSION and no STORM or MAJOR event outside ENDED; a major CONTAGION phase passes when its peak close Fear > 60.
import { isTradingDay } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../../ports';
import { BLOC_ALIAS, BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type GlobalMacroState, type Regime, type WorldEvent } from '../../schema';
import { ALLOWED } from '../../rules/regime';
import { macroGenesis } from '../../core/genesis';
import { macroWorld, type MacroWorld } from '../../testkit/macroWorld';
import { runDays } from '../../testkit/macroLoop';
import { ref16Ports } from './macro-crisis-calibration';

export const CALIB_SEEDS = 200, CALIB_DAYS = 3640;
export const REGIMES: readonly Regime[] = ['EXPANSION', 'OVERHEATING', 'CONTRACTION', 'RECOVERY'];
export const TARGET_DAYS: Readonly<Record<Regime, number>> = { EXPANSION: 819, OVERHEATING: 273, CONTRACTION: 273, RECOVERY: 273 };
const INV_MIN = 63, INV_LOOKBACK = 364, Y = 364;

export interface BlocSample { b: BlocId; reg: Regime; y3m: number; y10: number; spot: number; rate: number; grace: boolean; trading: boolean }
export interface DaySample { day: number; gReg: Regime; fear: number; calm: boolean; majorContagion: string[]; blocs: BlocSample[] }

interface Chain { reg: Regime; since: number }
interface InvState { run: number; lastQualEnd: number | null }
export interface SeedAcc {
  chains: Chain[]; inv: InvState[]; prevBloc: BlocSample[] | null;
  spells: Record<Regime, { n: number; sum: number }>; badEdges: number; conEntries: number; conPreceded: number;
  grace: Record<'FU' | 'NA' | 'SC', boolean>; carrySum: number; carryN: number; win: number[]; worst5: number;
  calmDays: number; calmInBand: number; contagion: { id: string; peak: number }[];
}
export interface SeedResult {
  seed: number; days: number; spells: Record<Regime, { n: number; sum: number }>; badEdges: number; conEntries: number; conPreceded: number;
  grace: Record<'FU' | 'NA' | 'SC', boolean>; carryMean: number | null; carryWorst5d: number | null; calmDays: number; calmInBand: number;
  contagionPhases: number; contagionOver60: number;
}

/** Opens every chain at the first close; fold that close too. */
export function newAcc(first: DaySample): SeedAcc {
  return { chains: [{ reg: first.gReg, since: first.day }, ...first.blocs.map((x) => ({ reg: x.reg, since: first.day }))],
    inv: first.blocs.map(() => ({ run: 0, lastQualEnd: null })), prevBloc: null,
    spells: { EXPANSION: { n: 0, sum: 0 }, OVERHEATING: { n: 0, sum: 0 }, CONTRACTION: { n: 0, sum: 0 }, RECOVERY: { n: 0, sum: 0 } },
    badEdges: 0, conEntries: 0, conPreceded: 0, grace: { FU: false, NA: false, SC: false }, carrySum: 0, carryN: 0, win: [], worst5: 0,
    calmDays: 0, calmInBand: 0, contagion: [] };
}

/** Folds one day close into the accumulator. */
export function foldDay(a: SeedAcc, s: DaySample): void {
  const regs = [s.gReg, ...s.blocs.map((x) => x.reg)];
  for (let i = 0; i < regs.length; i++) {
    const c = a.chains[i]!, r = regs[i]!;
    if (r === c.reg) continue;
    a.spells[c.reg].n++; a.spells[c.reg].sum += s.day - c.since;
    if (!ALLOWED[c.reg].includes(r)) a.badEdges++;
    if (i > 0 && r === 'CONTRACTION') {
      a.conEntries++;
      const v = a.inv[i - 1]!;
      if (v.run >= INV_MIN || (v.lastQualEnd !== null && s.day - v.lastQualEnd <= INV_LOOKBACK)) a.conPreceded++;
    }
    a.chains[i] = { reg: r, since: s.day };
  }
  s.blocs.forEach((x, i) => {
    const v = a.inv[i]!;
    if (x.trading) {
      if (x.y10 < x.y3m) v.run++;
      else { if (v.run >= INV_MIN) v.lastQualEnd = s.day - 1; v.run = 0; }
    }
    for (const k of ['FU', 'NA', 'SC'] as const) if (BLOC_ALIAS[k] === x.b && x.grace) a.grace[k] = true;
  });
  const prev = a.prevBloc;
  if (prev !== null) {
    const srl = s.blocs.find((x) => x.b === 'SRL')!, p = prev.find((x) => x.b === 'SRL')!, pf = prev.find((x) => x.b === 'FDL')!;
    const r = (1 + p.rate / Y) * (srl.spot / p.spot) - (1 + pf.rate / Y);
    a.carrySum += r; a.carryN++;
    a.win.push(1 + r); if (a.win.length > 5) a.win.shift();
    if (a.win.length === 5) { const w5 = a.win.reduce((m, x) => m * x, 1) - 1; if (w5 < a.worst5) a.worst5 = w5; }
  }
  a.prevBloc = s.blocs;
  if (s.gReg === 'EXPANSION' && s.calm) { a.calmDays++; if (s.fear >= 15 && s.fear <= 35) a.calmInBand++; }
  for (const id of s.majorContagion) {
    const e = a.contagion.find((x) => x.id === id);
    if (e) { if (s.fear > e.peak) e.peak = s.fear; } else a.contagion.push({ id, peak: s.fear });
  }
}

export function finishAcc(seed: number, days: number, a: SeedAcc): SeedResult {
  return { seed, days, spells: a.spells, badEdges: a.badEdges, conEntries: a.conEntries, conPreceded: a.conPreceded, grace: a.grace,
    carryMean: a.carryN > 0 ? a.carrySum / a.carryN : null, carryWorst5d: a.win.length === 5 || a.worst5 < 0 ? a.worst5 : null,
    calmDays: a.calmDays, calmInBand: a.calmInBand, contagionPhases: a.contagion.length, contagionOver60: a.contagion.filter((x) => x.peak > 60).length };
}

/** Reads one day close from the macro store. */
export function sampleDay(w: MacroWorld, day: number): DaySample {
  const g = w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!;
  const ev = w.store.iter<WorldEvent>(macroTables.event.name);
  return { day, gReg: g.globalRegime, fear: g.fearIndex,
    calm: !ev.some((e) => (e.tier === 'STORM' || e.tier === 'MAJOR') && e.phase !== 'ENDED'),
    majorContagion: ev.filter((e) => e.tier === 'MAJOR' && e.phase === 'CONTAGION').map((e) => e.id).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    blocs: BLOC_ORDER.map((b) => {
      const s = w.store.get<BlocMacroState>(macroTables.bloc.name, b)!;
      const h = w.store.get<{ y3m: number; y10: number; spotVsFdl: number; policyRate: number }>(macroTables.history.name, `${b}:${day}`);
      return { b, reg: s.regime, y3m: h?.y3m ?? 0, y10: h?.y10 ?? 0, spot: b === 'FDL' ? 1 : (h?.spotVsFdl ?? 1), rate: h?.policyRate ?? 0,
        grace: s.sovereign.status === 'GRACE', trading: isTradingDay(b, day) };
    }) };
}

export interface SeedRun { seed: number; w: MacroWorld; p: MacroPorts; day: number; acc: SeedAcc | null }
export function startSeed(seed: number): SeedRun {
  const p = ref16Ports(defaultMacroPorts()), w = macroWorld(`calib:${seed}`, 0);   // E-108 (7): natural SDCs get the reference 16 political-stability driver
  macroGenesis(w.ctx, p);
  return { seed, w, p, day: 0, acc: null };
}
/** Runs n more game days, folding each close. */
export function stepSeed(r: SeedRun, n: number): void {
  for (let i = 0; i < n; i++) {
    runDays(r.w, r.p, r.day, r.day + 1);
    r.w.reads.length = 0; r.w.events.length = 0; r.w.cb.posts.length = 0; r.w.cb.events.length = 0; r.w.cb.sent.length = 0;   // test-kit logs: unbounded over 3640 days
    const s = sampleDay(r.w, r.day);
    if (r.acc === null) r.acc = newAcc(s);
    foldDay(r.acc, s);
    r.day++;
  }
}
export const finishSeed = (r: SeedRun): SeedResult => finishAcc(r.seed, r.day, r.acc!);

export interface AcCheck { ac: string; value: string; pass: boolean }
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const fmt = (x: number | null): string => (x === null ? 'n/a' : x.toFixed(4));
/** Pools seeds and checks the five nightly ACs. A band with no data fails (no vacuous pass). */
export function aggregate(rs: SeedResult[]): AcCheck[] {
  const out: AcCheck[] = [];
  const means = REGIMES.map((g) => { const n = rs.reduce((m, r) => m + r.spells[g].n, 0); return ratio(rs.reduce((m, r) => m + r.spells[g].sum, 0), n); });
  const bad = rs.reduce((m, r) => m + r.badEdges, 0);
  out.push({ ac: '04#4', value: `${REGIMES.map((g, i) => `${g} ${fmt(means[i]!)}`).join(', ')}; bad edges ${bad}`,
    pass: bad === 0 && REGIMES.every((g, i) => means[i] !== null && Math.abs(means[i]! / TARGET_DAYS[g] - 1) <= 0.15) });
  const pre = ratio(rs.reduce((m, r) => m + r.conPreceded, 0), rs.reduce((m, r) => m + r.conEntries, 0));
  out.push({ ac: '04#6', value: `preceded ${fmt(pre)}`, pass: pre !== null && pre >= 0.6 });
  const fu = rs.filter((r) => r.grace.FU).length, na = rs.filter((r) => r.grace.NA).length, sc = ratio(rs.filter((r) => r.grace.SC).length, rs.length);
  out.push({ ac: '04#24', value: `FU ${fu}, NA ${na}, SC ${fmt(sc)}`, pass: fu === 0 && na === 0 && sc !== null && sc >= 0.05 && sc <= 0.25 });
  const cm = rs.filter((r) => r.carryMean !== null), mean = ratio(cm.reduce((m, r) => m + r.carryMean!, 0), cm.length);
  const blow = ratio(rs.filter((r) => r.carryWorst5d !== null && r.carryWorst5d <= -0.15).length, rs.length);
  out.push({ ac: '04#27', value: `mean ${fmt(mean)}, blow-up seeds ${fmt(blow)}`, pass: mean !== null && mean > 0 && blow !== null && blow >= 0.5 });
  const calm = ratio(rs.reduce((m, r) => m + r.calmInBand, 0), rs.reduce((m, r) => m + r.calmDays, 0));
  const con = ratio(rs.reduce((m, r) => m + r.contagionOver60, 0), rs.reduce((m, r) => m + r.contagionPhases, 0));
  out.push({ ac: '04#32', value: `calm in band ${fmt(calm)}, contagion > 60 ${fmt(con)}`, pass: calm !== null && calm >= 0.7 && con !== null && con >= 0.8 });
  return out;
}
