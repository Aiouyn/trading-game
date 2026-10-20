// Tooling only (approved as the reference seed). A stand-in for module 10's publisher: it builds
// a Port Avalon world (public records + private noise), then publishes it the way Systems ruled
// (pr4-systems-answers.md): manifest (only mutable file) + content-addressed snapshot, deltas,
// chunks (integer cm, CTY1) and ground mask (200 cm cells), all through the one canonical
// serializer. Production clients never generate cities (spec §5).
import { createHash } from 'node:crypto';
import { canonicalBytes, roundRatio } from '../../../../src/city/data/canonical';
import { applyDelta, publicSnapshot } from '../../../../src/city/data/store';
import { hashedUrl, manifestUrl } from '../../../../src/city/data/urls';
import { encodeChunk } from '../../../../src/city/worker/decode';
import { CHUNK_SIZE_CM, chunkKeyOf } from '../../../../src/city/worker/format';
import type {
  CityDelta,
  CityDistrict,
  CityEntity,
  CityManifest,
  CitySnapshot,
  DistrictTier,
  EntityKind,
  ParcelLifecycle,
  SectorId,
} from '../../../../src/city/data/types';

export const REFERENCE_SEED = 20261020;
export const CITY_ID = 'city_port_avalon';
const EXTENT = 512; // m, half size
const CELL_CM = 200;
const GROUND = (2 * EXTENT * 100) / CELL_CM; // 512 cells
const ORIGIN_CM = -EXTENT * 100; // -51,200 = -4 × 12,800 (aligned with the chunk grid)

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

// ---------- content (22 §3.3, §5) ----------
interface DistrictDef {
  slug: string;
  name: string;
  tier: DistrictTier;
  center: [number, number];
  landmark: [string, string];
}
const D = (slug: string, name: string, tier: DistrictTier, center: [number, number], landmark: [string, string]): DistrictDef => ({ slug, name, tier, center, landmark });
export const DISTRICTS: DistrictDef[] = [
  D('eastside_docks', 'Eastside Docks', 'working', [250, 60], ['lmk_the_coal_crane', 'The Coal Crane']),
  D('industrial_basin', 'Industrial Basin', 'working', [300, -220], ['lmk_basin_gasworks', 'Basin Gasworks']),
  D('old_harbor', 'Old Harbor', 'mid', [-90, 230], ['lmk_old_harbor_lighthouse', 'Old Harbor Lighthouse']),
  D('riverside_lofts', 'Riverside Lofts', 'mid', [120, -90], ['lmk_ironworks_bridge', 'Ironworks Bridge']),
  D('midtown', 'Midtown', 'mid', [10, -230], ['lmk_union_station', 'Union Station']),
  D('financial_mile', 'Financial Mile', 'prime', [-40, 40], ['lmk_port_avalon_exchange_building', 'Port Avalon Exchange Building']),
  D('glasshill', 'Glasshill', 'prime', [-270, -40], ['lmk_glasshill_observatory', 'Glasshill Observatory']),
  D('summit_estates_on_gilt_hill', 'Summit Estates on Gilt Hill', 'trophy', [-300, -290], ['lmk_gilt_hill_gates', 'Gilt Hill Gates']),
];
const distId = (d: DistrictDef) => `dist_port_avalon_${d.slug}`;

