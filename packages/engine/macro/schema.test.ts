import { EngineFault, ID_KIND_RE, matchStream, STREAM_REGISTRY, streamPrefix } from '@tycoon/engine-core';
import type { Ccy } from '@tycoon/engine-core';
import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { HOOK_CALL_TABLE, BLOC_ALIAS, BLOC_ORDER, ALL_MACRO_TABLES, macroTables, type BlocId, type BlocMacroState, type DailyHistoryRow, type PublicMacroView } from './schema';
import { BLOC_DEFAULTS, blocDef, ISLA_SERENA_CITY, SECTOR_COUNT } from './blocs';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { auctionId, blocOfEntity, crisisId, crtId, CSF_ID, DEALER_POOL_ID, excId, meetingId, regId, releaseId, STAB_ID } from './ids';
import { assertNoHiddenFields, HIDDEN_FIELD_NAMES, MACRO_EVENT_VISIBILITY, MACRO_EVENTS } from './events';
import { MACRO_STREAMS, S } from './streams';
import { defaultMacroPorts } from './ports';
import type { BlocContentReader as ContentView } from './blocs';

// 04 §2.2 table + card step 3 numbers, FU/EC/PL/NA/SC (independent transcription of the spec, not of blocs.ts).
const T: Record<string, [unknown, unknown, unknown, unknown, unknown]> = {
  gdpShare0: [0.32, 0.22, 0.24, 0.07, 0.15], potentialGrowth0: [0.025, 0.013, 0.04, 0.018, 0.045], inflationTarget: [0.02, 0.02, 0.025, 0.02, 0.04],
  rStar0: [0.0075, 0.0025, 0.01, 0.005, 0.02], nairu: [0.045, 0.07, 0.035, 0.04, 0.08], laborForceGrowth: [0.006, 0.001, 0.003, 0.005, 0.012],
  openness: [0.25, 0.45, 0.6, 0.55, 0.4], commodityExporter: [0, -0.6, -0.8, 0.9, 0.6], foodWeight: [0.12, 0.13, 0.15, 0.11, 0.2],
  energyWeight: [0.08, 0.09, 0.08, 0.07, 0.09], fxPassThrough: [0.05, 0.08, 0.1, 0.08, 0.25],
  fiscalRule: [{ kind: 'FLEXIBLE' }, { kind: 'DEFICIT_CAP', cap: 0.03, debtRef: 0.6 }, { kind: 'BALANCED_CYCLE', tolerance: 0.015 }, { kind: 'SURPLUS_SWF', targetSurplus: 0.02 }, { kind: 'PROCYCLICAL', boomSpendShare: 0.6 }],
  fxRegime0: ['FREE_FLOAT', 'FREE_FLOAT', 'MANAGED_BAND', 'FREE_FLOAT', 'MANAGED_FLOAT'],
  negativeRatesAllowed: [false, true, false, true, false], elb: [0, -0.005, 0, -0.0025, 0.005],
  sovereignBaseHazard: [0.0005, 0.003, 0.002, 0.0003, 0.02], debtReference: [1.1, 0.6, 0.7, 0.6, 0.5], fxDebtShare0: [0, 0, 0.05, 0, 0.3],
  initialDebtGdp: [0.95, 0.88, 0.6, 0.4, 0.7], initialPrimaryBalanceGdp: [-0.02, -0.01, -0.01, 0.03, -0.015], initialPolicyRate: [0.03, 0.0225, 0.0275, 0.025, 0.095],
  cycleCoupling: [0.8, 1.0, 1.2, 0.7, 1.3], hawkRange: [[0.4, 0.65], [0.55, 0.85], [0.3, 0.6], [0.45, 0.75], [0.2, 0.7]],
  credibility0: [0.85, 0.9, 0.75, 0.85, 0.45], communicationClarity: [0.8, 0.7, 0.5, 0.9, 0.4], fx0: [1.0, 1.1, 0.15, 0.095, 0.2],
  mandate: ['DUAL', 'PRICE_STABILITY', 'DUAL', 'PRICE_STABILITY', 'PRICE_STABILITY'], techShare: [1.0, 0.5, 0.9, 0.5, 0.3],
  rrDefault: [0.01, 0.01, 0.05, 0.01, 0.1], revBase: [0.3, 0.42, 0.25, 0.4, 0.27], tpBase: [0.005, 0.004, 0.006, 0.003, 0.012],
  tpFear: [-0.0004, 0.0002, 0, -0.0002, 0.0006], conv: [0.002, 0, 0, 0.0005, 0], ca0: [-0.03, 0.02, 0.03, 0.05, -0.02],
  betaRisk: [0, 0.01, 0.03, 0.04, 0.12], betaOil: [0, 0, 0, 0.25, 0.1], phiFx: [0, 0, 0.2, 0, 0.3],
  meetingTradingDayOfQuarter: [39, 51, 63, 15, 27], releaseOffset: [0, 1, 2, 3, 4],
};
const PERSONALITY = new Set(['credibility0', 'communicationClarity']);

