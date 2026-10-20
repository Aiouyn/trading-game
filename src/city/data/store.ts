import type { ChunkRef, CityDelta, CityDistrict, CityEntity, CitySnapshot } from './types';

export type ApplyResult =
  | { status: 'applied'; changedChunks: ChunkRef[]; full: boolean }
  | { status: 'same' }
  | { status: 'stale' }
  | { status: 'needs-snapshot' };

/** Copies only the public fields. Anything else on the wire is dropped (privacy, 17-AT-21). */
export function publicEntity(e: CityEntity): CityEntity {
  return {
    id: String(e.id),
    kind: e.kind,
    parcelId: String(e.parcelId),
    name: String(e.name),
    districtId: String(e.districtId),
    sector: String(e.sector),
    dayReturn: Number(e.dayReturn) || 0,
    forSale: Boolean(e.forSale),
    atAuction: Boolean(e.atAuction),
    development: Number.isFinite(e.development) ? Number(e.development) : 1,
  };
}

function publicDistrict(d: CityDistrict): CityDistrict {
  return {
    id: String(d.id),
    name: String(d.name),
    center: [Number(d.center[0]), Number(d.center[1])],
    index: Number(d.index),
    rent: Number(d.rent),
    listings: Number(d.listings),
  };
}

function publicChunk(c: ChunkRef): ChunkRef {
  return { cx: c.cx, cz: c.cz, url: String(c.url), hash: String(c.hash) };
}

export function publicSnapshot(s: CitySnapshot): CitySnapshot {
  return {
    type: 'snapshot',
    cityId: String(s.cityId),
    stateVersion: Number(s.stateVersion),
    lagTicks: Number(s.lagTicks) || 0,
    dayReturn: Number(s.dayReturn) || 0,
    extent: Number(s.extent),
    ground: { url: String(s.ground.url), size: Number(s.ground.size) },
    districts: s.districts.map(publicDistrict),
    entities: s.entities.map(publicEntity),
    chunks: s.chunks.map(publicChunk),
    brief: s.brief.map(String),
  };
}

/** The current public city. setData is idempotent by stateVersion. */
export class CityStore {
  private snap: CitySnapshot | null = null;

  get snapshot(): CitySnapshot | null {
    return this.snap;
  }

  get stateVersion(): number | null {
    return this.snap ? this.snap.stateVersion : null;
  }

  apply(input: CitySnapshot | CityDelta): ApplyResult {
    const cur = this.snap;
    if (cur && input.stateVersion === cur.stateVersion) return { status: 'same' };
    if (cur && input.stateVersion < cur.stateVersion) return { status: 'stale' };
    if (input.type === 'snapshot') {
      const next = publicSnapshot(input);
      const before = new Map((cur?.chunks ?? []).map((c) => [`${c.cx},${c.cz}`, c.hash]));
      const changed = next.chunks.filter((c) => before.get(`${c.cx},${c.cz}`) !== c.hash);
      const full = !cur || cur.ground.url !== next.ground.url;
      this.snap = next;
      return { status: 'applied', changedChunks: changed, full };
    }
    if (!cur || cur.stateVersion !== input.baseVersion) return { status: 'needs-snapshot' };
    const entities = new Map(cur.entities.map((e) => [e.id, e]));
    for (const id of input.remove ?? []) entities.delete(id);
    for (const e of input.upsert ?? []) entities.set(String(e.id), publicEntity(e));
    const chunks = new Map(cur.chunks.map((c) => [`${c.cx},${c.cz}`, c]));
    const changed = (input.chunks ?? []).map(publicChunk);
    for (const c of changed) chunks.set(`${c.cx},${c.cz}`, c);
    this.snap = {
      ...cur,
      stateVersion: input.stateVersion,
      lagTicks: Number(input.lagTicks) || 0,
      dayReturn: input.dayReturn ?? cur.dayReturn,
      districts: input.districts ? input.districts.map(publicDistrict) : cur.districts,
      entities: [...entities.values()],
      chunks: [...chunks.values()],
      brief: input.brief ? input.brief.map(String) : cur.brief,
    };
    return { status: 'applied', changedChunks: changed, full: false };
  }
}

/** Stable FNV-1a hash of the render input (public snapshot without the version stamp). */
export function renderInputHash(s: CitySnapshot): string {
  const { stateVersion: _v, ...rest } = publicSnapshot(s);
  void _v;
  const text = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
