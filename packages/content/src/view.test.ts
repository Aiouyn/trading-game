// T22A-01 acceptance tests (card test plan; every AC names its consumer).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toMoney, type ParamsView } from '@tycoon/engine-core';
import { BLOC_ALIAS_04, BLOC_IDS, canonicalBloc, canonicalEntityId, ContentError, type BlocId } from './blocs';
import { cbSellOwnForFdl, peBaseKey, peNorm0Of, SECTOR_IDS, statisticsOfficeRegistration, swfRegistration, top30Of } from './derived';
import { contentHashOf } from './hash';
import { FULL_FILES, loadContent, type ContentView, type SectorId } from './view';

/** 06 §3.4.1 PE_base defaults as listed on the card (registry T23-01 not built yet). */
const PE: Record<SectorId, number> = { TECH: 32, SEMI: 26, ENERGY: 11, MATERIALS: 12, INDUSTRIALS: 16, FINANCIALS: 10, HEALTH: 20,
  STAPLES: 18, DISCRETIONARY: 20, REAL_ESTATE: 16, MEDIA: 18, SECURITY: 24 };
function paramsWith(over: Partial<Record<SectorId, number>> = {}, extra: Record<string, number> = {}): ParamsView {
  const t: Record<string, number> = { ...extra };
  for (const s of SECTOR_IDS) t[peBaseKey(s)] = over[s] ?? PE[s];
  const get = (k: string): number => { const v = t[k]; if (v === undefined) throw new Error(`no param ${k}`); return v; };
  return { num: get, int: get };
}
const P = paramsWith();
const errCode = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof ContentError ? e.code : `other: ${String(e)}`; } };
const clone = <T>(x: T): T => structuredClone(x) as T;
type Rec = Record<string, unknown>;
const withFile = (name: string, edit: (f: Rec) => void): Record<string, unknown> => { const f = clone(FULL_FILES[name]) as Rec; edit(f); return { [name]: f }; };
const full = (): ContentView => loadContent('full', P);

