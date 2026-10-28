// T04-16: consensus and publication of data releases (04 §3.15.2), the due list, latest prints and risk reactions.
import { TICKS_PER_GAME_DAY, type ParamsView, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_ORDER, macroTables, RELEASE_KINDS, type BlocId, type DataRelease, type LatestPrint, type PublicMacroView, type ReleaseKind } from '../schema';
import { BLOC_DEFAULTS } from '../blocs';
import { S } from '../streams';
import { releasesInRange, type ScheduledRelease } from './calendar';
import { consensusOf, EXTRA_FIELDS, lastRow, measure, riskReaction, roundExtra, SIGMA_CONS, SIGMA_MEAS, surpriseOf, trueValues,
  type ReleaseRow, type RiskReaction } from './releaseValues';
import { blocRow } from './sovCase';

const D = TICKS_PER_GAME_DAY;
const T = macroTables.release.name;
/** Release ids use the stream-segment charset (S.nowcast takes them as a key segment). */
export const releaseId = (r: ScheduledRelease): string => `rel_${r.bloc}_${r.kind}_${r.tick}`;
type View = PublicMacroView & { id: BlocId };

export function postConsensus(ctx: PhaseCtx, b: BlocId, rel: ScheduledRelease): DataRelease {
  const rng = ctx.rng(S.shock(b)), f = trueValues(ctx.store, b, rel.kind, rel.referencePeriod, () => rng.normal());
  const { consensus, dispersion } = consensusOf(f.headline, rel.kind, SIGMA_CONS[rel.kind] > 0 ? rng.normal() : 0);
  const bl = blocRow(ctx.store, b), id = releaseId(rel);
  const row: ReleaseRow = { id, bloc: b, kind: rel.kind, scheduledTick: rel.tick, releasedTick: rel.tick, referencePeriod: rel.referencePeriod, trueValue: f.headline,
    actual: 0, consensus, consensusDispersion: dispersion, prior: 0, surprise: 0, extra: {}, pending: true, truthExtra: f.extra,
    ...(rel.kind === 'RETAIL' ? { realWageGrowth: bl.wageGrowth - bl.headlineInflation } : {}) };
  ctx.store.put(T, row);
  ctx.emit('macro.release.consensus', [cbkId(b)], { bloc: b, kind: rel.kind, releaseId: id, scheduledTick: rel.tick, consensus, dispersion }, 'PUBLIC');
  return row;
}

export function publishRelease(ctx: PhaseCtx, b: BlocId, rel: ScheduledRelease): DataRelease {
  const s = ctx.store, k = rel.kind, id = releaseId(rel);
  const row = (s.get<ReleaseRow>(T, id) ?? postConsensus(ctx, b, rel)) as ReleaseRow;
  if (!row.pending) return row;
  const rng = ctx.rng(S.shock(b)), noisy = SIGMA_MEAS[k] > 0, eps = (): number => (noisy ? rng.normal() : 0);
  const actual = measure(row.trueValue, k, eps()), extra: Record<string, number> = {};
  for (const f of EXTRA_FIELDS[k] ?? []) extra[f.key] = f.noisy ? measure(row.truthExtra[f.key]!, k, eps()) : roundExtra(row.truthExtra[f.key]!);
  const view = s.get<View>(macroTables.publicView.name, b), prints = { ...(view?.prints ?? {}) } as Record<ReleaseKind, LatestPrint | null>;
  const revised: ReleaseKind | null = k === 'GDP_REV1' ? 'GDP_ADV' : k === 'GDP_REV2' ? 'GDP_REV1' : null;
  const prior = (revised ? prints[revised]?.actual : prints[k]?.actual) ?? actual;   // no earlier print: prior = actual
  const surprise = surpriseOf(actual, row.consensus, k);
  const rr: RiskReaction = riskReaction(k, surprise, blocRow(s, b).coreInflation, BLOC_DEFAULTS[b].inflationTarget);
  const out: ReleaseRow = { ...row, releasedTick: ctx.tick, actual, extra, prior, ...(revised ? { revisedPrior: actual } : {}), surprise, pending: false, riskReaction: rr };
  s.put(T, out);
  const print: LatestPrint = { kind: k, tick: ctx.tick, actual, consensus: row.consensus, prior, ...(revised ? { revisedPrior: actual } : {}), surprise, extra };
  prints[k] = print;
  if (revised && prints[revised]) prints[revised] = { ...prints[revised]!, revisedPrior: actual };
  if (view) s.put(macroTables.publicView.name, { ...view, prints });
  ctx.emit('macro.release.published', [cbkId(b)], { bloc: b, kind: k, releaseId: id, actual, consensus: row.consensus, prior, ...(revised ? { revisedPrior: actual } : {}),
    surprise, riskReaction: { equityJump: rr.equityJump, fxJump: rr.fxValueJump } }, 'PUBLIC');
  return out;
}

