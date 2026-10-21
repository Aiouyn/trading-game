// T02-06: the 02 §3.10.4 stream registry as data. This file IS the registry: a module that needs a new stream adds a row here
// (19 CI, tools/ci/scan-stream-keys.ts, rejects unknown keys). Rows transcribed in table order; `sim.bot:<botId>` is the table's
// harness-seed row (root HARNESS, never in the live world). E-63: macro.fx keyed <base>:<quote>; macro.nowcast row added (81 rows).
import { EngineFault } from '../types';
import type { RootKind } from './stream';

export interface StreamSpec { module: string; pattern: string; root: RootKind | 'HARNESS'; usedFor: string }

export const STREAM_REGISTRY: readonly StreamSpec[] = Object.freeze([
  { module: '02', pattern: 'core.genesis:<subsystem>', root: 'SECRET', usedFor: 'genesis-time generation of anything not authored (fallback; most content uses 22\'s generators below)' },
  { module: '03', pattern: 'ledger.audit_sample:<bloc>', root: 'SECRET', usedFor: 'selection of entities for tax audits by probability (03 §3.12.10)' },
  { module: '04', pattern: 'macro.global_regime', root: 'PUBLIC', usedFor: 'global regime transitions' },
  { module: '04', pattern: 'macro.regime:<bloc>', root: 'PUBLIC', usedFor: 'bloc regime Markov transitions' },
  { module: '04', pattern: 'macro.shock:<bloc>', root: 'PUBLIC', usedFor: 'GDP, inflation, unemployment shocks' },
  { module: '04', pattern: 'macro.cb_decision:<cbk>', root: 'PUBLIC', usedFor: 'meeting-decision noise around the rule' },
  { module: '04', pattern: 'macro.cb_personality:<cbk>', root: 'SECRET', usedFor: 'hidden hawkishness trait drift (01 §5.4)' },
  { module: '04', pattern: 'macro.fiscal:<gov>', root: 'PUBLIC', usedFor: 'fiscal surprises, auction cover noise' },
  { module: '04', pattern: 'macro.fx:<base>:<quote>', root: 'PUBLIC', usedFor: 'FX fundamental noise (key form <base>:<quote> per E-63)' },
  { module: '04', pattern: 'macro.gapest:<bloc>', root: 'SECRET', usedFor: 'CB output-gap estimate noise ε, AR(1) ρ 0.98, σ 0.5 pp (E-45, PROVISIONAL [Quant]); secret root so the true gap cannot be recovered' },
  { module: '04', pattern: 'macro.crisis', root: 'PUBLIC', usedFor: 'crisis trigger draws (rates set by 04)' },
  { module: '04', pattern: 'macro.sovereign_event:<gov>', root: 'PUBLIC', usedFor: 'downgrade, restructuring triggers' },
  { module: '04', pattern: 'macro.nowcast:<chrId>:<releaseId>', root: 'SECRET', usedFor: '04 nowcast noise per character and release (row per E-63; root S per E-63.5)' },
  { module: '05', pattern: 'mkt.factor:<factorId>', root: 'PUBLIC', usedFor: 'factor returns (global, sector, region, rates, risk appetite, FX, crypto)' },
  { module: '05', pattern: 'mkt.idio:<assetId>', root: 'PUBLIC', usedFor: 'idiosyncratic Student-t(4) noise' },
  { module: '05', pattern: 'mkt.jump:<assetId>', root: 'PUBLIC', usedFor: 'Kou jumps (occurrence, sign, size)' },
  { module: '05', pattern: 'mkt.npc_flow:<assetId>', root: 'PUBLIC', usedFor: 'NPC liquidity order-flow noise' },
  { module: '05', pattern: 'mkt.lp_quote:<assetId>', root: 'PUBLIC', usedFor: 'NPC quote width and depth jitter' },
  { module: '05', pattern: 'mkt.earnings:<cmpId>', root: 'SECRET', usedFor: 'earnings surprise drawn before release (secret until published)' },
  { module: '05', pattern: 'mkt.corp_action:<cmpId>', root: 'PUBLIC', usedFor: 'NPC corporate-action decisions (buybacks, splits)' },
  { module: '05', pattern: 'mkt.surveillance_sample', root: 'SECRET', usedFor: 'random sampling for surveillance reviews' },
  { module: '06', pattern: 'ast.crypto_hype:<tokenId>', root: 'PUBLIC', usedFor: 'hype process' },
  { module: '06', pattern: 'ast.depeg:<stableId>', root: 'PUBLIC', usedFor: 'depeg triggers' },
  { module: '06', pattern: 'ast.commodity:<cmdtyId>', root: 'PUBLIC', usedFor: 'supply/demand shocks, weather' },
  { module: '06', pattern: 'ast.credit_event:<issuerId>', root: 'PUBLIC', usedFor: 'default draws from hazard rates' },
  { module: '06', pattern: 'ast.recovery:<issuerId>', root: 'PUBLIC', usedFor: 'recovery rate on default' },
  { module: '06', pattern: 'ast.collectible:<categoryId>', root: 'PUBLIC', usedFor: 'collectible index noise, rare finds' },
  { module: '06', pattern: 'ast.oracle:<oracleId>', root: 'PUBLIC', usedFor: 'oracle update jitter' },
  { module: '07', pattern: 'bank.deposit_flow:<bnkId>', root: 'PUBLIC', usedFor: 'deposit flow noise' },
  { module: '07', pattern: 'bank.run:<bnkId>', root: 'PUBLIC', usedFor: 'run cascade draws' },
  { module: '07', pattern: 'bank.loan_default:<portfolioId>', root: 'PUBLIC', usedFor: 'NPC loan-book defaults' },
  { module: '07', pattern: 'bank.interbank', root: 'PUBLIC', usedFor: 'interbank funding noise' },
  { module: '08', pattern: 'fund.npc_flow:<fndId>', root: 'PUBLIC', usedFor: 'NPC investor subscriptions/redemptions' },
  { module: '08', pattern: 'ins.cat:<peril>:<regionId>', root: 'PUBLIC', usedFor: 'catastrophe occurrence and severity' },
  { module: '08', pattern: 'ins.claims:<insId>', root: 'PUBLIC', usedFor: 'attritional claims' },
  { module: '08', pattern: 'spv.pool_default:<spvId>', root: 'PUBLIC', usedFor: 'pool default and prepayment draws' },
  { module: '08', pattern: 'rat.noise:<ratId>', root: 'PUBLIC', usedFor: 'rating-committee noise' },
  { module: '09', pattern: 'biz.demand:<cityId>:<sector>', root: 'PUBLIC', usedFor: 'demand shocks per city sector' },
  { module: '09', pattern: 'biz.event:<bizId>', root: 'PUBLIC', usedFor: 'business events (01 §4.5)' },
  { module: '09', pattern: 'biz.staff:<bizId>', root: 'PUBLIC', usedFor: 'staff turnover, hiring outcomes' },
  { module: '09', pattern: 'biz.supply:<chainId>', root: 'PUBLIC', usedFor: 'supplier failures, delays' },
  { module: '09', pattern: 'biz.npc_entry:<cityId>:<sector>', root: 'PUBLIC', usedFor: 'NPC entrant arrivals' },
  { module: '09', pattern: 'biz.startup:<cityId>', root: 'PUBLIC', usedFor: 'startup pipeline (power-law outcomes)' },
  { module: '09', pattern: 'biz.contract:<cityId>', root: 'PUBLIC', usedFor: 'NPC customer contract offers' },
  { module: '10', pattern: 're.district:<districtId>', root: 'PUBLIC', usedFor: 'district index shocks' },
  { module: '10', pattern: 're.tenant:<propId>', root: 'PUBLIC', usedFor: 'tenant arrival, default, departure' },
  { module: '10', pattern: 're.appraisal:<propId>', root: 'PUBLIC', usedFor: 'appraisal noise' },
  { module: '10', pattern: 'city.gen:<cityId>:<chunk>:<stage>', root: 'SECRET', usedFor: 'procedural city generation (06-cities §8.2), fixed once generated' },
  { module: '10', pattern: 'city.growth:<cityId>', root: 'PUBLIC', usedFor: 'development-point allocation tie-breaks' },
  { module: '10', pattern: 're.list:<cityId>', root: 'PUBLIC', usedFor: '10B NPC listing asks (one draw per listing, district then sequence order) (E-39)' },
  { module: '10', pattern: 're.buyer:<cityId>', root: 'PUBLIC', usedFor: '10B buyer arrival hazard per listing per game hour, credit-freeze thinning (E-39)' },
  { module: '10', pattern: 're.permit:<permitId>', root: 'PUBLIC', usedFor: '10B permit decision draw (E-39)' },
  { module: '10', pattern: 're.crunch_severity:<scenarioId>', root: 'PUBLIC', usedFor: '10#35 crunch severity m, one draw per scenario shared by all cities (E-45, PROVISIONAL [Quant])' },
  { module: '10', pattern: 're.dev:<projectId>:<phase>', root: 'PUBLIC', usedFor: '10B construction overrun, delay Bernoulli and delay size, in that order (E-39)' },
  { module: '11', pattern: 'lab.train:<runId>', root: 'PUBLIC', usedFor: 'training outcome noise' },
  { module: '11', pattern: 'lab.eval:<modelId>', root: 'PUBLIC', usedFor: 'evaluation noise on withheld worlds' },
  { module: '11', pattern: 'lab.incident:<labId>', root: 'PUBLIC', usedFor: 'AI incident draws' },
  { module: '11', pattern: 'lab.data:<datasetId>', root: 'PUBLIC', usedFor: 'data-quality realization' },
  { module: '11', pattern: 'lab.tournament:<weekNo>', root: 'PUBLIC', usedFor: 'weekly tournament scenario seed' },
  { module: '12', pattern: 'ops.resolve:<opId>', root: 'SECRET', usedFor: 'op success, detection, attribution rolls' },
  { module: '12', pattern: 'ops.session:<sessionId>', root: 'SECRET', usedFor: 'hidden-session accrual noise and clue timing' },
  { module: '12', pattern: 'ops.decoy:<chrId>', root: 'SECRET', usedFor: 'decoy anomalies (0.05/real hour)' },
  { module: '12', pattern: 'ops.scan:<chrId>', root: 'SECRET', usedFor: 'defense auto-scan detection rolls' },
  { module: '12', pattern: 'ops.npc_crime:<cityId>', root: 'SECRET', usedFor: 'NPC criminal-crew target choice and outcomes' },
  { module: '12', pattern: 'ops.label:<chrId>', root: 'SECRET', usedFor: 'rotating public labels for connection entries (00 §3.2)' },
  { module: '13', pattern: 'law.evidence:<caseId>', root: 'SECRET', usedFor: 'evidence discovery rolls' },
  { module: '13', pattern: 'law.verdict:<caseId>', root: 'SECRET', usedFor: 'verdict uncertainty within bands' },
  { module: '13', pattern: 'law.investigation_pick:<regId>', root: 'SECRET', usedFor: 'regulator queue tie-breaks' },
  { module: '14', pattern: 'life.event:<chrId>', root: 'PUBLIC', usedFor: 'lifestyle incidents, staff events' },
  { module: '14', pattern: 'life.club:<clubId>', root: 'PUBLIC', usedFor: 'club invitations, events' },
  { module: '15', pattern: 'soc.league_assign:<weekNo>', root: 'PUBLIC', usedFor: 'league group assignment' },
  { module: '15', pattern: 'soc.challenge:<eventId>', root: 'PUBLIC', usedFor: 'challenge-event scenario generation' },
  { module: '16', pattern: 'world.news:<templateId>', root: 'PUBLIC', usedFor: 'template variant selection' },
  { module: '16', pattern: 'world.actor:<npcId>', root: 'SECRET', usedFor: 'named-actor decision noise and hidden goals' },
  { module: '16', pattern: 'world.dynasty:<dynastyId>', root: 'SECRET', usedFor: 'dynasty internal events, succession' },
  { module: '16', pattern: 'world.politics:<bloc>', root: 'PUBLIC', usedFor: 'legislative outcomes' },
  { module: '16', pattern: 'world.secret:<secretId>', root: 'SECRET', usedFor: 'secret discovery chances' },
  { module: '16', pattern: 'world.rumor', root: 'SECRET', usedFor: 'rumor truth flags (secret until resolved)' },
  { module: '16', pattern: 'world.era', root: 'PUBLIC', usedFor: 'technology/era progression timing' },
  { module: '21', pattern: 'liveops.event:<eventId>', root: 'PUBLIC', usedFor: 'scripted live-event randomization' },
  { module: '20', pattern: 'sim.bot:<botId>', root: 'HARNESS', usedFor: 'adversarial bots, never in the live world' },
].map((r) => Object.freeze(r as StreamSpec)));

