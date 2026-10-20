// Binary chunk format, version 1 [P]. Little-endian.
//   u32 magic, u32 version, u32 idsJsonBytes, u32 partCount,
//   idsJson (UTF-8 JSON array of entity ids, zero-padded to 4 bytes),
//   f32 × FLOATS_PER_PART × partCount: x, z, w, d, y0, h, slot, style
// x/z are the part centre in world metres, y0 its base height, slot an index into the id array.
export const CHUNK_MAGIC = 0x31595443; // 'CTY1'
export const CHUNK_VERSION = 1;
export const FLOATS_PER_PART = 8;
export const CHUNK_SIZE_M = 128;
