// T04-15: Financial Stress Index FSI (0..1), every game hour, public on MKT-07 (04 §3.14.2). Runs before hourlyFear (card step 1).
// A missing component holds its last value (mac.inputs `values['fsi:<key>']`, key listed in staleKeys, edge 23); with no held
// value it counts 0. No 07 (ports.credit null, edge 18): interbank, repo and CCP are 0, not stale, and never a trigger.
import { dmath, EngineFault, type Id, type PhaseCtx } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocMacroState, type GlobalMacroState, type MacroInputs } from '../schema';

/** The mac.inputs row, or an empty one before T04-05's first day close. */
function inputsRow(ctx: PhaseCtx): MacroInputs {
  return ctx.store.get<MacroInputs>(macroTables.inputs.name, 'INPUTS') ?? { id: 'INPUTS', tick: ctx.tick, staleKeys: [], values: {} };
}
/** Value now, else the held value (else `dflt`), listing `key` as stale once. Same rule as rules/fear.ts (module-private there). */
function holdInput(row: MacroInputs, ns: string, key: string, now: number | null | undefined, dflt: number | null): number | null {
  const k = `${ns}:${key}`;
  if (now !== null && now !== undefined) { row.values[k] = now; return now; }
  if (!row.staleKeys.includes(key)) row.staleKeys.push(key);
  return row.values[k] ?? dflt;
}


export interface FsiComponents { interbank: number | null; repoHaircut: number | null; ccpFund: number | null; bankEquityDd: number | null; igSpread: number | null; stablecoinDepeg: number | null; etfDiscount: number | null; sovStressMax: number }

export const FSI_WEIGHTS: Readonly<Record<keyof FsiComponents, number>> = Object.freeze({
  interbank: 0.20, repoHaircut: 0.10, ccpFund: 0.10, bankEquityDd: 0.15, igSpread: 0.20, stablecoinDepeg: 0.05, etfDiscount: 0.05, sovStressMax: 0.15 });
export const FSI_DIVISORS: Readonly<Record<keyof FsiComponents, number>> = Object.freeze({
  interbank: 0.015, repoHaircut: 10, ccpFund: 0.25, bankEquityDd: 0.50, igSpread: 0.03, stablecoinDepeg: 0.10, etfDiscount: 0.05, sovStressMax: 1 });
const KEYS: readonly (keyof FsiComponents)[] = ['interbank', 'repoHaircut', 'ccpFund', 'bankEquityDd', 'igSpread', 'stablecoinDepeg', 'etfDiscount', 'sovStressMax'];

/** Each component clamp(value/divisor, 0, 1) (null → 0), then the weighted sum. */
export function fsiOf(c: FsiComponents): { fsi: number; normalized: Record<keyof FsiComponents, number> } {
  const normalized = {} as Record<keyof FsiComponents, number>;
  let fsi = 0;
  for (const k of KEYS) {
    const v = c[k];
    normalized[k] = v === null ? 0 : dmath.clamp(v / FSI_DIVISORS[k], 0, 1);
    fsi += FSI_WEIGHTS[k] * normalized[k];
  }
  return { fsi, normalized };
}

/** P2 at each game hour: components (held on miss), FSI to mac.global.financialStressIndex, macro.fsi PUBLIC with the normalized components. */
export function hourlyFsi(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store;
  const g = s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('I0.macro_global', 'no mac.global GLOBAL row (written at genesis, T04-20)');
  const row: MacroInputs = (({ staleKeys, values, ...r }) => ({ ...r, tick: ctx.tick, staleKeys: staleKeys.slice(), values: { ...values } }))(inputsRow(ctx));
  const hold = (k: keyof FsiComponents, now: number | null | undefined): number | null => holdInput(row, 'fsi', k, now, null);

  let interbank: number | null = 0, repoHaircut: number | null = 0, ccpFund: number | null = 0;
  const cr = ports.credit;
  if (cr !== null) {
    // GDP-weighted over the five blocs with the genesis shares gdpShare0; any bloc missing ⇒ the component is missing
    let ib: number | null = 0;
    for (const b of BLOC_ORDER) {
      const a = cr.creditAggregates(s, b);
      if (a === null || a === undefined) { ib = null; break; }
      ib += BLOC_DEFAULTS[b].gdpShare0 * a.interbankSpread;
    }
    interbank = hold('interbank', ib);
    repoHaircut = hold('repoHaircut', cr.repoHaircutIndexChange(s));
    ccpFund = hold('ccpFund', cr.ccpDefaultFundUsage(s));
  }
  let sovStressMax = 0;
  for (const b of BLOC_ORDER) {
    const st = s.get<BlocMacroState>(macroTables.bloc.name, b)?.sovereign.stressIndex;
    if (st !== undefined && st > sovStressMax) sovStressMax = st;
  }
  const c: FsiComponents = {
    interbank, repoHaircut, ccpFund,
    bankEquityDd: hold('bankEquityDd', ports.markets.bankEquityDrawdown364(s, 'WORLD')),
    igSpread: hold('igSpread', ports.assets.igCreditSpreadIndex(s)),
    stablecoinDepeg: hold('stablecoinDepeg', ports.assets.maxStablecoinDepeg(s)),
    etfDiscount: hold('etfDiscount', ports.funds.etfDiscountIndex(s)),
    sovStressMax,
  };
  const { fsi, normalized: n } = fsiOf(c);
  s.put(macroTables.inputs.name, row);
  s.put(macroTables.global.name, { ...g, financialStressIndex: fsi });
  ctx.emit('macro.fsi', [] as Id[], { fsi, components: { interbankSpread: n.interbank, repoHaircutChange: n.repoHaircut, ccpFundUsage: n.ccpFund,
    npcBankEquityDrawdown: n.bankEquityDd, igSpread: n.igSpread, stablecoinDepeg: n.stablecoinDepeg, etfDiscount: n.etfDiscount, sovereignStress: n.sovStressMax } }, 'PUBLIC');
}
