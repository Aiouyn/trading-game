import { createHash } from 'node:crypto';
import type { WireItem } from '../../src/world/types';
import type { TextRoleId } from './config';

/**
 * The public facts an item is written from (lead-phase7.md P7-2): numbers, names and the world's own line, nothing else. A
 * role never sees a holding, a handle of another player or any hidden value, because the item it reads is a wire story.
 */
export interface ItemFacts {
  /** the world's wire kind (macro, move, earnings, ...) */
  kind: string;
  /** the Wire's tag (for example EARNINGS) */
  tag: string;
  /** the world's own English line: the facts in words */
  text: string;
  tone: string;
  assetId?: string;
  /** the message descriptor the template is built from, when the world wrote one (key and the vars it filled) */
  msg?: { key: string; vars?: Record<string, string | number> };
}

export interface EnrichItem {
  /** the item's id in the world (WireItem.id): the overlay key */
  id: string;
  role: TextRoleId;
  facts: ItemFacts;
}

/**
 * The wire kinds that are news for the newsroom role. 'launchpad' is not one of them: its lines name other players (the
 * creator, the plaintiff, the defendant) in their vars and text.
 */
const NEWSROOM_KINDS = new Set<string>([
  'macro', 'rates', 'move', 'earnings', 'preview', 'rumor', 'halt', 'reopen', 'listing', 'index', 'squeeze', 'world',
]);

/** Every string value in a facts object, lower-cased. Keys are fixed names and are not searched. */
export function stringValuesOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v.toLowerCase());
  else if (Array.isArray(v)) v.forEach((x) => stringValuesOf(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => stringValuesOf(x, out));
  return out;
}

/**
 * The enrichable item of a wire line, or null when no role takes it (player-private kinds never reach here). When the server
 * passes the player handles, an item whose facts mention any of them (a case-insensitive substring of a fact value) is dropped,
 * so a handle of another player never reaches a prompt or a cache key.
 */
export function enrichItemOf(item: WireItem, handles?: ReadonlySet<string>): EnrichItem | null {
  if (!NEWSROOM_KINDS.has(item.kind)) return null;
  const facts: ItemFacts = { kind: item.kind, tag: item.tag, text: item.text, tone: item.tone };
  if (item.assetId) facts.assetId = item.assetId;
  if (item.msg) facts.msg = item.msg.vars ? { key: item.msg.key, vars: item.msg.vars } : { key: item.msg.key };
  if (handles && handles.size > 0) {
    const values = stringValuesOf(facts);
    for (const h of handles) {
      const needle = h.trim().toLowerCase();
      if (needle && values.some((v) => v.includes(needle))) return null;
    }
  }
  return { id: item.id, role: 'newsroom', facts };
}

/** A stable JSON form: object keys sorted, so the same facts always give the same text (and the same hash). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort().filter((k) => o[k] !== undefined);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/** The cache key part for a set of facts: a sha256 of their canonical form. */
export function factsHash(facts: unknown): string {
  return createHash('sha256').update(canonicalJson(facts)).digest('hex');
}

export const SYSTEM_PROMPT = [
  'You write one short market news line in English and the same line in French.',
  'Use only the numbers, names and facts given in FACTS, copied exactly. Invent nothing and add no number.',
  'No advice and no forecast: no should, will, expect, likely, buy or sell, and no recommendation.',
  'Reply with JSON only, exactly {"en": "...", "fr": "..."}, each line at most 200 characters.',
].join(' ');

/** The user message for an item: the role and its public facts (JSON), nothing else. */
export function promptFor(item: EnrichItem): string {
  return `ROLE: ${item.role}\nFACTS: ${canonicalJson(item.facts)}`;
}

/** Digit groups as the client would print them: thousands separators dropped, a French decimal comma read as a point. */
const NUM_RE = /\d+(?:[.,]\d+)*/g;
export function normNum(token: string): string {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) return token.replace(/,/g, '');
  if (/^\d+,\d+$/.test(token)) return token.replace(',', '.');
  return token;
}

/** Every number a text prints, normalized. A French thousands space is read as a thousands separator first. */
export function numbersIn(text: string): string[] {
  return [...text.replace(/(\d) (?=\d{3}(?!\d))/g, '$1').matchAll(NUM_RE)].map((m) => normNum(m[0]));
}

/** The numbers the facts allow: every figure in their values and their printed strings, as the client would print them. */
export function allowedNumbers(facts: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'number') {
      out.add(normNum(String(v)));
      out.add(normNum(v.toFixed(2)));
      out.add(normNum(v.toFixed(0)));
    } else if (typeof v === 'string') {
      for (const n of numbersIn(v)) out.add(n);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}
