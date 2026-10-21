// T22A-01: ContentView, a typed, pure, hashed read API over packages/content/data/*.json (22 §0.1).
import { toMoney, type Money, type ParamsView } from '@tycoon/engine-core';
import cities from '../data/cities.json' with { type: 'json' };
import finInstitutions from '../data/fin_institutions.json' with { type: 'json' };
import indices from '../data/indices.json' with { type: 'json' };
import institutions from '../data/institutions.json' with { type: 'json' };
import instruments from '../data/instruments.json' with { type: 'json' };
import releases from '../data/releases.json' with { type: 'json' };
import world from '../data/world.json' with { type: 'json' };
import { BLOC_ALIAS_04, BLOC_IDS, canonicalBloc, ContentError, isBlocId, type BlocAlias04, type BlocId } from './blocs';
import { PE_NORM0_MAX, PE_NORM0_MIN, PE_NORM0_TOL, peNorm0Of, SECTOR_IDS, sortedIds } from './derived';
import { contentHashOf, deepFreeze } from './hash';

export type SectorId = 'TECH'|'SEMI'|'ENERGY'|'MATERIALS'|'INDUSTRIALS'|'FINANCIALS'|'HEALTH'|'STAPLES'|'DISCRETIONARY'|'REAL_ESTATE'|'MEDIA'|'SECURITY';
export interface BlocContent { blocId: BlocId; alias04: BlocAlias04; name: string; currencyName: string; code: BlocId;
  display: string; politicalCapital: string; financialCentre: string; cityIds: readonly string[] }
export interface ReleaseNames { statisticsOfficeId: string; statisticsOfficeName: string; cycleCommitteeName: string }
export interface CityContent { cityId: string; name: string; bloc: BlocId; slot: number; cityGdpShare: number; cycleBeta: number }
export interface SerenaContent { cityId: 'cty_isla_serena'; name: string; bloc: null; homeBloc: 'SERENA'; reportingCcy: 'FDL' }
export type NpcBankKind = 'NPC_SIB' | 'NPC_COMMERCIAL' | 'NPC_REGIONAL' | 'NPC_PRIVATE';
export interface NpcBankContent { bankId: string; name: string; bloc: BlocId | null; kind: NpcBankKind; strategy: string; hq: string;
  assetsPctGdp: number | null; fixedAssets: Money | null;
  listed: string | null; roles: readonly string[]; defaultRetailFor: readonly string[]; dynasty: string | null }
export interface BlocEquityIndex { indexId: string; peNorm0: number }
export interface EquityContent { assetId: string; ticker: string; bloc: BlocId; sector: SectorId; cityId: string; cap0: Money; size: 'L'|'M'|'S'; freeFloat: number }
export interface ContentView {
  readonly contentHash: string;
  readonly catalogVersions: Readonly<Record<string, number>>;
  readonly params: ParamsView;
  blocs(): readonly BlocContent[];
  bloc(b: BlocId | BlocAlias04): BlocContent;
  releases(b: BlocId): ReleaseNames;
  cities(): readonly CityContent[];
  serena(): SerenaContent;
  npcBanks(): readonly NpcBankContent[];
  commercialBankA(b: BlocId): string;
  tchMembers(): readonly string[];
  blocEquityIndex(b: BlocId): BlocEquityIndex;
  primaryDealers(b: BlocId): readonly string[];
  sectors(): readonly { sectorId: SectorId; name: string }[];
  swfEntityId(b: BlocId): string;
  fxAssetId(ccy: Exclude<BlocId,'FDL'>): string;
  equities(): readonly EquityContent[];
  realFields(catalog: string): readonly string[];
}
export interface ContentOverrides { base: 'full' | 'minimal'; patch: Readonly<Record<string, unknown>> }

// ---- raw file shapes (one table row = one object, 22 §0.1 rule 2) ----
type Rec = Record<string, unknown>;
interface WorldFile { catalogVersion: number; blocs: { blocId: string; alias04: string; name: string; currencyName: string; code: string; display: string;
  politicalCapital: string; financialCentre: string; cities: string[] }[]; serena: Rec; aliasTable: Record<string, string> }
