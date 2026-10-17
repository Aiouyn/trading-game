// Map lenses: one at a time. A lens paints buildings (an rgb tint plus the emphasis bit, written to the
// per-building state texture, see render.js), may tint the ground (`ground`: 0 none, 1 land value, 2 districts),
// and describes its legend. A legend row either filters the lens (`filter`), flies the camera (`fly: [x, z, scale]`)
// or selects a building (`bid`). main.js handles those.

import { SECTORS } from './companies.js';

// categorical palette: 12 hues that read on the dark panels and on the ground (sectors, owners, districts)
export const PALETTE = [0x4e79a7, 0xf28e2b, 0xe15759, 0x76b7b2, 0x59a14f, 0xb07aa1, 0xff9da7, 0x9c755f, 0xbab0ac, 0x8cd17d, 0xa0cbe8, 0xd4a373];
export const BRASS = 0xc9a45c;
export const TEAL = 0x3fae8f;
export const CORAL = 0xd0705c;
export const IVORY = 0xe8e2d0;
const NEUTRAL = 0xcfc8b8;
// land value ramp: deep blue (low) to brass (high)
export const RAMP = [0x1b3a66, 0x5d849a, 0xc9a45c];

export const SECTOR_NAMES = {
  tech: 'Tech', semis: 'Semiconductors', financials: 'Financials', discretionary: 'Consumer discretionary',
  health: 'Health care', staples: 'Consumer staples', industrials: 'Industrials', media: 'Media', energy: 'Energy',
  security: 'Security', realestate: 'Real estate', materials: 'Materials',
};
export const LENS_IDS = ['normal', 'mine', 'market', 'sectors', 'owners', 'value', 'districts', 'use'];
export const LENS_NAMES = {
  normal: 'Normal', mine: 'Mine', market: 'Market', sectors: 'Sectors', owners: 'Owners', value: 'Land value', districts: 'Districts', use: 'Use',
};
const USE = [
  { id: 'hq', name: 'Headquarters', color: 0x4e79a7 }, { id: 'crown', name: 'Crown tower', color: 0xe8d27a },
  { id: 'landmark', name: 'Landmark', color: 0xe15759 }, { id: 'office', name: 'Office', color: 0x76b7b2 },
  { id: 'shop', name: 'Shop', color: 0xf28e2b }, { id: 'home', name: 'Home', color: 0x8cd17d },
  { id: 'estate', name: 'Estate', color: 0xb07aa1 }, { id: 'industry', name: 'Industry', color: 0x8a8f98 },
];
const USE_BY_ID = Object.fromEntries(USE.map((u) => [u.id, u]));
const ROLE_NAME = { company: 'Office', shop: 'Shop', home: 'Home' };
const ROLE_RANK = { company: 0, shop: 1, home: 2 };

const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const RAMP_RGB = RAMP.map(hexRGB);

export function rampAt(v) {
  const t = Math.min(1, Math.max(0, v));
  return t < 0.5 ? mix(RAMP_RGB[0], RAMP_RGB[1], t * 2) : mix(RAMP_RGB[1], RAMP_RGB[2], (t - 0.5) * 2);
}

/** A headquarters' day return: the same formula as the info card and the shader. mood is -1..1. */
export function dayReturn(bid, mood) {
  const h1 = (bid * 0.61803398875) % 1, h2 = (bid * 0.75487766625) % 1;
  return mood * 0.06 * (0.5 + h1) + (h2 - 0.5) * 0.024;
}

// strength grows with the move: a flat day is a pale tint, a 3% move is full
const marketTint = (ret) => mix(hexRGB(NEUTRAL), hexRGB(ret >= 0 ? TEAL : CORAL), Math.min(1, 0.5 + (Math.abs(ret) / 0.03) * 0.5));