describe('T22A-01 ContentView', () => {
  it('AC-22A-01-PURE: equal hash and deep-equal getters across loads; frozen results', () => {
    const a = full(), b = full();
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
    for (const g of ['blocs', 'cities', 'npcBanks', 'tchMembers', 'sectors', 'equities', 'serena'] as const) expect(a[g]()).toEqual(b[g]());
    expect(a.cities()).toBe(a.cities());   // same frozen value per call
    expect(() => { (a.blocs() as unknown as unknown[]).push(1); }).toThrow(TypeError);
    expect(() => { (a.blocs()[0] as unknown as Rec).name = 'x'; }).toThrow(TypeError);
    expect(() => { (a.equities()[0] as unknown as Rec).cap0 = 0n; }).toThrow(TypeError);
    expect(Object.isFrozen(a)).toBe(true);
    const src = ['view.ts', 'blocs.ts', 'hash.ts', 'derived.ts'].map((f) => readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8')).join('\n');
    expect(src).not.toMatch(/\bDate\b|Math\.random/);
  });

  it('AC-22A-01-HASH: one byte changes it, key order does not, an override patch does', () => {
    const base = contentHashOf(FULL_FILES);
    expect(full().contentHash).toBe(base);
    const files = clone(FULL_FILES) as Record<string, Rec>;
    (files['world.json']!.blocs as Rec[])[0]!.name = 'Federal Unioo';
    expect(contentHashOf(files)).not.toBe(base);
    const w = FULL_FILES['world.json'] as Rec, rev: Rec = {};
    for (const k of Object.getOwnPropertyNames(w).reverse()) rev[k] = w[k];
    const reordered: Record<string, unknown> = {};
    for (const k of Object.getOwnPropertyNames(FULL_FILES).reverse()) reordered[k] = k === 'world.json' ? rev : FULL_FILES[k];
    expect(contentHashOf(reordered)).toBe(base);
    const patched = loadContent({ base: 'full', patch: withFile('world.json', (f) => { (f.blocs as Rec[])[0]!.name = 'Federal Union'; }) }, P);
    expect(patched.contentHash).not.toBe(base);   // identical data, but the patch is hashed
    expect(loadContent({ base: 'full', patch: {} }, P).contentHash).not.toBe(base);
  });

  it('AC-22A-01-VERSION: a file without an integer catalogVersion fails the load', () => {
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('cities.json', (f) => { delete f.catalogVersion; }) }, P))).toBe('CONTENT_VERSION');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('indices.json', (f) => { f.catalogVersion = 1.5; }) }, P))).toBe('CONTENT_VERSION');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('world.json', (f) => { f.catalogVersion = '1'; }) }, P))).toBe('CONTENT_VERSION');
  });

  it('AC-22A-01-ALIAS: five aliases, five rewritten prefixes, identity otherwise', () => {
    expect(BLOC_ALIAS_04).toEqual({ FU: 'FDL', EC: 'EUN', PL: 'PYN', NA: 'NKR', SC: 'SRL' });
    for (const [a, b] of [['FU', 'FDL'], ['EC', 'EUN'], ['PL', 'PYN'], ['NA', 'NKR'], ['SC', 'SRL']]) { expect(canonicalBloc(a!)).toBe(b); expect(canonicalBloc(b!)).toBe(b); }
    expect(canonicalEntityId('cbk_NA')).toBe('cbk_NKR');
    for (const p of ['exc_', 'reg_', 'gov_', 'crt_']) expect(canonicalEntityId(`${p}FU`)).toBe(`${p}FDL`);
    expect(canonicalEntityId('nfd_NA')).toBe('nfd_NA');
    expect(canonicalEntityId('cmp_halc')).toBe('cmp_halc');
    expect(canonicalEntityId('cbk_NKR')).toBe('cbk_NKR');
    expect(canonicalEntityId('cbk_NAX')).toBe('cbk_NAX');
    expect(errCode(() => canonicalBloc('XX'))).toBe('CONTENT_UNKNOWN_BLOC');
    expect(errCode(() => canonicalBloc('fdl'))).toBe('CONTENT_UNKNOWN_BLOC');
    expect(full().bloc('NA').blocId).toBe('NKR');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('world.json', (f) => { (f.aliasTable as Rec).NA = 'SRL'; }) }, P))).toBe('CV05');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('world.json', (f) => { const t = f.aliasTable as Rec; t.NA = 'SRL'; t.SC = 'NKR'; }) }, P))).toBe('CV05');
  });

  it('AC-22A-01-BLOCS: 5 rows in draw order; SRL capital / centre; Serena is not a bloc', () => {
    const v = full();
    expect(v.blocs().map((b) => b.blocId)).toEqual(['FDL', 'EUN', 'PYN', 'NKR', 'SRL']);
    expect(BLOC_IDS).toEqual(['FDL', 'EUN', 'PYN', 'NKR', 'SRL']);
    const srl = v.bloc('SRL');
    expect([srl.politicalCapital, srl.financialCentre, srl.alias04, srl.currencyName]).toEqual(['Alta Verde', 'Sundara Coast', 'SC', 'Southern Sol']);
    expect(srl.cityIds).toEqual(['cty_sundara', 'cty_cobreval', 'cty_alta_verde']);
    expect(v.blocs().some((b) => b.name.includes('Serena'))).toBe(false);
  });

  it('AC-22A-01-RELEASES: NKR statistics office and cycle committee', () => {
    const r = full().releases('NKR');
    expect(r.statisticsOfficeName).toBe('Statistics Nordic (SN)');
    expect(r.cycleCommitteeName).toBe('SN Cycle Committee');
    expect(full().releases('FDL').cycleCommitteeName).toBe('FSB Business Cycle Dating Committee');
    // E-58.1: npc_STATS_<B> for every bloc; a valid 03 entity id (assertEntityId is not built yet: ENTITY_ID_RE of ledger/src/world.ts)
    const ENTITY_ID_RE = /^(?:[a-z]{3}|hh|prop)_[A-Za-z0-9_]+$/;
    for (const b of BLOC_IDS) {
      const id = full().releases(b).statisticsOfficeId;
      expect(id).toBe(`npc_STATS_${b}`); expect(id).toMatch(ENTITY_ID_RE);
      expect(statisticsOfficeRegistration(b)).toEqual({ entityId: id, kind: 'npc', holderClass: 'npcFirm', ownerId: `gov_${b}`, holdsMoney: false });
    }
  });

  it('AC-22A-01-CITIES: 15 rows, 3 per bloc, shares sum to 1, betas in [0.6, 1.8]; Serena separate', () => {
    const v = full(), c = v.cities();
    expect(c).toHaveLength(15);
    for (const b of BLOC_IDS) {
      const mine = c.filter((x) => x.bloc === b);
      expect(mine.map((x) => x.slot)).toEqual([1, 2, 3]);
      expect(Math.abs(mine.reduce((s, x) => s + x.cityGdpShare, 0) - 1)).toBeLessThanOrEqual(1e-9);
    }
    expect(c.map((x) => x.bloc)).toEqual(BLOC_IDS.flatMap((b) => [b, b, b]));
    for (const x of c) { expect(x.cityId).toMatch(/^cty_[a-z_]+$/); expect(x.cycleBeta).toBeGreaterThanOrEqual(0.6); expect(x.cycleBeta).toBeLessThanOrEqual(1.8); }
    expect(c.some((x) => x.cityId === 'cty_isla_serena')).toBe(false);
    const rev = loadContent({ base: 'full', patch: withFile('cities.json', (f) => { (f.cities as Rec[]).reverse(); }) }, P);
    expect(rev.cities().map((x) => x.cityId)).toEqual(c.map((x) => x.cityId));
    expect(v.serena()).toEqual({ cityId: 'cty_isla_serena', name: 'Isla Serena', bloc: null, homeBloc: 'SERENA', reportingCcy: 'FDL' });
  });

  it('AC-22A-01-INDEX: regional 30-stock index per bloc', () => {
    const v = full();
    expect(BLOC_IDS.map((b) => v.blocEquityIndex(b).indexId)).toEqual(['idx_FED30', 'idx_EUR30', 'idx_PAC30', 'idx_NOR30', 'idx_SOU30']);
  });

  it('AC-22A-01-PENORM0: stored = recomputed (±0.01), in [8, 40], tech retune, stale fails, units do not matter', () => {
    const v = full();
    const got = BLOC_IDS.map((b) => peNorm0Of(b, v.equities, P));
    for (const [i, b] of BLOC_IDS.entries()) {
      expect(Math.abs(v.blocEquityIndex(b).peNorm0 - got[i]!)).toBeLessThanOrEqual(0.01);
      expect(got[i]!).toBeGreaterThanOrEqual(8); expect(got[i]!).toBeLessThanOrEqual(40);
    }
    // Quant's corrected card table (dynasty free float 0.60 included)
    expect(got.map((x) => Math.round(x * 100) / 100)).toEqual([16.79, 16.94, 17.77, 14.63, 15.45]);
    const tech16 = paramsWith({ TECH: 16 });
    const dF = peNorm0Of('FDL', v.equities, tech16) - got[0]!, dN = peNorm0Of('NKR', v.equities, tech16) - got[3]!;
    expect(dF).toBeLessThan(0);
    expect(Math.abs(dN)).toBeLessThan(Math.abs(dF));
    expect(errCode(() => loadContent('full', tech16))).toBe('CONTENT_PENORM0_STALE');   // retune re-derives: stored field now stale
    const hi = paramsWith(Object.fromEntries(SECTOR_IDS.map((x) => [x, 100])) as Record<SectorId, number>);
    const atHi = withFile('indices.json', (f) => { for (const r of f.indices as Rec[]) if (r.peNorm0 !== undefined) r.peNorm0 = 100; });
    expect(errCode(() => loadContent({ base: 'full', patch: atHi }, hi))).toBe('CONTENT_PENORM0_RANGE');
    const stale = withFile('indices.json', (f) => { (f.indices as Rec[]).find((r) => r.indexId === 'idx_PAC30')!.peNorm0 = 17.77 + 0.02; });
    expect(errCode(() => loadContent({ base: 'full', patch: stale }, P))).toBe('CONTENT_PENORM0_STALE');
    const missing = withFile('indices.json', (f) => { delete (f.indices as Rec[]).find((r) => r.indexId === 'idx_SOU30')!.peNorm0; });
    expect(errCode(() => loadContent({ base: 'full', patch: missing }, P))).toBe('CONTENT_PENORM0_STALE');
    // units: the same formula on float cap0 ($B) gives the same value to 1e-9
    const eq = (FULL_FILES['instruments.json'] as { equities: { assetId: string; ticker: string; bloc: string; sector: SectorId; cap0Bn: number; notes: string }[] }).equities;
    const dyn = (FULL_FILES['dynasties.json'] as { dynasties: { listedStakes: { ticker: string }[] }[] }).dynasties.flatMap((d) => d.listedStakes.map((x) => x.ticker));
    for (const [i, b] of BLOC_IDS.entries()) {
      const top = eq.filter((e) => e.bloc === b).map((e) => ({ ...e, ff: e.notes.includes('listed REIT') ? 0.9 : dyn.includes(e.ticker) ? 0.6 : 0.75 }))
        .sort((x, y) => y.cap0Bn * y.ff - x.cap0Bn * x.ff || (x.assetId < y.assetId ? -1 : 1)).slice(0, 30);
      const f = top.reduce((s, e) => s + e.cap0Bn, 0) / top.reduce((s, e) => s + e.cap0Bn / PE[e.sector], 0);
      expect(Math.abs(f - got[i]!)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('AC-22A-01-DEALERS: 8 per bloc, 40 seats; contents; commercial bank A', () => {
    const v = full(), sibs = ['bnk_avnb', 'bnk_mrdb', 'bnk_kypb', 'bnk_nrhb', 'bnk_bsdr'];
    const A: Record<BlocId, string> = { FDL: 'bnk_lksb', EUN: 'bnk_bvlc', PYN: 'bnk_tscb', NKR: 'bnk_sksb', SRL: 'bnk_bavd' };
    let seats = 0;
    for (const b of BLOC_IDS) {
      const d = v.primaryDealers(b);
      expect(d).toHaveLength(8); seats += d.length;
      expect(v.commercialBankA(b)).toBe(A[b]);
      expect([...d].sort()).toEqual([...sibs, A[b], 'npc_dlr_GRAY', 'npc_dlr_OSTP'].sort());
      expect(d).toEqual([...d].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    }
    expect(seats).toBe(40);
  });

  it('AC-22A-01-BANKS: 26 rows, kinds per bloc, Serena fixed assets, 8 dynasties, every city has a retail bank', () => {
    const v = full(), banks = v.npcBanks();
    expect(banks).toHaveLength(26);
    for (const b of BLOC_IDS) {
      const k = banks.filter((x) => x.bloc === b).map((x) => x.kind);
      expect([k.filter((x) => x === 'NPC_SIB').length, k.filter((x) => x === 'NPC_COMMERCIAL').length, k.filter((x) => x === 'NPC_REGIONAL').length]).toEqual([1, 2, 2]);
    }
    const s = banks.find((x) => x.bankId === 'bnk_serena')!;
    expect([s.kind, s.bloc, s.fixedAssets, s.assetsPctGdp]).toEqual(['NPC_PRIVATE', null, toMoney(40e9, 'FDL'), null]);
    for (const x of banks) if (x.bankId !== 'bnk_serena') { expect(x.assetsPctGdp).not.toBeNull(); expect(x.fixedAssets).toBeNull(); }
    expect(banks.filter((x) => x.dynasty !== null)).toHaveLength(8);
    const retail = banks.flatMap((x) => x.defaultRetailFor);
    for (const c of v.cities()) expect(retail).toContain(c.name);
    expect(banks[0]!.bankId).toBe('bnk_avnb');   // 22 §5.1 table order
    expect(banks.find((x) => x.bankId === 'bnk_lksb')!.roles).toEqual(['PD', 'TCH', 'CUST', 'GUSD reserve bank']);
    expect(banks.find((x) => x.bankId === 'bnk_chst')!.roles).toEqual([]);
    expect(banks.find((x) => x.bankId === 'bnk_bmcb')!.listed).toBeNull();
    expect(banks.find((x) => x.bankId === 'bnk_avnb')!.listed).toBe('AVNB');
  });

  it('AC-22A-01-TCH: 14 members incl. Vault Clearing and Serena Private Bank', () => {
    const t = full().tchMembers();
    expect(t).toHaveLength(14);
    expect(t).toContain('npc_VAULTCLR'); expect(t).toContain('bnk_serena');
    expect(new Set(t).size).toBe(14);
  });

  it('AC-22A-01-SECTORS: 12 ids in 06 §3.4.1 order with names; every equity sector among them', () => {
    const s = full().sectors();
    expect(s.map((x) => x.sectorId)).toEqual(['TECH', 'SEMI', 'ENERGY', 'MATERIALS', 'INDUSTRIALS', 'FINANCIALS', 'HEALTH', 'STAPLES', 'DISCRETIONARY', 'REAL_ESTATE', 'MEDIA', 'SECURITY']);
    expect(s[0]!.name).toBe('GX Technology'); expect(s[11]!.name).toBe('GX Security and Defence');
    for (const e of full().equities()) expect(SECTOR_IDS).toContain(e.sector);
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('instruments.json', (f) => { (f.equities as Rec[])[0]!.sector = 'CRYPTO'; }) }, P))).toBe('CV04');
  });

  it('AC-22A-01-SWF: fnd_SWF_<B>, npcFirm, owner gov_<B>, SWF_TRANSFER is a TRANSFER', () => {
    expect(full().swfEntityId('NKR')).toBe('fnd_SWF_NKR');
    expect(swfRegistration('NKR')).toEqual({ entityId: 'fnd_SWF_NKR', holderClass: 'npcFirm', ownerId: 'gov_NKR', flowClass: { SWF_TRANSFER: 'TRANSFER' } });
  });

  it('AC-22A-01-FX: the four FDL legs; crosses refused', () => {
    const v = full();
    expect((['EUN', 'NKR', 'PYN', 'SRL'] as const).map((c) => v.fxAssetId(c))).toEqual(['ast_FX_EUNFDL', 'ast_FX_FDLNKR', 'ast_FX_FDLPYN', 'ast_FX_FDLSRL']);
    expect(errCode(() => v.fxAssetId('FDL' as 'EUN'))).toBe('CONTENT_FX_CROSS');
    expect(errCode(() => v.fxAssetId('XX' as 'EUN'))).toBe('CONTENT_UNKNOWN_BLOC');
  });

  it('AC-22A-01-FXSIDE (E-58.2): EUN sells EUNFDL at p; NKR/PYN/SRL buy FDLxxx at 1/p', () => {
    const v = full();
    expect(cbSellOwnForFdl('EUN', 1.1, v.fxAssetId('EUN'), 4)).toEqual({ assetId: 'ast_FX_EUNFDL', side: 'SELL', price: 1.1 });
    expect(cbSellOwnForFdl('NKR', 0.095, v.fxAssetId('NKR'), 4)).toEqual({ assetId: 'ast_FX_FDLNKR', side: 'BUY', price: 10.5263 });
    expect(cbSellOwnForFdl('PYN', 0.15, v.fxAssetId('PYN'), 2)).toEqual({ assetId: 'ast_FX_FDLPYN', side: 'BUY', price: 6.67 });
    expect(cbSellOwnForFdl('SRL', 0.2, v.fxAssetId('SRL'), 4)).toEqual({ assetId: 'ast_FX_FDLSRL', side: 'BUY', price: 5 });
  });

  it('AC-22A-01-MONEY: cap0 = toMoney(cap0 × 1e9), no real fields, MSI changes nothing', () => {
    const v = full(), raw = (FULL_FILES['instruments.json'] as { equities: { assetId: string; cap0Bn: number }[] }).equities;
    expect(v.equities()).toHaveLength(240);
    for (const [i, e] of v.equities().entries()) { expect(e.assetId).toBe(raw[i]!.assetId); expect(e.cap0).toBe(toMoney(raw[i]!.cap0Bn * 1e9, 'FDL')); }
    expect(v.equities()[0]!.cap0).toBe(720_000_000_000_000_000n);
    expect(v.realFields('instruments')).toEqual([]);
    for (const c of ['world', 'cities', 'fin_institutions', 'indices']) expect(v.realFields(c)).toEqual([]);
    const m = loadContent('full', paramsWith({}, { msi: 3.7 }));
    expect(m.equities()).toEqual(v.equities()); expect(m.npcBanks()).toEqual(v.npcBanks());
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('instruments.json', (f) => { (f.equities as Rec[])[0]!.cap0Bn = -1; }) }, P))).toBe('CV25');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('instruments.json', (f) => { (f.equities as Rec[])[0]!.cap0Bn = 1e-12; }) }, P))).toBe('CV25');
  });

  it('AC-22A-01-PARAMS: view.params is the same object', () => {
    expect(loadContent('full', P).params).toBe(P);
  });

  it('AC-22A-01-FULLONLY: only full content loads (presets belong to T22B)', () => {
    expect(errCode(() => loadContent('minimal' as 'full', P))).toBe('CONTENT_UNKNOWN_SOURCE');
    expect(errCode(() => loadContent({ base: 'minimal' as 'full', patch: {} }, P))).toBe('CONTENT_UNKNOWN_SOURCE');
    expect(errCode(() => loadContent('MICRO' as 'full', P))).toBe('CONTENT_UNKNOWN_SOURCE');
    expect(full().blocs()).toHaveLength(5);
  });

  it('AC-22A-01-FREEFLOAT: REIT 0.90, 22 §10.4 listed-stake tickers 0.60, else 0.75; index membership by float cap', () => {
    const v = full(), eq = v.equities();
    const dynTickers = (FULL_FILES['dynasties.json'] as { dynasties: { listedStakes: { ticker: string }[] }[] }).dynasties.flatMap((d) => d.listedStakes.map((x) => x.ticker));
    expect(dynTickers).toHaveLength(45);
    expect(eq.filter((e) => e.freeFloat === 0.9)).toHaveLength(10);
    expect(eq.filter((e) => e.freeFloat === 0.6).map((e) => e.ticker).sort()).toEqual([...dynTickers].sort());
    expect(eq.filter((e) => e.freeFloat === 0.75)).toHaveLength(240 - 10 - 45);
    for (const t of ['DNBR', 'CMAL', 'HLVR', 'AVNB']) expect(eq.find((e) => e.ticker === t)!.freeFloat).toBe(0.6);
    const members = (b: BlocId): string[] => top30Of(b, v.equities).map((e) => e.ticker);
    expect(v.blocEquityIndex('EUN').indexId).toBe('idx_EUR30');
    expect(members('EUN')).not.toContain('DNBR'); expect(members('EUN')).toContain('CLAR');
    expect(v.blocEquityIndex('SRL').indexId).toBe('idx_SOU30');
    expect(members('SRL')).not.toContain('CMAL'); expect(members('SRL')).toContain('BCMP');
    for (const b of BLOC_IDS) expect(members(b)).toHaveLength(30);
    const badStake = withFile('dynasties.json', (f) => { (f.dynasties as { listedStakes: Rec[] }[])[0]!.listedStakes[0]!.ticker = 'ZZZZ'; });
    expect(errCode(() => loadContent({ base: 'full', patch: badStake }, P))).toBe('CV04');
  });

  it('22 §18 loader checks: CV01 duplicate ids, CV03 counts, CV04 foreign keys', () => {
    const dup = withFile('cities.json', (f) => { (f.cities as Rec[])[1]!.cityId = 'cty_port_avalon'; });
    expect(errCode(() => loadContent({ base: 'full', patch: dup }, P))).toBe('CV01');
    const cross = withFile('fin_institutions.json', (f) => { (f.banks as Rec[])[0]!.bankId = 'ast_EQ_HALC'; });
    expect(errCode(() => loadContent({ base: 'full', patch: cross }, P))).toBe('CV01');
    const dupDyn = withFile('dynasties.json', (f) => { (f.dynasties as Rec[])[1]!.dynastyId = 'dyn_calloway'; });
    expect(errCode(() => loadContent({ base: 'full', patch: dupDyn }, P))).toBe('CV01');
    const fewer = withFile('instruments.json', (f) => { (f.fxPairs as Rec[]).pop(); });
    expect(errCode(() => loadContent({ base: 'full', patch: fewer }, P))).toBe('CV03');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('cities.json', (f) => { (f.cities as Rec[])[0]!.bloc = 'XYZ'; }) }, P))).toBe('CV04');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('instruments.json', (f) => { (f.equities as Rec[])[0]!.hq = 'Atlantis'; }) }, P))).toBe('CV04');
    expect(errCode(() => loadContent({ base: 'full', patch: withFile('fin_institutions.json', (f) => { (f.banks as Rec[])[2]!.defaultRetailFor = ['Atlantis']; }) }, P))).toBe('CV04');
    // REIT free float: 10 REITs at 0.9, the rest 0.75
    expect(full().equities().filter((e) => e.freeFloat === 0.9)).toHaveLength(10);
  });
});
