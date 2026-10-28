// T04-16: private nowcasts (04 §3.15.4) and the named-economist helper (§6.5).
import { EngineFault, type Id, type PhaseCtx, type TableDef, type Tick } from '@tycoon/engine-core';
import { macroTables } from '../schema';
import { S } from '../streams';
import { SIGMA_CONS, type ReleaseRow } from './releaseValues';

type NowcastRow = { id: string /* `${chrId}:${releaseId}` */; value: number; tick: Tick };
export const nowcastTable: TableDef<NowcastRow> = Object.freeze({ name: 'mac.nowcast', module: '04', idOf: (e: NowcastRow) => e.id });

/** After publication the actual; else the stored nowcast; else true + σ_cons·(1 − 0.8·quality)·ε, ε the first normal of S.nowcast(chrId, releaseId). */
export function nowcast(ctx: PhaseCtx, chrId: Id, releaseId: string, quality: number): number {
  const r = ctx.store.get<ReleaseRow>(macroTables.release.name, releaseId);
  if (!r) throw new EngineFault('MAC_STATE_MISSING', `release ${releaseId}`, []);
  if (!r.pending) return r.actual;
  const id = `${chrId}:${releaseId}`, got = ctx.store.get<NowcastRow>(nowcastTable.name, id);
  if (got) return got.value;
  const q = Math.min(1, Math.max(0, quality));
  const value = r.trueValue + SIGMA_CONS[r.kind] * (1 - 0.8 * q) * ctx.rng(S.nowcast(chrId, releaseId)).normal();
  ctx.store.put(nowcastTable.name, { id, value, tick: ctx.tick });
  return value;
}
export function economistForecast(consensus: number, bias: number): number { return consensus + bias; }
