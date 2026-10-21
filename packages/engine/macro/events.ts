// T04-01: zod payload schemas of every `macro.*` event of 04 §5 (one object per row), plus 'macro.input.stale' (edge 23, internal)
// and 'macro.sov.bid.accepted' (§4). Money is a decimal string (G3). Objects are strict: no undeclared key can ride along.
// Public payloads never carry a HIDDEN_FIELD_NAMES key; only macro.event.internal (SEALED, Truth Machine) does.
import { cmpStr, type Visibility } from '@tycoon/engine-core';
import { z } from 'zod';
import { BLOC_ORDER, CRISIS_KINDS, CRISIS_PHASES, EVENT_TIERS, FX_REGIME_KINDS, REGIMES, RELEASE_KINDS, RIPPLE_KINDS, STORM_KINDS, TENORS } from './schema';

const money = z.string().regex(/^-?(0|[1-9][0-9]*)$/);   // decimal string of a bigint (G3)
const num = z.number().refine(Number.isFinite);
const int = z.number().int();
const tick = int.nonnegative();
const id = z.string().min(1);
const bloc = z.enum(BLOC_ORDER as [string, ...string[]]);
const regime = z.enum(REGIMES as [string, ...string[]]);
const fxRegime = z.enum(FX_REGIME_KINDS as [string, ...string[]]);
const releaseKind = z.enum(RELEASE_KINDS as [string, ...string[]]);
const tenor = z.enum(TENORS as [string, ...string[]]);
const tier = z.enum(EVENT_TIERS as [string, ...string[]]);
const eventKind = z.enum([...CRISIS_KINDS, ...STORM_KINDS, ...RIPPLE_KINDS] as [string, ...string[]]);
const phase = z.enum(CRISIS_PHASES as [string, ...string[]]);
const o = z.strictObject;
const cbTool = z.enum(['QE_START', 'QE_HOLD', 'QT_START', 'YCC_START', 'YCC_RAISE', 'YCC_END', 'LTRO_OPEN', 'SWAPLINE_ON', 'SWAPLINE_OFF',
  'RR_CHANGE', 'CCYB_CHANGE', 'LTV_CHANGE']);
const shock = o({ id, target: z.string(), value: num, startTick: tick, endTick: tick, shape: z.enum(['STEP', 'RAMP', 'DECAY']),
  halfLifeDays: num.optional(), sourceCrisisId: z.string().optional() });
const loanEvent = o({ bloc, bankId: id, loanId: id, amount: money, ccy: bloc, termDays: int.positive(),
  collateral: z.array(o({ assetId: id, qty: money, haircut: num })) });

