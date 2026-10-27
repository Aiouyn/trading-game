// T22A-02: ContentView geography (22 §3.1 city profile fields, §3.2 personalities + district flags, §3.3 districts).
// Data plus a typed, pure read: no derivation, no height-cap rule, no renderer mapping (those belong to T10A-02).
import { ContentError } from './blocs';

export type DistrictTier = 'working' | 'mid' | 'prime' | 'trophy';
export type TerrainRole = 'waterfront' | 'industrial_shore' | 'riverside' | 'flat_center' | 'hill' | 'edge' | 'island' | 'reclaimed';
export type DistrictFlag = 'C' | 'CL' | 'R' | 'F' | 'H';   // coastal, lake shore ("C (lake)"), river, fault, hill (22 §3.2)
export type PerilClass = 0 | 1 | 2 | 3;
export interface DistrictContent { distId: string; cityId: string; name: string; tier: DistrictTier; terrainRole: TerrainRole;
  heritage: boolean; landmarkId: string; landmarkBrief: string; flags: readonly DistrictFlag[] }
export interface CityPersonality { cityId: string; palette: string; streetTrees: string; archetypeFamily: string;
  perils: { flood: PerilClass; coastalStorm: PerilClass; quake: PerilClass; wildfire: PerilClass; heatwave: PerilClass; snowIce: PerilClass } }
export interface CityProfile { cityId: string; launchPop: number; districtCount: number; unlock: 'R0' | 'R2' | 'R6';
  geographicConstraint: string; coastal: boolean; commodityHub: string | null; cityRentMult: number; hhSize: number;
  ownerOccupierShare: number; propertyTaxPctPerGY: number; cbdHeightCapM: number }

export const DISTRICT_TIERS: readonly DistrictTier[] = Object.freeze(['working', 'mid', 'prime', 'trophy'] as const);
export const TERRAIN_ROLES: readonly TerrainRole[] = Object.freeze(['waterfront', 'industrial_shore', 'riverside', 'flat_center', 'hill', 'edge', 'island', 'reclaimed'] as const);
/** Flag order inside DistrictContent.flags (the DistrictFlag declaration order). */
export const DISTRICT_FLAGS: readonly DistrictFlag[] = Object.freeze(['C', 'CL', 'R', 'F', 'H'] as const);
/** 22 §3.2 "Flagged districts" labels: `C/R` gives both flags, `C (lake)` gives CL. */
const FLAG_LABELS: Readonly<Record<string, readonly DistrictFlag[]>> = Object.freeze({
  'C': ['C'], 'C (lake)': ['CL'], 'C/R': ['C', 'R'], 'R': ['R'], 'F': ['F'], 'H': ['H'] });
const PERILS = ['flood', 'coastalStorm', 'quake', 'wildfire', 'heatwave', 'snowIce'] as const;

export interface DistrictRow { distId: string; cityId: string; name: string; tier: string; terrainRole: string; heritage: boolean; landmarkId: string; landmarkBrief: string }
export interface PersonalityRow { cityId: string; palette: string; streetTrees: string; archetypeFamily: string; perils: Record<string, number>; flaggedDistricts: string }
export interface ProfileRow { cityId: string; launchPop: string; districts: number; unlock: string; geographicConstraint: string; coastal: string;
  commodityHub: string | null; cityRentMult: number; hhSize: number; ownerOccupierShare: number; propertyTaxPctPerGY: number; cbdHeightCapM: number }

function fail(code: string, msg: string): never { throw new ContentError(code, msg); }

/** Step 2: parse one §3.2 cell ("C: a, b; H: c") into name → flags, resolving each name in its city (exact, else unique prefix). */
export function resolveFlags(cityId: string, cell: string, cityDistricts: readonly DistrictRow[]): Record<string, DistrictFlag[]> {
  const out: Record<string, DistrictFlag[]> = {};
  if (cell.trim() === '') return out;
  for (const seg of cell.split(';')) {
    const i = seg.indexOf(':');
    const flags = i < 0 ? undefined : FLAG_LABELS[seg.slice(0, i).trim()];
    if (flags === undefined) fail('CONTENT_SHAPE', `${cityId}: bad flag segment '${seg.trim()}'`);
    for (const raw of seg.slice(i + 1).split(',')) {
      const n = raw.trim();
      const exact = cityDistricts.filter((d) => d.name === n);
      const hits = exact.length > 0 ? exact : cityDistricts.filter((d) => d.name.startsWith(n));
      if (hits.length !== 1) fail('CONTENT_DISTRICT_FLAG_UNRESOLVED', `${cityId}: '${n}' matches ${hits.length} districts`);
      const id = hits[0]!.distId;
      const got = out[id] ?? (out[id] = []);
      for (const f of flags) if (!got.includes(f)) got.push(f);
    }
  }
  return out;
}