describe('BLOC_DEFAULTS (04 §2.2)', () => {
  it('Σ gdpShare0 = 1.00 (integer hundredths)', () => {
    let s = 0;
    for (const b of BLOC_ORDER) s += Math.round(BLOC_DEFAULTS[b].gdpShare0 * 100);
    expect(s).toBe(100);
  });
  for (const [field, vals] of Object.entries(T)) {
    BLOC_ORDER.forEach((b, i) => {
      it(`${b}.${field}`, () => {
        const d = BLOC_DEFAULTS[b] as unknown as Record<string, unknown>;
        const v = PERSONALITY.has(field) ? (d.personality as Record<string, unknown>)[field] : d[field];
        expect(v).toEqual(vals[i]);
      });
    });
  }
  it('personality hawkMin/hawkMax equal hawkRange; id = ccy = bloc; no sectorWeights default', () => {
    for (const b of BLOC_ORDER) {
      const d = BLOC_DEFAULTS[b];
      expect([d.personality.hawkMin, d.personality.hawkMax]).toEqual(d.hawkRange);
      expect(d.id).toBe(b); expect(d.ccy).toBe(b);
      expect('sectorWeights' in d).toBe(false);
    }
  });
  it('constants', () => { expect(SECTOR_COUNT).toBe(12); expect(ISLA_SERENA_CITY).toBe('cty_isla_serena'); });
  it('E-92 (2): ISLA_SERENA_CITY is cty_isla_serena (E-26 city prefix, never the legacy city_), the id content cities.json carries', () => {
    expect(ISLA_SERENA_CITY.startsWith('city_')).toBe(false);
    const ids = (JSON.parse(readFileSync(new URL('../../content/data/cities.json', import.meta.url), 'utf8')) as { cities: { cityId: string }[] }).cities.map((c) => c.cityId);
    expect(ids).toContain(ISLA_SERENA_CITY);
    expect(ids.every((id) => id.startsWith('cty_'))).toBe(true);
  });
});

const content = (w: number[]): ContentView => ({
  blocs: () => BLOC_ORDER.map((b) => ({ id: b, name: `N_${b}`, cityIds: [`c1_${b}`, `c2_${b}`, `c3_${b}`] as [string, string, string],
    sectorWeights: w })),
});
const W12 = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.05, 0.05, 0.05, 0.05];
describe('blocDef', () => {
  it('merges content with defaults and institution ids', () => {
    const d = blocDef(content(W12), 'PYN');
    expect(d.name).toBe('N_PYN'); expect(d.cityIds).toEqual(['c1_PYN', 'c2_PYN', 'c3_PYN']); expect(d.sectorWeights).toEqual(W12);
    expect([d.cbkId, d.govId, d.excId, d.regId, d.crtId]).toEqual(['cbk_PYN', 'gov_PYN', 'exc_PYN', 'reg_PYN', 'crt_PYN']);
    expect(d.debtReference).toBe(0.7); expect(d.personality.hawkMax).toBe(0.6);
    expect('initialPolicyRate' in d).toBe(false); expect('releaseOffset' in d).toBe(false);
  });
  it('rejects ≠12 weights, a sum off by > 1e-9, a missing bloc', () => {
    expect(() => blocDef(content(W12.slice(1)), 'FDL')).toThrow(/sector weights/);
    expect(() => blocDef(content([...W12, 0]), 'FDL')).toThrow(/13 sector weights/);   // sums to 1, wrong length
    expect(() => blocDef(content([...W12.slice(0, 11), 0.05 + 2e-9]), 'FDL')).toThrow(/sum/);
    expect(blocDef(content([...W12.slice(0, 11), 0.05 + 5e-10]), 'FDL').id).toBe('FDL');
    const c = content(W12); const empty: ContentView = { ...c, blocs: () => [] };
    expect(() => blocDef(empty, 'FDL')).toThrow(/no bloc/);
  });
});

