import type { CityOverlay } from '../index';
import type { Ramps } from '../art/ramps';
import { mixOklab, type Rgb } from '../art/color';
import type { CityDistrict, CityEntity } from '../data/types';

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
}

/**
 * Per-part colour and the "flat" flag (exact token colour, unlit). Brass discipline (17 §3.1.1):
 * --acc is used only for crown towers and the player's own places; selection is drawn separately.
 */
export function partColors(p: PartColorInput, r: Ramps): { colors: Float32Array; flat: Uint8Array } {
  const n = p.entity.length;
  const colors = new Float32Array(n * 3);
  const flat = new Uint8Array(n);
  const dIndex = new Map(p.districts.map((d) => [d.id, d.index]));
  const showMine = p.myCityOverlay || p.overlay === 'my_places';
  for (let i = 0; i < n; i++) {
    const base = r.facades[p.style[i] & 3];
    const ei = p.entity[i];
    const e = ei >= 0 ? p.entities[ei] : undefined;
    let c: Rgb = base;
    if (e) {
      if (e.kind === 'crown_tower' || (showMine && p.mine.has(e.id))) {
        c = r.brass;
        flat[i] = 1;
      } else {
        c = overlayColor(p.overlay, e, base, r, dIndex);
      }
    } else if (p.overlay !== 'none' && p.overlay !== 'my_places') {
      c = mixOklab(base, r.water, 0.35);
    }
    colors.set(c, i * 3);
  }
  return { colors, flat };
}

function overlayColor(o: CityOverlay, e: CityEntity, base: Rgb, r: Ramps, dIndex: Map<string, number>): Rgb {
  const dim = mixOklab(base, r.water, 0.35);
  switch (o) {
    case 'none':
    case 'my_places':
      return base;
    case 'districts':
      return r.districtHues[(dIndex.get(e.districtId) ?? 0) % r.districtHues.length];
    case 'sectors':
      return r.districtHues[hash(e.sector) % r.districtHues.length];
    case 'for_sale':
      return e.forSale || e.kind === 'listing' ? mixOklab(base, r.label, 0.55) : dim;
    case 'auctions':
      return e.atAuction ? mixOklab(base, r.label, 0.55) : dim;
    case 'movers': {
      const t = Math.min(1, Math.abs(e.dayReturn) / 0.05);
      return mixOklab(base, e.dayReturn >= 0 ? r.gain : r.loss, 0.15 + 0.6 * t);
    }
    case 'development':
      return e.development < 1 ? mixOklab(base, r.label, 0.4) : dim;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
