import type {
  ChunkRef,
  CityDelta,
  CityDistrict,
  CityEntity,
  CitySnapshot,
  DistrictUse,
  GroundRef,
  PublicCityState,
  UseClass,
} from './types';
import { isTombstone } from './types';
import { byKey, canonicalJson } from './canonical';

export type ApplyResult =
  | { status: 'applied'; changedChunks: ChunkRef[]; full: boolean }
  | { status: 'same' }
  | { status: 'stale' }
  | { status: 'needs-snapshot' };

const str = (v: unknown): string => String(v);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const int = (v: unknown): number => Math.trunc(Number(v));

/** Copies only allowlisted fields (10 §3.24). Anything else on the wire is dropped (17-AT-21). */
export function publicEntity(e: CityEntity): CityEntity {
  const out: CityEntity = {
    id: str(e.id),
    kind: e.kind,
    parcelId: str(e.parcelId),
    // a property is named only through OWNERSHIP_PUBLIC; the publisher sends null otherwise
    name: strOrNull(e.name),
    districtId: str(e.districtId),
    sector: e.sector ?? null,
    companyId: strOrNull(e.companyId),
    forSale: e.forSale === true,
    atAuction: e.atAuction === true,
    lifecycle: e.lifecycle,
    heightLevel: int(e.heightLevel),
  };
  if (e.kind === 'crown_tower') {
    out.title = e.title === 'city_crown' ? 'city_crown' : null;
    out.archetypeId = str(e.archetypeId ?? '');
  }
  return out;
}

function publicUse(u: DistrictUse): DistrictUse {
  return { rentPerM2PerGD: str(u.rentPerM2PerGD), vacancy: Number(u.vacancy), pressure: Number(u.pressure) };
}

function publicDistrict(d: CityDistrict): CityDistrict {
  const byUse: CityDistrict['byUse'] = {};
  for (const k of Object.keys(d.byUse ?? {}).sort() as UseClass[]) byUse[k] = publicUse(d.byUse[k]!);
  return {
    id: str(d.id),
    nameKey: str(d.nameKey),
    tier: d.tier,
    rentIndex: Number(d.rentIndex),
    priceIndex: Number(d.priceIndex),
    byUse,
    listings: int(d.listings),
    polygon: (d.polygon ?? []).map((p) => [int(p[0]), int(p[1])] as [number, number]),
  };
}

const publicChunk = (c: ChunkRef): ChunkRef => ({ chunkKey: str(c.chunkKey), contentHash: str(c.contentHash) });
const publicGround = (g: GroundRef): GroundRef => ({
  contentHash: str(g.contentHash),
  size: int(g.size),
  cellCm: int(g.cellCm),
  originCm: [int(g.originCm[0]), int(g.originCm[1])],
});

function header(s: PublicCityState): Omit<PublicCityState, 'districts' | 'entities' | 'chunks' | 'baseVersion'> {
  return {
    schemaVersion: 1,
    cityId: str(s.cityId),
    stateVersion: int(s.stateVersion),
    publicSnapshotTick: int(s.publicSnapshotTick),
    ccy: str(s.ccy),
    ground: publicGround(s.ground),
  };
}

/** Public, canonically ordered snapshot. */
export function publicSnapshot(s: CitySnapshot): CitySnapshot {
  return {
    ...header(s),
    baseVersion: null,
    districts: s.districts.map(publicDistrict).sort(byKey((d) => d.id)),
    entities: s.entities.filter((e) => !isTombstone(e)).map(publicEntity).sort(byKey((e) => e.id)),
    chunks: s.chunks.map(publicChunk).sort(byKey((c) => c.chunkKey)),
  };
}

/** apply(snapshot(v-1), delta(v-1 → v)) → snapshot(v). Pure. Caller checks the base. */
export function applyDelta(cur: CitySnapshot, d: CityDelta): CitySnapshot {
  const entities = new Map(cur.entities.map((e) => [e.id, e]));
  for (const e of d.entities) {
    if (isTombstone(e)) entities.delete(str(e.id));
    else entities.set(str(e.id), publicEntity(e));
  }
  const chunks = new Map(cur.chunks.map((c) => [c.chunkKey, c]));
  for (const c of d.chunks) {
    if ('removed' in c && c.removed) chunks.delete(str(c.chunkKey));
    else chunks.set(str(c.chunkKey), publicChunk(c as ChunkRef));
  }
  const districts = new Map(cur.districts.map((x) => [x.id, x]));
  for (const x of d.districts) districts.set(str(x.id), publicDistrict(x));
  return publicSnapshot({ ...header(d), baseVersion: null, districts: [...districts.values()], entities: [...entities.values()], chunks: [...chunks.values()] });
}

export function isSnapshot(s: CitySnapshot | CityDelta): s is CitySnapshot {
  return s.baseVersion === null;
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
    let next: CitySnapshot;
    if (isSnapshot(input)) next = publicSnapshot(input);
    else if (!cur || cur.stateVersion !== input.baseVersion) return { status: 'needs-snapshot' };
    else next = applyDelta(cur, input);
    const before = new Map((cur?.chunks ?? []).map((c) => [c.chunkKey, c.contentHash]));
    const changed = next.chunks.filter((c) => before.get(c.chunkKey) !== c.contentHash);
    const removed = (cur?.chunks ?? []).some((c) => !next.chunks.some((n) => n.chunkKey === c.chunkKey));
    const full = !cur || cur.ground.contentHash !== next.ground.contentHash || removed;
    this.snap = next;
    return { status: 'applied', changedChunks: changed, full };
  }
}

/** Hash of the render input (public snapshot without the version stamps). FNV-1a over canonical JSON. */
export function renderInputHash(s: CitySnapshot): string {
  const { stateVersion: _v, publicSnapshotTick: _t, ...rest } = publicSnapshot(s);
  void _v;
  void _t;
  const text = canonicalJson(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