interface CityRow { cityId: string; name: string; bloc: string | null; slot: number | null; cityGdpShare: number | null; cycleBeta: number | null }
interface EqRow { assetId: string; ticker: string; bloc: string; sector: string; hq: string; cap0Bn: number; size: string; notes: string }
interface BankRow { bankId: string; name: string; bloc: string | null; kind: string; strategy: string; hq: string; assetsPctGdp: number | null;
  fixedAssets: number | null; listed: string; roles: string[]; defaultRetailFor: string[]; dynasty: string | null }
interface IndexRow { indexId: string; name: string; sectorId?: string; bloc?: string; peNorm0?: number }

/** The shipped files, keyed by file name (sorted by cmpStr; canon sorts them again). */
export const FULL_FILES: Readonly<Record<string, unknown>> = deepFreeze({
  'cities.json': cities, 'fin_institutions.json': finInstitutions, 'indices.json': indices, 'institutions.json': institutions,
  'instruments.json': instruments, 'releases.json': releases, 'world.json': world,
});
const FILE_NAMES: readonly string[] = ['cities.json', 'fin_institutions.json', 'indices.json', 'institutions.json', 'instruments.json', 'releases.json', 'world.json'];

/** 22 explicitly labels no column of these catalogs as real (22 §0.1 rule 2: money columns are nominal genesis FDL). */
const REAL_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({});

/** 22 §4.1: REIT free float 90%, otherwise 75%. (Dynasty-linked 60% needs §10.4 dynasties.json, not in this card: open question.) */
export const FREE_FLOAT_DEFAULT = 0.75;
export const FREE_FLOAT_REIT = 0.9;
export function isReit(notes: string): boolean { return notes.includes('listed REIT'); }

/** 22 §5.1 commercial bank A per bloc (the listed commercial bank with PD, TCH, CUST). */
const COMMERCIAL_A: Readonly<Record<BlocId, string>> = Object.freeze({ FDL: 'bnk_lksb', EUN: 'bnk_bvlc', PYN: 'bnk_tscb', NKR: 'bnk_sksb', SRL: 'bnk_bavd' });
const REGIONAL_INDEX: Readonly<Record<BlocId, string>> = Object.freeze({ FDL: 'idx_FED30', EUN: 'idx_EUR30', PYN: 'idx_PAC30', NKR: 'idx_NOR30', SRL: 'idx_SOU30' });
const DEALERS: readonly string[] = ['npc_dlr_GRAY', 'npc_dlr_OSTP'];
/** 22 §1.4 lists office names but no entity id; the id below is a placeholder pattern (open question). */
export function statisticsOfficeId(b: BlocId): string { return `npc_STATS_${b}`; }

/** 22 §3.1: the HQ / retail columns use city display names; "(wealth clients only)" style qualifiers are dropped for the FK. */
function cityName(s: string): string { const i = s.indexOf(' ('); return i < 0 ? s : s.slice(0, i); }

function fail(code: string, msg: string): never { throw new ContentError(code, msg); }
function rows<T>(file: unknown, key: string): T[] {
  const v = (file as Rec | undefined)?.[key];
  if (!Array.isArray(v)) fail('CONTENT_SHAPE', `missing table ${key}`);
  return v as T[];
}

const LAUNCH_COUNTS = { blocs: 5, cities: 16, equities: 240, fxPairs: 10, banks: 26 } as const;

function minimalFiles(): Record<string, unknown> {
  // 20B minimal preset: FDL only (plus no-bloc Serena rows and the cross-bloc dealers).
  const w = world as unknown as WorldFile;
  const keep = (b: unknown): boolean => b === 'FDL' || b === null;
  const f = FULL_FILES as Record<string, Rec>;
  return {
    'cities.json': { ...f['cities.json'], cities: rows<CityRow>(f['cities.json'], 'cities').filter((r) => keep(r.bloc)) },
    'fin_institutions.json': { ...f['fin_institutions.json'], banks: rows<BankRow>(f['fin_institutions.json'], 'banks').filter((r) => keep(r.bloc)) },
    'indices.json': { ...f['indices.json'], indices: rows<IndexRow>(f['indices.json'], 'indices').filter((r) => r.bloc === undefined || r.bloc === 'FDL') },
    'institutions.json': f['institutions.json'],
    'instruments.json': { ...f['instruments.json'], equities: rows<EqRow>(f['instruments.json'], 'equities').filter((r) => r.bloc === 'FDL'), fxPairs: [] },
    'releases.json': { ...f['releases.json'], offices: rows<{ blocId: string }>(f['releases.json'], 'offices').filter((r) => r.blocId === 'FDL') },
    'world.json': { ...w, blocs: w.blocs.filter((r) => r.blocId === 'FDL') },
  };
}

