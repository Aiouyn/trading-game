import { deflateSync, inflateSync } from "node:zlib";

/** A decoded image: `data` is width × height RGBA bytes, row-major. */
export type Rgba = { width: number; height: number; data: Uint8Array };

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS: Partial<Record<number, number>> = { 2: 3, 6: 4 }; // truecolour, truecolour + alpha

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Decode the PNGs Playwright writes (8-bit truecolour with or without alpha, not interlaced) to RGBA, with no dependency.
 * Anything else throws, so a baseline in another format fails loudly instead of comparing wrong.
 */
export function decodePng(png: Buffer): Rgba {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width = 0, height = 0, channels = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at), type = png.toString("latin1", at + 4, at + 8), body = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = CHANNELS[colour!] ?? 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error(`PNG data is ${raw.length} bytes, expected ${height * (stride + 1)}`);
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[row + i - channels]! : 0, b = y > 0 ? px[row - stride + i]! : 0, c = i >= channels && y > 0 ? px[row - stride + i - channels]! : 0;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : NaN;
      if (Number.isNaN(pred)) throw new Error(`bad PNG filter ${filter} on row ${y}`);
      px[row + i] = (raw[src + i]! + pred) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: px };
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) { data.set(px.subarray(p * 3, p * 3 + 3), p * 4); data[p * 4 + 3] = 255; }
  return { width, height, data };
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, body: Buffer) => {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0); out.write(type, 4, "latin1"); body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
};

/** Encode RGBA as an 8-bit RGBA PNG (filter 0), for diff images. */
export function encodePng({ width, height, data }: Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Pixel offsets (y * width + x) where `a` and `b` differ in any RGBA byte (one 32-bit word per pixel). Sizes must match. */
export function differingPixels(a: Rgba, b: Rgba): number[] {
  const n = a.width * a.height, wa = new Uint32Array(a.data.buffer, a.data.byteOffset, n), wb = new Uint32Array(b.data.buffer, b.data.byteOffset, n);
  const out: number[] = [];
  for (let p = 0; p < n; p++) if (wa[p] !== wb[p]) out.push(p);
  return out;
}