const COMPANIES: [string, string, SectorId][] = [
  ['cmp_halc', 'Halcyon Systems', 'TECH'], ['cmp_qrmd', 'Quorum Data', 'TECH'], ['cmp_glfs', 'Gulfstar Petroleum', 'ENERGY'],
  ['cmp_irbm', 'Ironbridge Materials', 'MATERIALS'], ['cmp_taln', 'Talon Aerospace', 'INDUSTRIALS'], ['cmp_bayl', 'Bayline Logistics', 'INDUSTRIALS'],
  ['cmp_avnb', 'Avalon National Bank', 'FINANCIALS'], ['cmp_orig', 'Orion Information Group', 'FINANCIALS'],
  ['cmp_bwam', 'Brightwater Asset Management', 'FINANCIALS'], ['cmp_crwl', 'Carewell Health Systems', 'HEALTH'],
  ['cmp_palf', 'Pallas Foods', 'STAPLES'], ['cmp_mrqr', 'Marquee Resorts', 'DISCRETIONARY'], ['cmp_aurh', 'Aurelius Holdings', 'REAL_ESTATE'],
  ['cmp_hrbt', 'Harbor Realty Trust', 'REAL_ESTATE'], ['cmp_glor', 'Glasshill Office REIT', 'REAL_ESTATE'],
  ['cmp_bcnb', 'Beacon Broadcasting', 'MEDIA'], ['cmp_crdn', 'Cardinal News Group', 'MEDIA'], ['cmp_sntl', 'Sentinel Cyber', 'SECURITY'],
  ['cmp_wtch', 'Watchtower Security Services', 'SECURITY'],
];
const STREETS = ['Quay Street', 'Tanner Row', 'Lantern Lane', 'Cooper Street', 'Harbor Walk', 'Mill Road', 'Chandler Way', 'Exchange Place', 'Ropewalk', 'Gilt Hill Road', 'Ferry Lane', 'Salt Street', 'Rue des Tonneliers', 'Union Avenue'];
const SHOP_A = ['Corner', 'Harbor', 'Lantern', 'Brass', 'Old Quay', 'Union', 'Saltmarsh', 'Ferry', 'Copper', 'Bayline', 'Glasshill', 'Ropewalk'];
const SHOP_B = ['Coffee', 'Bakery', 'Books', 'Pharmacy', 'Hardware', 'Fishmonger', 'Tailors', 'Wine Bar', 'Noodle House', 'Florist', 'Barber', 'Deli'];
const SHOP_LONG = ['Boulangerie-Pâtisserie du Vieux-Port', 'Quincaillerie Générale des Tonneliers', 'Librairie et Papeterie de la Colline', 'Brasserie de la Gare Centrale'];
const AWNINGS: SectorId[] = ['STAPLES', 'DISCRETIONARY', 'HEALTH', 'MEDIA'];

// ---------- geography (22: crescent harbour bay, hill to the west) ----------
function riverX(z: number): number {
  return 70 + 30 * Math.sin(z / 110);
}
export function isWaterAt(x: number, z: number): boolean {
  const bay = Math.hypot(x - 170, z - 420) < 250 && !(Math.hypot(x - 60, z - 300) < 70); // crescent with a spit
  const sea = z > 470 - 0.08 * x || x > 455 + 0.05 * z;
  const river = z < 200 && z > -480 && Math.abs(x - riverX(z)) < 11;
  return bay || sea || river;
}

// ---------- world ----------
export interface WorldPart {
  ownerId: string;
  cm: number[]; // x, z, w, d, y0, h, (slot), style
}
export interface World {
  entities: (CityEntity & { ownerAccountId?: string; privateCostBasis?: string; liveQuoteBp?: number })[];
  parts: WorldPart[];
  mask: Uint8Array;
  districts: CityDistrict[];
  /** private noise that must never reach a public file */
  privateNoise: { trades: { accountId: string; qty: number; px: string }[]; online: number[] };
}

/** Streets: irregular lines (40–72 m apart) plus one diagonal avenue; only inside the built area. */
function streetLines(r: () => number): { xs: number[]; zs: number[] } {
  const xs: number[] = [], zs: number[] = [];
  for (let v = -470; v < 470; v += 40 + Math.floor(r() * 32)) xs.push(v);
  for (let v = -470; v < 470; v += 40 + Math.floor(r() * 32)) zs.push(v);
  return { xs, zs };
}
const builtArea = (x: number, z: number) => Math.hypot((x + 20) / 1.05, z + 20) < 470;
const avenueDist = (x: number, z: number) => Math.abs(0.6 * x - z - 30) / Math.hypot(0.6, 1);

