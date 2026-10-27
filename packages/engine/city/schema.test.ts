// T10A-01 acceptance tests AC-10A-01-1..4, plus the geometry and table guards the schema relies on.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { canonDecode, canonEncode, cmpStr, IdFactory, TABLE_NAME_RE, TableRegistry } from '@tycoon/engine-core';
import { ReasonCatalog } from '@tycoon/engine-ledger';
import { ALLOWED, NONCOMPLIANT } from './lint/entity-prefix.mjs';
import { ALLOWED_ENTITY_PREFIXES, assertEntityId, buildingId, cityId, districtId, ENTITY_ID_MAX_LEN, leaseId, NONCOMPLIANT_ENTITY_PREFIXES, parcelId, propId, unitId } from './ids';
import { assertFixedPolygon, assertFixedRect, quantiseCm, signedArea2 } from './geom';
import { ALL_CITY_TABLES, USE_CLASSES, type BuildingRow, type CityManifestRow, type CityRegionRow, type CityRow, type DistrictRow, type DistrictUseMarket,
  type LeaseRow, type ParcelRow, type PropertyRow, type PublicCityState, type UnitRow, type UseClass } from './schema';
import { CATALOG_GAPS_10A, CITY_DIRECT_CODES, CITY_REASON_ALIAS_NAMES, CITY_REASON_ALIASES, catalogGaps10A } from './codes';
import { CITY_EVENT_VISIBILITY, CITY_EVENTS, DEFERRED_EVENT_KINDS } from './events';
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
    expect(() => parcelId('port_avalon', -1)).toThrow();
    expect(() => parcelId('port_avalon', 1.5)).toThrow();
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
  it('a literal with each of the 73 allowed prefixes (and a template literal, and a mid-string match) passes', async () => {
    expect(await errs('good')).toEqual([]);
  });
  it('the allowed and denied lists are the card\'s, and ids.ts and the rule agree', () => {
    expect(ALLOWED_ENTITY_PREFIXES.length).toBe(73);
    expect(new Set(ALLOWED_ENTITY_PREFIXES).size).toBe(73);
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
const addr = { number: 14, streetId: 'str_port_avalon_9', streetName: 'Quayside Row', districtId: D, cityId: C, display: '14 Quayside Row, Old Harbor, Port Avalon' };
const appraisal = { tick: 1440, valueIncome: 1_250_000_00n, valueComp: 1_310_000_00n, weightIncome: 0.6, value: 1_274_000_00n, priceIndexAtAppraisal: 1.0125, appraiser: 'SYSTEM' as const };
const city: CityRow = { id: C, slug: 'port_avalon', rendererKey: 'avalon', name: 'city.port_avalon.name', bloc: 'FDL', ccy: 'FDL', personalityId: 'per_port_avalon',
  worldSeedStream: `city/${C}`, openedTick: 0, unlockRank: 'R0', districts: [D], population: 1_234_567.5, households: 514_403.125, hhSize: 2.4, laborForce: 640_000,
  jobsBySector: SECTORS.reduce((r, s, i) => ({ ...r, [s]: 1000 * (i + 1) + 0.25 }), {} as Record<SectorId, number>), medianHhIncomePerGY: 6_400_000n,
  cityGdpShare: 0.42, propertyTaxRate: 0.01, stampDutyRate: 0.01, priceIndex: 1, stateVersion: 3, manifestId: 'mfs_port_avalon_3' };
const market = (i: number): DistrictUseMarket => ({ supplyArea: 120_000 + i, occupiedArea: 110_000, demandArea: 111_234.5, vacancy: 0.0833, naturalVacancy: 0.05,
  pressure: 1.01, pressureHighDays: 0, pressureLowDays: 2, marketRentPerM2PerGD: -0n + BigInt(37 + i), rentIndex: 1, capRate: 0.055, txnCount91: 4 });
const district: DistrictRow = { id: D, cityId: C, name: 'district.old_harbor.name', tier: 'prime', terrainRole: 'waterfront', heritage: true, heightCapM: 45,
  market: perUse((_u, i) => market(i)), desirability: { jobsAccess: 0.3, services: -0.1, transit: 0.5, environment: 0.7, safety: 0, prestige: 0.2, momentum: 0.05, tierOffset: 0.5, value: 0.79 },
  crimeIndex: 48.5, capexMomentum91: 0n, landmarkParcelId: P, priceIndexByUse: perUse((_u, i) => 1 + i / 100) };
const parcel: ParcelRow = { id: P, cityId: C, districtId: D, regionId: 'reg_port_avalon_2', polygon: [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 3000 }, { x: -150, z: 3000 }],
  areaM2: 600, frontageM: 20, access: ['ROAD', 'CANAL'], zoning: { allowed: ['RES', 'RETAIL'], maxHeightM: 30, maxFar: 4.5, heritageLocked: false }, landValueV: 0.813,
  attributes: { waterView: 0.9, transitDist: 320, slope: 0.02, cornerLot: true, mainAvenue: false }, lifecycle: 'OCCUPIED', devPriority: 0.12, ownerId: 'npc_land_authority',
  buildingId: B, reservedFor: null, address: addr };
const building: BuildingRow = { id: B, parcelId: P, archetypeId: 'arc_quay_terrace', propertyType: 'APARTMENT_BLOCK', use: 'RES', floors: 6, heightM: 19.5, grossAreaM2: 1800,
  qualityGrade: 'B', builtTick: -40_000, condition: 72.5, units: [U1, U2],
  visual: { parts: [{ baseMeshId: 'msh_box', size: { xCm: 2000, zCm: 3000, heightCm: 1950 }, rotationQ: 2, styleId: 'sty_brick', seed: 913, floorHeightCm: 325, bayWidthCm: 400, tintIndex: 3 }] },
  physicalState: 'OCCUPIED', ownership: 'STRATA', wholeOwnerPropId: null, npcPoolKey: `${D}|RES|B` };
const unit: UnitRow = { id: U1, buildingId: B, use: 'RETAIL', areaM2: 90, floor: 0, storefront: true, slotClass: 'CORNER_AVENUE', propId: PR, occupantId: 'biz_bakery', leaseId: L };
const prop: PropertyRow = { id: PR, type: 'RETAIL_UNIT', ownerId: 'chr_0001', ccy: 'FDL', cityId: C, districtId: D, parcelId: P, buildingId: B, unitIds: [U1], areaM2: 90,
  condition: 80, qualityGrade: 'B', amenityMult: 1.07, useMode: 'RENTED', useModeChangedTick: 0, managerContractId: null, policyId: 'pol_default', groupId: null,
  mortgageIds: ['lon_1'], lastAppraisal: appraisal, costBasis: 1_200_000_00n, acquiredTick: 720, insurancePolicyId: null, listingId: null, heldByCourt: false,
  publicRecord: { publicOwnership: false }, uniqueAssetId: null };
const lease: LeaseRow = { id: L, propId: PR, unitIds: [U1], landlordId: 'chr_0001', tenantId: 'biz_bakery', tenantKind: 'PLAYER_BUSINESS', use: 'RETAIL', rentPerGD: 4_210n,
  revenueSharePct: 0, startTick: 720, endTick: 720 + 1440 * 3, indexation: 'CPI', depositHeld: -0n + 378_900n, breakFeeGD: 91, status: 'ACTIVE', arrearsGD: 0, relatedParty: false, contractId: 'ctr_9' };
const manifest: CityManifestRow = { id: 'mfs_port_avalon_3', worldId: 'wld_1', cityId: C, macroPlanVersion: 'cityplan@1.2.0', stateVersion: 3, publicSnapshotTick: 1440,
  regions: [{ regionId: 'reg_port_avalon_2', generatorPackage: 'citygen@1.0.0', contentHash: 'ab'.repeat(32) }], chunks: [{ chunkKey: '2:3', contentHash: 'cd'.repeat(32), url: 'https://cdn/x' }], schemaVersion: 1 };
const region: CityRegionRow = { id: 'reg_port_avalon_2', cityId: C, bounds: { minX: -50_000, minZ: 0, maxX: 50_000, maxZ: 80_000 },
  boundaryContracts: [{ edge: 'N', crossings: [{ at: { x: 1200, z: 80_000 }, streetClass: 'ARTERIAL', widthCm: 2400, elevationCm: -30 }], waterEdges: [[{ x: 0, z: 0 }, { x: 10, z: 20 }]] }],
  generatorPackage: 'citygen@1.0.0', generatedTick: 0, status: 'GENERATED' };
const pub: PublicCityState = { cityId: C, stateVersion: 3, baseVersion: 2, parcelStates: [{ parcelId: P, lifecycle: 'OCCUPIED', heightLevel: 2, archetypeId: 'arc_quay_terrace' }],
  bindings: [{ kind: 'STOREFRONT', unitId: U1, signText: 'Harbour Bakes', sectorAwning: 'STAPLES', status: 'OPEN' }, { kind: 'HALL_SEAT', cityId: C, position: 1, displayName: null, band: 'TOP' }],
  transitions: [{ id: 'trn_1', parcelId: P, cause: 'STOREFRONT_OPEN', fromState: 'FIT_OUT', toState: 'OPEN', publishedTick: 1440, sourceEventId: 'evt_1' }] };
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
    expect(() => assertFixedPolygon([{ x: 0, z: 0 }, { x: 1.5, z: 0 }, { x: 0, z: 2 }])).toThrow(/integer/);
    expect(() => assertFixedRect(region.bounds)).not.toThrow();
    expect(() => assertFixedRect({ minX: 1, minZ: 0, maxX: 0, maxZ: 0 })).toThrow(/min exceeds max/);
    expect(() => assertFixedRect({ minX: 0, minZ: 0, maxX: 0.5, maxZ: 0 })).toThrow(/integer/);
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
