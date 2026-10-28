// E-70 (4): minimal TEST registry. The real 23 registry (all params, loader, range validator) follows later.
import { ParamsError, type ParamCcy, type ParamsView } from './view';

export type ParamType = 'num' | 'int' | 'money' | 'bool' | 'str' | 'list';
/** money values are already Money (bigint micro-units), either one value for every ccy or one per ccy. */
export interface ParamDef { key: string; type: ParamType; value: unknown }

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function read(def: ParamDef | undefined, key: string, want: ParamType): unknown {
  if (!def) throw new ParamsError('PARAM_UNKNOWN', key, 'not in the registry');
  if (def.type !== want) throw new ParamsError('PARAM_TYPE', key, `is ${def.type}, read as ${want}`);
  return def.value;
}

/** A ParamsView over defs (+ test overrides by key). Each accessor checks the declared type and the value's runtime shape. */
export function createParamsView(defs: readonly ParamDef[], opts: { version?: number; overrides?: Readonly<Record<string, unknown>> } = {}): ParamsView {
  const byKey: Record<string, ParamDef> = Object.create(null) as Record<string, ParamDef>;
  for (const d of defs) {
    if (d.key in byKey) throw new ParamsError('PARAM_DUP', d.key, 'declared twice');
    byKey[d.key] = d;
  }
  if (opts.overrides) for (const k of Object.getOwnPropertyNames(opts.overrides)) {
    const d = byKey[k];
    if (!d) throw new ParamsError('PARAM_UNKNOWN', k, 'override of an unknown key');
    byKey[k] = { ...d, value: opts.overrides[k] };
  }
  const num = (key: string): number => {
    const v = read(byKey[key], key, 'num');
    if (typeof v !== 'number') throw new ParamsError('PARAM_TYPE', key, 'value is not a number');
    if (!Number.isFinite(v)) throw new ParamsError('PARAM_NOT_FINITE', key, `${v}`);
    return v === 0 ? 0 : v;
  };
  return Object.freeze({
    version: opts.version ?? 0,
    num,
    int(key: string): number {
      const v = read(byKey[key], key, 'int');
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new ParamsError('PARAM_NOT_INT', key, `${String(v)} is not a safe integer`);
      return v === 0 ? 0 : v;
    },
    money(key: string, ccy: ParamCcy): bigint {
      const v = read(byKey[key], key, 'money');
      if (typeof v === 'bigint') return v;
      if (isRec(v)) { const x = v[ccy]; if (typeof x === 'bigint') return x; throw new ParamsError('PARAM_NO_CCY', key, `no ${ccy} value`); }
      throw new ParamsError('PARAM_TYPE', key, 'value is not Money (bigint)');
    },
    bool(key: string): boolean {
      const v = read(byKey[key], key, 'bool');
      if (typeof v !== 'boolean') throw new ParamsError('PARAM_TYPE', key, 'value is not a boolean');
      return v;
    },
    str(key: string): string {
      const v = read(byKey[key], key, 'str');
      if (typeof v !== 'string') throw new ParamsError('PARAM_TYPE', key, 'value is not a string');
      return v;
    },
    list<T = unknown>(key: string): readonly T[] {
      const v = read(byKey[key], key, 'list');
      if (!Array.isArray(v)) throw new ParamsError('PARAM_TYPE', key, 'value is not a list');
      return Object.freeze(v.slice()) as readonly T[];
    },
  });
}

/** AC-02-11-PARAMS-PKG test registry: one key per accessor. */
export const TEST_PARAM_REGISTRY: readonly ParamDef[] = Object.freeze([
  { key: 'test_num', type: 'num', value: 0.25 },
  { key: 'test_int', type: 'int', value: 720 },
  { key: 'test_money', type: 'money', value: { FDL: 1_000_000n, EUN: 2_000_000n, PYN: 3_000_000n, NKR: 4_000_000n, SRL: 5_000_000n } },
  { key: 'test_bool', type: 'bool', value: true },
  { key: 'test_str', type: 'str', value: 'HALF_EVEN' },
  { key: 'test_list', type: 'list', value: Object.freeze(['P0', 'P13']) },
] as ParamDef[]);

/** T04-07 params (04 §3.7.5, §3.7.6, §3.11.1, §3.11.2; values per E-100). Stand-in home until the real 23 registry (T23-02) lands.
 *  `macro_sovereign_base_hazard` is per bloc: T23-02 plans `{kind:'struct'}`, which ParamType has no accessor for yet, so it is a
 *  `list` of `{ bloc, hazard }` in BLOC_ORDER (equal to macro/blocs.ts BLOC_DEFAULTS[b].sovereignBaseHazard). */
