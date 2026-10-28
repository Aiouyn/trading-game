// T04-21 params: MACRO_PARAM_KEYS covers every literal p.num/int/str/bool key under packages/engine/macro, and each exact key resolves.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MACRO_PARAM_KEYS } from '../params';
import { macroWorld } from '../testkit/macroWorld';

const ROOT = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === '__tests__') return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}
const READ = /\.(?:num|int|str|bool)\(\s*'([A-Za-z0-9_]+)'/g;
const literalKeys = (): string[] => [...new Set(sources(ROOT).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(READ)].map((m) => m[1])))].sort();
const covers = (k: string): boolean => MACRO_PARAM_KEYS.some((e) => (e.endsWith('*') ? k.startsWith(e.slice(0, -1)) : k === e));
const CARD_FAMILIES = ['macro_xreg_*', 'macro_x_*', 'macro_rr_*', 'macro_cb_haircut_*', 'macro_rev_base_*', 'macro_issue_mix_*'];
const ERRATA = ['macro_fx_capital_flow_kappa', 'mac_gov_cash0_gdp_*', 'mac_cbk_reserve_cover0_*', 'mac_gov_fdlcash0_gdp_SRL', 'macro_auction_announce_tick',
  'major_precursor_min_game_days', 'major_suppression_game_days'];

describe('T04-21 MACRO_PARAM_KEYS', () => {
  it('the card 50 (44 exact + 6 families) plus 7 errata keys, no duplicates', () => {
    expect(MACRO_PARAM_KEYS.length).toBe(57);
    expect(new Set(MACRO_PARAM_KEYS).size).toBe(57);
    const card = MACRO_PARAM_KEYS.filter((k) => !ERRATA.includes(k));
    expect(card.length).toBe(50);
    expect(card.filter((k) => k.endsWith('*')).sort()).toEqual([...CARD_FAMILIES].sort());
    expect(card).toContain('npc_to_player_wealth_band');
    for (const k of ERRATA) expect(MACRO_PARAM_KEYS).toContain(k);
  });
  it('the static scan finds no unlisted literal key, and finds the scan itself working', () => {
    const keys = literalKeys();
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).toContain('macro_world_gdp_ref');
    expect(keys.filter((k) => !covers(k))).toEqual([]);
    expect(covers('macro_not_a_key')).toBe(false);
    expect(covers('macro_xreg_exp')).toBe(true);
  });
  it('every exact key resolves in the test ParamSet, except the 6 no registry has yet (MISSING EXPORT: T23-02 default ParamSet)', () => {
    const p = macroWorld('g', 0).ctx.params;
    const resolves = (k: string): boolean => [() => p.num(k), () => p.str(k), () => p.bool(k), () => p.list(k)].some((f) => { try { f(); return true; } catch { return false; } });
    const bad = MACRO_PARAM_KEYS.filter((k) => !k.endsWith('*') && !resolves(k));
    expect(bad).toEqual(['macro_auction_noncomp_max_face', 'macro_cac_threshold', 'macro_fx_uip_share', 'macro_sov_grace_days', 'macro_ycc_bloc', 'npc_to_player_wealth_band']);
    expect(resolves('macro_sovereign_base_hazard')).toBe(true);   // list (T04-07 stand-in)
    expect(resolves('macro_not_a_key')).toBe(false);
  });
});
