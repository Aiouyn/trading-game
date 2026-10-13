import { RIVAL_HIST_DAYS } from '@/engine';
import { ladderRungs, type LadderRung } from '@/content/rivalLadder';

/**
 * The rival ladder's funds (R-10-7): a fictional net worth path per fund, deterministic from the world seed and the fund's id.
 * A fund's log level is a mean-reverting walk around its anchor (its rank band's rung): x[d] = (1 - THETA) x[d-1] + SIGMA z[d],
 * with z drawn from the fund's own seeded stream, one draw per game day. The paths are pure functions of the seed and the
 * day: they read no engine state and write none, so no market, account or ledger moves on their account, and a world without
 * a player's board is unchanged. The board reads them and nothing else; a ladder fund's trades are never shown.
 */

const THETA = 0.02;
const SIGMA = 0.012;
/** the walks kept in memory at once (each is a day-indexed array; a world uses the same few seeds all along) */
const MAX_WALKS = 200;

interface Walk {
  /** the log deviation from the anchor, one entry per game day from day 0 */
  x: number[];
  /** the fund's own uniform stream */
  uniform: () => number;
  /** a Box-Muller spare normal, drawn in pairs */
  spare: number | null;
}

const walks = new Map<string, Walk>();

/** 32-bit FNV-1a: a stable hash of a string (the same on every platform). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded uniform stream on [0, 1). */
function streamOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(w: Walk): number {
  if (w.spare !== null) {
    const z = w.spare;
    w.spare = null;
    return z;
  }
  const u1 = Math.max(w.uniform(), 1e-12);
  const u2 = w.uniform();
  const r = Math.sqrt(-2 * Math.log(u1));
  w.spare = r * Math.sin(2 * Math.PI * u2);
  return r * Math.cos(2 * Math.PI * u2);
}

function walkOf(seed: string, fundId: string): Walk {
  const key = `${seed}|${fundId}`;
  let w = walks.get(key);
  if (!w) {
    if (walks.size >= MAX_WALKS) walks.clear();
    w = { x: [], uniform: streamOf(hash32(key)), spare: null };
    walks.set(key, w);
  }
  return w;
}

/** The log deviation of a fund from its anchor on a game day (day 0 is the anchor). */
function logDeviation(seed: string, fundId: string, day: number): number {
  const w = walkOf(seed, fundId);
  const d = Math.max(0, Math.floor(day));
  while (w.x.length <= d) {
    const n = w.x.length;
    w.x.push(n === 0 ? 0 : (1 - THETA) * w.x[n - 1]! + SIGMA * normal(w));
  }
  return w.x[d]!;
}

/** One ladder fund's standing on a day: its close, and its closes over the last quarter (oldest first). */
export interface LadderFund {
  id: string;
  name: string;
  band: string;
  equity: number;
  /** its equity on the day the player joined (the base of "since start") */
  joinEquity: number;
  /** the last RIVAL_HIST_DAYS closes, one per game day, ending today */
  hist: { day: number; equity: number }[];
}

/** Every ladder fund on `day`, lowest anchor first. `joinDay` is the day the player joined (the base of their change). */
export function ladderFunds(seed: string, day: number, joinDay: number): LadderFund[] {
  return ladderRungs().map((r: LadderRung) => {
    const equityOn = (d: number) => r.anchor * Math.exp(logDeviation(seed, r.id, d));
    const first = Math.max(0, day - RIVAL_HIST_DAYS + 1);
    const hist: { day: number; equity: number }[] = [];
    for (let d = first; d <= day; d++) hist.push({ day: d, equity: equityOn(d) });
    return { id: r.id, name: r.name, band: r.band, equity: equityOn(day), joinEquity: equityOn(Math.min(joinDay, day)), hist };
  });
}
