import type { CityOverlay } from '../index';
import type { Ramps } from '../art/ramps';
import { mixOklab, type Rgb } from '../art/color';
import type { CityDistrict, CityEntity } from '../data/types';
import { materialId, partLook, visSeed, type Anchors } from '../art/materials';

export interface PartColorInput {
  /** per part: entity index into `entities` or -1 */
  entity: Int32Array;
  /** per part: facade style 0..3 */
  style: Uint8Array;
  entities: CityEntity[];
  districts: CityDistrict[];
  mine: ReadonlySet<string>;
  overlay: CityOverlay;
  myCityOverlay: boolean;
  /** Published day return of a company, from the market view; null = unavailable (SR Q8). */
  quote?: (companyId: string) => number | null;
  /** Card 2 district materials (§2.1). Absent = card-1 facade ramp (not wired in create.ts yet). */
  materials?: { anchors: Anchors; cityId: string };
}

/** flat: 0 = lit facade, 1 = exact colour, 2 = shaded brass (--acc-hi / --acc / --acc-lo). */
export const FLAT_LIT = 0;
export const FLAT_EXACT = 1;
export const FLAT_BRASS = 2;

/**
 * Per-part colour and shading mode. Brass discipline (17 §3.1.1): brass only on crown towers and
 * the player's own places; selection is drawn separately.
 */
export interface PartColors {
  colors: Float32Array;
  flat: Uint8Array;
  /** iMat per part (id, variant); id 0 = plain (no entity, no materials, or a data overlay) */
  mat: Float32Array;
  /** window seed per part, 0..1 (seed bits 24–31), or −1 = the card-1 per-part hash */
  windowSeed: Float32Array;
}

export function partColors(p: PartColorInput, r: Ramps): PartColors {
  const n = p.entity.length;
  const colors = new Float32Array(n * 3);
  const flat = new Uint8Array(n);
  const mat = new Float32Array(n * 2);
  const windowSeed = new Float32Array(n).fill(-1);
  // with a data overlay on, materials switch off so overlay colours read exactly as card 1 (§1)
  const matOn = p.materials && (p.overlay === 'none' || p.overlay === 'my_places') ? p.materials : undefined;
  const dIndex = new Map(p.districts.map((d, i) => [d.id, i]));
  const showMine = p.myCityOverlay || p.overlay === 'my_places';
  for (let i = 0; i < n; i++) {
    const base = r.facades[p.style[i] & 3];
    const ei = p.entity[i];
    const e = ei >= 0 ? p.entities[ei] : undefined;
    const L = e && matOn ? partLook(matOn.anchors, materialId(e.districtId, matOn.cityId), visSeed(matOn.cityId, e.parcelId)) : undefined;
    const look = L ? L.wall : base;
    if (L) {
      mat.set(L.mat, i * 2);
      windowSeed[i] = L.windowSeed / 256;
    }
    let c: Rgb = base;
    if (e) {
      if (e.kind === 'crown_tower' || (showMine && p.mine.has(e.id))) {
        c = r.brass;
        flat[i] = FLAT_BRASS;
      } else {
        c = overlayColor(p.overlay, e, look, r, dIndex, p.quote);
      }
    } else if (p.overlay !== 'none' && p.overlay !== 'my_places') {
      c = mixOklab(base, r.water, 0.35);
    }
    colors.set(c, i * 3);
  }
  return { colors, flat, mat, windowSeed };
}

const SECTOR_ORDER = ['TECH', 'SEMI', 'ENERGY', 'MATERIALS', 'INDUSTRIALS', 'FINANCIALS', 'HEALTH', 'STAPLES', 'DISCRETIONARY', 'REAL_ESTATE', 'MEDIA', 'SECURITY'];

function overlayColor(o: CityOverlay, e: CityEntity, base: Rgb, r: Ramps, dIndex: Map<string, number>, quote?: (id: string) => number | null): Rgb {
  const dim = mixOklab(base, r.water, 0.35);
  const hi = mixOklab(base, r.label, 0.55);
  switch (o) {
    case 'none':
    case 'my_places':
      return base;
    case 'districts':
      return r.districtHues[(dIndex.get(e.districtId) ?? 0) % r.districtHues.length];
    case 'sectors':
      return e.sector ? r.districtHues[SECTOR_ORDER.indexOf(e.sector) % r.districtHues.length] : dim;
    case 'for_sale':
      return e.forSale || e.kind === 'listing' ? hi : dim;
    case 'auctions':
      return e.atAuction ? hi : dim;
    case 'movers': {
      // HQs only, from the market view's quote; no quote → unavailable → dimmed like the rest
      const bp = e.kind === 'company_hq' && e.companyId && quote ? quote(e.companyId) : null;
      if (bp === null) return dim;
      const t = Math.min(1, Math.abs(bp) / 500);
      return mixOklab(base, bp >= 0 ? r.gain : r.loss, 0.15 + 0.6 * t);
    }
    case 'development':
      return e.lifecycle === 'PLANNED' || e.lifecycle === 'SERVICED' || e.lifecycle === 'BUILDING' || e.lifecycle === 'REUSE' ? hi : dim;
  }
}