export const MACRO_T04_07_PARAMS: readonly ParamDef[] = Object.freeze([
  { key: 'macro_ns_lambda', type: 'num', value: 1.8 },          // years, Nelson-Siegel λ
  { key: 'macro_irp', type: 'num', value: 0.002 },              // inflation risk premium in be10
  { key: 'macro_sov_lgd', type: 'num', value: 0.6 },            // sovereign loss given default
  { key: 'macro_sovereign_base_hazard', type: 'list', value: Object.freeze([
    Object.freeze({ bloc: 'FDL', hazard: 0.0005 }), Object.freeze({ bloc: 'EUN', hazard: 0.0030 }), Object.freeze({ bloc: 'PYN', hazard: 0.0020 }),
    Object.freeze({ bloc: 'NKR', hazard: 0.0003 }), Object.freeze({ bloc: 'SRL', hazard: 0.0200 })]) },
] as ParamDef[]);

/** T04-08 (04 §3.8.1–§3.8.3): corridor half-width, reserve requirements per bloc, standing-facility haircuts (key = kind_bucket, lower case). */
const HC: readonly (readonly [string, number])[] = [['own_gov_aaa_aa', 0.01], ['own_gov_a', 0.02], ['own_gov_bbb', 0.04], ['own_gov_bb', 0.15],
  ['other_gov_aaa_aa', 0.03], ['other_gov_a', 0.05], ['other_gov_bbb', 0.10], ['corp_aaa_aa', 0.05], ['corp_a', 0.07], ['corp_bbb', 0.12],
  ['abs_covered_aaa_aa', 0.08], ['abs_covered_a', 0.12], ['abs_covered_bbb', 0.20], ['credit_claim', 0.30], ['equity', 0.40]];
export const MACRO_T04_08_PARAMS: readonly ParamDef[] = Object.freeze([
  { key: 'macro_corridor_halfwidth', type: 'num', value: 0.0025 },
  { key: 'macro_rr_fdl', type: 'num', value: 0.01 }, { key: 'macro_rr_eun', type: 'num', value: 0.01 }, { key: 'macro_rr_pyn', type: 'num', value: 0.05 },
  { key: 'macro_rr_nkr', type: 'num', value: 0.01 }, { key: 'macro_rr_srl', type: 'num', value: 0.10 },
  ...HC.map(([k, v]) => ({ key: `macro_cb_haircut_${k}`, type: 'num', value: v })),
] as ParamDef[]);

/** E-93 (6) opening balance-sheet ratios (T04-22 param table; read with p.num × genesisNominalGdp). Values are E-93's with
 *  the E-103 (1)/(2) SRL amendments (reserve cover 11, FDL cash 0.007392). Ranges: cash [0, 0.25], cover [0, 36], FDL cash [0, 0.05]. */
export const MACRO_E93_OPENING_PARAMS: readonly ParamDef[] = Object.freeze([
  { key: 'mac_gov_cash0_gdp_FDL', type: 'num', value: 0.0246 }, { key: 'mac_gov_cash0_gdp_EUN', type: 'num', value: 0.0331 },
  { key: 'mac_gov_cash0_gdp_PYN', type: 'num', value: 0.0200 }, { key: 'mac_gov_cash0_gdp_NKR', type: 'num', value: 0.0285 },
  { key: 'mac_gov_cash0_gdp_SRL', type: 'num', value: 0.0219 },
  { key: 'mac_cbk_reserve_cover0_EUN', type: 'num', value: 4 }, { key: 'mac_cbk_reserve_cover0_PYN', type: 'num', value: 10 },
  { key: 'mac_cbk_reserve_cover0_NKR', type: 'num', value: 4 }, { key: 'mac_cbk_reserve_cover0_SRL', type: 'num', value: 11 },
  { key: 'mac_gov_fdlcash0_gdp_SRL', type: 'num', value: 0.007392 },
] as ParamDef[]);

/** T04-17 crisis scheduler (04 §3.16.1-§3.16.2, 16 §3.7.3). Ranges: base 2e-4–6e-4, gap 336–1008, ripple 1/14–1/3, storm 1/182–1/60, precursor 4–20, suppression 0–1344. */
export const MACRO_T04_17_PARAMS: readonly ParamDef[] = Object.freeze([
  { key: 'macro_major_base_rate', type: 'num', value: 3.6e-4 }, { key: 'macro_major_min_gap_days', type: 'num', value: 504 },
  { key: 'macro_ripple_rate', type: 'num', value: 1 / 7 }, { key: 'macro_storm_rate', type: 'num', value: 1 / 91 },
  { key: 'major_precursor_min_game_days', type: 'num', value: 8 }, { key: 'major_suppression_game_days', type: 'num', value: 336 },
] as ParamDef[]);