export function buildWorld(seed = REFERENCE_SEED, privateSeed = 1): World {
  const r = rng(seed);
  const { xs, zs } = streetLines(r);
  const ROAD = 8;
  // ground mask: 0 water, 1 land, 2 park, 3 road
  const mask = new Uint8Array(GROUND * GROUND);
  const cellM = CELL_CM / 100;
  const roadAt = (x: number, z: number) =>
    builtArea(x, z) && (xs.some((v) => Math.abs(x - v) < ROAD / 2) || zs.some((v) => Math.abs(z - v) < ROAD / 2) || avenueDist(x, z) < 6);
  for (let j = 0; j < GROUND; j++) {
    for (let i = 0; i < GROUND; i++) {
      const x = -EXTENT + (i + 0.5) * cellM, z = -EXTENT + (j + 0.5) * cellM;
      mask[j * GROUND + i] = isWaterAt(x, z) ? 0 : roadAt(x, z) ? 3 : 1;
    }
  }
  const nearest = (x: number, z: number) =>
    DISTRICTS.reduce((b, d) => (Math.hypot(x - d.center[0], z - d.center[1]) < Math.hypot(x - b.center[0], z - b.center[1]) ? d : b));
  const entities: World['entities'] = [];
  const parts: WorldPart[] = [];
  const lotsByDistrict = new Map<string, [number, number][]>();
  const cm = (m: number) => Math.round(m * 100);
  const used = new Set<string>();
  const parks: [number, number, number, number][] = [];
  let n = 0;
  const crownSites: [number, number][] = [[-30, 10], [30, -60]];
  const landmarkAt = new Map<string, [number, number]>();
  let companyNext = 0;
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < zs.length - 1; bj++) {
      const x0 = xs[bi] + ROAD / 2, x1 = xs[bi + 1] - ROAD / 2, z0 = zs[bj] + ROAD / 2, z1 = zs[bj + 1] - ROAD / 2;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (!builtArea(cx, cz)) continue;
      const district = nearest(cx, cz);
      if (!landmarkAt.has(district.slug) && Math.hypot(cx - district.center[0], cz - district.center[1]) < 60 && !isWaterAt(cx, cz)) {
        landmarkAt.set(district.slug, [cx, cz]);
        parks.push([x0, z0, x1, z1]);
        continue;
      }
      if (crownSites.some(([sx, sz]) => sx > x0 - 20 && sx < x1 + 20 && sz > z0 - 20 && sz < z1 + 20)) {
        parks.push([x0, z0, x1, z1]); // crown plaza: open ground around the tower
        continue;
      }
      if (r() < 0.06) {
        parks.push([x0, z0, x1, z1]);
        continue;
      }
      const hill = district.slug === 'glasshill' || district.slug === 'summit_estates_on_gilt_hill';
      const nx = Math.max(1, Math.round((x1 - x0) / (hill ? 22 : 15)));
      const nz = Math.max(1, Math.round((z1 - z0) / (hill ? 22 : 15)));
      const lw = (x1 - x0) / nx, ld = (z1 - z0) / nz;
      for (let lz = 0; lz < nz; lz++) {
        for (let lx = 0; lx < nx; lx++) {
          const x = x0 + lw * (lx + 0.5), z = z0 + ld * (lz + 0.5);
          if (isWaterAt(x, z) || isWaterAt(x + lw / 2, z + ld / 2) || isWaterAt(x - lw / 2, z - ld / 2) || avenueDist(x, z) < 6 + Math.max(lw, ld) / 2) continue;
          if (r() < (hill ? 0.3 : 0.1)) continue;
          const key = `${Math.round(x)},${Math.round(z)}`;
          if (used.has(key)) continue;
          used.add(key);
          const w = lw * (0.62 + 0.28 * r()), d = ld * (0.62 + 0.28 * r());
          const cbd = Math.max(0, 1 - Math.hypot(x + 10, z + 10) / 230);
          const tierK = district.tier === 'prime' ? 1 : district.tier === 'trophy' ? 0.2 : district.tier === 'mid' ? 0.6 : 0.3;
          const h = hill ? 6 + 8 * r() : 7 + 12 * r() + cbd * cbd * tierK * (50 + 120 * r());
          const roll = r();
          let kind: EntityKind = 'property';
          if (roll < 0.02 && companyNext < COMPANIES.length && cbd > 0.2) kind = 'company_hq';
          else if (roll < 0.15 && !hill) kind = 'storefront';
          else if (roll < 0.175) kind = 'listing';
          const pid = String(n).padStart(6, '0');
          const parcelId = `pcl_port_avalon_${pid}`;
          const addr = `${1 + Math.floor(r() * 180)} ${pick(STREETS)}`;
          let name: string | null = null;
          let sector: SectorId | null = null;
          let companyId: string | null = null;
          if (kind === 'company_hq') {
            const c = COMPANIES[companyNext++];
            [companyId, name, sector] = [c[0], c[1], c[2]];
          } else if (kind === 'storefront') {
            name = r() < 0.12 ? pick(SHOP_LONG) : `${pick(SHOP_A)} ${pick(SHOP_B)}`;
            sector = pick(AWNINGS);
          } else if (kind === 'listing') name = addr;
          else if (r() < 0.05) name = `${addr} (public owner)`; // OWNERSHIP_PUBLIC opt-in
          const lifeRoll = r();
          const lifecycle: ParcelLifecycle = lifeRoll < 0.03 ? 'BUILDING' : lifeRoll < 0.04 ? 'PLANNED' : lifeRoll < 0.07 ? 'VACANT' : 'OCCUPIED';
          const id = `bnd_${pid}_${kind === 'company_hq' ? 'hq' : kind === 'storefront' ? 'store' : kind === 'listing' ? 'listing' : 'parcel'}`;
          entities.push({
            id, kind, parcelId, name, districtId: distId(district), sector, companyId,
            forSale: kind === 'listing' || r() < 0.03, atAuction: r() < 0.01, lifecycle, heightLevel: Math.max(1, Math.round(h / 4)),
            ownerAccountId: `acc_${Math.floor(rng(privateSeed + n)() * 1e6)}`,
            privateCostBasis: (rng(privateSeed * 7 + n)() * 1e6).toFixed(2),
            ...(kind === 'company_hq' ? { liveQuoteBp: Math.round((rng(privateSeed * 13 + n)() - 0.5) * 1000) } : {}),
          });
          const style = Math.floor(r() * 4);
          parts.push({ ownerId: id, cm: [cm(x), cm(z), cm(w), cm(d), 0, cm(h), 0, style] });
          if (h > 50) parts.push({ ownerId: id, cm: [cm(x), cm(z), cm(w * 0.62), cm(d * 0.62), cm(h), cm(h * 0.3), 0, style] });
          const list = lotsByDistrict.get(distId(district)) ?? [];
          list.push([cm(x - w / 2), cm(z - d / 2)], [cm(x + w / 2), cm(z + d / 2)], [cm(x - w / 2), cm(z + d / 2)], [cm(x + w / 2), cm(z - d / 2)]);
          lotsByDistrict.set(distId(district), list);
          n++;
        }
      }
    }
  }
  // landmarks (one per district, 22 §3.3)
  for (const d of DISTRICTS) {
    const at = landmarkAt.get(d.slug) ?? d.center;
    const id = d.landmark[0];
    entities.push({ id, kind: 'landmark', parcelId: `pcl_port_avalon_${id}`, name: d.landmark[1], districtId: distId(d), sector: null, companyId: null, forSale: false, atAuction: false, lifecycle: 'OCCUPIED', heightLevel: 5 });
    parts.push({ ownerId: id, cm: [cm(at[0]), cm(at[1]), 1600, 1600, 0, 2000, 0, 3] });
  }
  // crown parcels (10 §3.22): real buildings with a public company owner; no anonymous tower
  const crowns: [string, string, string, 'city_crown' | null, number][] = [
    ['bnd_crown_meridian_spire', 'The Crown at Meridian Spire', 'cmp_aurh', 'city_crown', 250],
    ['bnd_crown_harborline', 'Harborline Crown Site', 'cmp_avnb', null, 210],
  ];
  crowns.forEach(([id, name, companyId, title, h], k) => {
    const [x, z] = crownSites[k];
    const district = nearest(x, z);
    entities.push({ id, kind: 'crown_tower', parcelId: `pcl_port_avalon_crown_${k + 1}`, name, districtId: distId(district), sector: null, companyId, forSale: false, atAuction: false, lifecycle: 'OCCUPIED', heightLevel: Math.round(h / 4), title, archetypeId: 'arch_crown_spire' });
    // body + crown: the crown sits flush on the body (no detached base)
    parts.push({ ownerId: id, cm: [cm(x), cm(z), 1800, 1800, 0, cm(h), 0, 1] });
    parts.push({ ownerId: id, cm: [cm(x), cm(z), 1000, 1000, cm(h), 3000, 0, 1] });
  });
  // parks into the mask
  for (const [x0, z0, x1, z1] of parks) {
    for (let j = Math.floor((z0 + EXTENT) / cellM); j <= Math.floor((z1 + EXTENT) / cellM); j++) {
      for (let i = Math.floor((x0 + EXTENT) / cellM); i <= Math.floor((x1 + EXTENT) / cellM); i++) {
        if (i >= 0 && j >= 0 && i < GROUND && j < GROUND && mask[j * GROUND + i] === 1) mask[j * GROUND + i] = 2;
      }
    }
  }
  const districts: CityDistrict[] = DISTRICTS.map((d) => {
    const id = distId(d);
    const base = { working: 0.9, mid: 1.4, prime: 2.6, trophy: 4.1 }[d.tier];
    return {
      id,
      nameKey: `district.${id}`,
      tier: d.tier,
      rentIndex: roundRatio(0.8 + r() * 0.6),
      priceIndex: roundRatio(0.8 + r() * 0.6),
      byUse: {
        OFFICE: { rentPerM2PerGD: (base * (1 + r() * 0.3)).toFixed(2), vacancy: roundRatio(0.05 + r() * 0.2), pressure: roundRatio(r()) },
        RES: { rentPerM2PerGD: (base * 0.8 * (1 + r() * 0.3)).toFixed(2), vacancy: roundRatio(0.03 + r() * 0.12), pressure: roundRatio(r()) },
        RETAIL: { rentPerM2PerGD: (base * 1.2 * (1 + r() * 0.3)).toFixed(2), vacancy: roundRatio(0.06 + r() * 0.2), pressure: roundRatio(r()) },
      },
      listings: entities.filter((e) => e.districtId === id && e.forSale).length,
      polygon: hull(lotsByDistrict.get(id) ?? []),
    };
  });
  const pr = rng(privateSeed);
  return {
    entities,
    parts,
    mask,
    districts,
    privateNoise: {
      trades: Array.from({ length: 50 }, (_, i) => ({ accountId: `acc_${i}`, qty: Math.floor(pr() * 100), px: (pr() * 300).toFixed(2) })),
      online: Array.from({ length: 20 }, () => Math.floor(pr() * 1e6)),
    },
  };
}

