// Binary chunk format v1 (SR Q3). Little-endian.
//   u32 magic 'CTY1', u32 version, u32 idsJsonBytes, u32 partCount,
//   idsJson (UTF-8 JSON array of persistent entity ids, zero-padded to 4 bytes),
//   partCount × 28 bytes: i32 x, z, w, d, y0, h (centimetres, x/z = part centre), u16 slot, u16 style,
//   u32 refCount, then per ref: u16 keyLen, key (UTF-8 chunkKey of the owner chunk), u16 slot.
// A part lives in exactly one owner chunk (the one holding its centre); others only reference it.
// The worker converts to FLOATS_PER_PART f32 per part in metres for the renderer.
export const CHUNK_MAGIC = 0x31595443; // 'CTY1'
export const CHUNK_VERSION = 1;
export const PART_BYTES = 28;
export const FLOATS_PER_PART = 8; // decoded: x, z, w, d, y0, h (m), slot, style
export const CHUNK_SIZE_CM = 12_800;
export const CHUNK_SIZE_M = CHUNK_SIZE_CM / 100;

export function chunkKeyOf(xCm: number, zCm: number): string {
  return `${Math.floor(xCm / CHUNK_SIZE_CM)}_${Math.floor(zCm / CHUNK_SIZE_CM)}`;
}