/** Build the lens set for one city. Lens objects keep their own filter (null, or a key the legend picked). */
export function makeLenses(city) {
  const B = city.buildings, P = city.P, half = city.S / 2;
  const lenses = {};
  const add = (id, o) => { lenses[id] = { id, name: LENS_NAMES[id], ground: 0, filterable: false, filter: null, ...o }; };
  const count = (list, key) => list.reduce((m, x) => { const k = key(x); if (k != null) m.set(k, (m.get(k) ?? 0) + 1); return m; }, new Map());

  add('normal', { paint: () => null, legend: () => null });

  // Mine: your assets by role
  add('mine', {
    paint: (b) => (b.mine ? { rgb: hexRGB(BRASS) } : null),
    legend: () => {
      const mine = B.filter((b) => b.mine).sort((a, b) => (ROLE_RANK[a.mineRole] ?? 9) - (ROLE_RANK[b.mineRole] ?? 9) || a.id - b.id);
      return {
        rows: mine.map((b) => ({ swatch: BRASS, label: b.label ?? 'Asset', value: ROLE_NAME[b.mineRole] ?? '', bid: b.id })),
        note: mine.length ? 'Click an asset to fly there and open its card.' : 'You own nothing in this city.',
      };
    },
  });

  // Market: headquarters tinted by today's return
  const hqs = B.filter((b) => b.company);
  add('market', {
    paint: (b, env) => (b.company ? { rgb: marketTint(dayReturn(b.id, env.mood)) } : null),
    legend: (env) => {
      const moves = hqs.map((b) => ({ b, r: dayReturn(b.id, env.mood) }));
      const up = moves.filter((m) => m.r >= 0).length;
      const sorted = moves.slice().sort((x, y) => y.r - x.r);
      const row = (m) => ({
        swatch: m.r >= 0 ? TEAL : CORAL, label: m.b.company.ticker, sub: m.b.company.name,
        value: `${m.r >= 0 ? '+' : '−'}${(Math.abs(m.r) * 100).toFixed(2)}%`, bid: m.b.id,
      });
      const gainers = sorted.filter((m) => m.r > 0).slice(0, 3), losers = sorted.filter((m) => m.r < 0).slice(-3).reverse();
      return {
        rows: [
          { swatch: TEAL, label: 'Up', value: up },
          { swatch: CORAL, label: 'Down', value: moves.length - up },
          { head: 'Top gainers' }, ...(gainers.length ? gainers.map(row) : [{ empty: 'None today' }]),
          { head: 'Top losers' }, ...(losers.length ? losers.map(row) : [{ empty: 'None today' }]),
        ],
        note: 'Headquarters light up by today’s return. Move the market slider to re-tint.',
      };
    },
  });

  // Sectors: headquarters by sector, filterable
  const secCount = count(hqs, (b) => b.company.sector);
  const secList = [...secCount.keys()].sort((a, c) => secCount.get(c) - secCount.get(a) || SECTORS.indexOf(a) - SECTORS.indexOf(c));
  const secColor = (s) => PALETTE[Math.max(0, SECTORS.indexOf(s)) % PALETTE.length];
  add('sectors', {
    filterable: true,
    paint: (b) => (b.company ? { rgb: hexRGB(secColor(b.company.sector)), key: b.company.sector } : null),
    legend: () => ({
      rows: secList.map((s) => ({ swatch: secColor(s), label: SECTOR_NAMES[s] ?? s, value: secCount.get(s), filter: s })),
      note: 'Click a sector to show only its headquarters. Click again to show all.',
    }),
  });

  // Owners: you in brass, each other player one colour, buildings for sale in ivory
  const ownCount = count(B, (b) => b.owner);
  const owners = [...ownCount.keys()].sort((a, c) => (a === 'you' ? -1 : c === 'you' ? 1 : ownCount.get(c) - ownCount.get(a)));
  const ownerColor = new Map();
  let oi = 0;
  for (const h of owners) ownerColor.set(h, h === 'you' ? BRASS : PALETTE[oi++ % PALETTE.length]);
  const saleN = B.filter((b) => b.forSale).length;
  add('owners', {
    filterable: true,
    paint: (b) => {
      if (b.owner) return { rgb: hexRGB(ownerColor.get(b.owner)), key: b.owner };
      if (b.forSale) return { rgb: hexRGB(IVORY), key: 'sale' };
      return null;
    },
    legend: () => ({
      rows: [
        ...owners.map((h) => ({ swatch: ownerColor.get(h), label: h === 'you' ? 'You' : h, value: ownCount.get(h), filter: h })),
        ...(saleN ? [{ swatch: IVORY, label: 'For sale', value: saleN, filter: 'sale' }] : []),
      ],
      note: 'Click an owner to show only their buildings.',
    }),
  });

  // Land value: the ground ramps from deep blue to brass; buildings take the value at their centre
  const V = city.value;
  const valueAt = (x, y) => {
    const i = Math.min(V.n - 1, Math.max(0, Math.floor((x + half) / V.res)));
    const j = Math.min(V.n - 1, Math.max(0, Math.floor((y + half) / V.res)));
    return V.data[j * V.n + i];
  };
  add('value', {
    ground: 1,
    paint: (b) => ({ rgb: rampAt(valueAt(b.x, b.y)) }),
    legend: () => ({ rows: [], ramp: true, note: 'Deep blue is cheap land, brass the most valuable.' }),
  });

  // Districts: each district one colour, on the ground and on its buildings; click a name to fly there
  const dIndex = new Map(P.districts.map((d, i) => [d.id, i]));
  const dCount = new Array(P.districts.length).fill(0);
  for (const b of B) { const i = dIndex.get(b.d?.id); if (i != null) dCount[i]++; }
  add('districts', {
    ground: 2,
    paint: (b) => {
      const i = dIndex.get(b.d?.id);
      return i == null ? null : { rgb: hexRGB(PALETTE[i % PALETTE.length]) };
    },
    legend: () => ({
      rows: P.districts.map((d, i) => ({ swatch: PALETTE[i % PALETTE.length], label: d.name, value: dCount[i], fly: [d.x, d.y, 0.6] })),
      note: 'Click a district to fly to its centre.',
    }),
  });

  // Use: by building category, filterable
  const catCount = count(B, (b) => b.cat);
  add('use', {
    filterable: true,
    paint: (b) => { const u = USE_BY_ID[b.cat]; return u ? { rgb: hexRGB(u.color), key: b.cat } : null; },
    legend: () => ({
      rows: USE.filter((u) => catCount.get(u.id)).map((u) => ({ swatch: u.color, label: u.name, value: catCount.get(u.id), filter: u.id })),
      note: 'Click a use to show only those buildings.',
    }),
  });

  return lenses;
}

/**
 * Apply a lens: clear the emphasis bit, write each emphasised building's tint and set its bit, then commit.
 * Sets the lens uniforms (uLens, uLensGround, uLensDim). Returns the time spent in ms.
 */
export function applyLens(view, city, lens, env) {
  const t0 = performance.now();
  const u = view.uniforms;
  view.clearState(1);
  const on = lens.id !== 'normal';
  if (on) {
    for (const b of city.buildings) {
      const p = lens.paint(b, env);
      if (!p) continue;
      if (lens.filter != null && p.key !== lens.filter) continue;
      const [r, g, bl] = p.rgb;
      view.setState(b.id, Math.round(r), Math.round(g), Math.round(bl), view.getFlags(b.id) | 1);
    }
  }
  u.uLens.value = on ? 1 : 0;
  u.uLensGround.value = on ? lens.ground : 0;
  u.uLensDim.value = on ? 0.18 : 0;
  view.commitState();
  return performance.now() - t0;
}
