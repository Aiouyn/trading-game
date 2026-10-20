import { CHUNK_MAGIC, CHUNK_VERSION, FLOATS_PER_PART, PART_BYTES } from './format';

export interface DecodedChunk {
  ids: string[];
  /** FLOATS_PER_PART floats per part, metres (see format.ts). */
  parts: Float32Array;
  refs: { ownerChunkKey: string; slot: number }[];
}

export function decodeChunk(buf: ArrayBuffer): DecodedChunk {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== CHUNK_MAGIC) throw new Error('city chunk: bad magic');
  if (dv.getUint32(4, true) !== CHUNK_VERSION) throw new Error('city chunk: unsupported version');
  const jsonBytes = dv.getUint32(8, true);
  const count = dv.getUint32(12, true);
  const td = new TextDecoder();
  const ids: unknown = JSON.parse(td.decode(new Uint8Array(buf, 16, jsonBytes)));
  if (!Array.isArray(ids)) throw new Error('city chunk: bad id table');
  let o = 16 + Math.ceil(jsonBytes / 4) * 4;
  if (o + count * PART_BYTES + 4 > buf.byteLength) throw new Error('city chunk: truncated');
  const parts = new Float32Array(count * FLOATS_PER_PART);
  for (let i = 0; i < count; i++, o += PART_BYTES) {
    const p = i * FLOATS_PER_PART;
    for (let k = 0; k < 6; k++) parts[p + k] = dv.getInt32(o + k * 4, true) / 100;
    parts[p + 6] = dv.getUint16(o + 24, true);
    parts[p + 7] = dv.getUint16(o + 26, true);
  }
  const refCount = dv.getUint32(o, true);
  o += 4;
  const refs: DecodedChunk['refs'] = [];
  for (let i = 0; i < refCount; i++) {
    const len = dv.getUint16(o, true);
    const ownerChunkKey = td.decode(new Uint8Array(buf, o + 2, len));
    refs.push({ ownerChunkKey, slot: dv.getUint16(o + 2 + len, true) });
    o += 4 + len;
  }
  return { ids: ids.map(String), parts, refs };
}

/** Inverse of decodeChunk, from integer-centimetre parts. Used by the tooling seed and tests. */
export function encodeChunk(ids: string[], partsCm: number[][], refs: { ownerChunkKey: string; slot: number }[] = []): Uint8Array {
  const te = new TextEncoder();
  const json = te.encode(JSON.stringify(ids));
  const pad = Math.ceil(json.length / 4) * 4;
  const refKeys = refs.map((r) => te.encode(r.ownerChunkKey));
  const refBytes = refKeys.reduce((a, k) => a + 4 + k.length, 0);
  const buf = new ArrayBuffer(16 + pad + partsCm.length * PART_BYTES + 4 + refBytes);
  const dv = new DataView(buf);
  dv.setUint32(0, CHUNK_MAGIC, true);
  dv.setUint32(4, CHUNK_VERSION, true);
  dv.setUint32(8, json.length, true);
  dv.setUint32(12, partsCm.length, true);
  new Uint8Array(buf, 16, json.length).set(json);
  let o = 16 + pad;
  for (const p of partsCm) {
    for (let k = 0; k < 6; k++) {
      if (!Number.isInteger(p[k])) throw new Error('city chunk: geometry must be integer cm');
      dv.setInt32(o + k * 4, p[k], true);
    }
    dv.setUint16(o + 24, p[6], true);
    dv.setUint16(o + 26, p[7], true);
    o += PART_BYTES;
  }
  dv.setUint32(o, refs.length, true);
  o += 4;
  refs.forEach((r, i) => {
    dv.setUint16(o, refKeys[i].length, true);
    new Uint8Array(buf, o + 2, refKeys[i].length).set(refKeys[i]);
    dv.setUint16(o + 2 + refKeys[i].length, r.slot, true);
    o += 4 + refKeys[i].length;
  });
  return new Uint8Array(buf);
}
