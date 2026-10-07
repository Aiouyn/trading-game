/**
 * Lifestyle and status (bible 04): ranks, licenses, the lifestyle catalog and Prestige.
 *
 * Prestige PP = sqrt(price / 1000) × rarity × condition × age factor, with diminishing weights
 * inside a category (breadth beats forty identical cars). Mass items fade, Limited and Unique
 * items track a collectibles index and can appreciate. Big purchases hit the Wire and add heat.
 */

export interface RankDef {
  id: string;
  name: string;
  threshold: number;
  /** the interface shell at this rank (bible 04 §9) */
  shell: string;
  /** what the rank unlocks, for the rank-up ceremony */
  unlocks: string[];
}

export const RANKS: RankDef[] = [
  { id: 'R0', name: 'Broke', threshold: 0, shell: 'Cracked phone', unlocks: ['Stocks and crypto (Retail license)', 'Hustle businesses (T1)', 'Port Avalon property'] },
  { id: 'R1', name: 'Hustler', threshold: 20_000, shell: 'New phone', unlocks: ['Small businesses (T2)', 'Mortgages', 'Analyst notes', 'Alliances'] },
  { id: 'R2', name: 'Owner', threshold: 250_000, shell: 'Laptop desk', unlocks: ['Pro license: shorting, 2× margin, forex, bonds, commodities', 'Companies (T3)', 'Nordhaven and Meridia property', 'The AI Lab'] },
  { id: 'R3', name: 'Operator', threshold: 5_000_000, shell: 'Trading floor', unlocks: ['Derivatives license: options and 5× margin', 'Enterprises (T4)', 'Sundara and Kaiyo property', 'Security Ops'] },
  { id: 'R4', name: 'Mogul', threshold: 100_000_000, shell: 'Penthouse office', unlocks: ['Institutional license: 10× margin', 'Conglomerates (T5)', 'Isla Serena'] },
  { id: 'R5', name: 'Titan', threshold: 2_000_000_000, shell: 'Tower command', unlocks: ['Megaprojects (T6)', 'Your name on a tower'] },
  { id: 'R6', name: 'Dynasty', threshold: 50_000_000_000, shell: 'Island control room', unlocks: ['A seat at the top of the world'] },
];

export function rankFor(netWorthPeak: number): RankDef {
  let r = RANKS[0]!;
  for (const x of RANKS) if (netWorthPeak >= x.threshold) r = x;
  return r;
}

export function rankIndex(id: string): number {
  return RANKS.findIndex((r) => r.id === id);
}

export interface LicenseDef {
  id: 'cash' | 'retail' | 'pro' | 'derivatives' | 'institutional';
  name: string;
  rank: string;
  maxLeverage: number;
  canShort: boolean;
  canOptions: boolean;
  /** asset classes it opens */
  classes: string[];
  blurb: string;
}

export const LICENSES: LicenseDef[] = [
  { id: 'retail', name: 'Retail', rank: 'R0', maxLeverage: 1, canShort: false, canOptions: false, classes: ['stock', 'crypto'], blurb: 'Buy and sell stocks and crypto with your own cash.' },
  { id: 'pro', name: 'Pro', rank: 'R2', maxLeverage: 2, canShort: true, canOptions: false, classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], blurb: 'Short selling, 2× margin, commodities, currencies and bonds.' },
  { id: 'derivatives', name: 'Derivatives', rank: 'R3', maxLeverage: 5, canShort: true, canOptions: true, classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], blurb: 'Options and up to 5× margin.' },
  { id: 'institutional', name: 'Institutional', rank: 'R4', maxLeverage: 10, canShort: true, canOptions: true, classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], blurb: 'Up to 10× margin and block trades.' },
];

export function licenseFor(rankId: string): LicenseDef {
  const idx = rankIndex(rankId);
  let l = LICENSES[0]!;
  for (const x of LICENSES) if (rankIndex(x.rank) <= idx) l = x;
  return l;
}

