// Search over one city: headquarters (name, ticker, sector), crown towers and owners (handles), named buildings,
// buildings for sale ("sale"), and districts. A hit carries a building id (bid) or a map point (fly).

import { SECTOR_NAMES } from './lenses.js';

const KIND = {
  hq: 'Headquarters', crown: 'Crown tower', landmark: 'Landmark', office: 'Office', shop: 'Shop', home: 'Home',
  estate: 'Estate', industry: 'Industry',
};

/** Index the city once per load. Only buildings with something to find are indexed (no plain houses). */
export function buildSearch(city) {
  const items = [];
  for (const b of city.buildings) {
    const hq = !!b.company, crown = !!b.crown;
    if (!(hq || crown || b.mine || b.owner || b.forSale || b.label)) continue;
    let kind = hq ? KIND.hq : crown ? KIND.crown : (KIND[b.cat] ?? 'Building');
    if (b.mine) kind = `Your ${kind.toLowerCase()}`;
    const title = hq ? b.company.name : (b.label ?? b.kind ?? kind);
    const place = b.d?.name ?? '';
    const hint = [kind, b.forSale ? 'For sale' : '', b.owner && !b.mine && !crown ? `held by ${b.owner}` : '', place].filter(Boolean).join(' · ');
    const text = [title, b.label ?? '', hq ? `${b.company.ticker} ${SECTOR_NAMES[b.company.sector] ?? ''}` : '', b.owner ?? '', b.forSale ? 'for sale' : '']
      .join(' ').toLowerCase();
    // ranking ties: your office and the headquarters first, then crowns, landmarks, districts, other assets
    const rank = hq ? 0 : crown ? 1 : b.mine && b.mineRole === 'company' ? 2 : b.cat === 'landmark' ? 3 : b.mine ? 5 : b.owner ? 6 : 7;
    items.push({ bid: b.id, title, titleL: title.toLowerCase(), hint, text, rank });
  }
  for (const d of city.P.districts) {
    items.push({ title: d.name, titleL: d.name.toLowerCase(), hint: 'District', text: d.name.toLowerCase(), rank: 4, fly: [d.x, d.y, 0.6] });
  }
  return items;
}

/** Up to `max` hits for a query: every word must appear; the title's start ranks first. */
export function searchCity(items, query, max = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const it of items) {
    if (!words.every((w) => it.text.includes(w))) continue;
    const score = it.titleL.startsWith(q) ? 3 : it.titleL.includes(q) ? 2 : 1;
    scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score || a.it.rank - b.it.rank || a.it.titleL.length - b.it.titleL.length || (a.it.titleL < b.it.titleL ? -1 : 1));
  return scored.slice(0, max).map((s) => s.it);
}
