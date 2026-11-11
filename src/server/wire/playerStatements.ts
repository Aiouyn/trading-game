// Player Wire statements (`soc.wire.post`, 15:625). A signed-in player posts a short STATEMENT about
// listed assets. The $500 fee, the public row, the daily cap, and the idempotency record commit in one
// auth-store save. 16:573: no direct price effect (no applyShock / openRumor / claim).
import { randomBytes } from "node:crypto";
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

export type WirePostErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "TEXT_EMPTY"
  | "TEXT_TOO_LONG"
  | "TEXT_FILTER"
  | "BAD_ASSET"
  | "INSUFFICIENT_CASH"
  | "DAY_CAP"
  | "IDEMPOTENCY_CONFLICT";

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

export interface PlayerWirePost {
  readonly id: string;
  readonly accountId: string;
  readonly handle: string;
  readonly text: string;
  readonly assetTags: readonly string[];
  readonly tick: number;
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

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const CONTROLS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const ABUSE_RE = new RegExp(`(?:${ABUSE_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");

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
  return EMAIL.test(text) || PHONE.test(text);
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

export function remainingPostsToday(posts: readonly PlayerWirePost[], accountId: string, tick: number): number {
  return Math.max(0, WIRE_POST_DAY_CAP - postsOnDay(posts, accountId, tick));
}

/** Missing or a non-array is an empty list (old stores, or a bad key that must not fail the auth store). */
export function parsePlayerWirePosts(raw: unknown): PlayerWirePost[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [];
  const out: PlayerWirePost[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const post = parsePlayerWirePost(row);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    out.push(post);
  }
  return out;
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
  return { id: o.id, accountId: o.accountId, handle: o.handle, text, assetTags, tick: o.tick };
}

export function parseWirePostIntents(raw: unknown): WirePostIntent[] {
  if (raw === undefined || raw === null || !Array.isArray(raw)) return [];
  const out: WirePostIntent[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.accountId !== "string" || typeof o.key !== "string" || typeof o.fingerprint !== "string") continue;
    if (o.result !== "ACCEPTED" && o.result !== "REJECTED") continue;
    const intent: WirePostIntent = {
      accountId: o.accountId,
      key: o.key,
      fingerprint: o.fingerprint,
      result: o.result,
      ...(typeof o.postId === "string" ? { postId: o.postId } : {}),
      ...(typeof o.rejectCode === "string" ? { rejectCode: o.rejectCode as WirePostErrorCode } : {}),
      ...(typeof o.status === "number" && Number.isInteger(o.status) ? { status: o.status } : {}),
    };
    out.push(intent);
  }
  return out;
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

export function playerPostToWireItem(post: PlayerWirePost): WireItem {
  const asset = ASSET_BY_ID[post.assetTags[0]!];
  const entities: WireItem["entities"] = [
    { kind: "actor", id: `player:${post.accountId}`, label: post.handle },
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
      authorId: post.accountId,
    },
    entities,
    tick: post.tick,
    breaking: false,
    causeEventIds: [],
    causeKey: WIRE_POST_CAUSE,
  };
}

export function mergePlayerStatements(items: readonly WireItem[], posts: readonly PlayerWirePost[]): WireItem[] {
  const have = new Set(items.map((i) => i.id));
  const extra = posts.filter((p) => !have.has(p.id)).map(playerPostToWireItem);
  return [...items, ...extra];
}

export function clonePlayerWirePost(p: PlayerWirePost): PlayerWirePost {
  return { ...p, assetTags: [...p.assetTags] };
}

export function cloneWirePostIntent(i: WirePostIntent): WirePostIntent {
  return { ...i };
}
