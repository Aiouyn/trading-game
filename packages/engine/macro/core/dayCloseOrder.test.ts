// T04-20 card step 3 (04 §3.1 row 3, "exactly this order"): golden call trace of macroDayStep (QA #88 B4: O8, O9, O11 and any other reordering).
// Every day-step module is wrapped; a call is recorded only at depth 0 (a direct call from dayStep.ts, not a helper's inner call).
import { describe, expect, it, vi } from 'vitest';
import { TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { BLOC_ORDER, macroTables, type BlocMacroState } from '../schema';
import { macroGenesis } from './genesis';
import { macroDayStep } from './dayStep';
import { macroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
import { stepOutputGapEstimate } from '../gapest';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const T = vi.hoisted(() => {
  const st = { on: false, depth: 0, log: [] as string[] };
  const BLOCS = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];
  const wrap = (m: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k in m) {
      const f = m[k];
      out[k] = typeof f !== 'function' || /^[A-Z]/.test(k) ? f : (...a: unknown[]) => {
        if (st.on && st.depth === 0) { const b = a.find((x) => typeof x === 'string' && BLOCS.includes(x)); st.log.push(b === undefined ? k : `${k}:${String(b)}`); }
        st.depth++;
        try { return (f as (...x: unknown[]) => unknown)(...a); } finally { st.depth--; }
      };
    }
    return out;
  };
  return { st, wrap };
});
vi.mock('../rules/inputs', async (o) => T.wrap(await o()));
vi.mock('../rules/scale', async (o) => T.wrap(await o()));
vi.mock('../rules/trade', async (o) => T.wrap(await o()));
vi.mock('../rules/regime', async (o) => T.wrap(await o()));
vi.mock('../rules/cycleCommittee', async (o) => T.wrap(await o()));
vi.mock('../rules/economy', async (o) => T.wrap(await o()));
vi.mock('../gapest', async (o) => T.wrap(await o()));
vi.mock('../rules/inflation', async (o) => T.wrap(await o()));
vi.mock('../rules/credit', async (o) => T.wrap(await o()));
vi.mock('../rules/fiscal', async (o) => T.wrap(await o()));
vi.mock('../rules/fiscalRules', async (o) => T.wrap(await o()));
vi.mock('../rules/programs', async (o) => T.wrap(await o()));
vi.mock('../rules/dealers', async (o) => T.wrap(await o()));
vi.mock('../rules/sovCredit', async (o) => T.wrap(await o()));
vi.mock('../rules/default', async (o) => T.wrap(await o()));
vi.mock('../rules/fxRegimes', async (o) => T.wrap(await o()));
vi.mock('../rules/capitalControls', async (o) => T.wrap(await o()));
vi.mock('../rules/concord', async (o) => T.wrap(await o()));
vi.mock('../rules/swapLines', async (o) => T.wrap(await o()));
vi.mock('../rules/curves', async (o) => T.wrap(await o()));
vi.mock('../rules/macroprudential', async (o) => T.wrap(await o()));
vi.mock('../rules/phases', async (o) => T.wrap(await o()));
vi.mock('../rules/emergent', async (o) => T.wrap(await o()));
vi.mock('../rules/scheduler', async (o) => T.wrap(await o()));
vi.mock('../rules/cb', async (o) => T.wrap(await o()));
vi.mock('../views/publicView', async (o) => T.wrap(await o()));
vi.mock('../views/stabReport', async (o) => T.wrap(await o()));
vi.mock('./history', async (o) => T.wrap(await o()));

/** The card's step functions (T04-20 step 3); helpers and reads are left out of the trace. */
const STEPS = new Set(['collectInputs', 'stepScale', 'dailyTrade', 'stepRegime', 'cycleLabelStep', 'smoothRealRateGap', 'gapTerms', 'stepOutputGap',
  'stepOutputGapEstimate', 'stepLevels', 'stepUnemployment', 'wageGrowth', 'stepNeutralRate', 'nominalGdpLocal', 'stepCore', 'stepCoreLevel', 'stepExpectations',
  'creditAggregates', 'stepFiscalDay', 'postFiscalCash', 'swfStep', 'runFiscalRuleChecks', 'handleProgramSpend', 'acceptProposals', 'quarterFiscalEvent',
  'quarterEndDealerReview', 'stepSovereignCredit', 'igExclusionCheck', 'checkDefaultTriggers', 'stepDefaultCase', 'stepFxDay', 'stepCapitalControls',
  'concordTranches', 'swapLineStep', 'recomputeCurve', 'macroprudentialRelease', 'stepPhases', 'emergentCheck', 'schedulerDay', 'scheduleEmergency',
  'writeHistoryRows', 'pruneHistory', 'refreshPublicView', 'publishMsi']);