describe('aliases, ids', () => {
  it('BLOC_ALIAS round trip and BLOC_ORDER = FU, EC, PL, NA, SC', () => {
    expect(BLOC_ALIAS).toEqual({ FU: 'FDL', EC: 'EUN', PL: 'PYN', NA: 'NKR', SC: 'SRL' });
    const back = Object.fromEntries(Object.entries(BLOC_ALIAS).map(([k, v]) => [v, k]));
    expect(Object.keys(back).length).toBe(5);
    expect(BLOC_ORDER.map((b) => back[b])).toEqual(['FU', 'EC', 'PL', 'NA', 'SC']);
  });
  it('institution ids and blocOfEntity', () => {
    expect([cbkId('FDL'), govId('FDL'), excId('FDL'), regId('FDL'), crtId('FDL')]).toEqual(['cbk_FDL', 'gov_FDL', 'exc_FDL', 'reg_FDL', 'crt_FDL']);
    expect(CSF_ID).toBe('npc_CSF'); expect(STAB_ID).toBe('sys_STAB'); expect(DEALER_POOL_ID('SRL')).toBe('npc_PD_SRL');
    for (const b of BLOC_ORDER) for (const f of [cbkId, govId, excId, regId, crtId]) expect(blocOfEntity(f(b))).toBe(b);
    for (const x of ['cbk_FU', 'gov_FDLX', 'npc_CSF', 'bnk_FDL', 'xcbk_FDL', '']) expect(blocOfEntity(x)).toBeNull();
  });
  it('generated ids use kinds mrl, mtg, auc, crs', () => {
    const kinds: string[] = []; const ctx = { newId: (k: string) => { kinds.push(k); return `${k}_1`; } } as never;
    releaseId(ctx, 'FDL', 'CPI'); meetingId(ctx); auctionId(ctx); crisisId(ctx);
    expect(kinds).toEqual(['mrl', 'mtg', 'auc', 'crs']);
    for (const k of kinds) expect(ID_KIND_RE.test(k)).toBe(true);   // core IdFactory accepts every kind
  });
});

describe('tables', () => {
  it('28 tables, mac.* names matching the T02-09 regex, module 04, unique', () => {
    // hook_call lives outside macroTables (HOOK_CALL_TABLE; QA hookId.test.ts:27 alias follow-up) but is still a registered table
    expect(ALL_MACRO_TABLES.length).toBe(Object.keys(macroTables).length + 1);
    expect(ALL_MACRO_TABLES.length).toBe(28);
    expect(ALL_MACRO_TABLES).toContain(HOOK_CALL_TABLE);
    expect(Object.values(macroTables)).not.toContain(HOOK_CALL_TABLE);
    const names = ALL_MACRO_TABLES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of ALL_MACRO_TABLES) { expect(t.name).toMatch(/^mac\.[a-z0-9_]+$/); expect(t.name).toMatch(/^[a-z]{2,8}\.[a-z0-9_]+$/); expect(t.module).toBe('04'); }
    expect(macroTables.voteSnapshot.name).toBe('mac.vote_snapshot');
  });
  it('idOf = id; secondary indexes as listed', () => {
    expect(macroTables.cb.idOf({ id: 'cbk_FDL' } as never)).toBe('cbk_FDL');
    const idx = Object.entries(macroTables).filter(([, t]) => t.indexes).map(([k, t]) => [k, t.indexes!.map((i) => i.name)]);
    expect(Object.fromEntries(idx)).toEqual({ release: ['bloc'], auction: ['govId'], bid: ['auctionId'], event: ['phase'], poolOrder: ['tick'], facility: ['bankId'] });
    expect(macroTables.release.indexes![0]!.key({ bloc: 'NKR' } as never)).toBe('NKR');
    expect(macroTables.auction.indexes![0]!.key({ govId: 'gov_EUN' } as never)).toBe('gov_EUN');
    expect(macroTables.bid.indexes![0]!.key({ auctionId: 'auc_1' } as never)).toBe('auc_1');
    expect(macroTables.event.indexes![0]!.key({ phase: 'TRIGGER' } as never)).toBe('TRIGGER');
    expect(HOOK_CALL_TABLE.indexes!.map((i) => i.name)).toEqual(['owner']);
    expect(HOOK_CALL_TABLE.indexes![0]!.key({ owner: '07' } as never)).toBe('07');
    expect(macroTables.facility.indexes![0]!.key({ bankId: 'bnk_x' } as never)).toBe('bnk_x');
    const pk = (t: number): string => macroTables.poolOrder.indexes![0]!.key({ tick: t } as never)!;
    expect(pk(9) < pk(10)).toBe(true); expect(pk(99) < pk(100)).toBe(true);   // lexicographic order = tick order
  });
});

