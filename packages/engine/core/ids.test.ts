import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FACT_ID_LOG, FACT_ID_WRITTEN, ID_KIND_RE, IdFactory, idTick, INV_ENG_003, FACT_ID_SALT, merkleProof, merkleRoot, toHex, utf8, verifyMerkleProof, type InvariantCtx, type TruthStoreRead } from './index';

// independent straight-line implementation (node:crypto + BigInt base32)
function expectedId(salt: Buffer, partition: string, tick: number, kind: string, seq: number): string {
  const t = Buffer.alloc(6); t.writeUIntBE(tick, 0, 6); const s = Buffer.alloc(4); s.writeUInt32BE(seq);
  const d = createHash('sha256').update(Buffer.concat([Buffer.from('TYC/id'), salt, Buffer.from(kind), t, Buffer.from(partition), s])).digest();
  let v = BigInt(`0x${Buffer.concat([t, d.subarray(0, 10)]).toString('hex')}`) << 2n; // 128 bits + 2 pad = 130 = 26 × 5
  let out = ''; for (let i = 0; i < 26; i++) { out = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Number(v & 31n)] + out; v >>= 5n; }
  return `${kind}_${out}`;
}
const SALT = new Uint8Array(32);

describe('ids (T02-07)', () => {
  it('worked example: salt 0×32, p_PLAYER_01, tick 541440, chr, seq 0', () => {
    const f = new IdFactory(SALT, 'p_PLAYER_01', 541440);
    const id = f.newId('chr');
    expect(id).toBe(expectedId(Buffer.alloc(32), 'p_PLAYER_01', 541440, 'chr', 0));
    expect(new IdFactory(SALT, 'p_PLAYER_01', 541440).newId('chr')).toBe(id);
    const id1 = f.newId('chr');
    expect(id1).not.toBe(id); expect(id1).toBe(expectedId(Buffer.alloc(32), 'p_PLAYER_01', 541440, 'chr', 1));
    expect(idTick(id)).toBe(541440);
    expect(id.slice(4)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(f.log()).toEqual([{ id, kind: 'chr', seq: 0 }, { id: id1, kind: 'chr', seq: 1 }]);
  });
  it('10,000 ids of one tick are unique; bad kinds throw I0.id_kind', () => {
    const f = new IdFactory(SALT, 'p', 7); const seen: Record<string, true> = {};
    for (let i = 0; i < 10_000; i++) seen[f.newId(i % 2 ? 'mkt' : 'ord')] = true;
    expect(Object.keys(seen).length).toBe(10_000);
    for (const k of ['A', 'x', 'abcdef', 'a1']) expect(() => f.newId(k)).toThrow(/invalid id kind/);
    expect(ID_KIND_RE.test('prop')).toBe(true);
  });
  it('INV-ENG-003: valid log passes; a one-char change fails; an id that exists pre-tick fails', () => {
    const f = new IdFactory(SALT, 'p1', 12); const a = f.newId('chr'); f.newId('biz');
    const rows = f.log().map((r) => ({ ...r, partitionId: 'p1' }));
    const none: TruthStoreRead = { get: () => undefined, iter: () => [], count: () => 0 };
    const ctx = (log: unknown[], written: unknown[] = [], pre: Record<string, true> = {}, salt: Uint8Array | null = SALT): InvariantCtx => ({
      tick: 12, phase: 'P13', scope: 'TICK', partitionId: 'p1', safeMode: false, writeSet: [], postings: [], events: [], num: () => 0, post: none,
      facts: { get: <T,>(k: string) => (k === FACT_ID_LOG ? log : k === FACT_ID_WRITTEN ? written : k === FACT_ID_SALT ? (salt ?? undefined) : undefined) as T | undefined },
      pre: { ...none, get: <T,>(_t: string, id: string) => pre[id] as T | undefined },
    });
    expect(INV_ENG_003.check(ctx(rows, [{ id: a, table: 'chr.entity' }]))).toEqual({ ok: true });
    const tampered = [{ ...rows[0]!, id: rows[0]!.id.slice(0, -1) + (rows[0]!.id.endsWith('0') ? '1' : '0') }, rows[1]!];
    expect(INV_ENG_003.check(ctx(tampered)).ok).toBe(false);
    expect(INV_ENG_003.check(ctx([rows[0]!, rows[0]!])).ok).toBe(false);
    expect(INV_ENG_003.check(ctx(rows, [{ id: a, table: 'chr.entity' }], { [a]: true }))).toMatchObject({ ok: false, entityIds: [a] });
    expect(INV_ENG_003.def).toMatchObject({ id: 'INV-ENG-003', scope: 'TICK', severity: 'FATAL', module: '02', sampling: 'NEVER' });
    expect(INV_ENG_003.check(ctx(rows, [], {}, null))).toMatchObject({ ok: false, observed: `fact ${FACT_ID_SALT} missing` });
    expect(INV_ENG_003.check(ctx([], [], {}, null))).toEqual({ ok: true });
  });
  it('AC-02-09-SALT-FACT (E-73): a missing salt with id-log rows fails; an empty log passes; the fact holds the 32-byte public salt only', () => {
    const PUB = Uint8Array.from({ length: 32 }, (_, i) => i + 1), OTHER = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
    const f = new IdFactory(PUB, 'p1', 12); f.newId('chr'); f.newId('biz');
    const rows = f.log().map((r) => ({ ...r, partitionId: 'p1' }));
    const none: TruthStoreRead = { get: () => undefined, iter: () => [], count: () => 0 };
    const ctx = (log: unknown[], salt: unknown): InvariantCtx => ({
      tick: 12, phase: 'P13', scope: 'TICK', partitionId: 'p1', safeMode: false, writeSet: [], postings: [], events: [], num: () => 0, post: none, pre: none,
      facts: { get: <T,>(k: string) => (k === FACT_ID_LOG ? log : k === FACT_ID_SALT ? salt : undefined) as T | undefined },
    });
    expect(INV_ENG_003.check(ctx(rows, PUB))).toEqual({ ok: true });
    expect(INV_ENG_003.check(ctx(rows, undefined))).toMatchObject({ ok: false, observed: `fact ${FACT_ID_SALT} missing`, entityIds: rows.map((r) => r.id) });
    expect(INV_ENG_003.check(ctx([], undefined))).toEqual({ ok: true });
    expect(INV_ENG_003.check(ctx(rows, OTHER)).ok).toBe(false);                        // any other salt (e.g. a secret) does not verify
    expect(INV_ENG_003.check(ctx(rows, new Uint8Array(32))).ok).toBe(false);
    for (const bad of [PUB.slice(0, 31), Uint8Array.from([...PUB, 0]), 'salt', [...PUB]])
      expect(INV_ENG_003.check(ctx(rows, bad))).toMatchObject({ ok: false, observed: `fact ${FACT_ID_SALT} is not a 32-byte salt` });
    expect(FACT_ID_SALT).toBe('core.ids.worldSeedPublicSalt');
  });
  it('AC-02-09-SALT-LENGTH (E-74): 16, 31 and 33 bytes fail both INV-ENG-003 and IdFactory; 32 passes; a fixed salt matches the golden id vector', () => {
    const PUB = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const f = new IdFactory(PUB, 'p_PLAYER_01', 541440), id = f.newId('chr');
    expect(id).toBe('chr_00000223038S3FS8EQR1YV9FC8');                                   // golden vector (salt 0x01..0x20)
    expect(id).toBe(expectedId(Buffer.from(PUB), 'p_PLAYER_01', 541440, 'chr', 0));
    const rows = f.log().map((r) => ({ ...r, partitionId: 'p_PLAYER_01' }));
    const none: TruthStoreRead = { get: () => undefined, iter: () => [], count: () => 0 };
    const ctx = (salt: Uint8Array): InvariantCtx => ({ tick: 541440, phase: 'P13', scope: 'TICK', partitionId: 'p_PLAYER_01', safeMode: false, writeSet: [], postings: [], events: [], num: () => 0, post: none, pre: none,
      facts: { get: <T,>(k: string) => (k === FACT_ID_LOG ? rows : k === FACT_ID_SALT ? salt : undefined) as T | undefined } });
    expect(INV_ENG_003.check(ctx(PUB))).toEqual({ ok: true });
    for (const n of [0, 16, 31, 33, 64]) {
      const bad = new Uint8Array(n); bad.set(PUB.subarray(0, Math.min(n, 32)));
      let code: string | undefined; try { new IdFactory(bad, 'p', 0); } catch (e) { code = (e as { code: string }).code; }
      expect(code).toBe('I0.id_salt_length');
      expect(INV_ENG_003.check(ctx(bad))).toMatchObject({ ok: false, observed: `fact ${FACT_ID_SALT} is not a 32-byte salt` });
    }
    expect(() => new IdFactory(new Uint8Array(32), 'p', 0)).not.toThrow();
  });
  it('AC-02-09-SALT-FACT: the seed root is not reachable from the fact (ids.ts imports only hashing/encoding/sorted/types/invariant types; reads no other fact)', () => {
    const src = readFileSync(fileURLToPath(new URL('./ids.ts', import.meta.url)), 'utf8');
    const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
    expect(imports).toEqual(['./crypto/hex', './crypto/sha256', './invariants', './sorted', './types']);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // comments stripped
    expect(code).not.toMatch(/secret|seedRoot|EpochRoot|entropy|rng/i);
    const facts = [...src.matchAll(/facts\.get<[^>]*>\(([A-Z_]+)\)/g)].map((m) => m[1]).sort();
    expect(facts).toEqual(['FACT_ID_LOG', 'FACT_ID_SALT', 'FACT_ID_WRITTEN']);
  });
});

describe('merkle (T02-07)', () => {
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => utf8(`leaf${i}`));
  it('roots of 1, 2, 3 and 1000 leaves; every proof verifies; a modified leaf fails', () => {
    for (const n of [1, 2, 3, 1000]) {
      const L = leaves(n); const root = merkleRoot(L);
      for (let i = 0; i < n; i += n > 10 ? 37 : 1) {
        const p = merkleProof(L, i);
        expect(verifyMerkleProof(root, L[i]!, p)).toBe(true);
        expect(verifyMerkleProof(root, utf8('tampered'), p)).toBe(false);
      }
    }
  });
  it('layout: leaf 0x00, node 0x01, odd promoted, empty = sha256("TYC/empty")', () => {
    const h = (...b: Buffer[]) => createHash('sha256').update(Buffer.concat(b)).digest();
    const [a, b, c] = ['a', 'b', 'c'].map((s) => Buffer.from(s));
    const la = h(Buffer.of(0), a!), lb = h(Buffer.of(0), b!), lc = h(Buffer.of(0), c!);
    expect(toHex(merkleRoot([a!, b!, c!].map((x) => new Uint8Array(x))))).toBe(h(Buffer.of(1), h(Buffer.of(1), la, lb), lc).toString('hex'));
    expect(toHex(merkleRoot([]))).toBe(h(Buffer.from('TYC/empty')).toString('hex'));
  });
});
