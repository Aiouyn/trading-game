// T10A-01 acceptance tests AC-10A-01-1..4, plus the geometry and table guards the schema relies on.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Money, StoreRead } from '@tycoon/engine-core';
import { canonDecode, canonEncode, cmpStr, IdFactory, TABLE_NAME_RE, TableRegistry } from '@tycoon/engine-core';
import { ReasonCatalog } from '@tycoon/engine-ledger';
import { ALLOWED, NONCOMPLIANT } from './lint/entity-prefix.mjs';
import { ENTITY_KINDS } from '../ledger/src/types';
import { ALLOWED_ENTITY_PREFIXES, archetypeId, assertEntityId, baseMeshId, buildingId, cityId, districtId, ENTITY_ID_MAX_LEN, leaseId, managementPolicyId, manifestId,
  NONCOMPLIANT_ENTITY_PREFIXES, parcelId, personalityId, propId, regionId, streetId, styleId, transitionId, unitId } from './ids';
import { assertFixedPolygon, assertFixedPolyline, assertFixedRect, quantiseCm, signedArea2 } from './geom';
import { ALL_CITY_TABLES, assertBuildingVisual, assertBuildingVisualPart, cityAccessOf, DEFAULT_PUBLIC_RECORD, effectivePublicRecord, ownRankFor, USE_CLASSES,
  type BuildingRow, type CityManifestRow, type CityRegionRow, type CityRow, type DistrictRow, type DistrictUseMarket,
  type LeaseRow, type ParcelRow, type PropertyRow, type PublicCityState, type UnitRow, type UseClass } from './schema';
import { CATALOG_GAPS_10A, CITY_DIRECT_CODES, CITY_REASON_ALIAS_NAMES, CITY_REASON_ALIASES, catalogGaps10A } from './codes';
import { byUseOf, checkCityEvent, CITY_EVENT_VISIBILITY, CITY_EVENTS, DEFERRED_EVENT_KINDS, optInAllows, PUBLIC_OPT_IN, PUBLIC_PAYLOAD_KEYS, supplyByUseOf } from './events';
import type { BlocMacroInputs, CityBizPort, CityContentPort, CityHhPort, CityMacroPort, CityPorts } from './ports';
import type { ContentView } from '@tycoon/content';
import type { z } from 'zod';
import type { SectorId } from '@tycoon/content';

const dir = fileURLToPath(new URL('.', import.meta.url));
const SALT = new Uint8Array(32).fill(7);
const ids = new IdFactory(SALT, 'p_city', 1440);

describe('AC-10A-01-1 every id helper output passes assertEntityId', () => {
  it('authored ids, including the longest district slug (43 ≤ 64)', () => {
    const longest = districtId('port_avalon', 'summit_estates_on_gilt_hill');
    expect(longest).toBe('dst_port_avalon_summit_estates_on_gilt_hill');
    expect(longest.length).toBe(43);
    for (const id of [cityId('port_avalon'), cityId('isla_serena'), longest, parcelId('port_avalon', 0), parcelId('port_avalon', 123456)])
      expect(() => assertEntityId(id)).not.toThrow();
    expect(cityId('port_avalon')).toBe('cty_port_avalon');
    expect(parcelId('port_avalon', 17)).toBe('pcl_port_avalon_17');
  });
  it('generated ids (02 deterministic ctx.newId): unt_, bld_, prop_, lse_ + 26 chars', () => {
    const out = [unitId(ids), buildingId(ids), propId(ids), leaseId(ids)];
    expect(out.map((x) => x.slice(0, x.indexOf('_') + 1))).toEqual(['unt_', 'bld_', 'prop_', 'lse_']);
    for (const id of out) { expect(() => assertEntityId(id)).not.toThrow(); expect(id.length - id.indexOf('_') - 1).toBe(26); }
  });
  it('assertEntityId rejects a bad kind, a bad body, and 65 characters; accepts exactly 64', () => {
    // eslint-disable-next-line city/no-noncompliant-entity-prefix -- negative cases for the rule and the id guard
    for (const bad of ['city_port_avalon', 'cty-port', 'cty_', 'CTY_x', 'cty_a-b', 'abcd_x', `cty_${'a'.repeat(61)}`]) expect(() => assertEntityId(bad)).toThrow(/CITY_BAD_ID|does not match|characters/);
    expect(() => assertEntityId(`cty_${'a'.repeat(60)}`)).not.toThrow();
    expect(`cty_${'a'.repeat(60)}`.length).toBe(ENTITY_ID_MAX_LEN);
    expect(() => assertEntityId('hh_x')).not.toThrow();
    expect(() => cityId('port avalon')).toThrow();
    expect(() => districtId('port_avalon', `x${'a'.repeat(60)}`)).toThrow();
    expect(() => parcelId('port_avalon', -1)).toThrow(/^parcel seq -1 is not a non-negative integer/);
    expect(() => parcelId('port_avalon', 1.5)).toThrow(/^parcel seq 1\.5 is not a non-negative integer/);
  });
});

