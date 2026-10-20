// SR Q1: the manifest is the entry point and the only mutable, short-cache file. Every other URL
// comes from the manifest (content-addressed); the client never builds versioned URLs itself.
// The CDN origin is config (NEXT_PUBLIC_CITY_CDN, Spec 1). worldId is not on the seam yet, so the
// path omits it until Spec 1 adds it [open: Front Dev].
const CDN = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CITY_CDN) || '';

export function manifestUrl(cityId: string): string {
  return `${CDN}/city/${encodeURIComponent(cityId)}/manifest.json`;
}

/** Immutable artifact path (what the publisher writes; used by the tooling seed). */
export function hashedUrl(cityId: string, contentHash: string, ext: string): string {
  return `${CDN}/city/${encodeURIComponent(cityId)}/h/${contentHash}.${ext}`;
}
