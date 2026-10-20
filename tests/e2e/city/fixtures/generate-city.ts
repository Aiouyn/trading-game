// Tooling only (approved as the reference seed): generates a published-style test city —
// a snapshot, a ground mask and content-hashed binary chunks — deterministically from a seed.
// Production clients never generate cities (spec §5).
import { CHUNK_MAGIC, CHUNK_SIZE_M, CHUNK_VERSION, FLOATS_PER_PART } from '../../../../src/city/worker/format';
import { snapshotUrl } from '../../../../src/city/data/urls';
import type { CityDistrict, CityEntity, CitySnapshot, EntityKind } from '../../../../src/city/data/types';

export interface GeneratedCity {
  snapshot: CitySnapshot;
  files: Map<string, Uint8Array>;
}

export const REFERENCE_SEED = 20261020;
const EXTENT = 512;
const GROUND = 256;
const BLOCK = 48;
const ROAD = 8;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function fnv(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function encodeChunk(ids: string[], parts: number[]): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(ids));
  const pad = Math.ceil(json.length / 4) * 4;
  const count = parts.length / FLOATS_PER_PART;
  const buf = new ArrayBuffer(16 + pad + parts.length * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, CHUNK_MAGIC, true);
  dv.setUint32(4, CHUNK_VERSION, true);
  dv.setUint32(8, json.length, true);
  dv.setUint32(12, count, true);
  new Uint8Array(buf, 16, json.length).set(json);
  new Float32Array(buf, 16 + pad).set(parts);
  return new Uint8Array(buf);
}

const DISTRICTS: { id: string; name: string; center: [number, number] }[] = [
  { id: 'd-midtown', name: 'Midtown', center: [40, -40] },
  { id: 'd-oldharbor', name: 'Old Harbor', center: [-180, 120] },
  { id: 'd-gilthill', name: 'Gilt Hill', center: [-160, -260] },
  { id: 'd-docks', name: 'Eastside Docks', center: [230, 200] },
  { id: 'd-westbank', name: 'West Bank', center: [-330, -40] },
];
const SECTORS = ['tech', 'finance', 'energy', 'retail', 'industry', 'health'];

function isWaterAt(x: number, z: number): boolean {
  // a bay in the south-east and a strip of sea along the south edge
  const bay = Math.hypot(x - 330, z - 360) < 230;
  const coast = z > 430 - 0.15 * x;
  return bay || coast;
}