const eslint = new ESLint({ overrideConfigFile: `${dir}eslint.config.mjs`, cwd: dir });
async function errs(fixture: string): Promise<{ rule: string | null; msg: string }[]> {
  const [r] = await eslint.lintText(readFileSync(`${dir}__lint_fixtures__/${fixture}.ts.txt`, 'utf8'), { filePath: `${dir}__virtual__/${fixture}.ts` });
  return r!.messages.filter((m) => m.severity === 2).map((m) => ({ rule: m.ruleId, msg: m.message }));
}
describe('AC-10A-01-2 lint rule no-noncompliant-entity-prefix', () => {
  const RULE = 'city/no-noncompliant-entity-prefix';
  // eslint-disable-next-line city/no-noncompliant-entity-prefix -- negative cases for the rule and the id guard
  for (const [f, bad, good] of [['bad-city', 'city_', 'cty_'], ['bad-dist', 'dist_', 'dst_'], ['bad-unit', 'unit_', 'unt_'], ['bad-loan', 'loan_', 'lon_'], ['bad-uq', 'uq_', 'unq_']] as const)
    it(`a '${bad}' literal fails and names '${good}'`, async () => {
      const e = await errs(f);
      expect(e).toEqual([{ rule: RULE, msg: `entity-id prefix '${bad}' is not E-26 compliant: use '${good}'` }]);
    });
  it('a literal with each of the 85 allowed prefixes (and a template literal, and a mid-string match) passes', async () => {
    expect(await errs('good')).toEqual([]);
  });
  // QA follow-up (E-88): the deny check runs at every template-literal position, not only the head quasi; one fixture per position.
  // eslint-disable-next-line city/no-noncompliant-entity-prefix -- negative cases for the rule
  for (const [f, bad, good] of [['pos-head', 'city_', 'cty_'], ['pos-middle', 'dist_', 'dst_'], ['pos-quasi-start', 'unit_', 'unt_'], ['pos-tail', 'loan_', 'lon_'], ['pos-token', 'uq_', 'unq_']] as const)
    it(`position fixture ${f}: '${bad}' fails and names '${good}'`, async () => {
      expect(await errs(f)).toEqual([{ rule: RULE, msg: `entity-id prefix '${bad}' is not E-26 compliant: use '${good}'` }]);
    });
  it('the allowed and denied lists are the card\'s, and ids.ts and the rule agree', () => {
    expect(ALLOWED_ENTITY_PREFIXES.length).toBe(85);
    expect(new Set(ALLOWED_ENTITY_PREFIXES).size).toBe(85);
    expect([...ALLOWED]).toEqual([...ALLOWED_ENTITY_PREFIXES]);
    // eslint-disable-next-line city/no-noncompliant-entity-prefix -- negative cases for the rule and the id guard
    expect([...NONCOMPLIANT_ENTITY_PREFIXES]).toEqual(['city_', 'dist_', 'unit_', 'loan_', 'uq_']);
    expect(Object.keys(NONCOMPLIANT)).toEqual([...NONCOMPLIANT_ENTITY_PREFIXES]);
    for (const p of NONCOMPLIANT_ENTITY_PREFIXES) { expect(ALLOWED_ENTITY_PREFIXES).not.toContain(p); expect(ALLOWED_ENTITY_PREFIXES).toContain(NONCOMPLIANT[p]); }
    for (const p of ALLOWED_ENTITY_PREFIXES) expect(() => assertEntityId(`${p}x`)).not.toThrow();   // every allowed kind satisfies E-18/E-20
  });
});

// ───────── AC-10A-01-3 fixtures: one fully populated row of each table ─────────
const SECTORS: SectorId[] = ['TECH', 'SEMI', 'ENERGY', 'MATERIALS', 'INDUSTRIALS', 'FINANCIALS', 'HEALTH', 'STAPLES', 'DISCRETIONARY', 'REAL_ESTATE', 'MEDIA', 'SECURITY'];
const perUse = <V>(f: (u: UseClass, i: number) => V): Record<UseClass, V> => USE_CLASSES.reduce((r, u, i) => ({ ...r, [u]: f(u, i) }), {} as Record<UseClass, V>);
const C = cityId('port_avalon'), D = districtId('port_avalon', 'old_harbor'), P = parcelId('port_avalon', 17);
const B = buildingId(ids), U1 = unitId(ids), U2 = unitId(ids), PR = propId(ids), L = leaseId(ids);
const addr = { number: 14, streetId: streetId('port_avalon', 9), streetName: 'Quayside Row', districtId: D, cityId: C, display: '14 Quayside Row, Old Harbor, Port Avalon' };
const appraisal = { tick: 1440, valueIncome: 1_250_000_00n, valueComp: 1_310_000_00n, weightIncome: 0.6, value: 1_274_000_00n, priceIndexAtAppraisal: 1.0125, appraiser: 'SYSTEM' as const };
const city: CityRow = { id: C, slug: 'port_avalon', rendererKey: 'avalon', name: 'city.port_avalon.name', bloc: 'FDL', ccy: 'FDL', personalityId: personalityId('port_avalon'),
  worldSeedStream: `city/${C}`, openedTick: 0, access: cityAccessOf(C), districts: [D], population: 1_234_567.5, households: 514_403.125, hhSize: 2.4, laborForce: 640_000,
  jobsBySector: SECTORS.reduce((r, s, i) => ({ ...r, [s]: 1000 * (i + 1) + 0.25 }), {} as Record<SectorId, number>), medianHhIncomePerGY: 6_400_000n,
  cityGdpShare: 0.42, propertyTaxRate: 0.01, stampDutyRate: 0.01, priceIndex: 1, stateVersion: 3, manifestId: manifestId('port_avalon', 3) };
const market = (i: number): DistrictUseMarket => ({ supplyArea: 120_000 + i, occupiedArea: 110_000, demandArea: 111_234.5, vacancy: 0.0833, naturalVacancy: 0.05,
  pressure: 1.01, pressureHighDays: 0, pressureLowDays: 2, marketRentPerM2PerGD: -0n + BigInt(37 + i), rentIndex: 1, capRate: 0.055, txnCount91: 4 });
const district: DistrictRow = { id: D, cityId: C, name: 'district.old_harbor.name', tier: 'prime', terrainRole: 'waterfront', heritage: true, heightCapM: 45,
  market: perUse((_u, i) => market(i)), desirability: { jobsAccess: 0.3, services: -0.1, transit: 0.5, environment: 0.7, safety: 0, prestige: 0.2, momentum: 0.05, tierOffset: 0.5, value: 0.79 },
  crimeIndex: 48.5, capexMomentum91: 0n, landmarkParcelId: P, priceIndexByUse: perUse((_u, i) => 1 + i / 100) };
