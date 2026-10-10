/**
 * Business catalog (bible 01, Businesses): 13 sectors × tiers T1 Hustle → T6 Megaproject,
 * about 10× the cost per tier. Businesses are the steady tycoon engine: they earn every tick,
 * compete for each city's sector demand (logit market share), and upgrade on six axes.
 * All names are fictional.
 */

export type BizSectorId =
  | 'food' | 'retail' | 'services' | 'tech' | 'media' | 'logistics' | 'energy'
  | 'manufacturing' | 'finance' | 'health' | 'hospitality' | 'entertainment' | 'compute';

export interface BizSector {
  id: BizSectorId;
  name: string;
  /** how much the business cycle moves demand (0 = defensive) */
  cyclicality: number;
  /** the stock sector whose mood drives this sector's demand */
  stockSector: string;
  /** data-quality units generated per game day per $1M of income (feeds the AI Lab) */
  dataPerM: number;
  blurb: string;
}

export const BIZ_SECTORS: BizSector[] = [
  { id: 'food', name: 'Food & Drink', cyclicality: 0.3, stockSector: 'staples', dataPerM: 2, blurb: 'Everyone eats. Thin margins, steady cash.' },
  { id: 'retail', name: 'Retail', cyclicality: 0.8, stockSector: 'discretionary', dataPerM: 4, blurb: 'Shops, brands and marketplaces.' },
  { id: 'services', name: 'Local Services', cyclicality: 0.5, stockSector: 'industrials', dataPerM: 2, blurb: 'Fix it, clean it, move it.' },
  { id: 'tech', name: 'Software & Apps', cyclicality: 0.9, stockSector: 'tech', dataPerM: 12, blurb: 'High margins, winner takes most.' },
  { id: 'media', name: 'Media & Creators', cyclicality: 0.8, stockSector: 'media', dataPerM: 8, blurb: 'Attention is the product.' },
  { id: 'logistics', name: 'Logistics', cyclicality: 1.0, stockSector: 'industrials', dataPerM: 3, blurb: 'Trucks, ships and warehouses.' },
  { id: 'energy', name: 'Energy', cyclicality: 0.6, stockSector: 'energy', dataPerM: 1, blurb: 'Power the city; power your data centers.' },
  { id: 'manufacturing', name: 'Manufacturing', cyclicality: 1.2, stockSector: 'materials', dataPerM: 2, blurb: 'Factories that boom and bust with the cycle.' },
  { id: 'finance', name: 'Finance', cyclicality: 1.3, stockSector: 'financials', dataPerM: 6, blurb: 'Money that makes money.' },
  { id: 'health', name: 'Health', cyclicality: 0.2, stockSector: 'health', dataPerM: 5, blurb: 'Clinics and labs; recession-proof.' },
  { id: 'hospitality', name: 'Hospitality', cyclicality: 1.4, stockSector: 'discretionary', dataPerM: 3, blurb: 'Hotels and resorts: great in booms, brutal in busts.' },
  { id: 'entertainment', name: 'Entertainment', cyclicality: 1.1, stockSector: 'media', dataPerM: 4, blurb: 'Clubs, arenas and studios.' },
  { id: 'compute', name: 'Compute & Data', cyclicality: 0.7, stockSector: 'semis', dataPerM: 20, blurb: 'GPUs and data: the inputs of AI.' },
];

export interface TierDef {
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  /** typical cost in $ */
  cost: number;
  /**
   * NET income per game day as a fraction of cost when well run (payback ≈ 1 / roi game days). Shops
   * (src/content/shops.ts) turn this into revenue, wages and opex; the lone-pool ladder is 10/15/30/50/80/120.
   */
  roi: number;
  /** rank id needed to buy */
  rank: string;
  /** most businesses of this tier one owner can run (attention is limited) */
  max: number;
}

