// T04-15: Financial Stress Index FSI (0..1), every game hour, public on MKT-07 (04 §3.14.2). Runs before hourlyFear (card step 1).
// A missing component holds its last value in the mac.inputs row `HOURLY` (E-93 (2): `fsi.<key>`, the IG level as `igCreditSpreadIndex`,
// shared with fear) and is listed in HOURLY.staleKeys (edge 23); IG absent → 0. Interbank is gdpShare0-weighted; with 07 present and
// any bloc's aggregates null the composite holds, with no renormalization (E-93 (3)). No 07 (ports.credit null, edge 18): interbank,
// repo and CCP are 0, not stale, and never a trigger.
import { dmath, EngineFault, type Id, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocMacroState, type GlobalMacroState, type MacroInputs } from '../schema';

/** The mac.inputs `HOURLY` row (E-93 (2)), copied; written at genesis (T04-20 step 1.1), so a missing row is MAC_STATE_MISSING (E-93 (4)). */
function hourlyRow(s: StoreRead): { row: MacroInputs; changed: boolean } {
  const h = s.get<MacroInputs>(macroTables.inputs.name, 'HOURLY');
  if (!h) throw new EngineFault('MAC_STATE_MISSING', 'no mac.inputs HOURLY row (written at genesis, T04-20 step 1.1)', ['HOURLY']);
  return { row: { ...h, staleKeys: h.staleKeys.slice(), values: { ...h.values } }, changed: false };
}
/** E-93 (2): a non-null read replaces the held value; a null read keeps it and lists `key` in HOURLY.staleKeys once. Marks a change. */
function holdKey(h: { row: MacroInputs; changed: boolean }, key: string, now: number | null | undefined): number | undefined {
  if (now !== null && now !== undefined) {
    if (!Object.is(h.row.values[key], now)) { h.row.values[key] = now; h.changed = true; }
    return now;
  }
  if (!h.row.staleKeys.includes(key)) { h.row.staleKeys.push(key); h.changed = true; }
  return h.row.values[key];
}
/** mac.global GLOBAL, or MAC_STATE_MISSING (E-93 (4)). */
function globalRow(s: StoreRead): GlobalMacroState & { id: 'GLOBAL' } {
  const g = s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('MAC_STATE_MISSING', 'no mac.global GLOBAL row (written at genesis, T04-20)', ['GLOBAL']);
  return g;
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
  const g = globalRow(s);
  const h = hourlyRow(s);
  const hold = (k: Exclude<keyof FsiComponents, 'igSpread' | 'sovStressMax'>, now: number | null | undefined): number | null => holdKey(h, `fsi.${k}`, now) ?? null;

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
    const row = s.get<BlocMacroState>(macroTables.bloc.name, b);
    if (!row) throw new EngineFault('MAC_STATE_MISSING', `no mac.bloc ${b} row (written at genesis, T04-20)`, [b]);
    if (row.sovereign.stressIndex > sovStressMax) sovStressMax = row.sovereign.stressIndex;
  }
  const c: FsiComponents = {
    interbank, repoHaircut, ccpFund,
    bankEquityDd: hold('bankEquityDd', ports.markets.bankEquityDrawdown364(s, 'WORLD')),
    igSpread: holdKey(h, 'igCreditSpreadIndex', ports.assets.igCreditSpreadIndex(s)) ?? null,
    stablecoinDepeg: hold('stablecoinDepeg', ports.assets.maxStablecoinDepeg(s)),
    etfDiscount: hold('etfDiscount', ports.funds.etfDiscountIndex(s)),
    sovStressMax,
  };
  const { fsi, normalized: n } = fsiOf(c);
  // TODO(T04-06): T04-06 step 6 checks emergency meetings at this hourly FSI update via `emergencyTriggers` (rules/cb.ts). Left unwired
  // until T04-06 is built (#72 Producer ruling item 8).
  if (h.changed) s.put(macroTables.inputs.name, { ...h.row, tick: ctx.tick });   // E-93 (2): put only on a change
  s.put(macroTables.global.name, { ...g, financialStressIndex: fsi });
  ctx.emit('macro.fsi', [] as Id[], { fsi, components: { interbankSpread: n.interbank, repoHaircutChange: n.repoHaircut, ccpFundUsage: n.ccpFund,
    npcBankEquityDrawdown: n.bankEquityDd, igSpread: n.igSpread, stablecoinDepeg: n.stablecoinDepeg, etfDiscount: n.etfDiscount, sovereignStress: n.sovStressMax } }, 'PUBLIC');
}