const parcel: ParcelRow = { id: P, cityId: C, districtId: D, regionId: regionId('port_avalon', 2), polygon: [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 3000 }, { x: -150, z: 3000 }],
  areaM2: 600, frontageM: 20, access: ['ROAD', 'CANAL'], zoning: { allowed: ['RES', 'RETAIL'], maxHeightM: 30, maxFar: 4.5, heritageLocked: false }, landValueV: 0.813,
  attributes: { waterView: 0.9, transitDist: 320, slope: 0.02, cornerLot: true, mainAvenue: false }, lifecycle: 'OCCUPIED', devPriority: 0.12, ownerId: 'npc_land_authority',
  buildingId: B, reservedFor: null, address: addr };
const building: BuildingRow = { id: B, parcelId: P, archetypeId: archetypeId('quay_terrace'), propertyType: 'APARTMENT_BLOCK', use: 'RES', floors: 6, heightM: 19.5, grossAreaM2: 1800,
  qualityGrade: 'B', builtTick: -40_000, condition: 72.5, units: [U1, U2],
  visual: { parts: [{ baseMeshId: baseMeshId('box'), size: { xCm: 2000, zCm: 3000, heightCm: 1950 }, rotationQ: 2, styleId: styleId('brick'), seed: 913, floorHeightCm: 325, bayWidthCm: 400, tintIndex: 3 }] },
  physicalState: 'OCCUPIED', ownership: 'STRATA', wholeOwnerPropId: null, npcPoolKey: `${D}|RES|B` };
const unit: UnitRow = { id: U1, buildingId: B, use: 'RETAIL', areaM2: 90, floor: 0, storefront: true, slotClass: 'CORNER_AVENUE', propId: PR, occupantId: 'biz_bakery', leaseId: L };
const prop: PropertyRow = { id: PR, type: 'RETAIL_UNIT', ownerId: 'chr_0001', ccy: 'FDL', cityId: C, districtId: D, parcelId: P, buildingId: B, unitIds: [U1], areaM2: 90,
  condition: 80, qualityGrade: 'B', amenityMult: 1.07, useMode: 'RENTED', useModeChangedTick: 0, managerContractId: null, policyId: managementPolicyId('default'), groupId: null,
  mortgageIds: ['lon_1'], lastAppraisal: appraisal, costBasis: 1_200_000_00n, acquiredTick: 720, insurancePolicyId: null, listingId: null, heldByCourt: false,
  publicRecord: DEFAULT_PUBLIC_RECORD, uniqueAssetId: null };
const lease: LeaseRow = { id: L, propId: PR, unitIds: [U1], landlordId: 'chr_0001', tenantId: 'biz_bakery', tenantKind: 'PLAYER_BUSINESS', use: 'RETAIL', rentPerGD: 4_210n,
  revenueSharePct: 0, startTick: 720, endTick: 720 + 1440 * 3, indexation: 'CPI', depositHeld: -0n + 378_900n, breakFeeGD: 91, status: 'ACTIVE', arrearsGD: 0, relatedParty: false, contractId: 'ctr_9' };
const manifest: CityManifestRow = { id: manifestId('port_avalon', 3), worldId: 'wld_1', cityId: C, macroPlanVersion: 'cityplan@1.2.0', stateVersion: 3, publicSnapshotTick: 1440,
  regions: [{ regionId: regionId('port_avalon', 2), generatorPackage: 'citygen@1.0.0', contentHash: 'ab'.repeat(32) }], chunks: [{ chunkKey: '2:3', contentHash: 'cd'.repeat(32), url: 'https://cdn/x' }], schemaVersion: 1 };
const region: CityRegionRow = { id: regionId('port_avalon', 2), cityId: C, bounds: { minX: -50_000, minZ: 0, maxX: 50_000, maxZ: 80_000 },
  boundaryContracts: [{ edge: 'N', crossings: [{ at: { x: 1200, z: 80_000 }, streetClass: 'ARTERIAL', widthCm: 2400, elevationCm: -30 }], waterEdges: [[{ x: 0, z: 0 }, { x: 10, z: 20 }]] }],
  generatorPackage: 'citygen@1.0.0', generatedTick: 0, status: 'GENERATED' };
const pub: PublicCityState = { cityId: C, stateVersion: 3, baseVersion: 2, parcelStates: [{ parcelId: P, lifecycle: 'OCCUPIED', heightLevel: 2, archetypeId: archetypeId('quay_terrace') }],
  bindings: [{ kind: 'STOREFRONT', unitId: U1, signText: 'Harbour Bakes', sectorAwning: 'STAPLES', status: 'OPEN' }, { kind: 'HALL_SEAT', cityId: C, position: 1, displayName: null, band: 'TOP' }],
  transitions: [{ id: transitionId(ids), parcelId: P, cause: 'STOREFRONT_OPEN', fromState: 'FIT_OUT', toState: 'OPEN', publishedTick: 1440, sourceEventId: 'evt_1' }] };
const ROWS = { city, district, parcel, building, unit, prop, lease, manifest, region, pub, unitWithLabel: { ...unit, id: U2 }, addrWithLabel: { ...addr, unitLabel: 'Shop 2' } };

const reverseKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(reverseKeys)
  : v !== null && typeof v === 'object' && !(v instanceof Uint8Array) ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

describe('AC-10A-01-3 schema round-trip: canonEncode/canonDecode is byte-stable', () => {
  for (const [name, row] of Object.entries(ROWS).sort(([a], [b]) => cmpStr(a, b)))
    it(`${name}: decode(encode(row)) deep-equals row and re-encodes to the same bytes; key order does not change the bytes`, () => {
      const b1 = canonEncode(row); const back = canonDecode(b1); const b2 = canonEncode(back);
      expect(back).toEqual(row);
      expect(hex(b2)).toBe(hex(b1));
      expect(hex(canonEncode(reverseKeys(row)))).toBe(hex(b1));
    });
  it('Money fields stay bigint and float fields stay float through the round trip', () => {
    const back = canonDecode(canonEncode(prop)) as PropertyRow;
    expect(typeof back.costBasis).toBe('bigint'); expect(typeof back.lastAppraisal.value).toBe('bigint'); expect(back.amenityMult).toBe(1.07);
    const c = canonDecode(canonEncode(city)) as CityRow;
    expect(c.medianHhIncomePerGY).toBe(6_400_000n); expect(c.households).toBe(514_403.125); expect(Object.keys(c.jobsBySector).length).toBe(12);
  });
});