export const TIERS: TierDef[] = [
  { tier: 1, name: 'Hustle', cost: 2_500, roi: 0.1, rank: 'R0', max: 4 },
  { tier: 2, name: 'Small Business', cost: 25_000, roi: 0.067, rank: 'R1', max: 6 },
  { tier: 3, name: 'Company', cost: 250_000, roi: 0.033, rank: 'R2', max: 8 },
  { tier: 4, name: 'Enterprise', cost: 3_000_000, roi: 0.02, rank: 'R3', max: 10 },
  { tier: 5, name: 'Conglomerate', cost: 40_000_000, roi: 0.0125, rank: 'R4', max: 12 },
  { tier: 6, name: 'Megaproject', cost: 600_000_000, roi: 0.0083, rank: 'R5', max: 15 },
];

export interface BizDef {
  id: string;
  name: string;
  sector: BizSectorId;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  cost: number;
  /** income per game day at baseline demand, before upgrades */
  income: number;
  blurb: string;
  /** produces something another business can use (vertical integration +5% to the buyer) */
  feeds?: BizSectorId;
  /** electricity (MWh per game day) this business supplies to its owner's data centers */
  power?: number;
  /** compute (thousand GPU-hours per game day) this business supplies to its owner's AI Lab */
  compute?: number;
}

/** [name, blurb, cost multiplier, extra] per sector, two per tier (T1..T6) */
type Row = [string, string, number, Partial<BizDef>?];