export function loadContent(src: 'full' | 'minimal' | ContentOverrides, params: ParamsView): ContentView {
  const base = typeof src === 'string' ? src : src.base;
  const patch = typeof src === 'string' ? null : src.patch;
  const files: Record<string, unknown> = base === 'full' ? { ...FULL_FILES } : minimalFiles();
  if (patch !== null) for (const k of Object.getOwnPropertyNames(patch)) files[k] = patch[k];
  const hashObj: Record<string, unknown> = { ...files };
  if (base === 'minimal') hashObj['$preset'] = 'minimal';
  if (patch !== null) hashObj['$patch'] = patch;
  return build(files, contentHashOf(hashObj), params, base === 'full' && patch === null);
}

function build(files: Record<string, unknown>, contentHash: string, params: ParamsView, checkLaunchCounts: boolean): ContentView {
  // ---- step 1: catalogVersion (22 §0.1 rule 5) ----
  const catalogVersions: Record<string, number> = {};
  for (const n of FILE_NAMES) {
    const v = (files[n] as Rec | undefined)?.catalogVersion;
    if (typeof v !== 'number' || !Number.isInteger(v)) fail('CONTENT_VERSION', `${n}: catalogVersion must be an integer`);
    catalogVersions[n] = v;
  }
  const w = files['world.json'] as WorldFile;
  // ---- CV05 bloc aliases ----
  const aliasTargets: string[] = [];
  for (const a of Object.getOwnPropertyNames(w.aliasTable)) {
    const t = w.aliasTable[a]!;
    if (!isBlocId(t) || BLOC_ALIAS_04[a as BlocAlias04] !== t) fail('CV05', `alias ${a} -> ${t}`);
    if (aliasTargets.includes(t)) fail('CV05', `aliases collide on ${t}`);
    aliasTargets.push(t);
  }
  const cityRows = rows<CityRow>(files['cities.json'], 'cities');
  const eqRows = rows<EqRow>(files['instruments.json'], 'equities');
  const fxRows = rows<{ assetId: string; displayDecimals: number }>(files['instruments.json'], 'fxPairs');
  const bankRows = rows<BankRow>(files['fin_institutions.json'], 'banks');
  const dealerRows = rows<{ entityId: string }>(files['fin_institutions.json'], 'dealers');
  const indexRows = rows<IndexRow>(files['indices.json'], 'indices');
  const officeRows = rows<{ blocId: string; statisticsOfficeName: string; cycleCommitteeName: string }>(files['releases.json'], 'offices');
  const blocIds = w.blocs.map((b) => canonicalBloc(b.blocId));

  // ---- CV03 launch counts (full content only; the catalogs this card covers) ----
  if (checkLaunchCounts) {
    const got = { blocs: w.blocs.length, cities: cityRows.length, equities: eqRows.length, fxPairs: fxRows.length, banks: bankRows.length };
    for (const k of ['blocs', 'cities', 'equities', 'fxPairs', 'banks'] as const)
      if (got[k] !== LAUNCH_COUNTS[k]) fail('CV03', `${k}: ${got[k]} != ${LAUNCH_COUNTS[k]}`);
  }
  // ---- CV01 unique ids (within and across catalogs) ----
  const seen: string[] = [];
  const uniq = (id: string): void => { if (seen.includes(id)) fail('CV01', `duplicate id ${id}`); seen.push(id); };
  for (const r of cityRows) uniq(r.cityId);
  for (const r of eqRows) uniq(r.assetId);
  for (const r of fxRows) uniq(r.assetId);
  for (const r of bankRows) uniq(r.bankId);
  for (const r of dealerRows) uniq(r.entityId);
  for (const r of indexRows) uniq(r.indexId);
  // ---- CV04 foreign keys ----
  const cityByName = (n: string): CityRow => cityRows.find((c) => c.name === cityName(n)) ?? fail('CV04', `unknown city ${n}`);
  const blocFk = (b: string | null, where: string): void => { if (b !== null && !blocIds.includes(b as BlocId)) fail('CV04', `${where}: unknown bloc ${b}`); };
  for (const c of cityRows) blocFk(c.bloc, c.cityId);
  for (const b of w.blocs) for (const n of b.cities) if (cityByName(n).bloc !== b.blocId) fail('CV04', `${b.blocId}: city ${n} not in bloc`);
  for (const e of eqRows) {
    blocFk(e.bloc, e.assetId);
    if (!(SECTOR_IDS as readonly string[]).includes(e.sector)) fail('CV04', `${e.assetId}: unknown sector ${e.sector}`);
    cityByName(e.hq);
    // ---- CV25 money units: cap0 is a whole, non-negative FDL amount ----
    if (!(e.cap0Bn >= 0) || !Number.isInteger(e.cap0Bn * 1e9)) fail('CV25', `${e.assetId}: cap0 ${e.cap0Bn}`);
  }
  for (const r of bankRows) {
    blocFk(r.bloc, r.bankId);
    cityByName(r.hq);
    for (const c of r.defaultRetailFor) cityByName(c);
    if ((r.assetsPctGdp === null) === (r.fixedAssets === null)) fail('CONTENT_SHAPE', `${r.bankId}: exactly one of assetsPctGdp/fixedAssets`);
    if (r.fixedAssets !== null && (!(r.fixedAssets >= 0) || !Number.isInteger(r.fixedAssets))) fail('CV25', `${r.bankId}: fixedAssets`);
  }

  // ---- typed rows ----
  const blocCities = (b: BlocId): string[] => cityRows.filter((c) => c.bloc === b).sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0)).map((c) => c.cityId);
  const blocsOut: BlocContent[] = BLOC_IDS.filter((b) => blocIds.includes(b)).map((b) => {
    const r = w.blocs.find((x) => x.blocId === b)!;
    return { blocId: b, alias04: r.alias04 as BlocAlias04, name: r.name, currencyName: r.currencyName, code: canonicalBloc(r.code),
      display: r.display, politicalCapital: r.politicalCapital, financialCentre: r.financialCentre, cityIds: blocCities(b) };
  });
  const citiesOut: CityContent[] = [];
  for (const b of BLOC_IDS) for (const id of blocCities(b)) {
    const c = cityRows.find((x) => x.cityId === id)!;
    citiesOut.push({ cityId: c.cityId, name: c.name, bloc: b, slot: c.slot!, cityGdpShare: c.cityGdpShare!, cycleBeta: c.cycleBeta! });
  }
  const sr = cityRows.find((c) => c.cityId === 'cty_isla_serena') ?? fail('CV04', 'cty_isla_serena missing');
  const serenaOut: SerenaContent = { cityId: 'cty_isla_serena', name: sr.name, bloc: null, homeBloc: 'SERENA', reportingCcy: 'FDL' };
  const equitiesOut: EquityContent[] = eqRows.map((e) => ({ assetId: e.assetId, ticker: e.ticker, bloc: canonicalBloc(e.bloc), sector: e.sector as SectorId,
    cityId: cityByName(e.hq).cityId, cap0: toMoney(e.cap0Bn * 1e9, 'FDL'), size: e.size as 'L' | 'M' | 'S',
    freeFloat: isReit(e.notes) ? FREE_FLOAT_REIT : FREE_FLOAT_DEFAULT }));
  const banksOut: NpcBankContent[] = bankRows.map((r) => ({ bankId: r.bankId, name: r.name, bloc: r.bloc === null ? null : canonicalBloc(r.bloc),
    kind: r.kind as NpcBankKind, strategy: r.strategy, hq: r.hq, assetsPctGdp: r.assetsPctGdp,
    fixedAssets: r.fixedAssets === null ? null : toMoney(r.fixedAssets, 'FDL'),
    listed: r.listed.startsWith('no') ? null : r.listed, roles: r.roles, defaultRetailFor: r.defaultRetailFor, dynasty: r.dynasty }));
  const sibOf = (b: BlocId): string | undefined => banksOut.find((x) => x.bloc === b && x.kind === 'NPC_SIB')?.bankId;
  const sibs = BLOC_IDS.map(sibOf).filter((x): x is string => x !== undefined);
  const sectorsOut = SECTOR_IDS.map((s) => ({ sectorId: s,
    name: indexRows.find((r) => r.sectorId === s)?.name ?? fail('CV04', `no idx_GXS row for ${s}`) }));
  const view0 = deepFreeze({ equities: equitiesOut });
  const eqFn = (): readonly EquityContent[] => view0.equities;

  // ---- step 5: peNorm0 stored in indices.json, recomputed and checked ----
  const indexOut: Partial<Record<BlocId, BlocEquityIndex>> = {};
  for (const b of blocIds) {
    const r = indexRows.find((x) => x.indexId === REGIONAL_INDEX[b]) ?? fail('CV04', `missing ${REGIONAL_INDEX[b]}`);
    const v = peNorm0Of(b, eqFn, params);
    if (typeof r.peNorm0 !== 'number' || !(Math.abs(r.peNorm0 - v) <= PE_NORM0_TOL))
      fail('CONTENT_PENORM0_STALE', `${r.indexId}: stored ${String(r.peNorm0)}, recomputed ${v}`);
    if (!(v >= PE_NORM0_MIN && v <= PE_NORM0_MAX)) fail('CONTENT_PENORM0_RANGE', `${r.indexId}: ${v}`);
    indexOut[b] = { indexId: r.indexId, peNorm0: r.peNorm0 };
  }
  const releasesOut: Partial<Record<BlocId, ReleaseNames>> = {};
  for (const o of officeRows) releasesOut[canonicalBloc(o.blocId)] =
    { statisticsOfficeId: statisticsOfficeId(canonicalBloc(o.blocId)), statisticsOfficeName: o.statisticsOfficeName, cycleCommitteeName: o.cycleCommitteeName };
  const dealersOut: Partial<Record<BlocId, readonly string[]>> = {};
  for (const b of blocIds) dealersOut[b] = sortedIds([sibOf(b)!, COMMERCIAL_A[b], ...sibs.filter((s) => s !== sibOf(b)), ...DEALERS]);
  const tch = sortedIds([...sibs, ...blocIds.map((b) => COMMERCIAL_A[b]), ...DEALERS, 'npc_VAULTCLR', 'bnk_serena']);
  const fxIds = fxRows.map((r) => r.assetId);

  const need = <T>(x: T | undefined, what: string): T => x ?? fail('CONTENT_NOT_IN_SUBSET', what);
  const D = deepFreeze({ blocsOut, citiesOut, serenaOut, banksOut, sectorsOut, indexOut, releasesOut, dealersOut, tch, catalogVersions });
  return Object.freeze({
    contentHash,
    catalogVersions: D.catalogVersions,
    params,
    blocs: () => D.blocsOut,
    bloc: (b: BlocId | BlocAlias04) => need(D.blocsOut.find((x) => x.blocId === canonicalBloc(b)), `bloc ${b}`),
    releases: (b: BlocId) => need(D.releasesOut[canonicalBloc(b)], `releases ${b}`),
    cities: () => D.citiesOut,
    serena: () => D.serenaOut,
    npcBanks: () => D.banksOut,
    commercialBankA: (b: BlocId) => COMMERCIAL_A[canonicalBloc(b)],
    tchMembers: () => D.tch,
    blocEquityIndex: (b: BlocId) => need(D.indexOut[canonicalBloc(b)], `index ${b}`),
    primaryDealers: (b: BlocId) => need(D.dealersOut[canonicalBloc(b)], `dealers ${b}`),
    sectors: () => D.sectorsOut,
    swfEntityId: (b: BlocId) => `fnd_SWF_${canonicalBloc(b)}`,
    fxAssetId: (ccy: Exclude<BlocId, 'FDL'>) => {
      const c = canonicalBloc(ccy);
      if (c === 'FDL') fail('CONTENT_FX_CROSS', 'FDL has no FDL leg');
      const id = c === 'EUN' ? 'ast_FX_EUNFDL' : `ast_FX_FDL${c}`;   // base priority EUN > FDL > NKR > PYN > SRL
      return fxIds.includes(id) ? id : fail('CONTENT_NOT_IN_SUBSET', id);
    },
    equities: eqFn,
    realFields: (catalog: string) => REAL_FIELDS[catalog] ?? EMPTY,
  });
}
const EMPTY: readonly string[] = Object.freeze([]);