describe('AC-10A-01-4 CATALOG_GAPS_10A is empty; every 10A code resolves through aliases.csv to a catalog row', () => {
  const cat = new ReasonCatalog();
  it('CATALOG_GAPS_10A = [] and catalogGaps10A(live catalog) = []', () => {
    expect(CATALOG_GAPS_10A).toEqual([]);
    expect(catalogGaps10A(cat)).toEqual([]);
  });
  it('the 7 aliases match export/ledger-ref/aliases.csv row for row', () => {
    const csv = readFileSync(`${dir}../../../export/ledger-ref/aliases.csv`, 'utf8').split('\n').filter((l) => /^RE_/.test(l)).map((l) => l.split(','));
    for (const a of CITY_REASON_ALIAS_NAMES) {
      const row = csv.find((r) => r[0] === a);
      expect(row, a).toBeDefined();
      expect(row![1]).toBe('10');
      expect(row![2]!.split('|')).toEqual([...CITY_REASON_ALIASES[a]!]);
    }
    expect([...CITY_REASON_ALIAS_NAMES]).toEqual(Object.keys(CITY_REASON_ALIASES).sort(cmpStr));
  });
  it('the live catalog rows behind RE_COSMETIC, CITY_NAMING_RIGHT and PROP_VACANT_UTILITIES have their catalog classes', () => {
    expect(cat.get('CITY_COSMETIC')!.cls).toBe('SINK'); expect(cat.get('CITY_COSMETIC')!.allowedTemplates).toEqual(['BURN']);
    expect(cat.get(CITY_DIRECT_CODES[0]!)!.cls).toBe('TRANSFER');
    expect(cat.get('PROP_VACANT_UTILITIES')!.cls).toBe('SINK'); expect(cat.get('PROP_VACANT_UTILITIES')!.valueLegA).toBe(5030);
  });
  it('a missing target or a wrong alias is reported as a gap', () => {
    const stub = { get: (c: string) => (c === 'CITY_NAMING_RIGHT' ? undefined : cat.get(c)), resolveAlias: (a: string) => (a === 'RE_RENT_IN' ? 'PROP_RENT_CORE' : cat.resolveAlias(a)) };
    expect(catalogGaps10A(stub)).toEqual(['RE_RENT_IN', 'CITY_NAMING_RIGHT']);
  });
});

describe('geometry: integer centimetres, counter-clockwise polygons (10 §2.11)', () => {
  it('quantiseCm rounds half even; the parcel fixture polygon is valid', () => {
    expect([quantiseCm(1.005), quantiseCm(0.125), quantiseCm(0.135), quantiseCm(-0.125)]).toEqual([100, 12, 14, -12]);   // 1.005 m = 100.49999… cm in float64
    expect(() => assertFixedPolygon(parcel.polygon)).not.toThrow();
    expect(signedArea2(parcel.polygon)).toBe(2n * 6_225_000n);
  });
  it('rejects clockwise, degenerate, < 3 vertices and non-integer coordinates', () => {
    expect(() => assertFixedPolygon([...parcel.polygon].reverse())).toThrow(/counter-clockwise/);
    expect(() => assertFixedPolygon([{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }])).toThrow(/counter-clockwise/);
    expect(() => assertFixedPolygon([{ x: 0, z: 0 }, { x: 1, z: 0 }])).toThrow(/< 3/);
    expect(() => assertFixedPolygon([{ x: 0, z: 0 }, { x: 1.5, z: 0 }, { x: 0, z: 2 }])).toThrow(/^vertex \(1\.5, 0\) is not integer centimetres/);
    expect(() => assertFixedRect(region.bounds)).not.toThrow();
    expect(() => assertFixedRect({ minX: 1, minZ: 0, maxX: 0, maxZ: 0 })).toThrow(/degenerate/);
    expect(() => assertFixedRect({ minX: 0, minZ: 0, maxX: 0, maxZ: 5 })).toThrow(/degenerate/);
    expect(() => assertFixedRect({ minX: 0, minZ: 0, maxX: 0.5, maxZ: 1 })).toThrow(/integer/);
  });
});