export type LifeCategory =
  | 'cars' | 'watches' | 'yachts' | 'jets' | 'art' | 'wine' | 'fashion' | 'experiences' | 'philanthropy' | 'trophies' | 'tech';

export type LifeClass = 'mass' | 'limited' | 'unique' | 'consumed';

export interface LifeItem {
  id: string;
  name: string;
  category: LifeCategory;
  price: number;
  cls: LifeClass;
  rarity: number;
  /** upkeep per game year as a fraction of price */
  upkeep: number;
  rank: string;
  blurb: string;
  /** perk text shown on the card; perks are small and never a cash faucet */
  perk?: string;
}

export const LIFE_CATEGORIES: { id: LifeCategory; name: string }[] = [
  { id: 'tech', name: 'Gadgets' },
  { id: 'fashion', name: 'Fashion' },
  { id: 'watches', name: 'Watches' },
  { id: 'cars', name: 'Cars' },
  { id: 'wine', name: 'Wine' },
  { id: 'art', name: 'Art' },
  { id: 'experiences', name: 'Experiences' },
  { id: 'yachts', name: 'Yachts' },
  { id: 'jets', name: 'Jets' },
  { id: 'philanthropy', name: 'Philanthropy' },
  { id: 'trophies', name: 'Trophies' },
];

const L = (id: string, name: string, category: LifeCategory, price: number, cls: LifeClass, rarity: number, upkeep: number, rank: string, blurb: string, perk?: string): LifeItem =>
  ({ id, name, category, price, cls, rarity, upkeep, rank, blurb, ...(perk ? { perk } : {}) });