const SPEC_KINDS = ['macro.release.consensus', 'macro.release.published', 'macro.cycle.declared', 'macro.cb.guidance', 'macro.cb.decision', 'macro.cb.minutes',
  'macro.cb.tool', 'macro.cb.facility.daily', 'macro.cb.repo', 'macro.cb.ela', 'macro.fiscal.quarter', 'macro.fiscal.program', 'macro.fiscal.rule_breach',
  'macro.sov.auction.announced', 'macro.sov.auction.result', 'macro.sov.bid.result', 'macro.sov.buyback.result', 'macro.sov.syndication.priced',
  'macro.sov.status', 'macro.sov.default', 'macro.sov.exchange.open', 'macro.sov.exchange.tally', 'macro.sov.exchange.result', 'macro.fx.intervention.daily',
  'macro.fx.regime', 'macro.fx.capcontrols', 'macro.csf.program', 'macro.fear', 'macro.fsi', 'macro.event.trigger', 'macro.event.phase', 'macro.event.ended',
  'macro.event.internal', 'macro.stab.msi', 'macro.stab.report', 'macro.governor.appointed'];
const EXTRA = ['macro.input.stale', 'macro.sov.bid.accepted'];
const dir = { L1_demand: 'UP', L2_lifestyle_price: 'FLAT', L3_levy_bp: 'DOWN', L4_upkeep: 'FLAT' };
const SAMPLES: Record<string, unknown> = {
  'macro.release.consensus': { bloc: 'FDL', kind: 'CPI', releaseId: 'r', scheduledTick: 10, consensus: 0.02, dispersion: 0.001 },
  'macro.release.published': { bloc: 'FDL', kind: 'CPI', releaseId: 'r', actual: 0.021, consensus: 0.02, prior: 0.019, surprise: 0.5, riskReaction: { equityJump: -0.0015, fxJump: 0.0015 } },
  'macro.cycle.declared': { bloc: 'EUN', cycleLabel: 'CONTRACTION', sinceDay: 40 },
  'macro.cb.guidance': { bloc: 'FDL', meetingId: 'm', score: 0.3, textKey: 'k' },
  'macro.cb.decision': { bloc: 'FDL', meetingId: 'm', previousRate: 0.03, newRate: 0.0325, corridor: { depositRate: 0.0275, lendingRate: 0.0375 }, emergency: false,
    votes: { for: 7, against: 2 }, ruleTerms: { neutral: 0.0275, inflation: 0.02, inflationGap: 0.0025, outputGap: 0.0025, finStress: 0, fx: 0, bias: 0 },
    qeChangePerMonth: '0', statementKey: 's', reasons: ['r1'] },
  'macro.cb.minutes': { bloc: 'FDL', meetingId: 'm', dissent: { higher: 1, lower: 1 }, riskKeys: ['k'] },
  'macro.cb.tool': { bloc: 'PYN', tool: 'YCC_START', params: { capYield: 0.01 } },
  'macro.cb.facility.daily': { bloc: 'FDL', repoOutstanding: '100', elaOutstanding: '0', deposits: '5' },
  'macro.cb.repo': { bloc: 'FDL', bankId: 'b', loanId: 'l', amount: '1000', ccy: 'FDL', termDays: 7, collateral: [{ assetId: 'a', qty: '10', haircut: 0.02 }] },
  'macro.cb.ela': { bloc: 'FDL', bankId: 'b', loanId: 'l', amount: '1000', ccy: 'FDL', termDays: 7, collateral: [] },
  'macro.fiscal.quarter': { bloc: 'FDL', quarter: 3, deficitGdp: 0.04, primaryBalanceGdp: -0.02, debtGdp: 0.95 },
  'macro.fiscal.program': { programId: 'p', bloc: 'FDL', kind: 'AI_COMPUTE', sizeGdpPerYear: 0.005, budget: '100', startTick: 1, endTick: 2, source: 'POLITICS', sponsors: [] },
  'macro.fiscal.rule_breach': { bloc: 'EUN', rule: 'DEFICIT_CAP', programId: null },
  'macro.sov.auction.announced': { auctionId: 'a', govId: 'gov_FDL', assetId: 'x', tenor: 'N10Y', reopening: false, announceTick: 1, bidOpenTick: 1, auctionTick: 5, offeredFace: '1000', whenIssuedYield: null },
  'macro.sov.auction.result': { auctionId: 'a', govId: 'gov_FDL', stopYield: 0.04, bidToCover: 2.4, tailBp: 0.5, allotmentAtStopPct: 0.4, awardedFace: '1000', npcShare: 0.9, playerShare: 0.1, failed: false },
  'macro.sov.bid.accepted': { auctionId: 'a', bidId: 'b', kind: 'COMPETITIVE', face: '10000', yieldBp: 400 },
  'macro.sov.bid.result': { auctionId: 'a', bidId: 'b', awardedFace: '10000', price: '99000000' },
  'macro.sov.buyback.result': { buybackId: 'b', govId: 'gov_SRL', acceptedFace: '0', offers: 0, averagePrice: null },
  'macro.sov.syndication.priced': { syndicationId: 's', govId: 'gov_SRL', assetId: 'x', size: '10', spreadBp: 12, orders: 3, coverRatio: 1.5 },
  'macro.sov.status': { govId: 'gov_SRL', status: 'GRACE', trigger: 'FAILED_ROLLOVER' },
  'macro.sov.default': { govId: 'gov_SRL', caseId: 'c', assetIds: ['x'], missedAssetId: 'x', missedAmount: '5', dueTick: 9 },
  'macro.sov.exchange.open': { govId: 'gov_SRL', caseId: 'c', offerId: 'o', round: 1, openTick: 1, closeTick: 2, haircutNpv: 0.3, newBonds: [{ tenor: 'N10Y', couponRate: 0.05, maturityYears: 10, facePer100: 70 }] },
  'macro.sov.exchange.tally': { offerId: 'o', consentSoFar: 0.5 },
  'macro.sov.exchange.result': { offerId: 'o', status: 'ACCEPTED', consent: 0.8 },
  'macro.fx.intervention.daily': { bloc: 'PYN', gameDay: 3, netInterventionFdl: '-5', reservesFdl: '100' },
  'macro.fx.regime': { bloc: 'PYN', old: 'MANAGED_BAND', new: 'FREE_FLOAT', band: null, devaluation: 0.2 },
  'macro.fx.capcontrols': { bloc: 'SRL', level: 2, untilTick: null },
  'macro.csf.program': { bloc: 'SRL', size: '100', rate: 0.03, startTick: 1, endTick: 2, trancheTicks: [1], conditions: { primaryBalanceStepPerYear: 0.01, cbIndependence: true, capitalControlsPhaseOutDays: 90 }, compliance: 1 },
  'macro.fear': { F: 20, RA: 0.6 },
  'macro.fsi': { fsi: 0.2, components: { interbankSpread: 0, repoHaircutChange: 0, ccpFundUsage: 0, npcBankEquityDrawdown: 0, igSpread: 0, stablecoinDepeg: 0, etfDiscount: 0, sovereignStress: 0 } },
  'macro.event.trigger': { eventId: 'e', tier: 'MAJOR', kind: 'OIL_SHOCK', blocs: ['NKR'], publicTitleKey: 't' },
  'macro.event.phase': { eventId: 'e', phase: 'CONTAGION' },
  'macro.event.ended': { eventId: 'e', outcomes: { gxDrawdown: -0.2 } },
  'macro.event.internal': { eventId: 'e', tier: 'MAJOR', kind: 'OIL_SHOCK', blocs: ['NKR'], precursorStartTick: 1, triggerTick: 2, plannedEndTick: 3, severity: 1.1, shocks: [] },
  'macro.stab.msi': { msi: 0.5 },
  'macro.stab.report': { msi: 0.5, levers: { L1_demand: 1, L2_lifestyle_price: 1, L3_levy_bp: 0, L4_upkeep: 1 }, leverDirections: dir, e: 0.01,
    faucetsByClass: { WAGE: '10' }, sinksByClass: { TAX: '8' }, netMint: '2', m0Index: 100, m2Index: 101, npcToPlayerWealthRatio: 3, crisisCount: 0 },
  'macro.governor.appointed': { bloc: 'FDL', governorNpcId: 'npc_g', termEndTick: 100 },
  'macro.input.stale': { keys: ['ai.aiRaceIndex'], tick: 5 },
};

