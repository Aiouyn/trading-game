// T04-18 step 1: the 15 major kinds (04 §3.16.4), in catalog order: eligibility, base weight, vulnerability, blocs, precursor and trigger vectors,
// response keys, calibration bands. Unit decisions: u = (severity − 0.6)/0.8 is "the kind draw"; a precursor effect spans
// [precursorStartTick, triggerTick); a trigger effect with no stated length lasts to plannedEndTick; an effect the card gives no hook or
// target for is a 16 WIRE_ITEM (`crisis.<kind>.<what>`), and the guidance tilt (no ONE_OFF target) is omitted.
import { dmath, TICKS_PER_GAME_DAY, type Ccy, type StoreRead } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type ActiveShock, type BlocId, type BlocMacroState, type CrisisKind, type GlobalMacroState, type HookCall,
  type RippleKind, type StormKind, type SubDefKey, type WorldEvent } from '../schema';
import { hook, shock } from './shocks';

const D = TICKS_PER_GAME_DAY;
/** Index of FINANCIALS in @tycoon/content SECTOR_IDS (the bank sector). */
const FINANCIALS = 5;

export interface CatalogInputs { blocZ: Record<BlocId, Record<string, number>>; gdpShareFdl: Record<BlocId, number>; fsi: number; fear: number; tension: number; hackRate: number; aiRace: number;
  cryptoHype: number | null; minStablecoinBacking: number | null; semisValuationZ: number | null; reserveCover: Record<BlocId, number>; currentAccount: Record<BlocId, number>; lambda: Record<BlocId, number>;
  worldHeadlineInflation: number; poolUnderwritingQuality: number | null; repoLeverageIndex: number | null; npcBankBelow12x: Record<BlocId, number>; housePriceGap: Record<BlocId, number>; defaultRateRising: boolean;
  /** unit addition: ports.credit.weakestNpcBanks(store, 3) for the BANKING_PANIC trigger. */
  weakestNpcBanks: string[] }
/** SHOCK carries its scope (unit addition: `bloc`, so a vector can hit several blocs). */
export type ShockSpec = { kind: 'SHOCK'; bloc: BlocId | 'WORLD'; shock: Omit<ActiveShock, 'id'> } | { kind: 'HOOK'; owner: HookCall['owner']; hook: string; args: HookCall['args'] }
  | { kind: 'ONE_OFF'; target: 'credibility' | 'pi_e1' | 'pi_e5' | 'fx_fair_ln'; value: number; bloc: BlocId | 'WORLD' };
export type ResponseKey = 'RULE_CUTS' | 'CCYB_RELEASE' | 'QE_CORP_IG' | 'QE_ABS' | 'LTRO' | 'ELA' | 'DEPOSIT_GUARANTEE' | 'RESCUE_MERGERS' | 'NONE' | 'LOOK_THROUGH_ENERGY' | 'ENERGY_SUBSIDY'
  | 'BREAK_RULE' | 'CONCORD' | 'AUSTERITY' | 'CYBERCERT_PATCH' | 'CIRCUIT_BREAKERS' | 'LTV_RELEASE' | 'HOUSING_PROGRAM' | 'RULE_HIKES' | 'SWAP_LINES' | 'FISCAL_SUPPORT';
export interface CalibrationBand { metric: string; lo: number; hi: number; withinDays: number; measuredBy: '04' | '05' | '06' | '07' | '08' | '10' | '11' | '12' }
export interface MajorDef { kind: CrisisKind; eligible(s: CatalogInputs): boolean; base: number; vuln(s: CatalogInputs): number; blocs(s: CatalogInputs, u: number): BlocId[];
  precursor(ev: WorldEvent): ShockSpec[]; trigger(ev: WorldEvent, s: CatalogInputs): ShockSpec[]; response: ResponseKey[]; calibration: CalibrationBand[] }

