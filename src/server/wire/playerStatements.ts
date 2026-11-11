// Player Wire statements (`soc.wire.post`, 15:625). A signed-in player posts a short STATEMENT about
// listed assets. The $500 fee, the public row, the daily cap, and the idempotency record commit in one
// auth-store save. 16:573: no direct price effect (no applyShock / openRumor / claim).
import { createHash, randomBytes } from "node:crypto";
import { ASSET_BY_ID } from "@/market/catalog";
import { dayOfTick } from "@/server/market/rumorFarm";
import { reservedCashCents } from "@/server/broker/execution";
import { ABUSE_TERMS } from "@/server/launchpad/moderate";
import type { PlayerPrivateRecord } from "@/server/auth/types";
import type { WireItem } from "@/shell/contracts/channels";

export const WIRE_POST_FEE_CENTS = 50_000;
export const WIRE_POST_DAY_CAP = 3;
export const WIRE_POST_MAX_CHARS = 280;
export const WIRE_POST_MAX_ASSETS = 3;
export const WIRE_POST_ID_PREFIX = "w-p-";
export const WIRE_POST_HEADLINE = "wire.statement.player";
export const WIRE_POST_CAUSE = "wire.cause.player-statement";
/** Raw POST /api/wire body cap: above a 280-char statement + key, far below a 200k payload. */
export const WIRE_POST_MAX_BODY_BYTES = 8_192;


export type WirePostErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "TEXT_EMPTY"
  | "TEXT_TOO_LONG"
  | "TEXT_FILTER"
  | "BAD_ASSET"
  | "INSUFFICIENT_CASH"
  | "DAY_CAP"
  | "IDEMPOTENCY_CONFLICT"
  | "STORED_UNREADABLE"
  | "BODY_TOO_LARGE";

export class WirePostError extends Error {
  readonly code: WirePostErrorCode;
  readonly status: number;

  constructor(code: WirePostErrorCode, message: string, status: number) {
    super(message);
    this.name = "WirePostError";
    this.code = code;
    this.status = status;
  }
}

export type StatementVerdict = "UNRESOLVED" | "TRUE" | "FALSE" | "OPINION";
export type StatementClaimDir = "UP" | "DOWN";

export interface PlayerWirePost {
  readonly id: string;
  readonly accountId: string;
  readonly handle: string;
  readonly text: string;
  readonly assetTags: readonly string[];
  readonly tick: number;
  readonly verdict?: StatementVerdict;
  readonly claimDir?: StatementClaimDir;
  readonly marksAtPost?: Readonly<Record<string, string>>;
  readonly resolvedTick?: number;
}

export interface WirePostIntent {
  readonly accountId: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly result: "ACCEPTED" | "REJECTED";
  readonly postId?: string;
  readonly rejectCode?: WirePostErrorCode;
  readonly status?: number;
}

/** A wirePosts / wirePostIntents row that could not be loaded. Kept verbatim; never a silent drop. */
export interface QuarantinedWireRow {
  readonly reason: string;
  readonly row: unknown;
  readonly accountId?: string;
  readonly key?: string;
  readonly postId?: string;
}

/** Stable public poster id: not the acc_ account id, stable if the handle later changes. */
export function publicHandleId(accountId: string): string {
  const hex = createHash("sha256").update(`wire-public:${accountId}`).digest("hex").slice(0, 16);
  return `ph_${hex}`;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const CONTROLS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const FORMAT_CHARS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const DIGIT_WORD_RE = /\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)(?:\s+(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)){6,}\b/gi;
