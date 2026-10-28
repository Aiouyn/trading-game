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
