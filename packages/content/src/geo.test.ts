// T22A-02 acceptance tests (card test plan; every AC serves T10A-02, whose AC-10A-02-1 reads these getters).
import { describe, expect, it } from 'vitest';
import { createParamsView, type ParamsView } from '@tycoon/params';
import { ContentError } from './blocs';
import { peBaseKey, SECTOR_IDS } from './derived';
import { resolveFlags, TERRAIN_ROLES, type DistrictRow } from './geo';
import { contentHashOf } from './hash';
import { FULL_FILES, loadContent, type ContentView, type DistrictFlag } from './view';

const PE: Record<string, number> = { TECH: 32, SEMI: 26, ENERGY: 11, MATERIALS: 12, INDUSTRIALS: 16, FINANCIALS: 10, HEALTH: 20,
  STAPLES: 18, DISCRETIONARY: 20, REAL_ESTATE: 16, MEDIA: 18, SECURITY: 24 };
function params(): ParamsView {
  const t: Record<string, number> = {};
  for (const s of SECTOR_IDS) t[peBaseKey(s)] = PE[s]!;
  const get = (k: string): number => { const v = t[k]; if (v === undefined) throw new Error(`no param ${k}`); return v; };
  return { ...createParamsView([]), num: get, int: get };
}
const P = params();
const errCode = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof ContentError ? e.code : `other: ${String(e)}`; } };
type Rec = Record<string, unknown>;
const clone = <T>(x: T): T => structuredClone(x) as T;
const withFile = (name: string, edit: (f: Rec) => void): Record<string, unknown> => { const f = clone(FULL_FILES[name]) as Rec; edit(f); return { [name]: f }; };
const full = (): ContentView => loadContent('full', P);
const ALL16 = (v: ContentView): string[] => [...v.cities().map((c) => c.cityId), 'cty_isla_serena'];
const count = <T>(xs: readonly T[], f: (x: T) => boolean): number => xs.filter(f).length;