const ABUSE_RE = new RegExp(`(?:${ABUSE_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");

/** Detection-only fold: NFKC, strip ZWSP/format chars, fold obfuscated at-signs and digit words. */
export function foldForPersonalData(text: string): string {
  let s = text.normalize("NFKC").replace(FORMAT_CHARS, "").replace(CONTROLS, "");
  s = s.replace(DIGIT_WORD_RE, (m) => m.split(/\s+/).map((w) => DIGIT_WORDS[w.toLowerCase()] ?? "").join(""));
  s = s.replace(/[\[\(\{]\s*at\s*[\]\)\}]/gi, "@");
  s = s.replace(/\s+at\s+/gi, "@");
  s = s.replace(/\s*@\s*/g, "@");
  return s;
}

export function spendableCashCents(rec: PlayerPrivateRecord): number {
  return rec.cashCents - reservedCashCents(rec);
}

export function newWirePostId(): string {
  return `${WIRE_POST_ID_PREFIX}${randomBytes(8).toString("hex")}`;
}

export function sanitizeWireText(raw: string): string {
  const nfc = raw.normalize("NFC").replace(/\s*\n\s*/g, " ").replace(CONTROLS, "").replace(/\s+/g, " ").trim();
  return nfc.replace(ABUSE_RE, (m) => "*".repeat(m.length));
}

export function codePointLength(text: string): number {
  return [...text].length;
}

export function hasPersonalData(text: string): boolean {
  const folded = foldForPersonalData(text);
  return EMAIL.test(folded) || PHONE.test(folded) || EMAIL.test(text) || PHONE.test(text);
}

export function listedAssetId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ASSET_BY_ID, id);
}

export function fingerprintPost(text: string, assetTags: readonly string[]): string {
  return `${text}\0${[...assetTags].sort().join(",")}`;
}

export function postsOnDay(posts: readonly PlayerWirePost[], accountId: string, tick: number): number {
  const day = dayOfTick(tick);
  let n = 0;
  for (const p of posts) if (p.accountId === accountId && dayOfTick(p.tick) === day) n += 1;
  return n;
}

function tickFromUnknownRow(row: unknown): number | undefined {
  if (!row || typeof row !== "object") return undefined;
  const t = (row as Record<string, unknown>).tick;
  if (typeof t === "number" && Number.isInteger(t) && t >= 0) return t;
  return undefined;
}

function quarantineAccountId(q: QuarantinedWireRow): string | undefined {
  if (typeof q.accountId === "string" && q.accountId.length > 0) return q.accountId;
  if (q.row && typeof q.row === "object") {
    const a = (q.row as Record<string, unknown>).accountId;
    if (typeof a === "string" && a.length > 0) return a;
  }
  return undefined;
}

function quarantinePostId(q: QuarantinedWireRow): string | undefined {
  if (typeof q.postId === "string" && q.postId.length > 0) return q.postId;
  if (q.row && typeof q.row === "object") {
    const id = (q.row as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return undefined;
}

function countsTowardDay(row: unknown, day: number): boolean {
  const t = tickFromUnknownRow(row);
  return t === undefined || dayOfTick(t) === day;
}

/**
 * Readable posts today, plus quarantined paid rows (and unpaired ACCEPTED intents) for this account.
 * An unreadable tick fails closed and counts toward `tick`'s day so a quarantined payment cannot free a slot.
 * Each paid slot is counted once.
 */
export function paidPostsOnDay(
  posts: readonly PlayerWirePost[],
  accountId: string,
  tick: number,
  quarantinedPosts: readonly QuarantinedWireRow[] = [],
  intents: readonly WirePostIntent[] = [],
): number {
  const day = dayOfTick(tick);
  let n = postsOnDay(posts, accountId, tick);
  const readableIds = new Set(posts.filter((p) => p.accountId === accountId).map((p) => p.id));
  const unused = quarantinedPosts.filter((q) => quarantineAccountId(q) === accountId);
  const used = new Set<QuarantinedWireRow>();

  const takeQuarantine = (postId: string | undefined): QuarantinedWireRow | undefined => {
    if (postId) {
      const hit = unused.find((q) => !used.has(q) && quarantinePostId(q) === postId);
      if (hit) return hit;
    }
    return unused.find((q) => !used.has(q));
  };

  for (const intent of intents) {
    if (intent.accountId !== accountId || intent.result !== "ACCEPTED") continue;
    if (intent.postId && readableIds.has(intent.postId)) continue;
    const q = takeQuarantine(intent.postId);
    if (q) {
      used.add(q);
      if (countsTowardDay(q.row, day)) n += 1;
    } else {
      n += 1;
    }
  }

  for (const q of unused) {
    if (used.has(q)) continue;
    if (countsTowardDay(q.row, day)) n += 1;
  }
  return n;
}

export function remainingPostsToday(
  posts: readonly PlayerWirePost[],
  accountId: string,
  tick: number,
  quarantinedPosts: readonly QuarantinedWireRow[] = [],
  intents: readonly WirePostIntent[] = [],
): number {
  return Math.max(0, WIRE_POST_DAY_CAP - paidPostsOnDay(posts, accountId, tick, quarantinedPosts, intents));
}

/** Missing or a non-array is an empty list (old stores, or a bad key that must not fail the auth store). */
export function parsePlayerWirePosts(raw: unknown): PlayerWirePost[] {
  return loadPlayerWirePosts(raw).posts;
}

export function loadPlayerWirePosts(raw: unknown): { posts: PlayerWirePost[]; quarantined: QuarantinedWireRow[] } {
  if (raw === undefined || raw === null) return { posts: [], quarantined: [] };
  if (!Array.isArray(raw)) return { posts: [], quarantined: [{ reason: "wirePosts is not an array", row: raw }] };
  const posts: PlayerWirePost[] = [];
  const quarantined: QuarantinedWireRow[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const post = parsePlayerWirePost(row);
    if (!post) {
      const o = row && typeof row === "object" ? (row as Record<string, unknown>) : undefined;
      quarantined.push({
        reason: "malformed wire post row",
        row,
        ...(typeof o?.accountId === "string" ? { accountId: o.accountId } : {}),
        ...(typeof o?.id === "string" ? { postId: o.id } : {}),
      });
      continue;
    }
    if (seen.has(post.id)) {
      quarantined.push({ reason: "duplicate wire post id", row, accountId: post.accountId, postId: post.id });
      continue;
    }
    seen.add(post.id);
    posts.push(post);
  }
  return { posts, quarantined };
}

export function parsePlayerWirePost(row: unknown): PlayerWirePost | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.startsWith(WIRE_POST_ID_PREFIX) || o.id.length > 64) return null;
  if (typeof o.accountId !== "string" || o.accountId.length < 1 || o.accountId.length > 128) return null;
  if (typeof o.handle !== "string" || o.handle.length < 1 || o.handle.length > 32) return null;
  if (typeof o.text !== "string") return null;
  const text = sanitizeWireText(o.text);
  if (text.length === 0 || codePointLength(text) > WIRE_POST_MAX_CHARS) return null;
  if (hasPersonalData(text) || hasPersonalData(o.text)) return null;
  if (!Array.isArray(o.assetTags) || o.assetTags.length < 1 || o.assetTags.length > WIRE_POST_MAX_ASSETS) return null;
  const assetTags: string[] = [];
  for (const tag of o.assetTags) {
    if (typeof tag !== "string" || !listedAssetId(tag) || assetTags.includes(tag)) return null;
    assetTags.push(tag);
  }
  if (typeof o.tick !== "number" || !Number.isInteger(o.tick) || o.tick < 0) return null;
  const verdict = parseOptionalVerdict(o.verdict);
  if (o.verdict !== undefined && verdict === undefined) return null;
  const claimDir = parseOptionalClaimDir(o.claimDir);
  if (o.claimDir !== undefined && claimDir === undefined) return null;
  const marksAtPost = parseOptionalMarks(o.marksAtPost);
  if (o.marksAtPost !== undefined && marksAtPost === undefined) return null;
  const resolvedTick = o.resolvedTick;
  if (resolvedTick !== undefined && (typeof resolvedTick !== "number" || !Number.isInteger(resolvedTick) || resolvedTick < 0)) return null;
  return {
    id: o.id, accountId: o.accountId, handle: o.handle, text, assetTags, tick: o.tick,
    ...(verdict ? { verdict } : {}),
    ...(claimDir ? { claimDir } : {}),
    ...(marksAtPost ? { marksAtPost } : {}),
    ...(resolvedTick !== undefined ? { resolvedTick } : {}),
  };
}

function parseOptionalVerdict(raw: unknown): StatementVerdict | undefined {
  if (raw === "UNRESOLVED" || raw === "TRUE" || raw === "FALSE" || raw === "OPINION") return raw;
  return undefined;
}

function parseOptionalClaimDir(raw: unknown): StatementClaimDir | undefined {
  if (raw === "UP" || raw === "DOWN") return raw;
  return undefined;
}

function parseOptionalMarks(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !listedAssetId(k) || typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v)) return undefined;
    out[k] = v;
  }
  return out;
}

export function parseWirePostIntents(raw: unknown): WirePostIntent[] {
  return loadWirePostIntents(raw).intents;
}

export function loadWirePostIntents(raw: unknown): { intents: WirePostIntent[]; quarantined: QuarantinedWireRow[] } {
  if (raw === undefined || raw === null) return { intents: [], quarantined: [] };
  if (!Array.isArray(raw)) return { intents: [], quarantined: [{ reason: "wirePostIntents is not an array", row: raw }] };
  const intents: WirePostIntent[] = [];
  const quarantined: QuarantinedWireRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      quarantined.push({ reason: "malformed wire post intent", row });
      continue;
    }
    const o = row as Record<string, unknown>;
    const accountId = typeof o.accountId === "string" ? o.accountId : undefined;
    const key = typeof o.key === "string" ? o.key : undefined;
    if (!accountId || !key || typeof o.fingerprint !== "string" || (o.result !== "ACCEPTED" && o.result !== "REJECTED")) {
      quarantined.push({
        reason: "malformed wire post intent",
        row,
        ...(accountId ? { accountId } : {}),
        ...(key ? { key } : {}),
        ...(typeof o.postId === "string" ? { postId: o.postId } : {}),
      });
      continue;
    }
    const intent: WirePostIntent = {
      accountId,
      key,
      fingerprint: o.fingerprint,
      result: o.result,
      ...(typeof o.postId === "string" ? { postId: o.postId } : {}),
      ...(typeof o.rejectCode === "string" ? { rejectCode: o.rejectCode as WirePostErrorCode } : {}),
      ...(typeof o.status === "number" && Number.isInteger(o.status) ? { status: o.status } : {}),
    };
    intents.push(intent);
  }
  return { intents, quarantined };
}

export function decidePostText(raw: unknown, assetTagsRaw: unknown): { text: string; assetTags: string[] } {
  if (typeof raw !== "string") throw new WirePostError("BAD_REQUEST", "text must be a string.", 400);
  const text = sanitizeWireText(raw);
  if (text.length === 0) throw new WirePostError("TEXT_EMPTY", "Statement text is empty.", 400);
  if (codePointLength(text) > WIRE_POST_MAX_CHARS) {
    throw new WirePostError("TEXT_TOO_LONG", `Statement must be at most ${WIRE_POST_MAX_CHARS} characters.`, 400);
  }
  if (hasPersonalData(raw) || hasPersonalData(text)) {
    throw new WirePostError("TEXT_FILTER", "Statement cannot include an email or phone number.", 400);
  }
  if (!Array.isArray(assetTagsRaw) || assetTagsRaw.length < 1 || assetTagsRaw.length > WIRE_POST_MAX_ASSETS) {
    throw new WirePostError("BAD_ASSET", "Provide 1–3 listed asset tags.", 400);
  }
  const assetTags: string[] = [];
  for (const tag of assetTagsRaw) {
    if (typeof tag !== "string" || !listedAssetId(tag)) throw new WirePostError("BAD_ASSET", "Unknown or unlisted asset tag.", 400);
    if (assetTags.includes(tag)) throw new WirePostError("BAD_ASSET", "Duplicate asset tag.", 400);
    assetTags.push(tag);
  }
  return { text, assetTags };
}

function verdictSlot(verdict: StatementVerdict | undefined): "unresolved" | "true" | "false" | "opinion" {
  if (verdict === "TRUE") return "true";
  if (verdict === "FALSE") return "false";
  if (verdict === "OPINION") return "opinion";
  return "unresolved";
}

export function playerPostToWireItem(
  post: PlayerWirePost,
  record?: { hits: number; resolved: number },
): WireItem {
  const asset = ASSET_BY_ID[post.assetTags[0]!];
  const publicId = publicHandleId(post.accountId);
  const entities: WireItem["entities"] = [
    { kind: "actor", id: `player:${publicId}`, label: post.handle },
    ...post.assetTags.map((id) => {
      const a = ASSET_BY_ID[id]!;
      return { kind: "asset", id, label: a.name };
    }),
  ];
  return {
    id: post.id,
    kind: "STATEMENT",
    headlineKey: WIRE_POST_HEADLINE,
    slots: {
      handle: post.handle,
      text: post.text,
      asset: asset?.ticker ?? post.assetTags[0]!,
      company: asset?.name ?? post.assetTags[0]!,
      assets: post.assetTags.join(", "),
      publicId,
      player: "1",
      verdict: verdictSlot(post.verdict),
    },
    entities,
    tick: post.tick,
    breaking: false,
    causeEventIds: [],
    causeKey: WIRE_POST_CAUSE,
    ...(record && record.resolved > 0 ? { sourceRecord: { hits: record.hits, resolved: record.resolved } } : {}),
  };
}

export function isPlayerStatement(item: WireItem): boolean {
  return item.headlineKey === WIRE_POST_HEADLINE || item.slots?.player === "1";
}

export function mergePlayerStatements(items: readonly WireItem[], posts: readonly PlayerWirePost[]): WireItem[] {
  const records = new Map<string, { hits: number; resolved: number }>();
  for (const p of posts) {
    if (p.verdict !== "TRUE" && p.verdict !== "FALSE") continue;
    const id = publicHandleId(p.accountId);
    const rec = records.get(id) ?? { hits: 0, resolved: 0 };
    rec.resolved += 1;
    if (p.verdict === "TRUE") rec.hits += 1;
    records.set(id, rec);
  }
  const have = new Set(items.map((i) => i.id));
  const extra = posts.filter((p) => !have.has(p.id)).map((p) => playerPostToWireItem(p, records.get(publicHandleId(p.accountId))));
  return [...items, ...extra];
}

export function clonePlayerWirePost(p: PlayerWirePost): PlayerWirePost {
  return { ...p, assetTags: [...p.assetTags], ...(p.marksAtPost ? { marksAtPost: { ...p.marksAtPost } } : {}) };
}

export function cloneWirePostIntent(i: WirePostIntent): WirePostIntent {
  return { ...i };
}