const perilOf = (cityId: string, k: string, v: unknown): PerilClass =>
  (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3) ? v as PerilClass : fail('CONTENT_SHAPE', `${cityId}: peril ${k} = ${String(v)}`);

/** Step 4: "240,000" → 240000; "0 (estates only)" → 0 (the leading number). */
function parsePop(cityId: string, s: string): number {
  const m = /^([0-9][0-9,]*)(?: \(.*\))?$/.exec(s);
  return m === null ? fail('CONTENT_SHAPE', `${cityId}: launchPop '${s}'`) : Number(m[1]!.replace(/,/g, ''));
}
/** yes/no with an optional parenthetical qualifier ("no (lake port only)", "yes (marinas only)"). */
function parseYesNo(cityId: string, s: string): boolean {
  const m = /^(yes|no)(?: \(.*\))?$/.exec(s);
  return m === null ? fail('CONTENT_SHAPE', `${cityId}: coastal '${s}'`) : m[1] === 'yes';
}
/** R0/R2/R6; Isla Serena's "view R0, own R6" takes the ownership gate R6 (interpretation, see PR). */
function parseUnlock(cityId: string, s: string): CityProfile['unlock'] {
  const m = /^(R0|R2|R6)$/.exec(s) ?? /^view R[026], own (R0|R2|R6)$/.exec(s);
  return m === null ? fail('CONTENT_SHAPE', `${cityId}: unlock '${s}'`) : m[1] as CityProfile['unlock'];
}

export interface Geo { districts: DistrictContent[]; personalities: CityPersonality[]; profiles: CityProfile[] }

export function buildGeo(cityIds: readonly string[], districtRows: readonly DistrictRow[], personalityRows: readonly PersonalityRow[],
  profileRows: readonly ProfileRow[]): Geo {
  for (const d of districtRows) {
    if (!cityIds.includes(d.cityId)) fail('CV04', `${d.distId}: unknown city ${d.cityId}`);
    if (!(DISTRICT_TIERS as readonly string[]).includes(d.tier)) fail('CONTENT_SHAPE', `${d.distId}: tier ${d.tier}`);
    if (!(TERRAIN_ROLES as readonly string[]).includes(d.terrainRole)) fail('CONTENT_SHAPE', `${d.distId}: terrainRole ${d.terrainRole}`);
    if (typeof d.heritage !== 'boolean') fail('CONTENT_SHAPE', `${d.distId}: heritage`);
  }
  const flagsById: Record<string, readonly DistrictFlag[]> = {};
  const personalities: CityPersonality[] = personalityRows.map((p) => {
    if (!cityIds.includes(p.cityId)) fail('CV04', `personality: unknown city ${p.cityId}`);
    Object.assign(flagsById, resolveFlags(p.cityId, p.flaggedDistricts, districtRows.filter((d) => d.cityId === p.cityId)));
    const perils = Object.fromEntries(PERILS.map((k) => [k, perilOf(p.cityId, k, p.perils[k])])) as CityPersonality['perils'];
    return { cityId: p.cityId, palette: p.palette, streetTrees: p.streetTrees, archetypeFamily: p.archetypeFamily, perils };
  });
  const districts: DistrictContent[] = districtRows.map((d) => {
    const s = flagsById[d.distId] ?? [];
    return { distId: d.distId, cityId: d.cityId, name: d.name, tier: d.tier as DistrictTier, terrainRole: d.terrainRole as TerrainRole,
      heritage: d.heritage, landmarkId: d.landmarkId, landmarkBrief: d.landmarkBrief, flags: DISTRICT_FLAGS.filter((f) => s.includes(f)) };
  });
  const profiles: CityProfile[] = profileRows.map((r) => ({ cityId: r.cityId, launchPop: parsePop(r.cityId, r.launchPop), districtCount: r.districts,
    unlock: parseUnlock(r.cityId, r.unlock), geographicConstraint: r.geographicConstraint, coastal: parseYesNo(r.cityId, r.coastal),
    commodityHub: r.commodityHub === null || r.commodityHub.trim() === '' || r.commodityHub.trim() === '-' ? null : r.commodityHub,
    cityRentMult: r.cityRentMult, hhSize: r.hhSize, ownerOccupierShare: r.ownerOccupierShare, propertyTaxPctPerGY: r.propertyTaxPctPerGY,
    cbdHeightCapM: r.cbdHeightCapM }));
  return { districts, personalities, profiles };
}
