import { sha256Concat } from './crypto/sha256';
import { u32be, u48be } from './crypto/hex';
import type { InvariantCtx, InvariantImpl, InvariantOutcome } from './invariants';
import { SortedMap, SortedSet } from './sorted';
import { EngineFault } from './types';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Crockford base32, 5 bits per char, MSB first, trailing bits zero-padded. */
export function base32Crockford(bytes: Uint8Array): string {
  let out = '', acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += CROCKFORD[(acc >> bits) & 31]!; }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD[(acc << (5 - bits)) & 31]!;
  return out;
}

export const ID_KIND_RE = /^[a-z]{2,5}$/;
export const FACT_ID_LOG = 'core.ids.log';          // rows { id, kind, seq, partitionId }
export const FACT_ID_WRITTEN = 'core.ids.written';  // rows { id, table } supplied by the engine
/** E-70/E-73 AC-02-09-SALT-FACT: the T20A-01 InvariantCtx has no salt member, so the engine supplies the world seed's PUBLIC salt
 *  (32 bytes, never a secret) as this fact. Missing with id-log rows -> fail; empty log -> pass. */
export const FACT_ID_SALT = 'core.ids.worldSeedPublicSalt';   // Uint8Array

function digestId(salt: Uint8Array, partitionId: string, tick: number, kind: string, seq: number): string {
  const tickB = u48be(tick);
  const d = sha256Concat('TYC/id', salt, kind, tickB, partitionId, u32be(seq));
  const raw = new Uint8Array(16); raw.set(tickB); raw.set(d.subarray(0, 10), 6);
  return `${kind}_${base32Crockford(raw)}`;
}

/** One per (partition, tick). */
export class IdFactory {
  private seqs = new SortedMap<string, number>();
  private created: { id: string; kind: string; seq: number }[] = [];
  constructor(private readonly worldSeedPublicSalt: Uint8Array, private readonly partitionId: string, private readonly tick: number) {}
  newId(kind: string): string {
    if (!ID_KIND_RE.test(kind)) throw new EngineFault('I0.id_kind', `invalid id kind '${kind}'`);
    const seq = this.seqs.get(kind) ?? 0; this.seqs.set(kind, seq + 1);
    const id = digestId(this.worldSeedPublicSalt, this.partitionId, this.tick, kind, seq);
    this.created.push({ id, kind, seq });
    return id;
  }
  log(): { id: string; kind: string; seq: number }[] { return this.created.map((r) => ({ ...r })); }
}

/** Decode the creation tick embedded in an id (first 48 bits of the suffix). */
export function idTick(id: string): number {
  const suffix = id.slice(id.indexOf('_') + 1);
  if (suffix.length !== 26) throw new EngineFault('I0.id_format', `bad id '${id}'`);
  let v = 0n;
  for (const ch of suffix.slice(0, 10)) { const i = CROCKFORD.indexOf(ch); if (i < 0) throw new EngineFault('I0.id_format', `bad id '${id}'`); v = (v << 5n) | BigInt(i); }
  return Number(v >> 2n);
}

interface IdLogRow { id: string; kind: string; seq: number; partitionId: string }
interface IdWrittenRow { id: string; table: string }

export const INV_ENG_003: InvariantImpl = {
  def: { id: 'INV-ENG-003', module: '02', scope: 'TICK', severity: 'FATAL', costClass: 'O_TOUCHED', sampling: 'NEVER', sinceEngineVersion: '1.0.0',
    description: 'ID determinism: every id created this tick equals hash(worldSeed, kind, creationTick, sequence) (00 §3.2), and no id collides with an existing id' },
  check(ctx: InvariantCtx): InvariantOutcome {
    const seen = new SortedSet<string>(), bad: string[] = [];
    const log = ctx.facts.get<readonly IdLogRow[]>(FACT_ID_LOG) ?? [], salt = ctx.facts.get<Uint8Array>(FACT_ID_SALT);
    if (log.length > 0 && salt === undefined) return { ok: false, entityIds: log.map((r) => r.id), observed: `fact ${FACT_ID_SALT} missing`, expected: 'the engine supplies the public salt' };
    if (log.length > 0 && !(salt instanceof Uint8Array && salt.length === 32))
      return { ok: false, entityIds: log.map((r) => r.id), observed: `fact ${FACT_ID_SALT} is not a 32-byte salt`, expected: 'the 32-byte world-seed public salt only' };
    for (const r of log) {
      const ok = ID_KIND_RE.test(r.kind) && digestId(salt!, r.partitionId, ctx.tick, r.kind, r.seq) === r.id;
      if (!ok || seen.has(r.id)) bad.push(r.id);
      seen.add(r.id);
    }
    for (const w of ctx.facts.get<readonly IdWrittenRow[]>(FACT_ID_WRITTEN) ?? []) if (ctx.pre.get(w.table, w.id) !== undefined) bad.push(w.id);
    if (bad.length === 0) return { ok: true };
    return { ok: false, entityIds: bad, observed: `${bad.length} invalid, duplicate or pre-existing id(s)`, expected: 'every new id recomputes, is unique and is new' };
  },
};