const U = (ev: WorldEvent): number => dmath.clamp((ev.severity - 0.6) / 0.8, 0, 1);
const pDays = (ev: WorldEvent): number => (ev.triggerTick - ev.precursorStartTick) / D;
const wire = (kind: CrisisKind, what: string): ShockSpec => hook('16', 'WIRE_ITEM', { key: `crisis.${kind}.${what}` });
const pre = (ev: WorldEvent, bloc: BlocId | 'WORLD', target: string, value: number, shape: ActiveShock['shape'] = 'STEP'): ShockSpec => shock(bloc, target, value, ev.precursorStartTick, ev.triggerTick, shape);
const trg = (ev: WorldEvent, bloc: BlocId | 'WORLD', target: string, value: number, days: number | null, shape: ActiveShock['shape'] = 'STEP', hl?: number): ShockSpec =>
  shock(bloc, target, value, ev.triggerTick, days === null ? ev.plannedEndTick : ev.triggerTick + days * D, shape, hl);
const each = (ev: WorldEvent, f: (b: BlocId) => ShockSpec[]): ShockSpec[] => ev.blocs.flatMap(f);
/** The blocs where `score` is defined, highest first (ties in BLOC_ORDER); [] when none. */
const ranked = (score: (b: BlocId) => number | null): BlocId[] => BLOC_ORDER.filter((b) => score(b) !== null).sort((a, b) => (score(b) as number) - (score(a) as number) || BLOC_ORDER.indexOf(a) - BLOC_ORDER.indexOf(b));
const maxOf = (xs: number[]): number => xs.reduce((m, x) => (x > m ? x : m), Number.NEGATIVE_INFINITY);
const ALL = (): BlocId[] => [...BLOC_ORDER];
const band = (metric: string, lo: number, hi: number, measuredBy: CalibrationBand['measuredBy'], withinDays = 0): CalibrationBand => ({ metric, lo, hi, withinDays, measuredBy });
const INF = Number.POSITIVE_INFINITY;

const eqBlocs = (s: CatalogInputs): BlocId[] => ranked((b) => (s.blocZ[b]!['valuation']! >= 1 && s.gdpShareFdl[b]! >= 0.2 ? s.blocZ[b]!['valuation']! : null));
const crBlocs = (s: CatalogInputs): BlocId[] => ranked((b) => (s.blocZ[b]!['credit']! >= 0.5 || s.defaultRateRising ? s.blocZ[b]!['credit']! : null));
const fxBlocs = (s: CatalogInputs): BlocId[] => ranked((b) => ((b === 'SRL' || b === 'PYN') && (s.reserveCover[b]! < 9 || s.currentAccount[b]! < -0.02) ? (9 - s.reserveCover[b]!) / 3 : null));
const sovBlocs = (s: CatalogInputs): BlocId[] => ranked((b) => (s.lambda[b]! >= 0.01 ? s.lambda[b]! : null));
const hsBlocs = (s: CatalogInputs): BlocId[] => ranked((b) => (s.housePriceGap[b]! >= 0.15 ? s.blocZ[b]!['house']! : null));
const bkBlocs = (s: CatalogInputs): BlocId[] => { const r = ranked((b) => (s.npcBankBelow12x[b]! >= 1 ? s.npcBankBelow12x[b]! : null)); return r.length ? r : ranked((b) => s.blocZ[b]!['credit']!).slice(0, 1); };

