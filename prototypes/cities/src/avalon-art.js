// Explicit art recipes for Port Avalon. Other cities return their personality unchanged.
import { hash2 } from './noise.js';

// Per-district overrides: [heightMedian, heightSigma, heightMin, heightMax], type weights,
// facade palette and the layout rules the art direction asks for. These are the first
// art-direction candidate values, not approved final numbers.
const RECIPES = {
  oldharbor: {
    height: [14, 0.12, 9, 21],
    gap: 0,
    types: [['row', 4], ['midrise', 1]],
    facade: [0x9c5a43, 0x8a4b38, 0xa86b4f, 0xb07a5c],
    // connected narrow masonry frontages: no random towers inside the old fabric
    interior: false,
    trees: 0.22,
  },
  midtown: {
    height: [52, 0.5, 18, 260],
    types: [['tower', 2], ['midrise', 3]],
    // a cluster, not one tower per parcel: two thirds of the Midtown type weight is midrise
  },
  docks: {
    height: [10, 0.16, 7, 18],
    types: [['warehouse', 5], ['loft', 1], ['containers', 2]],
    trees: 0.04,
  },
  gilthill: {
    height: [10, 0.12, 8, 15],
    // low detached buildings, generous gaps, contour-following lanes
    jitter: 0.18,
  },
  northgate: { height: [16, 0.16, 9, 28] },
  westbank: { height: [10, 0.14, 6, 18] },
};

/** A prepared clone of a personality with Avalon districts replaced by their recipes. */
export function preparePersonality(P) {
  if (P.id !== 'avalon') return P;
  const districts = P.districts.map((d) => (RECIPES[d.id] ? { ...d, ...RECIPES[d.id] } : { ...d }));
  return { ...P, districts };
}

/**
 * Block-correlated cornice height for the ordinary masonry districts. Architectural families
 * share a baseline per block (block seed) with small per-parcel variation, so a street wall
 * reads as one terrace rather than random heights. Deterministic and order independent: it
 * never consumes the shared random stream.
 */
export function avalonHeight(districtId, blockSeed, x, y, proposed, seed = 1701) {
  if (!['oldharbor', 'northgate', 'westbank'].includes(districtId)) return proposed;
  const floorHeight = 3.3;
  const baseFloors = districtId === 'westbank' ? 2 : 3;
  const floors = baseFloors + Math.floor(hash2(blockSeed, 0, seed) * 2);
  const variation = (hash2(Math.round(x * 10), Math.round(y * 10), seed) - 0.5) * 0.8;
  return floors * floorHeight + variation;
}

/** Whether a district keeps its generated placement/scatter choice. */
export function keepsPlacement(districtId) {
  return districtId === 'gilthill';
}