export function generateCity(seed = REFERENCE_SEED, cityId = 'port-avalon', stateVersion = 1): GeneratedCity {
  const r = rng(seed);
  const files = new Map<string, Uint8Array>();

  // ground mask
  const mask = new Uint8Array(GROUND * GROUND);
  const cell = (2 * EXTENT) / GROUND;
  for (let j = 0; j < GROUND; j++) {
    for (let i = 0; i < GROUND; i++) {
      const x = -EXTENT + (i + 0.5) * cell, z = -EXTENT + (j + 0.5) * cell;
      let k = isWaterAt(x, z) ? 0 : 1;
      if (k === 1) {
        const bx = ((x % BLOCK) + BLOCK) % BLOCK, bz = ((z % BLOCK) + BLOCK) % BLOCK;
        if (bx < ROAD || bz < ROAD) k = 3;
      }
      mask[j * GROUND + i] = k;
    }
  }
  const groundUrl = `/city/${cityId}/ground.${fnv(mask)}.bin`;
  files.set(groundUrl, mask);

  // buildings
  const entities: CityEntity[] = [];
  const chunkParts = new Map<string, { ids: string[]; parts: number[] }>();
  const nearest = (x: number, z: number) =>
    DISTRICTS.reduce((best, d) => (Math.hypot(x - d.center[0], z - d.center[1]) < Math.hypot(x - best.center[0], z - best.center[1]) ? d : best));
  const parkBlocks = new Set<string>();
  let n = 0;
  for (let bz = -EXTENT; bz < EXTENT; bz += BLOCK) {
    for (let bx = -EXTENT; bx < EXTENT; bx += BLOCK) {
      const cx = bx + BLOCK / 2, cz = bz + BLOCK / 2;
      if (isWaterAt(cx, cz) || isWaterAt(bx, bz) || isWaterAt(bx + BLOCK, bz + BLOCK)) continue;
      const dDown = Math.hypot(cx - 40, cz - 40);
      if (dDown > 470) continue;
      if (r() < 0.05) {
        parkBlocks.add(`${bx},${bz}`);
        continue;
      }
      // 3×3 lots per block
      const lot = (BLOCK - ROAD) / 3;
      for (let lz = 0; lz < 3; lz++) {
        for (let lx = 0; lx < 3; lx++) {
          if (r() < 0.12) continue;
          const x = bx + ROAD + lot * (lx + 0.5), z = bz + ROAD + lot * (lz + 0.5);
          const w = lot * (0.6 + 0.3 * r()), d = lot * (0.6 + 0.3 * r());
          const tall = Math.max(0, 1 - dDown / 260);
          const h = 6 + 12 * r() + tall * tall * (60 + 140 * r());
          const district = nearest(x, z);
          const roll = r();
          let kind: EntityKind = 'property';
          if (roll < 0.035) kind = 'company_hq';
          else if (roll < 0.15) kind = 'storefront';
          else if (roll < 0.175) kind = 'listing';
          const id = `e${n}`;
          const parcelId = `p-${Math.round(x)}-${Math.round(z)}`;
          entities.push({
            id,
            kind,
            parcelId,
            name: `${kind === 'company_hq' ? 'HQ' : kind === 'storefront' ? 'Shop' : kind === 'listing' ? 'Lot' : 'Building'} ${n}`,
            districtId: district.id,
            sector: SECTORS[Math.floor(r() * SECTORS.length)],
            dayReturn: (r() - 0.5) * 0.12,
            forSale: kind === 'listing' || r() < 0.03,
            atAuction: r() < 0.01,
            development: r() < 0.04 ? r() : 1,
          });
          const parts: number[][] = [[x, z, w, d, 0, h, 0, Math.floor(r() * 4)]];
          if (h > 50) parts.push([x, z, w * 0.62, d * 0.62, h, h * 0.35, 0, Math.floor(r() * 4)]);
          addParts(chunkParts, id, parts);
          n++;
        }
      }
    }
  }
  // landmarks and crown towers on park blocks and in Midtown
  let lm = 0;
  for (const key of [...parkBlocks].slice(0, 8)) {
    const [bx, bz] = key.split(',').map(Number);
    const x = bx + BLOCK / 2, z = bz + BLOCK / 2;
    const id = `lm${lm}`;
    entities.push({ id, kind: 'landmark', parcelId: `p-lm-${lm}`, name: `Landmark ${lm + 1}`, districtId: nearest(x, z).id, sector: 'civic', dayReturn: 0, forSale: false, atAuction: false, development: 1 });
    addParts(chunkParts, id, [[x, z, 14, 14, 0, 18, 0, 3]]);
    lm++;
  }
  [[10, -30], [70, 30], [-30, 60]].forEach(([x, z], k) => {
    const id = `ct${k}`;
    entities.push({ id, kind: 'crown_tower', parcelId: `p-ct-${k}`, name: `Crown Tower ${k + 1}`, districtId: nearest(x, z).id, sector: 'finance', dayReturn: 0, forSale: false, atAuction: false, development: 1 });
    addParts(chunkParts, id, [[x, z, 12, 12, 0, 230 + 20 * k, 0, 1], [x, z, 7, 7, 230 + 20 * k, 30, 0, 1]]);
  });
  // parks in the ground mask
  for (const key of parkBlocks) {
    const [bx, bz] = key.split(',').map(Number);
    for (let j = 0; j < GROUND; j++) for (let i = 0; i < GROUND; i++) {
      const x = -EXTENT + (i + 0.5) * cell, z = -EXTENT + (j + 0.5) * cell;
      if (x > bx + ROAD && x < bx + BLOCK && z > bz + ROAD && z < bz + BLOCK) mask[j * GROUND + i] = 2;
    }
  }
  files.delete(groundUrl);
  const groundUrl2 = `/city/${cityId}/ground.${fnv(mask)}.bin`;
  files.set(groundUrl2, mask);

  const chunks = [...chunkParts.entries()].map(([key, c]) => {
    const [cx, cz] = key.split(',').map(Number);
    const bytes = encodeChunk(c.ids, c.parts);
    const hash = fnv(bytes);
    const url = `/city/${cityId}/chunks/${cx}_${cz}.${hash}.bin`;
    files.set(url, bytes);
    return { cx, cz, url, hash };
  });

  const districts: CityDistrict[] = DISTRICTS.map((d, index) => ({
    ...d,
    index,
    rent: Math.round(800 + r() * 3000),
    listings: entities.filter((e) => e.districtId === d.id && e.forSale).length,
  }));
  const snapshot: CitySnapshot = {
    type: 'snapshot',
    cityId,
    stateVersion,
    lagTicks: 0,
    dayReturn: 0.012,
    extent: EXTENT,
    ground: { url: groundUrl2, size: GROUND },
    districts,
    entities,
    chunks,
    brief: ['Midtown rents up 2%'],
  };
  files.set(snapshotUrl(cityId, stateVersion), new TextEncoder().encode(JSON.stringify(snapshot)));
  return { snapshot, files };
}

function addParts(map: Map<string, { ids: string[]; parts: number[] }>, id: string, parts: number[][]): void {
  const [x, z] = parts[0];
  const key = `${Math.floor(x / CHUNK_SIZE_M)},${Math.floor(z / CHUNK_SIZE_M)}`;
  let c = map.get(key);
  if (!c) map.set(key, (c = { ids: [], parts: [] }));
  const slot = c.ids.length;
  c.ids.push(id);
  for (const p of parts) {
    p[6] = slot;
    c.parts.push(...p);
  }
}