function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ---------- publisher stand-in ----------
export interface Published {
  snapshot: CitySnapshot;
  manifest: CityManifest;
  /** url → bytes; every file the CDN would hold for this version */
  files: Map<string, Uint8Array>;
}

/** Publishes the public part of a world. Reads only allowlisted fields via publicSnapshot. */
export function publish(world: World, stateVersion: number, publicSnapshotTick: number, cityId = CITY_ID): Published {
  const files = new Map<string, Uint8Array>();
  const put = (bytes: Uint8Array, ext: string) => {
    const contentHash = sha256(bytes);
    const url = hashedUrl(cityId, contentHash, ext);
    files.set(url, bytes);
    return { url, contentHash };
  };
  const ground = put(world.mask, 'bin');
  // chunks: a part belongs to the chunk holding its centre
  const byKey = new Map<string, { ids: string[]; parts: number[][] }>();
  const sorted = [...world.parts].sort((a, b) => (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0));
  for (const p of sorted) {
    const key = chunkKeyOf(p.cm[0], p.cm[1]);
    let c = byKey.get(key);
    if (!c) byKey.set(key, (c = { ids: [], parts: [] }));
    let slot = c.ids.indexOf(p.ownerId);
    if (slot < 0) slot = c.ids.push(p.ownerId) - 1;
    const row = [...p.cm];
    row[6] = slot;
    c.parts.push(row);
  }
  const chunkFiles = [...byKey.keys()].sort().map((chunkKey) => {
    const c = byKey.get(chunkKey)!;
    return { chunkKey, ...put(encodeChunk(c.ids, c.parts), 'bin') };
  });
  const snapshot = publicSnapshot({
    schemaVersion: 1,
    cityId,
    stateVersion,
    baseVersion: null,
    publicSnapshotTick,
    ccy: 'FDL',
    ground: { contentHash: ground.contentHash, size: GROUND, cellCm: CELL_CM, originCm: [ORIGIN_CM, ORIGIN_CM] },
    districts: world.districts,
    entities: world.entities,
    chunks: chunkFiles.map(({ chunkKey, contentHash }) => ({ chunkKey, contentHash })),
  });
  const snap = put(canonicalBytes(snapshot), 'json');
  const manifest: CityManifest = {
    schemaVersion: 1,
    cityId,
    stateVersion,
    publicSnapshotTick,
    snapshot: { ...snap, stateVersion },
    deltas: [],
    chunks: chunkFiles,
    ground,
    t0: [],
  };
  return { snapshot, manifest, files };
}