/** Static part before the first ':' ('mkt.idio' for 'mkt.idio:<assetId>'). */
export function streamPrefix(spec: StreamSpec): string { const i = spec.pattern.indexOf(':'); return i < 0 ? spec.pattern : spec.pattern.slice(0, i); }

const SEGMENT = '[A-Za-z0-9_\\-.]+';
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS: readonly { re: RegExp; spec: StreamSpec }[] = STREAM_REGISTRY.map((spec) => ({
  spec, re: new RegExp(`^${spec.pattern.split(/<[^>]+>/).map(escape).join(SEGMENT)}$`),
}));
/** The registry row whose pattern matches the whole key ('<x>' segments match [A-Za-z0-9_\-.]+; no partial matches). */
export function matchStream(key: string): StreamSpec | undefined {
  for (const m of MATCHERS) if (m.re.test(key)) return m.spec;
  return undefined;
}

const SEGMENT_RE = new RegExp(`^${SEGMENT}$`);
/** One <placeholder> segment of a stream key, checked against the registry key charset [A-Za-z0-9_\-.]+ (no ':' or '/').
 *  Template helpers (streams.ts) pass every argument through this, so a helper cannot build a key outside its row. */
export function streamSegment(seg: string, helper: string): string {
  if (typeof seg !== 'string' || !SEGMENT_RE.test(seg)) throw new EngineFault('I0.rng_unregistered', `${helper}: key segment "${String(seg)}" is outside the registry charset [A-Za-z0-9_\\-.]+`);
  return seg;
}
