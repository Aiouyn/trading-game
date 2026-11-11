// 15:625 §3.10.4 / 16:573: 5-game-day TRUE/FALSE/OPINION resolution for player statements.
// No price effect, no cash movement. OPINION (no checkable claim) never becomes TRUE/FALSE.
import { TICKS_PER_DAY } from "@/server/market/meme";
import { publicHandleId, type PlayerWirePost } from "./playerStatements";

export const STATEMENT_RESOLVE_GAME_DAYS = 5;
export const STATEMENT_RESOLVE_TICKS = STATEMENT_RESOLVE_GAME_DAYS * TICKS_PER_DAY;

export type StatementVerdict = "UNRESOLVED" | "TRUE" | "FALSE" | "OPINION";
export type StatementClaimDir = "UP" | "DOWN";

export const UP_CLAIM_WORDS = [
  "up", "rise", "rises", "rising", "rose", "gain", "gains", "rally", "rallies",
  "bull", "bullish", "higher", "upside", "moon", "moons", "pump", "climb", "climbs",
  "hausse", "haussier", "monte", "monter", "progressera",
] as const;

export const DOWN_CLAIM_WORDS = [
  "down", "fall", "falls", "falling", "fell", "drop", "drops", "dropped", "decline",
  "sink", "sell", "bear", "bearish", "lower", "downside", "dump",
  "baisse", "baissier", "chute", "chuter",
] as const;

const UP = new Set<string>(UP_CLAIM_WORDS);
const DOWN = new Set<string>(DOWN_CLAIM_WORDS);
const DEC = /^-?\d+(\.\d+)?$/;

/** Closed V1 lexicon after NFKC + lower. Both sides, or neither → not checkable. No general negation. */
export function classifyStatementClaim(text: string): StatementClaimDir | null {
  const tokens = text.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let up = false;
  let down = false;
  for (const tok of tokens) {
    if (UP.has(tok)) up = true;
    if (DOWN.has(tok)) down = true;
  }
  if (up && !down) return "UP";
  if (down && !up) return "DOWN";
  return null;
}

export function statementDueTick(postTick: number): number {
  return postTick + STATEMENT_RESOLVE_TICKS;
}

export function isDecPrice(s: unknown): s is string {
  return typeof s === "string" && DEC.test(s);
}

export function marksFromTicker(rows: Record<string, { last?: string } | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, row] of Object.entries(rows)) {
    if (row && isDecPrice(row.last)) out[id] = row.last;
  }
  return out;
}

export function snapshotMarks(assetTags: readonly string[], marks: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const id of assetTags) {
    if (!isDecPrice(marks[id])) return undefined;
    out[id] = marks[id]!;
  }
  return out;
}

function cmpDec(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return 0;
  if (na === nb) return 0;
  return na > nb ? 1 : -1;
}

function sameMarks(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

/** Apply classification and, when due, the engine-mark comparison. Frozen verdicts are returned as-is. */
export function resolvePlayerWirePost(
  post: PlayerWirePost,
  nowTick: number,
  liveMarks: Record<string, string>,
): PlayerWirePost {
  if (post.verdict === "TRUE" || post.verdict === "FALSE" || post.verdict === "OPINION") return post;

  const dir = post.claimDir ?? classifyStatementClaim(post.text);
  const snap = post.marksAtPost ?? undefined;
  const complete = dir !== null && snap !== undefined && post.assetTags.every((id) => isDecPrice(snap[id]));

  if (!complete) {
    return { ...post, verdict: "OPINION", resolvedTick: nowTick };
  }

  let next: PlayerWirePost = post;
  if (post.claimDir !== dir || !sameMarks(post.marksAtPost, snap)) {
    next = { ...post, claimDir: dir, marksAtPost: snap };
  }
  if (nowTick < statementDueTick(post.tick)) return next;

  const ok = post.assetTags.every((id) => {
    const from = snap[id];
    const to = liveMarks[id];
    if (!isDecPrice(from) || !isDecPrice(to)) return false;
    const c = cmpDec(to, from);
    return dir === "UP" ? c > 0 : c < 0;
  });
  return { ...next, verdict: ok ? "TRUE" : "FALSE", resolvedTick: nowTick };
}

export function trackRecordByPublicId(
  posts: readonly PlayerWirePost[],
): Map<string, { hits: number; resolved: number }> {
  const out = new Map<string, { hits: number; resolved: number }>();
  for (const p of posts) {
    if (p.verdict !== "TRUE" && p.verdict !== "FALSE") continue;
    const id = publicHandleId(p.accountId);
    const rec = out.get(id) ?? { hits: 0, resolved: 0 };
    rec.resolved += 1;
    if (p.verdict === "TRUE") rec.hits += 1;
    out.set(id, rec);
  }
  return out;
}

export function verdictSlot(verdict: StatementVerdict | undefined): "unresolved" | "true" | "false" | "opinion" {
  if (verdict === "TRUE") return "true";
  if (verdict === "FALSE") return "false";
  if (verdict === "OPINION") return "opinion";
  return "unresolved";
}