/** releasesInRange reads no params (calendar.ts `void params`); the due list needs only the store. */
const NO_PARAMS = Object.freeze({}) as unknown as ParamsView;
const kindRank = (k: ReleaseKind): number => RELEASE_KINDS.indexOf(k), blocRank = (b: BlocId): number => BLOC_ORDER.indexOf(b);
/** Releases with a mac.schedule row whose consensus (t 420 of the previous trading day) or publication falls on `tick`. */
export function releasesDue(store: StoreRead, tick: Tick): { consensus: ScheduledRelease[]; publish: ScheduledRelease[] } {
  const day = Math.floor(tick / D), consensus: ScheduledRelease[] = [], publish: ScheduledRelease[] = [];
  for (const r of releasesInRange(day, day + 12, NO_PARAMS)) {
    if (store.get(macroTables.schedule.name, `${r.bloc}:${r.kind}:${r.tick}`) === undefined) continue;
    if (r.tick === tick) publish.push(r);
    if (r.consensusTick === tick) consensus.push(r);
  }
  const cmp = (x: ScheduledRelease, y: ScheduledRelease): number => x.tick - y.tick || blocRank(x.bloc) - blocRank(y.bloc) || kindRank(x.kind) - kindRank(y.kind);
  return { consensus: consensus.sort(cmp), publish: publish.sort(cmp) };
}

export function latestPrint(store: StoreRead, b: BlocId, kind: ReleaseKind): LatestPrint | null {
  return store.get<View>(macroTables.publicView.name, b)?.prints?.[kind] ?? null;
}

/** actual − true of the latest published GDP print (ADV, REV1 or REV2, by release tick); 0 before the first. */
export function gdpPrintError(store: StoreRead, b: BlocId): number {
  let best: ReleaseRow | undefined;
  for (const k of ['GDP_ADV', 'GDP_REV1', 'GDP_REV2'] as const) {
    const r = lastRow(store, b, k, true);
    if (r && (!best || r.releasedTick > best.releasedTick)) best = r;
  }
  return best ? best.actual - best.trueValue : 0;
}

export function releaseRiskReactions(store: StoreRead, tick: Tick): { bloc: BlocId; kind: ReleaseKind; equityJump: number; fxValueJump: number; releaseId: string }[] {
  const out: { bloc: BlocId; kind: ReleaseKind; equityJump: number; fxValueJump: number; releaseId: string }[] = [];
  for (const b of BLOC_ORDER) {
    const rows = [...store.index<ReleaseRow>(T, 'bloc', b)].filter((r) => !r.pending && r.releasedTick === tick && r.riskReaction)
      .sort((x, y) => kindRank(x.kind) - kindRank(y.kind));
    for (const r of rows) out.push({ bloc: b, kind: r.kind, equityJump: r.riskReaction!.equityJump, fxValueJump: r.riskReaction!.fxValueJump, releaseId: r.id });
  }
  return out;
}