describe('tables and events', () => {
  it('every city table registers (name grammar, module 10, unique names and indexes) and keys its fixture row', () => {
    const reg = new TableRegistry();
    for (const t of ALL_CITY_TABLES) { expect(t.name).toMatch(TABLE_NAME_RE); expect(t.module).toBe('10'); reg.add(t); }
    expect(reg.all().map((t) => t.name)).toEqual(['city.building', 'city.city', 'city.district', 'city.lease', 'city.manifest', 'city.parcel', 'city.prop', 'city.public_state', 'city.region', 'city.unit']);
    expect(reg.get('city.public_state')!.idOf(pub)).toBe(`${C}:3`);
    expect(reg.get('city.prop')!.indexes![0]!.key(prop)).toBe('chr_0001');
  });
  it('every §5 kind has a visibility; every kind has a payload schema or a deferral reason, never both', () => {
    // The 39 kinds of the 10 §5 table, transcribed row by row (the 'a / b' rows expanded).
    const SPEC_5 = ['city.dayClose', 'city.districtMarket', 'city.employmentDelta', 'city.opened', 'city.opening', 'city.transition', 'city.manifestPublished',
      'prop.listed', 'prop.delisted', 'prop.purchased', 'prop.leaseSigned', 'prop.leaseEnded', 'prop.tenantDefault', 'prop.eviction', 'prop.appraised', 'prop.exception',
      'prop.conditionLow', 'prop.damage', 'mortgage.originated', 'mortgage.paid', 'mortgage.late', 'mortgage.covenantBreach', 'mortgage.cureStarted', 'mortgage.cured',
      'mortgage.foreclosure', 'dev.planned', 'dev.permitDecision', 'dev.phaseStart', 'dev.phaseEnd', 'dev.completed', 'dev.cancelled', 'dev.stalled', 'land.auction',
      'land.auctionResult', 'unique.auction', 'unique.sold', 'hall.snapshot', 'prop.relatedPartyLease', 'prop.appraisalByPlayerFirm'];
    expect(SPEC_5.length).toBe(39);
    const kinds = Object.keys(CITY_EVENT_VISIBILITY).sort(cmpStr);
    expect(kinds).toEqual([...SPEC_5].sort(cmpStr));
    expect([...Object.keys(CITY_EVENTS), ...Object.keys(DEFERRED_EVENT_KINDS)].sort(cmpStr)).toEqual(kinds);
    for (const k of Object.keys(CITY_EVENTS)) expect(DEFERRED_EVENT_KINDS[k]).toBeUndefined();
  });
  it('payload schemas accept the fixtures (Money as decimal strings) and reject an extra key', () => {
    const s = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)));
    expect(CITY_EVENTS['city.transition']!.safeParse(pub.transitions[0]).success).toBe(true);
    expect(CITY_EVENTS['prop.leaseSigned']!.safeParse(s(lease)).success).toBe(true);
    expect(CITY_EVENTS['prop.appraised']!.safeParse(s(appraisal)).success).toBe(true);
    expect(CITY_EVENTS['city.opened']!.safeParse({ cityId: cityId('isla_serena'), bloc: null, openTick: 0 }).success).toBe(true);
    expect(CITY_EVENTS['city.dayClose']!.safeParse({ cityId: C, population: 1, households: 1, jobs: 1, priceIndex: 1, vacancyByUse: { RES: 0.05 }, rentIndexByUse: {} }).success).toBe(true);
    expect(CITY_EVENTS['city.dayClose']!.safeParse({ cityId: C, population: 1, households: 1, jobs: 1, priceIndex: 1, vacancyByUse: { FARM: 0.05 }, rentIndexByUse: {} }).success).toBe(false);
    expect(CITY_EVENTS['prop.leaseSigned']!.safeParse({ ...(s(lease) as object), ownerPnl: '1' }).success).toBe(false);
    expect(CITY_EVENTS['prop.purchased']!.safeParse({ propId: PR, type: 'RETAIL_UNIT', districtId: D, price: 12.5 }).success).toBe(false);
  });
  it('dev.completed carries the PRIVATE appraisal, so it is not PUBLIC; the sealed 13 evidence kinds are SEALED', () => {
    expect(CITY_EVENT_VISIBILITY['dev.completed']).toBe('PRIVATE');
    expect(CITY_EVENT_VISIBILITY['prop.relatedPartyLease']).toBe('SEALED'); expect(CITY_EVENT_VISIBILITY['prop.appraisalByPlayerFirm']).toBe('SEALED');
  });
});

// Keys a zod payload schema can carry, recursing through objects, records, optional and nullable (zod v4 def shapes).
const schemaKeys = (t: z.ZodType): string[] => {
  const d = (t as unknown as { def: { type: string; shape?: Record<string, z.ZodType>; innerType?: z.ZodType; valueType?: z.ZodType; element?: z.ZodType } }).def;
  if (d.type === 'object') return Object.entries(d.shape!).flatMap(([k, v]) => [k, ...schemaKeys(v)]);
  if (d.type === 'optional' || d.type === 'nullable') return schemaKeys(d.innerType!);
  if (d.type === 'record') return schemaKeys(d.valueType!);
  if (d.type === 'array') return schemaKeys(d.element!);
  return [];
};
const fault = (f: () => unknown): string => { try { f(); } catch (e) { return (e as { code?: string }).code ?? String(e); } return 'NO_THROW'; };
const part = building.visual.parts[0]!;