export const MAJORS: readonly MajorDef[] = Object.freeze<MajorDef[]>([
  { kind: 'EQUITY_BUBBLE_BURST', base: 1.0, eligible: (s) => eqBlocs(s).length > 0, vuln: (s) => maxOf(eqBlocs(s).map((b) => s.blocZ[b]!['valuation']!)), blocs: (s) => eqBlocs(s).slice(0, 1),
    precursor: (ev) => each(ev, (b) => [hook('06', 'erpShock', { bloc: b, sector: null, deltaPremium: -0.003, halfLifeDays: null })]),
    trigger: (ev) => [...each(ev, (b) => [hook('06', 'erpShock', { bloc: b, sector: null, deltaPremium: 0.025 * ev.severity, halfLifeDays: 120 }), trg(ev, b, 'x_target', -0.015 * ev.severity, 180)]),
      trg(ev, 'WORLD', 'fear_add', 25 * ev.severity, null, 'DECAY', 7)],
    response: ['RULE_CUTS', 'CCYB_RELEASE'], calibration: [band('gx_drawdown', 0.30, 0.45, '05', 42), band('tech_drawdown', 0.60, INF, '05'), band('gold_return', 0.15, INF, '06')] },
  { kind: 'CREDIT_CRUNCH', base: 1.0, eligible: (s) => crBlocs(s).length > 0, vuln: (s) => maxOf(crBlocs(s).map((b) => s.blocZ[b]!['credit']!)), blocs: (s) => crBlocs(s).slice(0, 1),
    precursor: (ev) => each(ev, (b) => [hook('07', 'corporatePdMultiplier', { bloc: b, mult: 1.2, days: pDays(ev) }), pre(ev, b, 'credit_conditions_add', -0.1)]),
    trigger: (ev) => each(ev, (b) => [hook('07', 'corporatePdMultiplier', { bloc: b, mult: 3, days: 120 }), trg(ev, b, 'credit_conditions_add', -0.6, null),
      hook('07', 'ltvTighten', { bloc: b, delta: -0.20 }), hook('10', 'ltvTighten', { bloc: b, delta: -0.20 }), trg(ev, b, 'x_target', -0.025 * ev.severity, null)]),
    response: ['RULE_CUTS', 'QE_CORP_IG', 'LTRO'], calibration: [] },
  { kind: 'BANKING_PANIC', base: 0.6, eligible: (s) => BLOC_ORDER.some((b) => s.npcBankBelow12x[b]! >= 1) || s.fsi >= 0.4, vuln: (s) => (s.fsi - 0.3) / 0.1, blocs: (s) => bkBlocs(s).slice(0, 1),
    precursor: (ev) => [pre(ev, 'WORLD', 'interbank_add', 0.002), pre(ev, 'WORLD', `sector_value:${FINANCIALS}`, -0.10)],
    trigger: (ev, s) => [hook('07', 'depositConfidenceShock', { bankIds: s.weakestNpcBanks.slice(0, 1 + Math.floor(3 * U(ev))), delta: -0.4 * ev.severity }),
      trg(ev, 'WORLD', 'interbank_add', 0.015 * ev.severity, null), trg(ev, 'WORLD', 'fear_add', 20 * ev.severity, null)],
    response: ['ELA', 'DEPOSIT_GUARANTEE', 'RESCUE_MERGERS'], calibration: [band('peak_fsi', 0.7, INF, '04')] },
  { kind: 'CRYPTO_WINTER', base: 0.8, eligible: (s) => (s.cryptoHype !== null && s.cryptoHype >= 0.5) || (s.minStablecoinBacking !== null && s.minStablecoinBacking < 1.02),
    vuln: (s) => (s.cryptoHype === null ? 0 : 2 * (s.cryptoHype - 0.5) / 0.5), blocs: ALL,
    precursor: () => [wire('CRYPTO_WINTER', 'redemptions'), wire('CRYPTO_WINTER', 'exchange_outflow_rumors')],
    trigger: (ev) => [U(ev) < 0.5 ? hook('06', 'stablecoinDepeg', { assetId: 'WEAKEST', target: 0.85 + 0.12 * (1 - ev.severity / 1.4), days: (ev.plannedEndTick - ev.triggerTick) / D })
      : hook('06', 'venueCollapse', { venueId: 'WEAKEST' }), wire('CRYPTO_WINTER', 'hype_zero')],
    response: ['NONE'], calibration: [] },
  { kind: 'OIL_SHOCK', base: 0.8, eligible: () => true, vuln: (s) => (s.tension - 40) / 20, blocs: ALL,
    precursor: (ev) => [wire('OIL_SHOCK', 'tension_up_10'), hook('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.02, days: pDays(ev) })],
    trigger: (ev) => { const days = 60 + 120 * U(ev);
      return [hook('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.08 * ev.severity, days }), hook('06', 'commoditySupplyShock', { commodityId: 'GAS', pct: -0.05 * ev.severity, days }),
        trg(ev, 'WORLD', 'fear_add', 15 * ev.severity, null)]; },
    response: ['LOOK_THROUGH_ENERGY', 'ENERGY_SUBSIDY'], calibration: [band('headline_change', 0.03, INF, '04')] },
  { kind: 'CURRENCY_CRISIS', base: 0.8, eligible: (s) => fxBlocs(s).length > 0, vuln: (s) => maxOf(fxBlocs(s).map((b) => (9 - s.reserveCover[b]!) / 3)), blocs: (s) => fxBlocs(s).slice(0, 1),
    precursor: (ev) => each(ev, (b) => [pre(ev, b, 'capital_flow', -0.2)]),
    trigger: (ev) => each(ev, (b) => [trg(ev, b, 'capital_flow', -0.8, 30), { kind: 'ONE_OFF', target: 'fx_fair_ln', value: dmath.ln(0.90), bloc: b }]),
    response: ['BREAK_RULE', 'CONCORD'], calibration: [band('srl_fair_change', Number.NEGATIVE_INFINITY, -0.40, '04'), band('capital_controls_days', 3, INF, '04')] },
  { kind: 'SOVEREIGN_DEBT_CRISIS', base: 0.6, eligible: (s) => sovBlocs(s).length > 0, vuln: (s) => dmath.ln(maxOf(sovBlocs(s).map((b) => s.lambda[b]!)) / 0.01), blocs: (s) => sovBlocs(s).slice(0, 1),
    precursor: (ev) => each(ev, (b) => [pre(ev, b, 'auction_stress', 0.05), hook('16', 'politicalStabilityShock', { bloc: b, delta: -0.1, days: pDays(ev) })]),
    trigger: (ev) => each(ev, (b) => [hook('16', 'politicalStabilityShock', { bloc: b, delta: -0.3 * ev.severity, days: 63 }), trg(ev, b, 'lambda_raw_mult', 3, 63), trg(ev, b, 'auction_stress', 0.3, null)]),
    response: ['CONCORD', 'AUSTERITY'], calibration: [band('s10_peak', 0.10, INF, '04')] },
  { kind: 'AI_BUBBLE', base: 0.7, eligible: (s) => s.aiRace >= 70 && s.semisValuationZ !== null && s.semisValuationZ >= 1, vuln: (s) => (s.aiRace - 70) / 10, blocs: ALL,
    precursor: () => [wire('AI_BUBBLE', 'compute_spot_up_20')],
    trigger: (ev) => [hook('11', 'aiRaceIndexShock', { delta: -30 * ev.severity }), wire('AI_BUBBLE', 'compute_demand_down_40_120d')],
    response: ['NONE'], calibration: [] },
  { kind: 'CYBER_PANDEMIC', base: 0, eligible: () => false, vuln: () => 0, blocs: ALL, precursor: () => [], trigger: () => [],
    response: ['CYBERCERT_PATCH'], calibration: [] },
  { kind: 'FLASH_CRASH', base: 0.6, eligible: () => true, vuln: (s) => s.fear / 50, blocs: ALL,
    precursor: (ev) => [hook('05', 'makerWithdrawal', { assetFilter: 'ALL', depthMult: 0.9, ticks: ev.triggerTick - ev.precursorStartTick })],
    trigger: () => [hook('05', 'makerWithdrawal', { assetFilter: 'GX', depthMult: 0.2, ticks: 30 }), hook('05', 'npcSellProgram', { assetFilter: 'GX', advPerTick: 0.03, ticks: 20 })],
    response: ['CIRCUIT_BREAKERS'], calibration: [] },
  { kind: 'HOUSING_CRASH', base: 0.7, eligible: (s) => hsBlocs(s).length > 0, vuln: (s) => maxOf(hsBlocs(s).map((b) => s.blocZ[b]!['house']!)), blocs: (s) => hsBlocs(s).slice(0, 1),
    precursor: () => [wire('HOUSING_CRASH', 'mortgage_approvals_down'), wire('HOUSING_CRASH', 'listings_up')],
    trigger: (ev) => [...each(ev, (b) => [hook('10', 'housePriceShock', { cityIds: [`bloc:${b}`], pct: -(0.20 + 0.15 * (ev.severity - 0.6) / 0.8), days: 180 }),
      hook('10', 'transactionFreeze', { cityIds: [`bloc:${b}`], level: 0.5, days: 180 })]), trg(ev, 'WORLD', `sector_value:${FINANCIALS}`, -0.15, null)],
    response: ['LTV_RELEASE', 'HOUSING_PROGRAM'], calibration: [] },
  { kind: 'STAGFLATION', base: 0.5, eligible: (s) => s.worldHeadlineInflation > 0.035, vuln: (s) => (s.worldHeadlineInflation - 0.035) / 0.01, blocs: ALL,
    precursor: (ev) => each(ev, (b) => [pre(ev, b, 'pi_e1_add', 0.005)]),
    trigger: (ev) => [{ kind: 'ONE_OFF', target: 'pi_e1', value: 0.02 * ev.severity, bloc: 'WORLD' }, { kind: 'ONE_OFF', target: 'pi_e5', value: 0.008 * ev.severity, bloc: 'WORLD' },
      { kind: 'ONE_OFF', target: 'credibility', value: -0.15, bloc: 'WORLD' }, hook('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.03, days: 90 })],
    response: ['RULE_HIKES'], calibration: [band('headline_change', 0.03, INF, '04')] },
  { kind: 'SECURITIZATION_CRISIS', base: 0.5, eligible: (s) => s.poolUnderwritingQuality !== null && s.poolUnderwritingQuality <= 0.6, vuln: (s) => (0.7 - (s.poolUnderwritingQuality ?? 0.7)) / 0.1, blocs: ALL,
    precursor: () => [wire('SECURITIZATION_CRISIS', 'abs_spreads_up'), wire('SECURITIZATION_CRISIS', 'delinquencies_up')],
    trigger: () => [hook('08', 'correlationShock', { poolKind: 'MORTGAGE', delta: 0.2 }), hook('08', 'pdShock', { poolKind: 'MORTGAGE', mult: 2, days: 180 }),
      hook('07', 'repoHaircutShock', { assetKind: 'ABS', deltaPts: 15, days: 120 })],
    response: ['QE_ABS', 'LTRO'], calibration: [band('peak_fsi', 0.6, INF, '04')] },
  { kind: 'FUNDING_RUN', base: 0.5, eligible: (s) => s.repoLeverageIndex !== null && s.repoLeverageIndex >= 1.2, vuln: (s) => ((s.repoLeverageIndex ?? 1.2) - 1.2) / 0.2, blocs: ALL,
    precursor: () => [wire('FUNDING_RUN', 'repo_rates_up_10bp')],
    trigger: () => [hook('07', 'repoHaircutShock', { assetKind: 'ALL', deltaPts: 10, days: 60 }), wire('FUNDING_RUN', 'prime_broker_margin_calls'), wire('FUNDING_RUN', 'ccp_procyclical_margin')],
    response: ['SWAP_LINES', 'LTRO'], calibration: [band('peak_fsi', 0.6, INF, '04')] },
  { kind: 'TRADE_WAR', base: 0.5, eligible: (s) => s.tension >= 50, vuln: (s) => (s.tension - 50) / 15, blocs: () => ['FDL', 'PYN'],
    precursor: () => [wire('TRADE_WAR', 'tariff_talk')],
    trigger: (ev) => [trg(ev, 'WORLD', 'tariff_level', 0.10, 364), trg(ev, 'PYN', 'x_target', -0.02, null), trg(ev, 'FDL', 'x_target', -0.007, null),
      { kind: 'ONE_OFF', target: 'fx_fair_ln', value: dmath.ln(0.95), bloc: 'PYN' }],
    response: ['FISCAL_SUPPORT'], calibration: [band('pyn_fair_change', Number.NEGATIVE_INFINITY, -0.08, '04')] },
]);
/** E-35 §5 sub-defs within a kind (weights PROVISIONAL [Quant]); the rest of the kind is generic. They draw inside the kind rate (no new draw:
 *  the kind draw's within-bucket fraction picks the sub-def), so onsets are identical with and without them. */
export const SUB_DEFS: Readonly<Partial<Record<RippleKind | StormKind, readonly { key: SubDefKey; w: number }[]>>> = Object.freeze({
  COMMODITY_SUPPLY: [{ key: 'DROUGHT', w: 0.25 }, { key: 'CROP_DISEASE', w: 0.15 }, { key: 'CHIP_FAB', w: 0.15 }, { key: 'SHIPPING_LANE', w: 0.15 }],
  SECTOR_SHOCK: [{ key: 'RECALL', w: 0.2 }, { key: 'SCANDAL', w: 0.15 }, { key: 'CYBER', w: 0.15 }, { key: 'DATA_CENTER', w: 0.1 }],
  CREDIT_WOBBLE: [{ key: 'BANK_RUN_LOCAL', w: 0.5 }],
});
/** The sub-def `f` ∈ [0, 1) falls in, with the uniform rescaled inside its bucket; null = generic. */
export function subDefOf(kind: RippleKind | StormKind, f: number): { key: SubDefKey; u: number } | null {
  let c = 0;
  for (const x of SUB_DEFS[kind] ?? []) { if (f < c + x.w) return { key: x.key, u: (f - c) / x.w }; c += x.w; }
  return null;
}
export const STORM_EFFECT_DAYS: Readonly<Record<StormKind, number>> = Object.freeze({ RATE_SCARE: 30, OIL_SPIKE_LITE: 20, CRYPTO_FLUSH: 1, CREDIT_WOBBLE: 30, FX_SQUALL: 10,
  SECTOR_ROTATION: 1, EARNINGS_SCARE: 1, LIQUIDITY_HICCUP: 1 });

/** Store + ports snapshot. GDP shares at FDL spot (fxSpot, else the bloc's fx0); world headline inflation is GDP-share weighted; missing 07 → 0 banks, no weakest. */
export function catalogInputs(store: StoreRead, ports: MacroPorts): CatalogInputs {
  const g = store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  const rows = {} as Record<BlocId, BlocMacroState>;
  for (const b of BLOC_ORDER) { const r = store.get<BlocMacroState>(macroTables.bloc.name, b); if (r) rows[b] = r; }
  const per = <T>(f: (r: BlocMacroState, b: BlocId) => T, dflt: T): Record<BlocId, T> => { const o = {} as Record<BlocId, T>; for (const b of BLOC_ORDER) o[b] = rows[b] ? f(rows[b], b) : dflt; return o; };
  const fdl = per((r, b) => Number(r.nominalGdp) * (b === 'FDL' ? 1 : ports.markets.fxSpot(store, b as Ccy) ?? BLOC_DEFAULTS[b].fx0), 0);
  const tot = BLOC_ORDER.reduce((t, b) => t + fdl[b], 0);
  const gdpShareFdl = per((_r, b) => (tot > 0 ? fdl[b] / tot : BLOC_DEFAULTS[b].gdpShare0), 0);
  return {
    blocZ: per<Record<string, number>>((r) => ({ ...r.imbalance }), {}), gdpShareFdl,
    fsi: g?.financialStressIndex ?? 0, fear: g?.fearIndex ?? 0, tension: ports.world.geopoliticalTension(store) ?? g?.geopoliticalTension ?? 0,
    hackRate: ports.conflict.worldHackRate(store) ?? g?.worldHackRate ?? 0, aiRace: ports.ai.aiRaceIndex(store) ?? g?.aiRaceIndex ?? 0,
    cryptoHype: ports.assets.cryptoHype(store), minStablecoinBacking: ports.assets.minStablecoinBacking(store), semisValuationZ: ports.assets.semisValuationZ(store),
    reserveCover: per((r) => r.fx.reserveCoverMonths, 99), currentAccount: per((r) => r.fx.currentAccountGdp, 0), lambda: per((r) => r.sovereign.hazard, 0),
    worldHeadlineInflation: BLOC_ORDER.reduce((t, b) => t + (rows[b] ? gdpShareFdl[b] * rows[b].headlineInflation : 0), 0),
    poolUnderwritingQuality: ports.funds.poolUnderwritingQuality(store), repoLeverageIndex: ports.credit?.repoLeverageIndex(store) ?? null,
    npcBankBelow12x: per((_r, b) => ports.credit?.npcBankBelow12xMin(store, b) ?? 0, 0), housePriceGap: per((r) => r.housePriceGap, 0),
    defaultRateRising: false,   // MISSING EXPORT: T07 defaultRateRising (07 port flag)
    weakestNpcBanks: ports.credit?.weakestNpcBanks(store, 3) ?? [],
  };
}
export function weightOf(def: MajorDef, s: CatalogInputs): number {
  return def.eligible(s) ? def.base * dmath.exp(dmath.clamp(def.vuln(s), -3, 4)) : 0;
}
export function majorWeights(store: StoreRead, ports: MacroPorts): { kind: CrisisKind; w: number }[] {
  const s = catalogInputs(store, ports);
  return MAJORS.map((d) => ({ kind: d.kind, w: weightOf(d, s) }));
}
export function chooseBlocs(store: StoreRead, kind: CrisisKind, u: number, ports?: MacroPorts): BlocId[] {
  const def = MAJORS.find((d) => d.kind === kind);
  if (!def) return [];
  return def.blocs(catalogInputs(store, ports ?? defaultMacroPorts()), u);
}
