import { CHUNK_MAGIC, CHUNK_VERSION, FLOATS_PER_PART } from './format';

export interface DecodedChunk {
  ids: string[];
  /** FLOATS_PER_PART floats per part, see format.ts. */
  parts: Float32Array;
}

export function decodeChunk(buf: ArrayBuffer): DecodedChunk {
  const head = new DataView(buf, 0, 16);
  if (head.getUint32(0, true) !== CHUNK_MAGIC) throw new Error('city chunk: bad magic');
  if (head.getUint32(4, true) !== CHUNK_VERSION) throw new Error('city chunk: unsupported version');
  const jsonBytes = head.getUint32(8, true);
  const count = head.getUint32(12, true);
  const ids: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 16, jsonBytes)));
  if (!Array.isArray(ids)) throw new Error('city chunk: bad id table');
  const offset = 16 + Math.ceil(jsonBytes / 4) * 4;
  const parts = new Float32Array(buf.slice(offset, offset + count * FLOATS_PER_PART * 4));
  if (parts.length !== count * FLOATS_PER_PART) throw new Error('city chunk: truncated');
  return { ids: ids.map(String), parts };
}