/** The delta between two published snapshots (public-state shape + base version). */
export function diff(a: CitySnapshot, b: CitySnapshot): CityDelta {
  const enc = (x: unknown) => JSON.stringify(x);
  const aE = new Map(a.entities.map((e) => [e.id, enc(e)]));
  const bIds = new Set(b.entities.map((e) => e.id));
  const aC = new Map(a.chunks.map((c) => [c.chunkKey, c.contentHash]));
  const bC = new Set(b.chunks.map((c) => c.chunkKey));
  const aD = new Map(a.districts.map((d) => [d.id, enc(d)]));
  return {
    schemaVersion: 1,
    cityId: b.cityId,
    stateVersion: b.stateVersion,
    baseVersion: a.stateVersion,
    publicSnapshotTick: b.publicSnapshotTick,
    ccy: b.ccy,
    ground: b.ground,
    districts: b.districts.filter((d) => aD.get(d.id) !== enc(d)),
    entities: [
      ...b.entities.filter((e) => aE.get(e.id) !== enc(e)),
      ...a.entities.filter((e) => !bIds.has(e.id)).map((e) => ({ id: e.id, removed: true as const })),
    ],
    chunks: [
      ...b.chunks.filter((c) => aC.get(c.chunkKey) !== c.contentHash),
      ...a.chunks.filter((c) => !bC.has(c.chunkKey)).map((c) => ({ chunkKey: c.chunkKey, removed: true as const })),
    ],
  };
}