describe('events (04 §5)', () => {
  it('every §5 kind plus the two extras is registered with a visibility, nothing else', () => {
    const want = [...SPEC_KINDS, ...EXTRA].sort();
    expect(Object.keys(MACRO_EVENTS).sort()).toEqual(want);
    expect(Object.keys(MACRO_EVENT_VISIBILITY).sort()).toEqual(want);
  });
  it('visibility column', () => {
    const nonPublic = Object.fromEntries(Object.entries(MACRO_EVENT_VISIBILITY).filter(([, v]) => v !== 'PUBLIC'));
    expect(nonPublic).toEqual({ 'macro.cb.repo': 'PARTIES', 'macro.cb.ela': 'PARTIES', 'macro.sov.bid.accepted': 'PRIVATE', 'macro.sov.bid.result': 'PRIVATE',
      'macro.event.internal': 'SEALED', 'macro.input.stale': 'SEALED' });
  });
  for (const k of [...SPEC_KINDS, ...EXTRA]) {
    it(`${k}: sample parses; non-SEALED payload has no hidden field`, () => {
      const r = MACRO_EVENTS[k]!.safeParse(SAMPLES[k]);
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
      if (MACRO_EVENT_VISIBILITY[k] !== 'SEALED') expect(assertNoHiddenFields(r.data)).toEqual([]);
    });
  }
  it('strict: an undeclared hidden key is rejected; money must be a decimal string', () => {
    expect(MACRO_EVENTS['macro.cycle.declared']!.safeParse({ bloc: 'EUN', cycleLabel: 'RECOVERY', sinceDay: 1, regime: 'RECOVERY' }).success).toBe(false);
    expect(MACRO_EVENTS['macro.event.trigger']!.safeParse({ ...(SAMPLES['macro.event.trigger'] as object), plannedEndTick: 9 }).success).toBe(false);
    expect(MACRO_EVENTS['macro.cb.facility.daily']!.safeParse({ bloc: 'FDL', repoOutstanding: 100, elaOutstanding: '0', deposits: '5' }).success).toBe(false);
    expect(MACRO_EVENTS['macro.cb.facility.daily']!.safeParse({ bloc: 'FDL', repoOutstanding: '1.5', elaOutstanding: '0', deposits: '5' }).success).toBe(false);
    expect(MACRO_EVENTS['macro.cb.facility.daily']!.safeParse({ bloc: 'FU', repoOutstanding: '1', elaOutstanding: '0', deposits: '5' }).success).toBe(false);
  });
  it('macro.cb.decision publishes the estimate-based outputGap term; rejects true-gap fields (E-54 ruling, E-41 B2; flips #17)', () => {
    const d = SAMPLES['macro.cb.decision'] as { ruleTerms: Record<string, number> };
    expect(MACRO_EVENTS['macro.cb.decision']!.safeParse(d).success).toBe(true);
    const { outputGap: _x, ...six } = d.ruleTerms;
    expect(MACRO_EVENTS['macro.cb.decision']!.safeParse({ ...d, ruleTerms: six }).success).toBe(false);   // the estimate term is required
    for (const extra of [{ outputGapTerm: 0.001 }, { outputGapTrue: 0.001 }, { trueOutputGap: 0.001 }, { hawkishness: 0.5 }]) {
      expect(MACRO_EVENTS['macro.cb.decision']!.safeParse({ ...d, ruleTerms: { ...d.ruleTerms, ...extra } }).success).toBe(false);
      expect(MACRO_EVENTS['macro.cb.decision']!.safeParse({ ...d, ...extra }).success).toBe(false);
    }
    expect(assertNoHiddenFields(d)).toEqual([]);   // ruleTerms.outputGap is the public estimate term (PUBLIC_PATH_EXCEPTIONS)
  });
  it('macro.event.internal carries the plan (hidden fields allowed there only)', () => {
    expect(assertNoHiddenFields(SAMPLES['macro.event.internal'])).toEqual(['plannedEndTick', 'precursorStartTick', 'severity']);
  });
  it('assertNoHiddenFields', () => {
    expect(assertNoHiddenFields({ a: { outputGap: 0.01 } })).toEqual(['a.outputGap']);
    expect(assertNoHiddenFields({ x: [{ y: 1 }, { bids: [] }], hHat: 1 })).toEqual(['hHat', 'x[1].bids']);
    expect(assertNoHiddenFields(null)).toEqual([]); expect(assertNoHiddenFields('regime')).toEqual([]);
    expect(HIDDEN_FIELD_NAMES).toEqual(['regime', 'outputGap', 'outputGapTarget', 'rStar', 'rStarEstimate', 'hawkishness', 'hawkDrift', 'creditGap', 'trueValue',
      'plannedEndTick', 'precursorStartTick', 'severity', 'hHat', 'bids', 'gapEstNoise', 'outputGapTerm', 'outputGapTrue', 'trueOutputGap']);
    expect(assertNoHiddenFields({ ruleTerms: { outputGap: 1 }, a: { outputGap: 2, ruleTerms: { outputGap: 3 } } })).toEqual(['a.outputGap']);
  });
});