const ports = stubPorts();
function trace(day: number): string[] {
  const w = macroWorld('trace', 0); macroGenesis(w.ctx, ports);
  w.setTick(day * TICKS_PER_GAME_DAY + 719);
  T.st.log = []; T.st.on = true;
  try { macroDayStep(w.ctx, ports); } finally { T.st.on = false; }
  return T.st.log.filter((e) => STEPS.has(e.split(':')[0]!));
}
const per = (f: (b: string) => string[]): string[] => BLOC_ORDER.flatMap((b) => f(b));
/** The card's order (T04-20 step 3.1–3.13), one entry per call; `:b` where the call takes the bloc id. Quarter end adds 3.6's quarter steps. */
function cardOrder(quarterEnd: boolean): string[] {
  return [
    'collectInputs',                                                                               // 3.1
    'stepScale', 'dailyTrade',                                                                     // 3.2
    'stepRegime', ...per(() => ['stepRegime', 'cycleLabelStep']),                                  // 3.3 global first, then per bloc
    ...per((b) => ['smoothRealRateGap', 'gapTerms', 'stepOutputGap', `stepOutputGapEstimate:${b}`, 'stepLevels', 'stepUnemployment', 'wageGrowth',
      `stepNeutralRate:${b}`,                                                                      // 3.4 (card T04-20 step 3.4)
      'stepCore', 'stepCoreLevel', 'stepExpectations', `nominalGdpLocal:${b}`, 'creditAggregates']),  // 3.5 (E-87 (2): core → level → headline → e1 → e5)
    ...per((b) => ['stepFiscalDay', `postFiscalCash:${b}`, ...(b === 'NKR' ? ['swfStep'] : []), `runFiscalRuleChecks:${b}`]),                 // 3.6
    'handleProgramSpend', ...per((b) => [`acceptProposals:${b}`]),
    ...(quarterEnd ? per((b) => [`quarterFiscalEvent:${b}`, `quarterEndDealerReview:${b}`]) : []),
    ...per((b) => [`stepSovereignCredit:${b}`, `igExclusionCheck:${b}`, `checkDefaultTriggers:${b}`, `stepDefaultCase:${b}`]),                 // 3.7
    'stepFxDay', 'stepCapitalControls', 'concordTranches', 'swapLineStep',                         // 3.8
    ...per((b) => [`recomputeCurve:${b}`]),                                                        // 3.9
    ...per((b) => [`macroprudentialRelease:${b}`]),                                                // 3.10
    'stepPhases', 'emergentCheck', 'schedulerDay', ...per((b) => [`scheduleEmergency:${b}`]),      // 3.11
    'writeHistoryRows', 'pruneHistory', ...per((b) => [`refreshPublicView:${b}`]), 'publishMsi',   // 3.13
  ];
}

describe('T04-20 step 3 day-close order (golden trace)', () => {
  it('quarter-end day close (day 90): the direct calls of macroDayStep are exactly the card order', () => {
    expect(trace(90)).toEqual(cardOrder(true));
  });
  it('ordinary day close (day 10): the same order without the quarter-end steps', () => {
    expect(trace(10)).toEqual(cardOrder(false));
  });
  it('step 3.4 keeps the gap-estimate noise stepped there: the bloc row ends the day with ε1 of macro.gapest:<bloc>, not ε0', () => {
    const noise = (w: ReturnType<typeof macroWorld>, b: string): number => w.ctx.store.get<BlocMacroState & { id: string }>(macroTables.bloc.name, b)!.gapEstNoise;
    const a = macroWorld('gapest-carry', 0), z = macroWorld('gapest-carry', 0);
    macroGenesis(a.ctx, ports); macroGenesis(z.ctx, ports);
    a.setTick(10 * TICKS_PER_GAME_DAY + 719); z.setTick(10 * TICKS_PER_GAME_DAY + 719);
    const e0 = BLOC_ORDER.map((b) => noise(a, b));
    const e1 = BLOC_ORDER.map((b) => stepOutputGapEstimate(a.ctx, b, 0));   // same stream state the day step sees
    macroDayStep(z.ctx, ports);
    for (const [i, b] of BLOC_ORDER.entries()) {
      expect(noise(z, b)).toBe(e1[i]);
      expect(noise(z, b)).not.toBe(e0[i]);
    }
  });
});
