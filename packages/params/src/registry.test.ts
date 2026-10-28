import { describe, expect, it } from 'vitest';
import { createParamsView, MACRO_E93_OPENING_PARAMS, MACRO_T04_07_PARAMS, MACRO_T04_08_PARAMS, ParamsError, TEST_PARAM_REGISTRY, type ParamsView } from './index';

const code = (f: () => unknown): string | undefined => { try { f(); } catch (e) { return (e as ParamsError).code; } return undefined; };

describe('AC-02-11-PARAMS-PKG: @tycoon/params ParamsView over the test registry', () => {
  const p: ParamsView = createParamsView(TEST_PARAM_REGISTRY, { version: 3 });
  it('every accessor reads its key: num, int, money(key, ccy), bool, str, list, version', () => {
    expect(p.num('test_num')).toBe(0.25); expect(p.int('test_int')).toBe(720);
    expect(p.money('test_money', 'FDL')).toBe(1_000_000n); expect(p.money('test_money', 'SRL')).toBe(5_000_000n);
    expect(p.bool('test_bool')).toBe(true); expect(p.str('test_str')).toBe('HALF_EVEN');
    expect(p.list<string>('test_list')).toEqual(['P0', 'P13']); expect(p.version).toBe(3);
    expect(createParamsView([]).version).toBe(0);
    expect(Object.keys(p).sort()).toEqual(['bool', 'int', 'list', 'money', 'num', 'str', 'version']);
  });
  it('E-71 (2): int faults PARAM_NOT_INT on any value that is not a safe integer', () => {
    for (const v of [0.5, -1.5, 2 ** 53, -(2 ** 53), NaN, Infinity, '7', 7n, null])
      expect(code(() => createParamsView(TEST_PARAM_REGISTRY, { overrides: { test_int: v } }).int('test_int'))).toBe('PARAM_NOT_INT');
    for (const v of [0, -0, 1, -1, 2 ** 53 - 1, -(2 ** 53 - 1)]) expect(createParamsView(TEST_PARAM_REGISTRY, { overrides: { test_int: v } }).int('test_int')).toBe(v === 0 ? 0 : v);
    expect(Object.is(createParamsView(TEST_PARAM_REGISTRY, { overrides: { test_int: -0 } }).int('test_int'), 0)).toBe(true);
  });
  it('type and shape faults', () => {
    expect(code(() => p.num('nope'))).toBe('PARAM_UNKNOWN');
    expect(code(() => p.int('test_num'))).toBe('PARAM_TYPE'); expect(code(() => p.num('test_int'))).toBe('PARAM_TYPE');
    expect(code(() => p.bool('test_str'))).toBe('PARAM_TYPE'); expect(code(() => p.str('test_bool'))).toBe('PARAM_TYPE');
    expect(code(() => p.list('test_str'))).toBe('PARAM_TYPE'); expect(code(() => p.money('test_num', 'FDL'))).toBe('PARAM_TYPE');
    const o = (k: string, v: unknown) => createParamsView(TEST_PARAM_REGISTRY, { overrides: { [k]: v } });
    expect(code(() => o('test_num', NaN).num('test_num'))).toBe('PARAM_NOT_FINITE'); expect(code(() => o('test_num', '1').num('test_num'))).toBe('PARAM_TYPE');
    expect(code(() => o('test_money', { FDL: 1n }).money('test_money', 'EUN'))).toBe('PARAM_NO_CCY'); expect(o('test_money', 9n).money('test_money', 'PYN')).toBe(9n);
    expect(code(() => o('test_money', 1.5).money('test_money', 'FDL'))).toBe('PARAM_TYPE'); expect(code(() => o('test_money', { FDL: 1 }).money('test_money', 'FDL'))).toBe('PARAM_NO_CCY');
    expect(code(() => o('test_bool', 1).bool('test_bool'))).toBe('PARAM_TYPE'); expect(code(() => o('test_str', 1).str('test_str'))).toBe('PARAM_TYPE');
    expect(code(() => o('test_list', 'a').list('test_list'))).toBe('PARAM_TYPE');
    expect(code(() => o('nope', 1))).toBe('PARAM_UNKNOWN');
    expect(code(() => createParamsView([...TEST_PARAM_REGISTRY, TEST_PARAM_REGISTRY[0]!]))).toBe('PARAM_DUP');
    expect(Object.is(o('test_num', -0).num('test_num'), 0)).toBe(true);
  });
  it('list returns a frozen copy; the view is frozen', () => {
    const l = p.list<string>('test_list'); expect(Object.isFrozen(l)).toBe(true); expect(Object.isFrozen(p)).toBe(true);
    expect(() => { (l as string[]).push('x'); }).toThrow(); expect(p.list('test_list')).toHaveLength(2);
    const src = ['a'], q = createParamsView(TEST_PARAM_REGISTRY, { overrides: { test_list: src } }), r = q.list<string>('test_list');
    expect(r).not.toBe(src); expect(Object.isFrozen(r)).toBe(true); src.push('b'); expect(r).toEqual(['a']);
  });
});