describe('AC-10A-01-5 (E-88 (2a), (3)) geometry, visuals, opt-in defaults and CityAccess', () => {
  it('rejects a non-integer BuildingVisualPart field and a seed outside 0..2^32−1; accepts the bounds; 1..4 parts', () => {
    expect(() => assertBuildingVisual(building.visual)).not.toThrow();
    for (const bad of [{ ...part, rotationQ: 1.5 }, { ...part, tintIndex: 0.5 }, { ...part, floorHeightCm: 325.5 }, { ...part, bayWidthCm: NaN },
      { ...part, size: { ...part.size, heightCm: 1950.25 } }, { ...part, seed: -1 }, { ...part, seed: 2 ** 32 }, { ...part, seed: 0.5 }])
      expect(fault(() => assertBuildingVisualPart(bad))).toBe('CITY_BAD_VISUAL');
    expect(() => assertBuildingVisualPart({ ...part, seed: 0 })).not.toThrow();
    expect(() => assertBuildingVisualPart({ ...part, seed: 2 ** 32 - 1 })).not.toThrow();
    expect(fault(() => assertBuildingVisual({ parts: [] }))).toBe('CITY_BAD_VISUAL');
    expect(fault(() => assertBuildingVisual({ parts: [part, part, part, part, part] }))).toBe('CITY_BAD_VISUAL');
    expect(() => assertBuildingVisual({ parts: [part, part, part, part] })).not.toThrow();
  });
  it('rejects a degenerate rect and a 1-point polyline', () => {
    expect(fault(() => assertFixedRect({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 }))).toBe('CITY_BAD_GEOMETRY');
    expect(fault(() => assertFixedRect({ minX: 0, minZ: 3, maxX: 9, maxZ: 3 }))).toBe('CITY_BAD_GEOMETRY');
    expect(() => assertFixedRect({ minX: 0, minZ: 3, maxX: 1, maxZ: 4 })).not.toThrow();
    expect(fault(() => assertFixedPolyline([{ x: 0, z: 0 }]))).toBe('CITY_BAD_GEOMETRY');
    expect(fault(() => assertFixedPolyline([]))).toBe('CITY_BAD_GEOMETRY');
    expect(fault(() => assertFixedPolyline([{ x: 0, z: 0 }, { x: 1.5, z: 0 }]))).toBe('CITY_BAD_GEOMETRY');
    expect(() => assertFixedPolyline([{ x: 0, z: 0 }, { x: 10, z: 20 }])).not.toThrow();
    for (const w of region.boundaryContracts[0]!.waterEdges) expect(() => assertFixedPolyline(w)).not.toThrow();
  });
  it('PublicPropertyRecord defaults to all false; publicAddress counts only with visitableEstate', () => {
    expect(DEFAULT_PUBLIC_RECORD).toEqual({ publicOwnership: false, visitableEstate: false, publicAddress: false });
    expect(Object.isFrozen(DEFAULT_PUBLIC_RECORD)).toBe(true);
    expect(effectivePublicRecord({ publicOwnership: false, visitableEstate: false, publicAddress: true }).publicAddress).toBe(false);
    expect(effectivePublicRecord({ publicOwnership: true, visitableEstate: true, publicAddress: true })).toEqual({ publicOwnership: true, visitableEstate: true, publicAddress: true });
  });
  it('CityAccess: cty_isla_serena is R0/R4/R4/R6; every other cities.json city is R0/R0/R2/null', () => {
    const cities = (JSON.parse(readFileSync(`${dir}../../content/data/cities.json`, 'utf8')) as { cities: { cityId: string }[] }).cities.map((c) => c.cityId);
    expect([cities.length, cities.includes('cty_isla_serena')]).toEqual([16, true]);   // 15 bloc cities + Isla Serena
    expect(cityAccessOf('cty_isla_serena')).toEqual({ viewRank: 'R0', homeBlocOwnRank: 'R4', otherBlocOwnRank: 'R4', islandRank: 'R6' });
    for (const c of cities.filter((x) => x !== 'cty_isla_serena'))
      expect([c, cityAccessOf(c)]).toEqual([c, { viewRank: 'R0', homeBlocOwnRank: 'R0', otherBlocOwnRank: 'R2', islandRank: null }]);
    expect(ownRankFor(cityAccessOf(C), 'FDL', 'FDL')).toBe('R0');
    expect(ownRankFor(cityAccessOf(C), 'FDL', 'EUN')).toBe('R2');
    expect(ownRankFor(cityAccessOf('cty_isla_serena'), null, 'FDL')).toBe('R4');
    expect(city.access).toEqual(cityAccessOf(C));
  });
});