export const LIFE_ITEMS: LifeItem[] = [
  // gadgets
  L('phone-new', 'A phone without a crack', 'tech', 1_200, 'mass', 1, 0, 'R0', 'Finally, a screen you can read.', 'Removes the cracked-phone shell early'),
  L('laptop-pro', 'Pro laptop', 'tech', 3_500, 'mass', 1, 0, 'R0', 'Three monitors\' worth of charts.'),
  L('trading-desk', 'Six-screen trading desk', 'tech', 18_000, 'mass', 1.1, 0.02, 'R1', 'Every chart, all at once.', '+1 watchlist and price alert slots'),
  L('home-studio', 'Home podcast studio', 'tech', 45_000, 'mass', 1.1, 0.03, 'R1', 'Soundproofed and on air.', '+5% income for media businesses'),
  // fashion
  L('sneakers', 'Grail sneakers', 'fashion', 2_400, 'limited', 1.2, 0, 'R0', 'Only 500 pairs exist.'),
  L('tailored-suit', 'Bespoke suit', 'fashion', 9_000, 'mass', 1.1, 0.02, 'R1', 'Fits like it was poured on.', 'Better odds when negotiating contracts'),
  L('velour-coat', 'Velour Maison coat', 'fashion', 38_000, 'limited', 1.3, 0.01, 'R1', 'The season\'s most-wanted piece.'),
  L('haute-couture', 'Haute couture commission', 'fashion', 420_000, 'unique', 1.6, 0.01, 'R2', 'A one-off, made by hand over 900 hours.'),
  // watches
  L('steel-diver', 'Steel diver watch', 'watches', 8_500, 'mass', 1.1, 0.01, 'R0', 'Waterproof to 300 meters.'),
  L('chronos-classic', 'Chronos Classic', 'watches', 32_000, 'limited', 1.3, 0.01, 'R1', 'Hand-finished in Nordhaven.'),
  L('perpetual', 'Perpetual calendar', 'watches', 140_000, 'limited', 1.5, 0.01, 'R2', 'Knows leap years until 2100.'),
  L('grand-complication', 'Grand complication', 'watches', 1_800_000, 'unique', 2, 0.005, 'R3', 'Twenty complications, one of seven made.', 'Collateral: counts at 90% for loans'),
  // cars
  L('used-hatch', 'Used hatchback', 'cars', 6_000, 'mass', 0.8, 0.08, 'R0', 'It starts. Usually.'),
  L('electric-sedan', 'Corvo electric sedan', 'cars', 52_000, 'mass', 1, 0.05, 'R1', 'Zero to sixty before you finish the sentence.'),
  L('sports-coupe', 'Sports coupe', 'cars', 180_000, 'mass', 1.2, 0.06, 'R2', 'Six hundred horsepower.'),
  L('vintage-roadster', 'Vintage roadster', 'cars', 950_000, 'limited', 1.6, 0.04, 'R2', 'A 1960s classic, matching numbers.'),
  L('hypercar', 'Hypercar', 'cars', 3_200_000, 'limited', 1.8, 0.05, 'R3', 'One of 99 built.'),
  L('armored-suv', 'Armored SUV', 'cars', 600_000, 'mass', 1.1, 0.06, 'R3', 'Survives what you hope never happens.', 'Physical security +1'),
  L('car-collection', 'Concours car collection', 'cars', 45_000_000, 'unique', 2.4, 0.03, 'R4', 'Twelve cars, a museum garage.'),
  // wine
  L('wine-case', 'Case of Grand Cru', 'wine', 4_800, 'consumed', 1.1, 0, 'R0', 'Twelve bottles for twelve celebrations.', 'Hosting +1 for a week'),
  L('cellar', 'Temperature-controlled cellar', 'wine', 120_000, 'limited', 1.3, 0.02, 'R2', 'Six hundred bottles laid down.'),
  L('vineyard-share', 'Vineyard in Meridia', 'wine', 8_500_000, 'unique', 1.8, 0.03, 'R3', 'Your own label, your own harvest.'),
  // art
  L('emerging-artist', 'Emerging artist canvas', 'art', 15_000, 'limited', 1.2, 0.005, 'R1', 'Bought before they were famous.'),
  L('photo-print', 'Signed photo print', 'art', 60_000, 'limited', 1.3, 0.005, 'R2', 'Edition of 10.'),
  L('mid-century', 'Mid-century master', 'art', 2_400_000, 'unique', 1.8, 0.005, 'R3', 'Museum quality.'),
  L('old-master', 'Old master painting', 'art', 68_000_000, 'unique', 2.6, 0.003, 'R4', 'Four centuries old, last sold in 1961.'),
  L('icon', 'The Icon', 'art', 450_000_000, 'unique', 3, 0.002, 'R5', 'The most famous painting ever sold privately.'),
  // experiences
  L('festival-vip', 'Festival VIP weekend', 'experiences', 3_000, 'consumed', 1, 0, 'R0', 'Backstage passes and a cabana.', 'Hosting +1 for a week'),
  L('private-chef', 'Private chef for a month', 'experiences', 40_000, 'consumed', 1.1, 0, 'R1', 'Dinner parties that people talk about.', 'Hosting +2 for a month'),
  L('safari', 'Private safari', 'experiences', 150_000, 'consumed', 1.3, 0, 'R2', 'A lodge to yourself.'),
  L('space-flight', 'Suborbital flight', 'experiences', 750_000, 'consumed', 1.8, 0, 'R3', 'Four minutes of weightlessness.'),
  L('lunar-flyby', 'Lunar flyby seat', 'experiences', 120_000_000, 'consumed', 2.6, 0, 'R5', 'Around the moon and back.'),
  // yachts
  L('day-sailer', 'Day sailer', 'yachts', 65_000, 'mass', 1, 0.08, 'R1', 'Weekends on the bay.'),
  L('motor-yacht', '30 m motor yacht', 'yachts', 6_500_000, 'mass', 1.4, 0.1, 'R3', 'Crew of six.', 'Hosting +2'),
  L('expedition-yacht', 'Expedition yacht', 'yachts', 48_000_000, 'limited', 1.8, 0.1, 'R4', 'Ice-class hull and a helipad.'),
  L('superyacht', '120 m superyacht', 'yachts', 420_000_000, 'unique', 2.5, 0.1, 'R5', 'Two pools and a submarine.', 'Hosting +4'),
  // jets
  L('jet-card', 'Private jet card', 'jets', 250_000, 'consumed', 1.1, 0, 'R2', 'Fifty flight hours.'),
  L('light-jet', 'Light jet', 'jets', 4_500_000, 'mass', 1.3, 0.12, 'R3', 'Four seats, two pilots.'),
  L('long-range-jet', 'Long-range jet', 'jets', 62_000_000, 'mass', 1.6, 0.1, 'R4', 'Port Avalon to Kaiyo nonstop.'),
  L('airliner-vip', 'VIP airliner', 'jets', 380_000_000, 'unique', 2.2, 0.1, 'R5', 'A bedroom at 40,000 feet.'),
  // philanthropy
  L('scholarship', 'Scholarship fund', 'philanthropy', 50_000, 'consumed', 1.2, 0, 'R1', 'Ten students, four years each.', 'Reputation +2'),
  L('hospital-wing', 'Hospital wing', 'philanthropy', 5_000_000, 'consumed', 1.6, 0, 'R3', 'Your name over the door.', 'Reputation +6'),
  L('foundation', 'Family foundation', 'philanthropy', 250_000_000, 'unique', 2.2, 0.02, 'R4', 'Gives forever.', 'Reputation +15'),
  L('museum', 'A museum', 'philanthropy', 1_500_000_000, 'unique', 2.8, 0.02, 'R5', 'Free entry, your collection on the walls.', 'Reputation +30'),
  // trophies
  L('racehorse', 'Racehorse', 'trophies', 900_000, 'limited', 1.5, 0.15, 'R3', 'Out of a champion mare.'),
  L('football-club', 'Second-division football club', 'trophies', 120_000_000, 'unique', 2, 0.08, 'R4', 'Promotion is one season away.'),
  L('island', 'Private island', 'trophies', 220_000_000, 'unique', 2.4, 0.03, 'R4', 'Twelve acres in the Cays.', 'Physical security +3'),
  L('tower-name', 'Your name on a tower', 'trophies', 900_000_000, 'unique', 2.8, 0.01, 'R5', 'Forty floors in Midtown, lit at night.'),
  L('space-station', 'Private space station module', 'trophies', 6_000_000_000, 'unique', 3, 0.05, 'R6', 'Your own room in orbit.'),
];