describe('streams (02 §3.10.4)', () => {
  it('keys', () => {
    expect(S.regime('SRL')).toBe('macro.regime:SRL'); expect(S.fx('PYN', 'FDL')).toBe('macro.fx:PYN:FDL');
    expect(S.globalRegime()).toBe('macro.global_regime'); expect(S.shock('EUN')).toBe('macro.shock:EUN');
    expect(S.cbPersonality('NKR')).toBe('macro.cb_personality:cbk_NKR'); expect(S.cbDecision('FDL')).toBe('macro.cb_decision:cbk_FDL');
    expect(S.fiscal('SRL')).toBe('macro.fiscal:gov_SRL'); expect(S.crisis()).toBe('macro.crisis'); expect(S.sov('PYN')).toBe('macro.sovereign_event:gov_PYN');
    expect(S.nowcast('chr_1', 'macro_rel_2')).toBe('macro.nowcast:chr_1:macro_rel_2');
  });
  it('QA #36: every helper validates each segment against the registry key charset; a bad segment throws I0.rng_unregistered', () => {
    const code = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };
    expect(S.fx('EUN', 'FDL')).toBe('macro.fx:EUN:FDL');
    expect(code(() => S.fx('EUN/X' as Ccy, 'FDL'))).toBe('I0.rng_unregistered');
    expect(code(() => S.fx('a:b' as Ccy, 'FDL'))).toBe('I0.rng_unregistered');
    expect(code(() => S.fx('EUN', 'a:b' as Ccy))).toBe('I0.rng_unregistered');
    expect(code(() => S.fx('' as Ccy, 'FDL'))).toBe('I0.rng_unregistered');
    const bad = ['a:b', 'x/y', '', 'a b'] as const;
    for (const v of bad) {
      for (const f of [() => S.regime(v as BlocId), () => S.shock(v as BlocId), () => S.cbPersonality(v as BlocId), () => S.cbDecision(v as BlocId),
        () => S.fiscal(v as BlocId), () => S.gapest(v as BlocId), () => S.sov(v as BlocId), () => S.nowcast(v, 'rel_1'), () => S.nowcast('chr_1', v)]) {
        expect(code(f)).toBe('I0.rng_unregistered');
      }
    }
  });
  it('every S key matches a module-04 row of the 02 §3.10.4 registry (T02-06 STREAM_REGISTRY, E-63) and uses a listed stream', () => {
    const b: BlocId = 'FDL';
    for (const key of [S.globalRegime(), S.regime(b), S.shock(b), S.cbPersonality(b), S.cbDecision(b), S.fiscal(b), S.fx('PYN', 'FDL'), S.gapest(b), S.crisis(), S.sov(b), S.nowcast('chr_1', 'rel_2')]) {
      expect(matchStream(key)?.module).toBe('04');
      expect(MACRO_STREAMS).toContain(key.split(':')[0]);
    }
    for (const k of MACRO_STREAMS) expect(STREAM_REGISTRY.some((r) => r.module === '04' && streamPrefix(r) === k)).toBe(true);
  });
});