describe('T22A-02 ContentView geography', () => {
  it('AC-22A-02-DISTRICTS: 105 rows; tiers 26/44/29/6; heritage 11/94; terrain roles in the 8 values', () => {
    const d = full().districts();
    expect(d.length).toBe(105);
    expect({ working: count(d, (x) => x.tier === 'working'), mid: count(d, (x) => x.tier === 'mid'), prime: count(d, (x) => x.tier === 'prime'),
      trophy: count(d, (x) => x.tier === 'trophy') }).toEqual({ working: 26, mid: 44, prime: 29, trophy: 6 });
    expect([count(d, (x) => x.heritage), count(d, (x) => !x.heritage)]).toEqual([11, 94]);
    expect(TERRAIN_ROLES.length).toBe(8);
    for (const x of d) expect(TERRAIN_ROLES).toContain(x.terrainRole);
    expect(Object.keys(d[0]!).sort()).toEqual(['cityId', 'distId', 'flags', 'heritage', 'landmarkBrief', 'landmarkId', 'name', 'terrainRole', 'tier']);
    // 22 §3.3 row order: first and last rows
    expect([d[0]!.distId, d[104]!.distId]).toEqual(['dst_port_avalon_eastside_docks', 'dst_isla_serena_the_cays']);
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('districts.json', (f) => { (f.districts as Rec[])[3]!.tier = 'luxury'; }) }, P))).toBe('CONTENT_SHAPE');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('districts.json', (f) => { (f.districts as Rec[])[3]!.terrainRole = 'mountain'; }) }, P))).toBe('CONTENT_SHAPE');
  });

  it('AC-22A-02-IDS: 105 distinct dst_ ids and 105 distinct lmk_ ids', () => {
    const d = full().districts();
    expect(new Set(d.map((x) => x.distId)).size).toBe(105);
    expect(new Set(d.map((x) => x.landmarkId)).size).toBe(105);
    for (const x of d) { expect(x.distId).toMatch(/^dst_[a-z0-9_]+$/); expect(x.landmarkId).toMatch(/^lmk_[a-z0-9_]+$/); }
  });

  it('AC-22A-02-CITYMATCH: per-city district counts equal cityProfile.districtCount; 8/8/8/1; sum 105; every cityId known', () => {
    const v = full(), ids = ALL16(v);
    expect(ids.length).toBe(16);
    let sum = 0;
    for (const c of ids) { expect(v.districts(c).length).toBe(v.cityProfile(c).districtCount); sum += v.districts(c).length; }
    expect(sum).toBe(105);
    expect(['cty_port_avalon', 'cty_meridia', 'cty_kaiyo', 'cty_isla_serena'].map((c) => v.districts(c).length)).toEqual([8, 8, 8, 1]);
    for (const x of v.districts()) expect(ids).toContain(x.cityId);
    expect(errCode(() => v.districts('cty_x'))).toBe('CONTENT_UNKNOWN_CITY');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('districts.json', (f) => { (f.districts as Rec[])[0]!.cityId = 'cty_atlantis'; }) }, P))).toBe('CV04');
  });

  it('AC-22A-02-FLAGS: 73 §3.2 name entries resolve to 71 districts with 77 flag assignments; per-flag city entries C 9, CL 3, R 7, F 5, H 11; a renamed district fails', () => {
    const v = full(), d = v.districts();
    // 73 name entries in the §3.2 column (71 distinct districts; Temple Hill and Mirador carry two flags each), all resolved:
    const flagged = d.filter((x) => x.flags.length > 0);
    expect(flagged.length).toBe(71);
    expect(d.reduce((n, x) => n + x.flags.length, 0)).toBe(73 + 4);   // + 4: the four C/R districts of Tessan carry two flags from one entry
    const cities = (f: DistrictFlag): number => new Set(d.filter((x) => x.flags.includes(f)).map((x) => x.cityId)).size;
    expect({ C: cities('C'), CL: cities('CL'), R: cities('R'), F: cities('F'), H: cities('H') }).toEqual({ C: 9, CL: 3, R: 7, F: 5, H: 11 });
    const byName = (c: string, n: string): readonly DistrictFlag[] => v.districts(c).find((x) => x.name === n)!.flags;
    expect(byName('cty_port_avalon', 'Summit Estates on Gilt Hill')).toEqual(['H']);   // prefix resolution
    expect(byName('cty_tessan', 'Fab Island')).toEqual(['C', 'R']);                    // C/R
    expect(byName('cty_lakemont', 'Lakefront')).toEqual(['CL']);                       // C (lake)
    expect(byName('cty_mirako', 'Temple Hill')).toEqual(['F', 'H']);                   // E-88 (4): two entries (H and F), one district
    expect(byName('cty_cobreval', 'Mirador')).toEqual(['F', 'H']);
    expect(count(d, (x) => x.cityId === 'cty_meridia' && x.flags.length === 0)).toBeGreaterThan(0);
    for (const x of d) if (x.flags.length === 0) expect(x.flags).toEqual([]);
    const rename = (from: string, to: string) => withFile('districts.json', (f) => { for (const r of f.districts as Rec[]) if (r.name === from) r.name = to; });
    expect(errCode(() => loadContent({ base: 'full', patch: rename('Riverside Lofts', 'Riverside Loftz') }, P))).toBe('CONTENT_DISTRICT_FLAG_UNRESOLVED');
    expect(errCode(() => loadContent({ base: 'full', patch: rename('Summit Estates on Gilt Hill', 'Gilt Hill Summit') }, P))).toBe('CONTENT_DISTRICT_FLAG_UNRESOLVED');
    const rows = (...ns: string[]): DistrictRow[] => ns.map((name, i) => ({ distId: `dst_t_${i}`, cityId: 'cty_t', name, tier: 'mid', terrainRole: 'hill',
      heritage: false, landmarkId: `lmk_t_${i}`, landmarkBrief: '' }));
    expect(errCode(() => resolveFlags('cty_t', 'H: Oak', rows('Oak Park', 'Oak Hill')))).toBe('CONTENT_DISTRICT_FLAG_UNRESOLVED');   // ambiguous prefix
    expect(Object.keys(resolveFlags('cty_t', 'H: Oak', rows('Oak', 'Oak Hill')))).toEqual(['dst_t_0']);                            // exact wins
    expect(errCode(() => resolveFlags('cty_t', 'X: Oak', rows('Oak')))).toBe('CONTENT_SHAPE');
  });

  it('AC-22A-02-PERSONALITY: 16 personalities, perils integers 0..3, Isla Serena coastal storm 3, unknown id throws', () => {
    const v = full();
    for (const c of ALL16(v)) {
      const p = v.personality(c);
      expect(p.cityId).toBe(c);
      expect(Object.keys(p.perils).sort()).toEqual(['coastalStorm', 'flood', 'heatwave', 'quake', 'snowIce', 'wildfire']);
      for (const x of Object.values(p.perils)) { expect(Number.isInteger(x)).toBe(true); expect(x >= 0 && x <= 3).toBe(true); }
      for (const s of [p.palette, p.streetTrees, p.archetypeFamily]) expect(s.length).toBeGreaterThan(0);
    }
    expect(v.personality('cty_isla_serena').perils.coastalStorm).toBe(3);
    expect(errCode(() => v.personality('cty_x'))).toBe('CONTENT_UNKNOWN_CITY');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('personalities.json', (f) => {
      ((f.personalities as Rec[])[0]!.perils as Rec).quake = 4; }) }, P))).toBe('CONTENT_SHAPE');
  });

  it('AC-22A-02-PROFILE: Port Avalon profile; viewRank R0 everywhere, ownRank R0 for the 3 FDL cities and R2 for the other 12 (E-88 (3))', () => {
    const v = full();
    expect(v.cityProfile('cty_port_avalon')).toEqual({ cityId: 'cty_port_avalon', launchPop: 240000, districtCount: 8, viewRank: 'R0', ownRank: 'R0',
      geographicConstraint: 'crescent harbour bay, hill to the west', coastal: true, commodityHub: 'FDL hub (Eastside Docks)', cityRentMult: 1.0,
      hhSize: 2.4, ownerOccupierShare: 0.55, propertyTaxPctPerGY: 1.0, cbdHeightCapM: 320 });
    for (const c of ALL16(v)) { expect(['R0', 'R2', 'R6']).toContain(v.cityProfile(c).viewRank); expect(['R0', 'R2', 'R6']).toContain(v.cityProfile(c).ownRank); }
    expect(ALL16(v).map((c) => v.cityProfile(c).viewRank)).toEqual(ALL16(v).map(() => 'R0'));
    const own = v.cities().map((c) => [c.bloc, v.cityProfile(c.cityId).ownRank] as const);
    expect(own.filter(([b, r]) => b === 'FDL' && r === 'R0').length).toBe(3);
    expect(own.filter(([b, r]) => b !== 'FDL' && r === 'R2').length).toBe(12);
    expect(own.length).toBe(15);
    expect(v.cityProfile('cty_lakemont')).toMatchObject({ coastal: false, commodityHub: null, launchPop: 180000 });   // "no (lake port only)"
    expect(v.cityProfile('cty_isla_serena')).toMatchObject({ launchPop: 0, coastal: true, viewRank: 'R0', ownRank: 'R6', districtCount: 1 });   // AC-22A-02-SERENA: view R0, own R6 (E-88 (3))
    for (const bad of ['R4', 'r2', 'view R0 own R6', 'view R4, own R6', 'own R6, view R0', '']) {
      expect(errCode(() => loadContent({ base: 'full', patch: withFile('cities.json', (f) => { (f.cities as Rec[])[5]!.unlock = bad; }) }, P))).toBe('CONTENT_CITY_UNLOCK_UNPARSED');
    }
    const w2 = loadContent({ base: 'full', patch: withFile('cities.json', (f) => { (f.cities as Rec[])[5]!.unlock = 'view R2, own R6'; }) }, P);
    expect(w2.cityProfile(w2.cities()[5]!.cityId)).toMatchObject({ viewRank: 'R2', ownRank: 'R6' });
    expect(errCode(() => v.cityProfile('cty_x'))).toBe('CONTENT_UNKNOWN_CITY');
    for (const hub of ['-', '', ' - ']) {
      const w = loadContent({ base: 'full', patch: withFile('cities.json', (f) => { (f.cities as Rec[])[0]!.commodityHub = hub; }) }, P);
      expect(w.cityProfile('cty_port_avalon').commodityHub).toBeNull();
    }
  });

  it('AC-22A-02-SERENA: cities() still 15; Isla Serena reached via serena/districts/personality/cityProfile', () => {
    const v = full();
    expect(v.cities().length).toBe(15);
    expect(v.cities().map((c) => c.cityId)).not.toContain('cty_isla_serena');
    expect(v.serena().cityId).toBe('cty_isla_serena');
    const s = v.districts('cty_isla_serena');
    expect(s.map((x) => [x.name, x.flags])).toEqual([['The Cays', ['C']]]);
    expect(v.personality('cty_isla_serena').cityId).toBe('cty_isla_serena');
    expect(v.cityProfile('cty_isla_serena').cityId).toBe('cty_isla_serena');
  });

  it('AC-22A-02-HASH: one byte of either new file changes contentHash, key order does not; results frozen and pure', () => {
    const base = full().contentHash;
    expect(base).toBe(contentHashOf(FULL_FILES));
    const without: Record<string, unknown> = { ...FULL_FILES };
    delete without['districts.json'];
    expect(contentHashOf(without)).not.toBe(base);
    for (const [file, key, field] of [['districts.json', 'districts', 'landmarkBrief'], ['personalities.json', 'personalities', 'palette']] as const) {
      const files = clone(FULL_FILES) as Record<string, Rec>;
      const r = (files[file]![key] as Rec[])[7]!;
      r[field] = `${String(r[field]).slice(0, -1)}#`;
      expect(contentHashOf(files)).not.toBe(base);
      const f = FULL_FILES[file] as Rec, rev: Rec = {};
      for (const k of Object.getOwnPropertyNames(f).reverse()) rev[k] = k === key ? (f[k] as Rec[]).map((row) => {
        const o: Rec = {}; for (const kk of Object.getOwnPropertyNames(row).reverse()) o[kk] = row[kk]; return o; }) : f[k];
      expect(contentHashOf({ ...FULL_FILES, [file]: rev })).toBe(base);
    }
    const v = full();
    expect(v.catalogVersions['districts.json']).toBe(1);
    expect(v.catalogVersions['personalities.json']).toBe(1);
    expect(v.districts()).toEqual(full().districts());
    expect(v.districts('cty_kaiyo')).toBe(v.districts('cty_kaiyo'));
    expect(() => { (v.districts()[0] as unknown as Rec).name = 'x'; }).toThrow(TypeError);
    expect(() => { (v.districts()[0]!.flags as DistrictFlag[]).push('F'); }).toThrow(TypeError);
    expect(() => { (v.personality('cty_kaiyo').perils as Rec).quake = 0; }).toThrow(TypeError);
    expect(() => { (v.cityProfile('cty_kaiyo') as unknown as Rec).launchPop = 1; }).toThrow(TypeError);
    expect(() => { (v.districts('cty_kaiyo') as unknown as unknown[]).push(1); }).toThrow(TypeError);
  });
});
