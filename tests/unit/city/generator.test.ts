import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { decodeChunk, encodeChunk } from '@/city/worker/decode';
import { FLOATS_PER_PART } from '@/city/worker/format';

const ab = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('reference seed', () => {
  it('is deterministic and decodes', () => {
    const a = generateCity();
    const b = generateCity();
    expect(JSON.stringify(a.snapshot)).toBe(JSON.stringify(b.snapshot));
    const m = a.manifests.get(1)!;
    let parts = 0;
    for (const c of m.chunks) parts += decodeChunk(ab(a.files.get(c.url)!)).parts.length / FLOATS_PER_PART;
    console.log('entities', a.snapshot.entities.length, 'parts', parts, 'chunks', m.chunks.length);
    expect(a.snapshot.entities.length).toBeGreaterThan(1000);
  });
});

describe('chunk binary v1 (SR Q3)', () => {
  it('integer cm in, metres out; refs block round-trips; float geometry is rejected', () => {
    const bytes = encodeChunk(['bnd_1', 'bnd_2'], [[12_345, -6_700, 800, 900, 0, 2_550, 1, 3]], [{ ownerChunkKey: '0_-1', slot: 4 }]);
    const d = decodeChunk(ab(bytes));
    expect(d.ids).toEqual(['bnd_1', 'bnd_2']);
    expect([...d.parts]).toEqual([123.45, -67, 8, 9, 0, 25.5, 1, 3].map((x) => Math.fround(x)));
    expect(d.refs).toEqual([{ ownerChunkKey: '0_-1', slot: 4 }]);
    expect(() => encodeChunk(['x'], [[1.5, 0, 1, 1, 0, 1, 0, 0]])).toThrow(/integer cm/);
  });
});