describe('defaultMacroPorts', () => {
  it('every reader null / [] / false; credit null; ownerGroupOf = entity', () => {
    const p = defaultMacroPorts(); const s = {} as never;
    expect(p.credit).toBeNull();
    for (const [mod, port] of Object.entries(p)) {
      if (port === null) continue;
      for (const [fn, f] of Object.entries(port as Record<string, (...a: unknown[]) => unknown>)) {
        const v = f(s, 'x_1', 1, 1);
        if (fn === 'ownerGroupOf') expect(v).toBe('x_1');
        else if (fn === 'tariffDelta') expect(v).toBe(0);
        else if (fn === 'priceFromYield' || fn === 'yieldFromPrice') expect(Number.isNaN(v)).toBe(true);
        else expect([null, false].includes(v as never) || (Array.isArray(v) && v.length === 0), `${mod}.${fn}`).toBe(true);
      }
    }
  });
});

/** Every key path (deep) in a payload whose key is one of `names`. */
function keysNamed(payload: unknown, names: readonly string[], path = ''): string[] {
  if (payload === null || typeof payload !== 'object') return [];
  const out: string[] = [];
  if (Array.isArray(payload)) { payload.forEach((v, i) => out.push(...keysNamed(v, names, `${path}[${i}]`))); return out; }
  for (const [k, v] of Object.entries(payload)) {
    const p = path === '' ? k : `${path}.${k}`;
    if (names.includes(k)) out.push(p);
    out.push(...keysNamed(v, names, p));
  }
  return out;
}