export const LIFE_BY_ID = new Map(LIFE_ITEMS.map((i) => [i.id, i]));

/** Prestige points of one item at a given age (game days owned). */
export function itemPrestige(item: LifeItem, ageDays: number): number {
  const base = Math.sqrt(item.price / 1000) * item.rarity;
  // mass goods fade with novelty; limited and unique gain heritage
  const age = item.cls === 'mass' ? Math.max(0.4, 1 - ageDays / 500)
    : item.cls === 'consumed' ? Math.max(0, 1 - ageDays / 30)
      : Math.min(1.5, 1 + ageDays / 2000);
  return base * age;
}

/** Category weights: the best item counts fully, then 1/2, 1/3, … (breadth beats repetition). */
export function prestigeOf(items: { item: LifeItem; ageDays: number }[]): number {
  const byCat = new Map<LifeCategory, number[]>();
  for (const { item, ageDays } of items) {
    const arr = byCat.get(item.category) ?? [];
    arr.push(itemPrestige(item, ageDays));
    byCat.set(item.category, arr);
  }
  let pp = 0;
  for (const arr of byCat.values()) {
    arr.sort((a, b) => b - a);
    arr.forEach((v, k) => { pp += v / (k + 1); });
  }
  return pp;
}

/** Resale value: mass goods depreciate, collectibles follow the collectibles index. */
export function resaleValue(item: LifeItem, paid: number, ageDays: number, collectibles: number): number {
  switch (item.cls) {
    case 'consumed': return 0;
    case 'mass': return paid * Math.max(0.25, 0.8 * Math.pow(0.9985, ageDays));
    case 'limited': return paid * 0.85 * collectibles;
    case 'unique': return paid * 0.9 * collectibles;
  }
}