describe('T04-07 params (E-100)', () => {
  const p = createParamsView(MACRO_T04_07_PARAMS);
  it('macro_ns_lambda 1.8, macro_irp 0.002, macro_sov_lgd 0.6', () => {
    expect(p.num('macro_ns_lambda')).toBe(1.8); expect(p.num('macro_irp')).toBe(0.002); expect(p.num('macro_sov_lgd')).toBe(0.6);
    expect(MACRO_T04_07_PARAMS.map((d) => d.key)).toEqual(['macro_ns_lambda', 'macro_irp', 'macro_sov_lgd', 'macro_sovereign_base_hazard']);
  });
  it('macro_sovereign_base_hazard per bloc in BLOC_ORDER = BLOC_DEFAULTS.sovereignBaseHazard', () => {
    expect(p.list<{ bloc: string; hazard: number }>('macro_sovereign_base_hazard')).toEqual([
      { bloc: 'FDL', hazard: 0.0005 }, { bloc: 'EUN', hazard: 0.003 }, { bloc: 'PYN', hazard: 0.002 }, { bloc: 'NKR', hazard: 0.0003 }, { bloc: 'SRL', hazard: 0.02 }]);
    expect(code(() => p.num('macro_sovereign_base_hazard'))).toBe('PARAM_TYPE');
    expect(Object.isFrozen(p.list<object>('macro_sovereign_base_hazard')[0])).toBe(true);
  });
  it('combines with the test registry without a duplicate key', () => {
    expect(createParamsView([...TEST_PARAM_REGISTRY, ...MACRO_T04_07_PARAMS]).num('macro_irp')).toBe(0.002);
  });
});

describe('E-93 (6) opening params', () => {
  const p = createParamsView([...TEST_PARAM_REGISTRY, ...MACRO_T04_07_PARAMS, ...MACRO_T04_08_PARAMS, ...MACRO_E93_OPENING_PARAMS]);
  it('the 10 keys with the E-93 values', () => {
    expect(MACRO_E93_OPENING_PARAMS.map((d) => [d.key, p.num(d.key)])).toEqual([['mac_gov_cash0_gdp_FDL', 0.0246], ['mac_gov_cash0_gdp_EUN', 0.0331],
      ['mac_gov_cash0_gdp_PYN', 0.02], ['mac_gov_cash0_gdp_NKR', 0.0285], ['mac_gov_cash0_gdp_SRL', 0.0219], ['mac_cbk_reserve_cover0_EUN', 4],
      ['mac_cbk_reserve_cover0_PYN', 10], ['mac_cbk_reserve_cover0_NKR', 4], ['mac_cbk_reserve_cover0_SRL', 10], ['mac_gov_fdlcash0_gdp_SRL', 0.00672]]);
  });
});