describe('E-90 credit0 / history credit schema', () => {
  it('AC E-90-1: BlocMacroState.credit0: number; DailyHistoryRow.credit: number | null; a bigint fails to compile on both', () => {
    expectTypeOf<BlocMacroState['credit0']>().toEqualTypeOf<number>();
    expectTypeOf<BlocMacroState['credit']>().toEqualTypeOf<number>();
    expectTypeOf<DailyHistoryRow['credit']>().toEqualTypeOf<number | null>();
    // @ts-expect-error bigint is not assignable to credit0 (E-90 (1): float, not Money)
    const a: BlocMacroState['credit0'] = 1n;
    // @ts-expect-error bigint is not assignable to the history row credit
    const b: DailyHistoryRow['credit'] = 1n;
    expect([typeof a, typeof b]).toEqual(['bigint', 'bigint']);   // runtime values are irrelevant; the check is the two directives above
  });

  it('AC E-90-8: credit0 and credit are not hidden names, not PublicMacroView keys, and no PUBLIC event sample carries them', () => {
    expect(HIDDEN_FIELD_NAMES).not.toContain('credit0');
    expect(HIDDEN_FIELD_NAMES).not.toContain('credit');
    expectTypeOf<Extract<keyof PublicMacroView, 'credit0' | 'credit'>>().toEqualTypeOf<never>();
    const publicKinds = Object.keys(MACRO_EVENT_VISIBILITY).filter((k) => MACRO_EVENT_VISIBILITY[k] === 'PUBLIC');
    expect(publicKinds.length).toBeGreaterThan(0);
    for (const k of publicKinds) {
      expect(SAMPLES[k], k).toBeDefined();
      expect(keysNamed(SAMPLES[k], ['credit0', 'credit']), k).toEqual([]);
      expect(assertNoHiddenFields(SAMPLES[k]), k).toEqual([]);
    }
    expect(keysNamed({ a: [{ credit0: 1 }], credit: null }, ['credit0', 'credit'])).toEqual(['a[0].credit0', 'credit']);   // the scanner itself
  });
});