export const MACRO_EVENTS: Record<string, z.ZodType> = {
  'macro.release.consensus': o({ bloc, kind: releaseKind, releaseId: id, scheduledTick: tick, consensus: num, dispersion: num }),
  'macro.release.published': o({ bloc, kind: releaseKind, releaseId: id, actual: num, consensus: num, prior: num, revisedPrior: num.optional(), surprise: num,
    riskReaction: o({ equityJump: num, fxJump: num }) }),   // §3.15: market factor jump J and FX value jump
  // the public label is `cycleLabel` (as in PublicMacroView): `regime` is a hidden field name (§2.4)
  'macro.cycle.declared': o({ bloc, cycleLabel: regime, sinceDay: int }),
  'macro.cb.guidance': o({ bloc, meetingId: id, score: num, textKey: z.string() }),
  'macro.cb.decision': o({ bloc, meetingId: id, previousRate: num, newRate: num, corridor: o({ depositRate: num, lendingRate: num }), emergency: z.boolean(),
    votes: o({ for: int.nonnegative(), against: int.nonnegative() }),
    // rounded contributions (0.01 pp). CbDecision.ruleTerms.outputGap is published as `outputGapTerm`: `outputGap` is a hidden field name (§2.4)
    ruleTerms: o({ neutral: num, inflation: num, inflationGap: num, outputGapTerm: num, finStress: num, fx: num, bias: num }),
    qeChangePerMonth: money, statementKey: z.string(), reasons: z.array(z.string()) }),
  'macro.cb.minutes': o({ bloc, meetingId: id, dissent: o({ hike: int.nonnegative(), hold: int.nonnegative(), cut: int.nonnegative() }), riskKeys: z.array(z.string()) }),
  'macro.cb.tool': o({ bloc, tool: cbTool, params: z.record(z.string(), z.union([num, z.string(), z.boolean()])) }),
  'macro.cb.facility.daily': o({ bloc, repoOutstanding: money, elaOutstanding: money, deposits: money }),
  'macro.cb.repo': loanEvent,
  'macro.cb.ela': loanEvent,
  'macro.fiscal.quarter': o({ bloc, quarter: int, deficitGdp: num, primaryBalanceGdp: num, debtGdp: num }),
  'macro.fiscal.program': o({ programId: id, bloc, kind: z.enum(['INFRASTRUCTURE', 'GREEN_ENERGY', 'AI_COMPUTE', 'HOUSING', 'DEFENSE_SECURITY', 'TAX_CUT',
    'HOUSEHOLD_TRANSFER', 'INDUSTRIAL_SUBSIDY', 'AUSTERITY']), sizeGdpPerYear: num, budget: money, startTick: tick, endTick: tick,
    source: z.enum(['AUTOMATIC', 'POLITICS', 'CRISIS_RESPONSE', 'CONCORD_CONDITIONALITY']), sponsors: z.array(id) }),
  'macro.fiscal.rule_breach': o({ bloc, rule: z.enum(['FLEXIBLE', 'DEFICIT_CAP', 'BALANCED_CYCLE', 'SURPLUS_SWF', 'PROCYCLICAL']), programId: id.nullable() }),
  'macro.sov.auction.announced': o({ auctionId: id, govId: id, assetId: id, tenor, reopening: z.boolean(), announceTick: tick, bidOpenTick: tick, auctionTick: tick,
    offeredFace: money, whenIssuedYield: num.nullable() }),
  'macro.sov.auction.result': o({ auctionId: id, govId: id, stopYield: num, bidToCover: num, tailBp: num, allotmentAtStopPct: num, awardedFace: money,
    npcShare: num, playerShare: num, failed: z.boolean() }),
  'macro.sov.bid.accepted': o({ auctionId: id, bidId: id, kind: z.enum(['COMPETITIVE', 'NONCOMPETITIVE']), face: money, yieldBp: num.optional() }),
  'macro.sov.bid.result': o({ auctionId: id, bidId: id, awardedFace: money, price: money }),
  'macro.sov.buyback.result': o({ buybackId: id, govId: id, acceptedFace: money, offers: int.nonnegative(), averagePrice: money.nullable() }),
  'macro.sov.syndication.priced': o({ syndicationId: id, govId: id, assetId: id, size: money, spreadBp: num, orders: int.nonnegative(), coverRatio: num }),
  'macro.sov.status': o({ govId: id, status: z.enum(['PERFORMING', 'GRACE', 'SELECTIVE_DEFAULT', 'RESTRUCTURING', 'POST_RESTRUCTURING']),
    trigger: z.enum(['FAILED_ROLLOVER', 'FX_SERVICE', 'POLITICAL', 'HAZARD']).nullable() }),
  'macro.sov.default': o({ govId: id, caseId: id, assetIds: z.array(id), missedAssetId: id, missedAmount: money, dueTick: tick }),
  'macro.sov.exchange.open': o({ govId: id, caseId: id, offerId: id, round: z.union([z.literal(1), z.literal(2), z.literal(3)]), openTick: tick, closeTick: tick,
    haircutNpv: num, newBonds: z.array(o({ tenor, couponRate: num, maturityYears: num, facePer100: num })) }),
  'macro.sov.exchange.tally': o({ offerId: id, consentSoFar: num }),
  'macro.sov.exchange.result': o({ offerId: id, status: z.enum(['ACCEPTED', 'FAILED']), consent: num }),
  'macro.fx.intervention.daily': o({ bloc, gameDay: int, netInterventionFdl: money, reservesFdl: money }),
  'macro.fx.regime': o({ bloc, old: fxRegime, new: fxRegime, band: o({ center: num, halfWidth: num }).nullable(), devaluation: num }),
  'macro.fx.capcontrols': o({ bloc, level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), untilTick: tick.nullable() }),
  'macro.csf.program': o({ bloc, size: money, rate: num, startTick: tick, endTick: tick, trancheTicks: z.array(tick),
    conditions: o({ primaryBalanceStepPerYear: num, cbIndependence: z.boolean(), capitalControlsPhaseOutDays: int }), compliance: num }),
  'macro.fear': o({ F: num, RA: num }),
  'macro.fsi': o({ fsi: num, components: o({ interbankSpread: num, repoHaircutChange: num, ccpFundUsage: num, npcBankEquityDrawdown: num, igSpread: num,
    stablecoinDepeg: num, etfDiscount: num, sovereignStress: num }) }),   // §3.14.2 components
  'macro.event.trigger': o({ eventId: id, tier, kind: eventKind, blocs: z.array(bloc), publicTitleKey: z.string().nullable() }),   // §9 #3: no length, no moves
  'macro.event.phase': o({ eventId: id, phase }),
  'macro.event.ended': o({ eventId: id, outcomes: z.record(z.string(), num) }),
  'macro.event.internal': o({ eventId: id, tier, kind: eventKind, blocs: z.array(bloc), precursorStartTick: tick, triggerTick: tick, plannedEndTick: tick,
    severity: num, shocks: z.array(shock) }),
  'macro.stab.msi': o({ msi: num }),
  'macro.stab.report': o({ msi: num, levers: o({ L1_demand: num, L2_lifestyle_price: num, L3_levy_bp: num, L4_upkeep: num }),
    leverDirections: o({ L1_demand: z.enum(['UP', 'DOWN', 'FLAT']), L2_lifestyle_price: z.enum(['UP', 'DOWN', 'FLAT']), L3_levy_bp: z.enum(['UP', 'DOWN', 'FLAT']), L4_upkeep: z.enum(['UP', 'DOWN', 'FLAT']) }),
    e: num, faucetsByClass: z.record(z.string(), money), sinksByClass: z.record(z.string(), money), netMint: money, m0Index: num, m2Index: num,
    npcToPlayerWealthRatio: num, crisisCount: int.nonnegative() }),   // §3.17.5 contents
  'macro.governor.appointed': o({ bloc, governorNpcId: id, termEndTick: tick }),
  'macro.input.stale': o({ keys: z.array(z.string()), tick }),
};