const CATALOG: Record<BizSectorId, Row[]> = {
  food: [
    ['Street Food Cart', 'Skewers and noodles outside the stadium.', 0.6],
    ['Coffee Kiosk', 'Espresso for commuters at the ferry.', 1.2],
    ['Neighborhood Bakery', 'Bread at dawn, croissants by eight.', 0.8],
    ['Ramen Bar', 'Twelve stools and a line out the door.', 1.2],
    ['Restaurant Group', 'Five restaurants, one central kitchen.', 0.9],
    ['Organic Farm Co-op', 'Grows for half the restaurants in town.', 1.1, { feeds: 'hospitality' }],
    ['Packaged Snacks Brand', 'Chips in every gas station.', 1],
    ['Craft Brewery Chain', 'Taprooms in six cities.', 1.2],
    ['National Grocery Chain', 'Two hundred supermarkets.', 0.9],
    ['Food Processing Group', 'Factories that feed the nation.', 1.1, { feeds: 'retail' }],
    ['Global Beverage Empire', 'A soda in every hand on the planet.', 1],
    ['Agri-Tech Vertical Farms', 'Skyscraper farms for every megacity.', 1.2],
  ],
  retail: [
    ['Sneaker Resale Stall', 'Buy limited drops, flip them online.', 0.7],
    ['Phone Repair Booth', 'Cracked screens fixed in 20 minutes.', 1.1],
    ['Vintage Boutique', 'Curated clothes, curated customers.', 0.9],
    ['Online Dropshop', 'A storefront, a supplier, an ad budget.', 1.1, { feeds: 'logistics' }],
    ['Electronics Store', 'Phones, laptops, extended warranties.', 1],
    ['Furniture Showroom', 'Sofas on a five-year payment plan.', 1],
    ['Department Store', 'Six floors on Midtown Avenue.', 0.9],
    ['Fashion Label', 'Runway shows and a waitlist.', 1.2],
    ['E-commerce Marketplace', 'Millions of sellers, one checkout.', 1.1],
    ['Luxury Retail House', 'Flagships in every capital.', 1],
    ['Global Retail Conglomerate', 'Malls, brands and the trucks between.', 1],
    ['Planetary Marketplace', 'If it exists, it is sold here.', 1.2],
  ],
  services: [
    ['Dog-Walking Service', 'Twelve dogs, one very strong walker.', 0.5],
    ['Car Wash', 'Hand wash and wax.', 1.2],
    ['Cleaning Company', 'Offices spotless by 7 a.m.', 0.8],
    ['Moving Company', 'Three trucks and careful hands.', 1.2, { feeds: 'logistics' }],
    ['Facilities Management', 'Runs the buildings other people own.', 1],
    ['Security Guard Agency', 'Guards for banks and galas.', 1],
    ['Staffing Agency', 'Temps for every industry.', 0.9],
    ['Engineering Consultancy', 'Bridges designed, permits handled.', 1.1],
    ['Outsourcing Giant', 'Back offices for a thousand firms.', 1],
    ['Construction Group', 'Towers, stadiums and airports.', 1.1, { feeds: 'hospitality' }],
    ['Infrastructure Operator', 'Toll roads and water systems.', 1],
    ['Smart City Concession', 'Runs an entire city\'s services.', 1.2],
  ],
  tech: [
    ['Freelance Web Studio', 'Websites for the corner shops.', 0.7],
    ['Mobile Game Studio', 'One hit could change everything.', 1.3],
    ['App Agency', 'Builds apps for startups with funding.', 0.9],
    ['SaaS Startup', 'Monthly subscriptions, churn worries.', 1.1],
    ['Cybersecurity Firm', 'Audits, pentests and incident response.', 1, { feeds: 'finance' }],
    ['Fintech App', 'A bank account in your pocket.', 1.1, { feeds: 'finance' }],
    ['Cloud Software Company', 'Enterprise contracts, high margins.', 1],
    ['Social App', 'Millions of daily users and a content team.', 1.2, { feeds: 'media' }],
    ['Platform Company', 'The operating system of an industry.', 1],
    ['Search & Ads Engine', 'Every query is an auction.', 1.1],
    ['Tech Megacorp', 'Phones, cloud, ads and everything between.', 1],
    ['Planet-Scale OS', 'The software layer under civilization.', 1.2],
  ],
  media: [
    ['Meme Page', 'Two million followers, zero employees.', 0.5],
    ['Podcast', 'Weekly episodes, sponsor reads.', 1.2],
    ['Video Channel', 'Long-form videos with a studio.', 0.9],
    ['Creator Agency', 'Manages forty influencers.', 1.1],
    ['Local Newspaper', 'Print, online and the city council beat.', 0.9],
    ['Record Label', 'Three artists on the charts.', 1.2],
    ['TV Network', 'News, sports and reality shows.', 1],
    ['Streaming Service', 'Originals and a back catalog.', 1.2],
    ['Media Conglomerate', 'Studios, channels and magazines.', 1],
    ['Global News Wire', 'The feed every trader watches.', 1.1],
    ['Entertainment Empire', 'From comics to theme parks.', 1],
    ['Metaverse Network', 'Worlds where a billion people hang out.', 1.2],
  ],
  logistics: [
    ['Bike Courier', 'Documents across Midtown in 15 minutes.', 0.6],
    ['Delivery Van', 'Last-mile parcels for the marketplaces.', 1.2],
    ['Courier Company', 'A fleet of vans and a sorting shed.', 0.9],
    ['Warehouse Operator', 'Pick, pack, ship.', 1.1],
    ['Trucking Fleet', 'Two hundred trucks on the highways.', 1],
    ['Cold Chain Logistics', 'Refrigerated everything.', 1.1, { feeds: 'food' }],
    ['Freight Airline', 'Overnight air cargo.', 1],
    ['Container Shipping Line', 'Forty ships on six oceans.', 1.1],
    ['Port Terminal Concession', 'Every container through Port Avalon.', 1],
    ['Global Logistics Network', 'Air, sea and land, one tracking number.', 1.1],
    ['Autonomous Freight Grid', 'Robot trucks and drone hubs.', 1],
    ['Orbital Cargo Service', 'Freight to low orbit.', 1.2],
  ],
  energy: [
    ['Rooftop Solar Installer', 'Panels on every suburban roof.', 0.7, { power: 0.5 }],
    ['EV Charging Spot', 'Twelve chargers at the mall.', 1.2, { power: 0.2 }],
    ['Solar Farm', 'Fifty acres of panels.', 0.9, { power: 8 }],
    ['Fuel Distributor', 'Diesel for farms and fleets.', 1.1],
    ['Wind Farm', 'Turbines on the ridge.', 1, { power: 60 }],
    ['Gas Peaker Plant', 'Switches on when prices spike.', 1.1, { power: 80 }],
    ['Utility Company', 'The grid of a whole district.', 1, { power: 600 }],
    ['Offshore Wind Array', 'Turbines in the North Sea.', 1.1, { power: 900 }],
    ['Nuclear Plant', 'Steady baseload for decades.', 1, { power: 9000 }],
    ['Energy Trading House', 'Buys low, sells high, across continents.', 1.1],
    ['National Grid Operator', 'Every electron in the country.', 1, { power: 80000 }],
    ['Fusion Power Project', 'Unlimited energy, if it works.', 1.3, { power: 200000 }],
  ],
  manufacturing: [
    ['3D Printing Shop', 'Prototypes overnight.', 0.7],
    ['Custom Furniture Workshop', 'Hand-built tables for designers.', 1.2],
    ['Metal Fabrication Shop', 'Brackets, frames and railings.', 0.9],
    ['Packaging Plant', 'Boxes for the marketplaces.', 1.1, { feeds: 'retail' }],
    ['Auto Parts Factory', 'Brake pads for three carmakers.', 1],
    ['Electronics Assembly', 'Phones and laptops, by the million.', 1.1, { feeds: 'tech' }],
    ['Steel Mill', 'Furnaces that never go out.', 1],
    ['Chemical Works', 'Plastics, paints and solvents.', 1.1],
    ['Car Manufacturer', 'Assembly lines in three countries.', 1],
    ['Chip Fab', 'Leading-edge wafers.', 1.2, { feeds: 'compute' }],
    ['Aerospace Manufacturer', 'Jets and satellites.', 1],
    ['Gigafactory Network', 'Batteries for a continent.', 1.1],
  ],
  finance: [
    ['Pawn Shop', 'Cash today, watches as collateral.', 0.7],
    ['Tax Prep Service', 'Busy one month a year, profitable all year.', 1.1],
    ['Insurance Brokerage', 'Policies for small businesses.', 0.9],
    ['Payday Lender Alternative', 'Fair microloans with a mobile app.', 1.1],
    ['Wealth Advisory', 'Manages money for doctors and lawyers.', 1],
    ['Regional Bank', 'Twenty branches and a mortgage book.', 1.1],
    ['Hedge Fund', 'Two and twenty.', 1],
    ['Payments Processor', 'A cut of every card swipe.', 1.1],
    ['Investment Bank', 'IPOs, mergers and trading desks.', 1],
    ['Global Insurer', 'Insures ships, satellites and stadiums.', 1.1],
    ['Universal Bank', 'Too big to fail.', 1],
    ['Sovereign-Scale Fund', 'Manages more money than most countries.', 1.2],
  ],
  health: [
    ['Personal Trainer', 'Morning sessions in the park.', 0.6],
    ['Pharmacy Counter', 'Prescriptions and vitamins.', 1.2],
    ['Physio Clinic', 'Backs and knees, fixed.', 0.9],
    ['Dental Practice', 'Six chairs, always booked.', 1.1],
    ['Diagnostics Lab', 'Blood tests by the thousand.', 1, { feeds: 'compute' }],
    ['Clinic Network', 'Walk-in care in every district.', 1.1],
    ['Private Hospital', 'Surgery without the waiting list.', 1],
    ['Medical Devices Maker', 'Implants and monitors.', 1.1],
    ['Biotech Lab', 'Drugs in trials; one success pays for all.', 1.1],
    ['Hospital Group', 'Fifty hospitals.', 1],
    ['Pharma Major', 'Blockbuster drugs on four continents.', 1],
    ['Longevity Institute', 'Selling more years of life.', 1.3],
  ],
  hospitality: [
    ['Rented Spare Room', 'One room, five-star reviews.', 0.6],
    ['Food Truck Festival Stand', 'Weekend markets and festivals.', 1.2],
    ['Boutique Hostel', 'Bunk beds and a rooftop bar.', 0.9],
    ['Seaside B&B', 'Breakfast with a view.', 1.1],
    ['City Hotel', 'Two hundred rooms near Midtown.', 1],
    ['Event Venue', 'Weddings and conferences.', 1.1],
    ['Resort', 'Pools, spa and a private beach.', 1],
    ['Hotel Chain', 'Forty hotels, one loyalty program.', 1.1],
    ['Cruise Line', 'Floating cities.', 1],
    ['Luxury Hotel Brand', 'The name on every skyline.', 1.1],
    ['Global Travel Group', 'Airlines, hotels and the booking app.', 1],
    ['Space Tourism Hotel', 'A weekend in orbit.', 1.3],
  ],
  entertainment: [
    ['Karaoke Booth', 'Two rooms, endless songs.', 0.6],
    ['Escape Room', 'Sixty minutes, four locks.', 1.2],
    ['Arcade Bar', 'Retro games and craft beer.', 0.9],
    ['Comedy Club', 'Open mic Mondays.', 1.1],
    ['Nightclub', 'The line around the block.', 1],
    ['Indoor Climbing Gym', 'Walls, ropes and memberships.', 1.1],
    ['Esports Team', 'Five players, one trophy cabinet.', 1],
    ['Film Studio', 'Two blockbusters a year.', 1.1],
    ['Concert Promoter', 'Stadium tours.', 1],
    ['Sports Franchise', 'A team, a stadium and the TV rights.', 1.1],
    ['Theme Park Group', 'Rollercoasters on three continents.', 1],
    ['Global Sports League', 'Owns the league itself.', 1.2],
  ],
  compute: [
    ['GPU Rig in a Closet', 'Four cards and a loud fan.', 0.6, { compute: 0.02 }],
    ['Data Labeling Shop', 'Humans tagging images for AI labs.', 1.2],
    ['Server Colocation Rack', 'Rented racks in a data center.', 0.9, { compute: 0.3 }],
    ['Web Scraping Service', 'Public data, cleaned and sold.', 1.1],
    ['Edge Data Center', 'Small, close to users.', 1, { compute: 5 }],
    ['Data Brokerage', 'Licensed datasets for training.', 1.1],
    ['GPU Cloud', 'Rents accelerators by the hour.', 1, { compute: 80 }],
    ['Synthetic Data Lab', 'Generates training data from models.', 1.1],
    ['Hyperscale Data Center', 'A hundred megawatts of compute.', 1, { compute: 1500 }],
    ['Data Exchange', 'Where the world trades data.', 1.1],
    ['Compute Superfactory', 'A gigawatt of accelerators.', 1, { compute: 30000 }],
    ['Orbital Data Center', 'Solar-powered compute in orbit.', 1.3, { compute: 400000 }],
  ],
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const BUSINESSES: BizDef[] = BIZ_SECTORS.flatMap((sec) =>
  CATALOG[sec.id].map(([name, blurb, mult, extra], k) => {
    const t = TIERS[Math.floor(k / 2)]!;
    const cost = roundNice(t.cost * mult);
    // higher-risk entries (multiplier > 1.15) earn a little more per dollar
    const roi = t.roi * (mult > 1.15 ? 1.08 : mult < 0.75 ? 0.95 : 1);
    return { id: `${sec.id}.${slug(name)}`, name, sector: sec.id, tier: t.tier, cost, income: cost * roi, blurb, ...(extra ?? {}) };
  }),
);

function roundNice(x: number): number {
  const mag = 10 ** Math.floor(Math.log10(x));
  return Math.round(x / (mag / 4)) * (mag / 4);
}

export const BIZ_BY_ID = new Map(BUSINESSES.map((b) => [b.id, b]));
export const BIZ_SECTOR_BY_ID = new Map(BIZ_SECTORS.map((s) => [s.id, s]));

/**
 * The six upgrade axes of the old model (bible 01). Staff and marketing are retired in Phase 4 (A1):
 * crew, quality and the marketing lever replace them, and existing levels move to those levers on migration.
 */
export type UpgradeAxis = 'staff' | 'marketing' | 'equipment' | 'location' | 'automation' | 'research';

export interface UpgradeDef {
  id: UpgradeAxis;
  name: string;
  /** the effect line, as an i18n key (en.json / fr.json) */
  effectKey: string;
  blurb: string;
}

/** The upgrades still for sale, each with 5 levels. */
export const UPGRADES: UpgradeDef[] = [
  { id: 'equipment', name: 'Equipment', effectKey: 'biz.upgrade.equipment.effect', blurb: 'New machines break less and do more.' },
  { id: 'location', name: 'Location', effectKey: 'biz.upgrade.location.effect', blurb: 'Move closer to the foot traffic.' },
  { id: 'automation', name: 'Automation', effectKey: 'biz.upgrade.automation.effect', blurb: 'Keeps earning while you are away.' },
  { id: 'research', name: 'R&D', effectKey: 'biz.upgrade.research.effect', blurb: 'New products and the data they produce.' },
];

/** Axes no longer for sale; a business that held levels keeps them in its record only. */
export const RETIRED_UPGRADES: UpgradeAxis[] = ['staff', 'marketing'];

export const MAX_UPGRADE = 5;

/** Cost of the next level of an axis for a business that cost `cost`. */
export function upgradeCost(cost: number, level: number): number {
  return Math.round(cost * 0.45 * 1.7 ** level);
}

/** Random business events (bible: NPC-only incidents in Phase 0, including data breaches). */
export interface BizEventDef {
  id: string;
  title: string;
  /** income multiplier while active */
  mult: number;
  /** duration in game days */
  days: number;
  /** relative frequency */
  weight: number;
  good: boolean;
  /** equipment upgrades reduce bad mechanical events */
  mechanical?: boolean;
  text: string;
}

export const BIZ_EVENTS: BizEventDef[] = [
  { id: 'viral', title: 'Goes viral', mult: 1.6, days: 3, weight: 3, good: true, text: '{biz} goes viral after a creator posts about it.' },
  { id: 'award', title: 'Wins an award', mult: 1.25, days: 5, weight: 2, good: true, text: '{biz} wins "Best in {city}".' },
  { id: 'contract', title: 'Lands a big contract', mult: 1.4, days: 4, weight: 2, good: true, text: '{biz} lands a contract with a city agency.' },
  { id: 'rival_closes', title: 'A rival closes', mult: 1.2, days: 6, weight: 2, good: true, text: 'A competitor of {biz} shuts down; customers walk over.' },
  { id: 'breakdown', title: 'Equipment breakdown', mult: 0.5, days: 1, weight: 3, good: false, mechanical: true, text: 'A key machine at {biz} breaks down.' },
  { id: 'inspection', title: 'Surprise inspection', mult: 0.7, days: 1, weight: 2, good: false, text: 'Inspectors spend the day at {biz}.' },
  { id: 'strike', title: 'Staff walkout', mult: 0.4, days: 2, weight: 1, good: false, text: 'Staff at {biz} walk out over pay.' },
  { id: 'breach', title: 'Data breach', mult: 0.6, days: 3, weight: 1, good: false, text: '{biz} discloses a customer data breach.' },
  { id: 'bad_review', title: 'Bad review storm', mult: 0.75, days: 2, weight: 2, good: false, text: 'A one-star review of {biz} spreads online.' },
  { id: 'supply', title: 'Supply shortage', mult: 0.7, days: 3, weight: 2, good: false, mechanical: true, text: '{biz} cannot get supplies this week.' },
];
