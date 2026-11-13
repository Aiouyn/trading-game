// Content loader. Content lives in plain-text files under sim/content/, separate from the engine,
// the way Dwarf Fortress keeps its raws:
//
//   [OBJECT:GOOD]            the type of every object in this file
//   [GOOD:STEEL]             starts an object; the token repeats the type
//   [NAME:steel]
//   [INPUT:IRON_ORE:1.4]     a tag with arguments; tags may repeat
//   [PERISHABLE]             a flag
//
// Anything outside brackets is a comment. No dependencies, no build step.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Raw { type: string; id: string; file: string; line: number; tags: { tag: string; args: string[]; line: number }[] }

export function parseRaws(text: string, file: string): Raw[] {
  const out: Raw[] = [];
  let type = '', cur: Raw | undefined;
  const re = /\[([^\]]*)\]/g;
  text.split('\n').forEach((lineText, n) => {
    const line = n + 1;
    for (const m of lineText.matchAll(re)) {
      const [tag, ...args] = m[1].split(':').map((x) => x.trim());
      if (!tag) throw new Error(`${file}:${line}: empty tag`);
      if (tag === 'OBJECT') { type = args[0]; if (!type) throw new Error(`${file}:${line}: [OBJECT] needs a type`); continue; }
      if (!type) throw new Error(`${file}:${line}: [${tag}] before any [OBJECT:...]`);
      if (tag === type) {
        if (!args[0]) throw new Error(`${file}:${line}: [${tag}] needs an id`);
        cur = { type, id: args[0], file, line, tags: [] }; out.push(cur); continue;
      }
      if (!cur) throw new Error(`${file}:${line}: [${tag}] before the first [${type}:ID]`);
      cur.tags.push({ tag, args, line });
    }
  });
  return out;
}

export function loadRaws(dir: string): Raw[] {
  const out: Raw[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) out.push(...parseRaws(readFileSync(join(dir, f), 'utf8'), f));
  const seen = new Map<string, Raw>();
  for (const r of out) {
    const k = r.type + ':' + r.id, prev = seen.get(k);
    if (prev) throw new Error(`${r.file}:${r.line}: ${k} already defined at ${prev.file}:${prev.line}`);
    seen.set(k, r);
  }
  return out;
}

/** Typed access to one object's tags, with errors that name the file and line. */
export class RawReader {
  raw: Raw;
  constructor(raw: Raw) { this.raw = raw; }
  where(line = this.raw.line): string { return `${this.raw.file}:${line} (${this.raw.type}:${this.raw.id})`; }
  has(tag: string): boolean { return this.raw.tags.some((t) => t.tag === tag); }
  all(tag: string): string[][] { return this.raw.tags.filter((t) => t.tag === tag).map((t) => t.args); }
  str(tag: string, def?: string): string {
    const t = this.raw.tags.find((x) => x.tag === tag);
    if (!t) { if (def !== undefined) return def; throw new Error(`${this.where()}: missing [${tag}]`); }
    return t.args.join(':');
  }
  num(tag: string, def?: number): number {
    const t = this.raw.tags.find((x) => x.tag === tag);
    if (!t) { if (def !== undefined) return def; throw new Error(`${this.where()}: missing [${tag}]`); }
    const v = Number(t.args[0]);
    if (!Number.isFinite(v)) throw new Error(`${this.where(t.line)}: [${tag}] needs a number, got '${t.args[0]}'`);
    return v;
  }
  /** Repeated [TAG:KEY:number] lines as a map. */
  pairs(tag: string): Record<string, number> {
    const o: Record<string, number> = {};
    for (const t of this.raw.tags.filter((x) => x.tag === tag)) {
      const v = Number(t.args[1]);
      if (!t.args[0] || !Number.isFinite(v)) throw new Error(`${this.where(t.line)}: [${tag}:KEY:number] expected`);
      o[t.args[0]] = (o[t.args[0]] ?? 0) + v;
    }
    return o;
  }
}