describe('AC-10A-01-6 (E-88, E-92 (1)) ports.ts', () => {
  const src = readFileSync(`${dir}ports.ts`, 'utf8');
  it('exports exactly the four ports, BlocMacroInputs and the CityPorts bundle, and nothing else (static export-set test); no Ccy', () => {
    // every export form: declarations of any kind, and no re-export lists or star exports that would hide a name
    expect(src).not.toMatch(/^export\s*(?:\{|\*|default\b)/m);
    const exported = [...src.matchAll(/^export\s+(?:declare\s+)?(?:interface|type|const|let|var|function|class|enum|abstract\s+class)\s+(\w+)/gm)].map((m) => m[1]!);
    expect(exported.length).toBe([...src.matchAll(/^export\b/gm)].length);
    expect(exported.filter((n) => /Port$/.test(n)).sort(cmpStr)).toEqual(['CityBizPort', 'CityContentPort', 'CityHhPort', 'CityMacroPort']);
    expect(exported.sort(cmpStr)).toEqual(['BlocMacroInputs', 'CityBizPort', 'CityContentPort', 'CityHhPort', 'CityMacroPort', 'CityPorts']);
    expect(src).not.toMatch(/\bCcy\b/);
    expect(src).not.toMatch(/^\s+\w*[dD]emand\w*\(/m);   // no port method returns a demand
  });
  it('shapes match E-88 (2b): bloc-keyed macro, cityId-keyed 09/16, Money median income', () => {
    expectTypeOf<Parameters<CityMacroPort['blocInputs']>>().toEqualTypeOf<[StoreRead, import('@tycoon/engine-macro').BlocId]>();
    expectTypeOf<ReturnType<CityMacroPort['blocInputs']>>().toEqualTypeOf<BlocMacroInputs | null>();
    expectTypeOf<BlocMacroInputs>().toEqualTypeOf<{ g: number; pi: number; u: number; i: number; y10: number; c: number }>();
    expectTypeOf<Parameters<CityMacroPort['fearIndex']>>().toEqualTypeOf<[StoreRead]>();
    expectTypeOf<ReturnType<CityBizPort['jobsByUse']>>().toEqualTypeOf<Partial<Record<UseClass, number>> | null>();
    expectTypeOf<ReturnType<CityHhPort['frmJobsByUse']>>().toEqualTypeOf<Partial<Record<UseClass, number>> | null>();
    expectTypeOf<NonNullable<ReturnType<CityHhPort['householdInputs']>>['medianHhIncomePerGY']>().toEqualTypeOf<Money>();
    expectTypeOf<keyof CityContentPort>().toEqualTypeOf<'cities' | 'serena' | 'sectors' | 'districts' | 'personality' | 'cityProfile'>();
    expectTypeOf<CityContentPort['cityProfile']>().toEqualTypeOf<ContentView['cityProfile']>();
    expectTypeOf<keyof CityPorts>().toEqualTypeOf<'content22' | 'macro04' | 'biz09' | 'hh16'>();
    expectTypeOf<CityPorts>().toEqualTypeOf<{ content22: CityContentPort; macro04: CityMacroPort; biz09: CityBizPort; hh16: CityHhPort }>();
  });
});

describe('AC-10A-01-10 (E-92 (3)) the 12 E-92 prefixes, no colon ids, no reg_ region ids', () => {
  const E92 = ['str_', 'per_', 'mfs_', 'arc_', 'msh_', 'sty_', 'mgp_', 'ctr_', 'wld_', 'trn_', 'evt_', 'rgn_'];
  it('the id helpers mint str_, per_, mfs_, arc_, msh_, sty_, mgp_, trn_ and rgn_ ids that pass assertEntityId', () => {
    const trn = transitionId(ids);
    const minted = [streetId('port_avalon', 9), personalityId('port_avalon'), manifestId('port_avalon', 3), archetypeId('quay_terrace'), baseMeshId('box'),
      styleId('brick'), managementPolicyId('default'), regionId('port_avalon', 2)];
    expect(minted).toEqual(['str_port_avalon_9', 'per_port_avalon', 'mfs_port_avalon_3', 'arc_quay_terrace', 'msh_box', 'sty_brick', 'mgp_default', 'rgn_port_avalon_2']);
    expect(trn.slice(0, 4)).toBe('trn_');
    expect(trn.length - 4).toBe(26);   // 02 ctx.newId body, as unitId
    for (const id of [...minted, trn]) expect(() => assertEntityId(id)).not.toThrow();
    for (const f of [personalityId, archetypeId, baseMeshId, styleId, managementPolicyId]) {
      expect(() => f('a:b')).toThrow(/CITY_BAD_ID|does not match/);   // the E-18/E-20 grammar has no colon
      expect(() => f('')).toThrow(/CITY_BAD_ID|does not match/);
    }
    for (const f of [streetId, manifestId, regionId]) {
      expect(() => f('a:b', 1)).toThrow(/CITY_BAD_ID|does not match/);
      for (const n of [-1, 1.5, Number.NaN]) expect(() => f('port_avalon', n)).toThrow(/not a non-negative integer/);
      expect(() => f('port_avalon', 0)).not.toThrow();
    }
  });
  it('#68 ruling: parts are verbatim, so a bloc code keeps its case as in cbk_FDL and gov_FDL', () => {
    expect(personalityId('FDL')).toBe('per_FDL');
    expect(regionId('FDL', 2)).toBe('rgn_FDL_2');
    expect(streetId('SRL', 0)).toBe('str_SRL_0');
    expect(manifestId('EUN', 7)).toBe('mfs_EUN_7');
    expect(styleId('PYN_brick')).toBe('sty_PYN_brick');
  });
  it('ALLOWED_ENTITY_PREFIXES adds those plus ctr_, wld_ and evt_ (73 → 85); none is a ledger entity kind', () => {
    expect(ALLOWED_ENTITY_PREFIXES.slice(73)).toEqual(E92);
    for (const p of E92) expect(ENTITY_KINDS.map((k) => `${k}_`)).not.toContain(p);
    expect(ALLOWED_ENTITY_PREFIXES).not.toContain('pol_');
    expect(ALLOWED_ENTITY_PREFIXES).not.toContain('reg_');
  });
  it('no schema or test id uses a colon form, and no region id starts with reg_', () => {
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => `${dir}${f}`),
      ...readdirSync(`${dir}__lint_fixtures__`).map((f) => `${dir}__lint_fixtures__/${f}`)];
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect([f, text.match(/['"`](?:[a-z]{3}|hh|prop):[A-Za-z0-9_]/g)]).toEqual([f, null]);
      expect([f, text.match(/(?:regionId|\bid)\s*:\s*['"`]reg_/g)]).toEqual([f, null]);
    }
    expect([parcel.regionId, region.id, ...manifest.regions.map((r) => r.regionId)].every((r) => r.startsWith('rgn_'))).toBe(true);
  });
});

describe('AC-10A-01-7 (E-88 (2d)) deferred kinds and city.employmentDelta', () => {
  it('every deferred entry names an owner card; emitting it throws CITY_EVENT_SCHEMA_MISSING', () => {
    expect(Object.keys(DEFERRED_EVENT_KINDS).length).toBe(21);
    for (const [k, owner] of Object.entries(DEFERRED_EVENT_KINDS)) {
      expect([k, owner]).toEqual([k, expect.stringMatching(/^T10[AB]-\d\d$/)]);
      expect(fault(() => checkCityEvent(k, {}))).toBe('CITY_EVENT_SCHEMA_MISSING');
    }
    expect([DEFERRED_EVENT_KINDS['prop.damage'], DEFERRED_EVENT_KINDS['prop.appraisalByPlayerFirm'], DEFERRED_EVENT_KINDS['hall.snapshot'], DEFERRED_EVENT_KINDS['land.auction']])
      .toEqual(['T10A-06', 'T10A-07', 'T10A-10', 'T10B-01']);
    expect(fault(() => checkCityEvent('city.nope', {}))).toBe('CITY_EVENT_SCHEMA_MISSING');
  });
  it('city.employmentDelta validates and is PUBLIC', () => {
    const ok = { cityId: C, districtId: D, jobs: -12, sector: 'STAPLES', cause: 'biz_bakery' };
    expect(CITY_EVENT_VISIBILITY['city.employmentDelta']).toBe('PUBLIC');
    expect(checkCityEvent('city.employmentDelta', ok)).toEqual(ok);
    expect(checkCityEvent('city.employmentDelta', { ...ok, districtId: null }).districtId).toBeNull();
    for (const bad of [{ ...ok, jobs: 1.5 }, { ...ok, sector: 'FARMING' }, { ...ok, cause: '' }, { ...ok, extra: 1 }, { ...ok, districtId: undefined }])
      expect(fault(() => checkCityEvent('city.employmentDelta', bad))).toBe('CITY_EVENT_BAD_PAYLOAD');
  });
});

describe('AC-10A-01-8 (E-88 (2e)) PUBLIC payloads are inside the 10 §3.24 allowlist', () => {
  it('every key of every PUBLIC kind with a schema is in PUBLIC_PAYLOAD_KEYS', () => {
    const pubKinds = Object.keys(CITY_EVENTS).filter((k) => CITY_EVENT_VISIBILITY[k] === 'PUBLIC');
    expect(pubKinds.length).toBe(12);
    for (const k of pubKinds) for (const key of schemaKeys(CITY_EVENTS[k]!)) expect([k, key, key in PUBLIC_PAYLOAD_KEYS]).toEqual([k, key, true]);
    expect(schemaKeys(CITY_EVENTS['prop.leaseSigned']!)).toContain('rentPerGD');
    expect('rentPerGD' in PUBLIC_PAYLOAD_KEYS).toBe(false);
  });
  it('buyer, owner and address keys pass only behind their opt-in', () => {
    expect(PUBLIC_OPT_IN).toEqual({ buyerDisplay: 'publicOwnership', ownerDisplay: 'publicOwnership', address: 'publicAddress' });
    const pur = { propId: PR, type: 'RETAIL_UNIT', districtId: D, price: '1250000', buyerDisplay: 'Harbour Bakes Ltd' };
    expect(fault(() => checkCityEvent('prop.purchased', pur))).toBe('CITY_EVENT_NOT_OPTED_IN');
    expect(fault(() => checkCityEvent('prop.purchased', pur, { publicRecord: DEFAULT_PUBLIC_RECORD }))).toBe('CITY_EVENT_NOT_OPTED_IN');
    expect(checkCityEvent('prop.purchased', pur, { publicRecord: { ...DEFAULT_PUBLIC_RECORD, publicOwnership: true } })).toEqual(pur);
    const { buyerDisplay: _b, ...anon } = pur;
    expect(checkCityEvent('prop.purchased', anon)).toEqual(anon);
    const R = (o: boolean, v: boolean, a: boolean) => ({ publicOwnership: o, visitableEstate: v, publicAddress: a });
    expect([optInAllows('ownerDisplay'), optInAllows('ownerDisplay', R(true, false, false))]).toEqual([false, true]);
    expect([optInAllows('address', R(true, false, true)), optInAllows('address', R(false, true, false)), optInAllows('address', R(false, true, true))]).toEqual([false, false, true]);
    expect(optInAllows('price')).toBe(true);
  });
});

describe('AC-10A-01-9 (E-88 (2f)) byUse keys iff supply > 0', () => {
  const noHosp = { ...district.market, HOSPITALITY: { ...district.market.HOSPITALITY, supplyArea: 0 } };
  const supply = supplyByUseOf(noHosp);
  const day = (v: object, r: object) => ({ cityId: C, population: 1, households: 1, jobs: 1, priceIndex: 1, vacancyByUse: v, rentIndexByUse: r });
  it('a district with no HOSPITALITY stock emits no HOSPITALITY key', () => {
    expect('HOSPITALITY' in supply).toBe(false);
    expect(Object.keys(supply).length).toBe(USE_CLASSES.length - 1);
    const vac = byUseOf(supply, (u) => noHosp[u].vacancy), rent = byUseOf(supply, (u) => noHosp[u].rentIndex);
    expect('HOSPITALITY' in vac || 'HOSPITALITY' in rent).toBe(false);
    expect(checkCityEvent('city.dayClose', day(vac, rent), { supplyByUse: supply })).toEqual(day(vac, rent));
    const dm = { districtId: D, byUse: byUseOf(supply, (u) => ({ rentIndex: 1, vacancy: noHosp[u].vacancy, pressure: 1, capRate: 0.05, priceIndex: 1 })) };
    expect('HOSPITALITY' in dm.byUse).toBe(false);
    expect(checkCityEvent('city.districtMarket', dm, { supplyByUse: supply })).toEqual(dm);
  });
  it('a key whose supply is 0 fails; a missing key with supply fails; no scope fails', () => {
    const vac = byUseOf(supply, () => 0.05), rent = byUseOf(supply, () => 1);
    expect(fault(() => checkCityEvent('city.dayClose', day({ ...vac, HOSPITALITY: 0 }, rent), { supplyByUse: supply }))).toBe('CITY_EVENT_BYUSE_PRESENCE');
    expect(fault(() => checkCityEvent('city.dayClose', day(vac, { ...rent, HOSPITALITY: 1 }), { supplyByUse: supply }))).toBe('CITY_EVENT_BYUSE_PRESENCE');
    const { RES: _r, ...noRes } = vac;
    expect(fault(() => checkCityEvent('city.dayClose', day(noRes, rent), { supplyByUse: supply }))).toBe('CITY_EVENT_BYUSE_PRESENCE');
    expect(fault(() => checkCityEvent('city.districtMarket', { districtId: D, byUse: { HOSPITALITY: { rentIndex: 1, vacancy: 0, pressure: 1, capRate: 0.05, priceIndex: 1 } } },
      { supplyByUse: supply }))).toBe('CITY_EVENT_BYUSE_PRESENCE');
    expect(fault(() => checkCityEvent('city.dayClose', day(vac, rent)))).toBe('CITY_EVENT_SCOPE_MISSING');
    // An explicit 0 in supplyByUse counts as no supply: a key there fails, and its absence passes.
    const zero = { ...supply, HOSPITALITY: 0 };
    expect(fault(() => checkCityEvent('city.dayClose', day({ ...vac, HOSPITALITY: 0 }, { ...rent, HOSPITALITY: 1 }), { supplyByUse: zero }))).toBe('CITY_EVENT_BYUSE_PRESENCE');
    expect(checkCityEvent('city.dayClose', day(vac, rent), { supplyByUse: zero })).toEqual(day(vac, rent));
    expect('HOSPITALITY' in byUseOf(zero, () => 1)).toBe(false);
  });
});