/** v2 of the reference world: one sign renamed, one listing sold (removed), one building started. */
export function worldV2(w: World): World {
  const entities = w.entities.map((e) => ({ ...e }));
  const store = entities.find((e) => e.kind === 'storefront')!;
  store.name = `${store.name} & Sons`;
  const listingIdx = entities.findIndex((e) => e.kind === 'listing');
  const listing = entities[listingIdx];
  entities.splice(listingIdx, 1);
  const prop = entities.find((e) => e.kind === 'property' && e.lifecycle === 'OCCUPIED')!;
  prop.lifecycle = 'REUSE';
  return { ...w, entities, parts: w.parts.filter((p) => p.ownerId !== listing.id) };
}

export interface GeneratedCity {
  snapshot: CitySnapshot;
  files: Map<string, Uint8Array>;
  /** manifest url → manifest per published version */
  manifests: Map<number, CityManifest>;
}

/** v1 and v2 of the reference city, with the v1→v2 delta listed in the v2 manifest. */
export function generateCity(seed = REFERENCE_SEED, privateSeed = 1): GeneratedCity {
  const w1 = buildWorld(seed, privateSeed);
  const p1 = publish(w1, 1, 14_400);
  const p2 = publish(worldV2(w1), 2, 15_840);
  const files = new Map([...p1.files, ...p2.files]);
  const delta = diff(p1.snapshot, p2.snapshot);
  const deltaBytes = canonicalBytes(delta);
  const contentHash = sha256(deltaBytes);
  const url = hashedUrl(CITY_ID, contentHash, 'json');
  files.set(url, deltaBytes);
  p2.manifest.deltas = [{ base: 1, url, contentHash }];
  // sanity: the publisher invariant (SR Q4)
  const applied = canonicalBytes(applyDelta(p1.snapshot, delta));
  if (sha256(applied) !== sha256(canonicalBytes(p2.snapshot))) throw new Error('publisher: delta does not reproduce v2');
  return { snapshot: p1.snapshot, files, manifests: new Map([[1, p1.manifest], [2, p2.manifest]]) };
}

export { manifestUrl, CHUNK_SIZE_CM };