/** Property types (bible 01, Real estate). value is at district index 100 for a 'mid' district. */
export interface PropertyType {
  id: string;
  name: string;
  /** base value at index 100 in a 'mid' district */
  value: number;
  /** gross rent yield per game year */
  rentYield: number;
  /** upkeep per game year as a fraction of value */
  upkeep: number;
  /** can be lived in (counts as your home; homes give Prestige instead of rent) */
  home: boolean;
  /** district tiers it exists in */
  tiers: ('working' | 'mid' | 'prime' | 'trophy')[];
  rank: string;
  blurb: string;
}

export const PROPERTY_TYPES: PropertyType[] = [
  { id: 'studio', name: 'Studio apartment', value: 90_000, rentYield: 0.07, upkeep: 0.01, home: true, tiers: ['working', 'mid'], rank: 'R0', blurb: 'One room and a view of the neighbor.' },
  { id: 'apartment', name: 'Two-bed apartment', value: 260_000, rentYield: 0.06, upkeep: 0.01, home: true, tiers: ['working', 'mid', 'prime'], rank: 'R0', blurb: 'The classic first investment.' },
  { id: 'loft', name: 'Warehouse loft', value: 520_000, rentYield: 0.055, upkeep: 0.012, home: true, tiers: ['working', 'mid'], rank: 'R1', blurb: 'Exposed brick and huge windows.' },
  { id: 'retail', name: 'Shop unit', value: 700_000, rentYield: 0.075, upkeep: 0.015, home: false, tiers: ['working', 'mid', 'prime'], rank: 'R1', blurb: 'A storefront on a busy street.' },
  { id: 'townhouse', name: 'Townhouse', value: 1_200_000, rentYield: 0.045, upkeep: 0.012, home: true, tiers: ['mid', 'prime'], rank: 'R1', blurb: 'Four floors and a garden.' },
  { id: 'office', name: 'Office floor', value: 4_500_000, rentYield: 0.065, upkeep: 0.015, home: false, tiers: ['mid', 'prime'], rank: 'R2', blurb: 'A whole floor in a tower.' },
  { id: 'warehouse', name: 'Logistics warehouse', value: 9_000_000, rentYield: 0.07, upkeep: 0.012, home: false, tiers: ['working'], rank: 'R2', blurb: 'Near the port, leased to a courier.' },
  { id: 'villa', name: 'Villa', value: 6_500_000, rentYield: 0.04, upkeep: 0.015, home: true, tiers: ['prime'], rank: 'R2', blurb: 'Pool, gardens and a gate.' },
  { id: 'penthouse', name: 'Penthouse', value: 18_000_000, rentYield: 0.035, upkeep: 0.012, home: true, tiers: ['prime', 'mid'], rank: 'R3', blurb: 'The top two floors, the whole skyline.' },
  { id: 'apartment-block', name: 'Apartment block', value: 40_000_000, rentYield: 0.055, upkeep: 0.013, home: false, tiers: ['working', 'mid'], rank: 'R3', blurb: 'Eighty units, one manager.' },
  { id: 'mansion', name: 'Mansion', value: 75_000_000, rentYield: 0.025, upkeep: 0.015, home: true, tiers: ['prime'], rank: 'R3', blurb: 'Twenty rooms, staff quarters, a cinema.' },
  { id: 'tower', name: 'Office tower', value: 600_000_000, rentYield: 0.06, upkeep: 0.012, home: false, tiers: ['mid', 'prime'], rank: 'R4', blurb: 'Fifty floors of tenants.' },
  { id: 'estate', name: 'Private island estate', value: 400_000_000, rentYield: 0.02, upkeep: 0.02, home: true, tiers: ['trophy'], rank: 'R4', blurb: 'An island, a house, a dock and a helipad.' },
];

export const TIER_VALUE_MULT: Record<'working' | 'mid' | 'prime' | 'trophy', number> = { working: 0.7, mid: 1, prime: 1.8, trophy: 2.5 };

export const PROPERTY_TYPE_BY_ID = new Map(PROPERTY_TYPES.map((p) => [p.id, p]));
