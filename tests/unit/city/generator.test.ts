import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { decodeChunk } from '@/city/worker/decode';
import { FLOATS_PER_PART } from '@/city/worker/format';

describe('reference seed', () => {
  it('is deterministic and decodes', () => {
    const a = generateCity();
    const b = generateCity();
    expect(JSON.stringify(a.snapshot)).toBe(JSON.stringify(b.snapshot));
    let parts = 0;
    for (const c of a.snapshot.chunks) {
      const bytes = a.files.get(c.url)!;
      const d = decodeChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      parts += d.parts.length / FLOATS_PER_PART;
    }
    console.log('entities', a.snapshot.entities.length, 'parts', parts, 'chunks', a.snapshot.chunks.length);
    expect(a.snapshot.entities.length).toBeGreaterThan(1500);
  });
});
