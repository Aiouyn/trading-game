import { DESK } from '@/content/learning';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { EXPLAIN_ROWS, FLOW_POOLS, ecoArchive, explainMove, impactShares, type MoveExplain } from '@/engine';
import { TPD } from './core';
import { ensureLedger, ledgerOf } from './ledger';
import { textProvider } from './text';
import type { DeskDossier, DeskFile, DeskPool, DeskRow } from './ledger-types';
import type { CommandResult, GameState, Player, WireItem } from './types';

/**
 * The Research Desk (Phase 3, D-19; velvet-research-desk.md). A query explains one asset over a closed window from the
 * engine's own move explainer. The window is clamped to the closed days here, so the screen never asks for an open day.
 * Every query is kept as a file with its dossier, so Files stays readable after the desk locks; only new queries stop.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

/** The first archived day and the last closed day (null before the first close). The desk and the journal share it. */
export interface DeskWindow {
  firstDay: number;
  lastClosed: number | null;
}

export function deskWindow(g: GameState): DeskWindow {
  const arc = ecoArchive(g.market);
  if (arc.length === 0) return { firstDay: 0, lastClosed: null };
  return { firstDay: arc[0]!.day, lastClosed: arc[arc.length - 1]!.day };
}

/** The Wire kinds that read as headlines about one asset. Public items only. */
const HEADLINE_KINDS: ReadonlySet<WireItem['kind']> = new Set(['move', 'earnings', 'preview', 'rumor', 'halt', 'reopen']);

/**
 * The asset's headlines over closed days from..to, oldest first (a day covers the ticks after its open up to its close).
 * Only what the Wire still holds: a window older than the Wire's retention shows fewer headlines.
 */
export function headlinesFor(g: GameState, assetId: string, from: number, to: number): { day: number; text: string }[] {
  const lo = from * TPD;
  const hi = (to + 1) * TPD;
  return g.wire
    .filter((w) => w.assetId === assetId && HEADLINE_KINDS.has(w.kind) && w.tick > lo && w.tick <= hi)
    .reverse()
    .slice(0, 12)
    .map((w) => ({ day: Math.floor((w.tick - 1) / TPD), text: w.text }));
}

const clampDay = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** The dossier for one asset over a window that is already clamped to closed days. Throws when explainMove does. */
function dossierOf(g: GameState, assetId: string, from: number, to: number, no: number): DeskDossier {
  const e: MoveExplain = explainMove(g.market, assetId, from, to);
  // the parts of the move as fractions: the engine's own sign-following split of the move, so the rows sum to it exactly
  const shares = impactShares(e.total, EXPLAIN_ROWS.map((k) => e.parts[k] ?? 0));
  const rows: DeskRow[] = [];
  EXPLAIN_ROWS.forEach((k, i) => { if ((e.parts[k] ?? 0) !== 0) rows.push({ row: k, value: shares[i]! }); });

  const logs = FLOW_POOLS.map((pool) => e.flow[pool] ?? 0);
  const gross = logs.reduce((s, x) => s + Math.abs(x), 0);
  const flow: DeskPool[] = FLOW_POOLS.map((pool, i) => ({ pool, share: gross > 0 ? logs[i]! / gross : 0 }));

  const gx = (d: number) => g.dayCloses?.[d]?.gx;
  const gxBase = gx(e.from - 1) ?? gx(e.from);
  const gxEnd = gx(e.to);
  const gxMove = gxBase !== undefined && gxEnd !== undefined && gxBase > 0 ? gxEnd / gxBase - 1 : null;

  const bars: { day: number; px: number }[] = [];
  for (let d = e.from - 1; d <= e.to; d++) {
    const px = g.dayCloses?.[d]?.px[assetId];
    if (px !== undefined) bars.push({ day: d, px });
  }

  const dominant = rows.reduce<DeskRow | null>((best, r) => (best === null || Math.abs(r.value) > Math.abs(best.value) ? r : best), null);
  const top = flow.reduce<DeskPool | null>((best, p) => (best === null || Math.abs(p.share) > Math.abs(best.share) ? p : best), null);
  const memo = textProvider.deskMemo({
    assetId, from: e.from, to: e.to, move: e.total,
    dominant: dominant !== null ? dominant.row : null,
    pool: top !== null && top.share !== 0 ? { id: top.pool, buying: top.share > 0 } : null,
  });

  return {
    no, assetId, from: e.from, to: e.to, move: e.total, gx: gxMove, rows, flow, memo,
    headlines: headlinesFor(g, assetId, e.from, e.to), bars,
  };
}

/** Run a desk query for a human player: the window is clamped to closed days, the dossier is kept as a file. */
export function deskQuery(g: GameState, p: Player, assetId: string, fromDay: number, toDay: number): CommandResult {
  if (!p.desk) return fail('unlock the Research Desk first');
  if (p.desk.lapsed) return fail('the Research Desk is locked: resume it first');
  if (rankIndex(p.rankId) < rankIndex(DESK.minRank)) return fail(`the Research Desk opens at ${RANKS[rankIndex(DESK.minRank)]!.name}`);
  const w = deskWindow(g);
  if (w.lastClosed === null) return fail('no day has closed yet');
  if (!Number.isFinite(fromDay) || !Number.isFinite(toDay)) return fail('choose two game days');
  const L = ensureLedger(g, p.id);
  if (!L) return fail('join the world first');
  const to = clampDay(Math.floor(toDay), w.firstDay, w.lastClosed);
  const from = clampDay(Math.floor(fromDay), w.firstDay, to);
  const no = (L.deskSeq ?? 0) + 1;
  let dossier: DeskDossier;
  try {
    dossier = dossierOf(g, assetId, from, to, no);
  } catch {
    return fail(`${assetId} has no closed days in that window`);
  }
  L.deskSeq = no;
  const file: DeskFile = { no, assetId, from: dossier.from, to: dossier.to, move: dossier.move, dossier };
  L.deskFiles = [file, ...(L.deskFiles ?? [])].slice(0, DESK.filesKeep);
  return ok(dossier);
}

/** A saved file's dossier. Readable while the desk is locked. */
export function deskFileOf(g: GameState, p: Player, no: number): CommandResult {
  const f = ledgerOf(g, p.id)?.deskFiles?.find((x) => x.no === no);
  if (!f) return fail('no such file');
  return ok(f.dossier);
}

/** The Files list the view carries: the summaries only, newest first. */
export function deskFileSummaries(g: GameState, pid: string): { no: number; assetId: string; from: number; to: number; move: number }[] {
  return (ledgerOf(g, pid)?.deskFiles ?? []).map((f) => ({ no: f.no, assetId: f.assetId, from: f.from, to: f.to, move: f.move }));
}