export const MACRO_EVENT_VISIBILITY: Readonly<Record<string, Visibility>> = Object.freeze({
  'macro.release.consensus': 'PUBLIC', 'macro.release.published': 'PUBLIC', 'macro.cycle.declared': 'PUBLIC', 'macro.cb.guidance': 'PUBLIC',
  'macro.cb.decision': 'PUBLIC', 'macro.cb.minutes': 'PUBLIC', 'macro.cb.tool': 'PUBLIC', 'macro.cb.facility.daily': 'PUBLIC',
  'macro.cb.repo': 'PARTIES', 'macro.cb.ela': 'PARTIES',   // + SEALED copy of ELA to the bloc regulator (emitter's job)
  'macro.fiscal.quarter': 'PUBLIC', 'macro.fiscal.program': 'PUBLIC', 'macro.fiscal.rule_breach': 'PUBLIC',
  'macro.sov.auction.announced': 'PUBLIC', 'macro.sov.auction.result': 'PUBLIC', 'macro.sov.bid.accepted': 'PRIVATE', 'macro.sov.bid.result': 'PRIVATE',
  'macro.sov.buyback.result': 'PUBLIC', 'macro.sov.syndication.priced': 'PUBLIC', 'macro.sov.status': 'PUBLIC', 'macro.sov.default': 'PUBLIC',
  'macro.sov.exchange.open': 'PUBLIC', 'macro.sov.exchange.tally': 'PUBLIC', 'macro.sov.exchange.result': 'PUBLIC',
  'macro.fx.intervention.daily': 'PUBLIC', 'macro.fx.regime': 'PUBLIC', 'macro.fx.capcontrols': 'PUBLIC', 'macro.csf.program': 'PUBLIC',
  'macro.fear': 'PUBLIC', 'macro.fsi': 'PUBLIC', 'macro.event.trigger': 'PUBLIC', 'macro.event.phase': 'PUBLIC', 'macro.event.ended': 'PUBLIC',
  'macro.event.internal': 'SEALED', 'macro.stab.msi': 'PUBLIC', 'macro.stab.report': 'PUBLIC', 'macro.governor.appointed': 'PUBLIC',
  'macro.input.stale': 'SEALED',
});

export const HIDDEN_FIELD_NAMES: readonly string[] = Object.freeze(['regime', 'outputGap', 'outputGapTarget', 'rStar', 'rStarEstimate', 'hawkishness',
  'hawkDrift', 'creditGap', 'trueValue', 'plannedEndTick', 'precursorStartTick', 'severity', 'hHat', 'bids']);

/** Recursive key scan; returns the dotted paths of every hidden key (array items as `[i]`, keys in byte order). */
export function assertNoHiddenFields(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (v === null || typeof v !== 'object') return;
    for (const k of Object.getOwnPropertyNames(v).sort(cmpStr)) {   // byte order: result independent of insertion order
      const p = path === '' ? k : `${path}.${k}`;
      if (HIDDEN_FIELD_NAMES.includes(k)) out.push(p);
      walk((v as Record<string, unknown>)[k], p);
    }
  };
  walk(payload, '');
  return out;
}
