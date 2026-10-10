import { DEFAULT_CATALYSTS } from './catalysts';
import { DEFAULT_INDICES, DEFAULT_REGIMES, DEFAULT_TRADING, DEFAULT_VOLUME, normalizeLoadings } from './config';
import { DEFAULT_OPTIONS } from './options';
import { DEFAULT_RATES } from './rates';
import { DEFAULT_RIVALS } from './rivals';
import { DEFAULT_MARGIN } from './trading';
import type { AssetDef, IndexDef, WorldConfig } from './types';

/**
 * The full game universe (bible 01 §3): ~120 companies across 12 sectors and 5 regions, 15 crypto
 * tokens, commodities including the game-native Compute, Data and Power, four currency pairs,
 * a rates complex, and the unlisted property-district indices that real estate prices off.
 * Every name, brand, city and currency is fictional.
 */

export interface RegionDef {
  id: string;
  name: string;
  /** currency code and name */
  ccy: string;
  ccyName: string;
  flag: string;
}

export const REGIONS: RegionDef[] = [
  { id: 'avalon', name: 'Avalon Republic', ccy: 'AVD', ccyName: 'Avalon dollar', flag: 'AV' },
  { id: 'nordhaven', name: 'Nordhaven', ccy: 'NHK', ccyName: 'Nordhaven krone', flag: 'NH' },
  { id: 'meridian', name: 'Meridian Union', ccy: 'MRE', ccyName: 'Meridian mer', flag: 'MU' },
  { id: 'sundara', name: 'Sundara', ccy: 'SDR', ccyName: 'Sundara sun', flag: 'SD' },
  { id: 'kaiyo', name: 'Kaiyo', ccy: 'KYN', ccyName: 'Kaiyo yen', flag: 'KY' },
];

export interface SectorDef {
  id: string;
  name: string;
  cycleBeta: number;
  dividendYield: number;
  jumpsPerYear: number;
  halfLifeDays: number;
  wMarket: number;
  wSector: number;
  /** jump sizes; health names are binary (trial results) */
  jumpUpMean: number;
  jumpDownMean: number;
}

export const SECTORS: SectorDef[] = [
  { id: 'tech', name: 'Technology', cycleBeta: 1.3, dividendYield: 0.005, jumpsPerYear: 3, halfLifeDays: 30, wMarket: 0.55, wSector: 0.45, jumpUpMean: 0.05, jumpDownMean: 0.06 },
  { id: 'semis', name: 'Semiconductors', cycleBeta: 1.6, dividendYield: 0.004, jumpsPerYear: 5, halfLifeDays: 30, wMarket: 0.55, wSector: 0.5, jumpUpMean: 0.06, jumpDownMean: 0.07 },
  { id: 'energy', name: 'Energy & Utilities', cycleBeta: 0.9, dividendYield: 0.035, jumpsPerYear: 3, halfLifeDays: 40, wMarket: 0.4, wSector: 0.6, jumpUpMean: 0.04, jumpDownMean: 0.05 },
  { id: 'materials', name: 'Materials & Mining', cycleBeta: 1.3, dividendYield: 0.025, jumpsPerYear: 3, halfLifeDays: 50, wMarket: 0.5, wSector: 0.5, jumpUpMean: 0.05, jumpDownMean: 0.06 },
  { id: 'industrials', name: 'Industrials', cycleBeta: 1.1, dividendYield: 0.018, jumpsPerYear: 3, halfLifeDays: 30, wMarket: 0.6, wSector: 0.4, jumpUpMean: 0.04, jumpDownMean: 0.06 },
  { id: 'financials', name: 'Financials', cycleBeta: 1.4, dividendYield: 0.03, jumpsPerYear: 3, halfLifeDays: 30, wMarket: 0.65, wSector: 0.4, jumpUpMean: 0.04, jumpDownMean: 0.07 },
  { id: 'health', name: 'Health & Biotech', cycleBeta: 0.5, dividendYield: 0.012, jumpsPerYear: 5, halfLifeDays: 60, wMarket: 0.35, wSector: 0.35, jumpUpMean: 0.1, jumpDownMean: 0.14 },
  { id: 'staples', name: 'Consumer Staples', cycleBeta: 0.3, dividendYield: 0.03, jumpsPerYear: 2, halfLifeDays: 30, wMarket: 0.45, wSector: 0.4, jumpUpMean: 0.03, jumpDownMean: 0.04 },
  { id: 'discretionary', name: 'Consumer & Luxury', cycleBeta: 1.3, dividendYield: 0.01, jumpsPerYear: 4, halfLifeDays: 40, wMarket: 0.55, wSector: 0.45, jumpUpMean: 0.05, jumpDownMean: 0.06 },
  { id: 'realestate', name: 'Real Estate', cycleBeta: 1.1, dividendYield: 0.045, jumpsPerYear: 2, halfLifeDays: 60, wMarket: 0.5, wSector: 0.5, jumpUpMean: 0.04, jumpDownMean: 0.05 },
  { id: 'security', name: 'Security & Defense', cycleBeta: 0.4, dividendYield: 0.006, jumpsPerYear: 4, halfLifeDays: 50, wMarket: 0.35, wSector: 0.45, jumpUpMean: 0.06, jumpDownMean: 0.06 },
  { id: 'media', name: 'Media & Telecom', cycleBeta: 1.0, dividendYield: 0.015, jumpsPerYear: 4, halfLifeDays: 40, wMarket: 0.5, wSector: 0.45, jumpUpMean: 0.05, jumpDownMean: 0.06 },
];

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

/** [ticker, name, region, price, market cap in $B, vol, blurb, overrides] */
type Row = [string, string, string, number, number, number, string, Partial<AssetDef>?];

const STOCKS: Record<string, Row[]> = {
  tech: [
    ['HLCN', 'Halcyon Systems', 'avalon', 182, 420, 0.32, 'Cloud platforms and enterprise AI.', { drift: 0.04 }],
    ['ORBT', 'Orbital Cloud', 'avalon', 134, 310, 0.30, 'Hyperscale data centers rented by the hour.'],
    ['PXLW', 'Pixelworks Interactive', 'avalon', 76, 48, 0.38, 'Video games and persistent virtual worlds.'],
    ['QNTA', 'Quanta Labs', 'avalon', 23, 9, 0.7, 'A quantum computing moonshot with no revenue yet.', { jumpsPerYear: 6, jumpUpMean: 0.12, jumpDownMean: 0.12 }],
    ['LYRA', 'Lyra Social', 'avalon', 312, 380, 0.34, 'The social network with two billion users.'],
    ['FJRD', 'Fjordline Software', 'nordhaven', 58, 66, 0.28, 'Enterprise resource software, sold by the seat.'],
    ['KYTS', 'Kaiyo Tsushin', 'kaiyo', 41, 120, 0.27, 'Consumer electronics: phones, cameras, consoles.'],
    ['VNTA', 'Ventana Search', 'avalon', 148, 290, 0.29, 'Search and the ad auction behind it.'],
    ['SNDR', 'Sundara Digital', 'sundara', 19, 35, 0.45, 'The fastest-growing e-commerce marketplace in Sundara.'],
    ['MRLN', 'Merlin Robotics', 'meridian', 64, 28, 0.48, 'Warehouse and household robots.'],
  ],
  semis: [
    ['NMBS', 'Nimbus Compute', 'avalon', 96, 260, 0.45, 'GPUs for gamers and AI labs alike.', { drift: 0.05 }],
    ['AXIA', 'Axiom Microdevices', 'avalon', 88, 140, 0.42, 'CPUs for laptops and servers.'],
    ['KSMI', 'Kaisei Semiconductor', 'kaiyo', 112, 330, 0.38, 'The leading-edge foundry everyone depends on.'],
    ['LUXR', 'Luxor Photonics', 'nordhaven', 640, 210, 0.36, 'The only maker of extreme-UV lithography machines.'],
    ['GRDN', 'Gridion Memory', 'kaiyo', 47, 60, 0.5, 'Memory chips: boom, bust, repeat.', { cycleBeta: 2.0 }],
    ['PLSM', 'Plasma Etch Systems', 'avalon', 95, 45, 0.44, 'Etch and deposition tools for fabs.'],
    ['NRON', 'Neuron Silicon', 'avalon', 240, 380, 0.55, 'Custom AI accelerators; the market\'s favorite story.', { drift: 0.06, jumpsPerYear: 6 }],
    ['CHPS', 'Chipset Sundara', 'sundara', 12, 14, 0.4, 'Chip assembly, packaging and test.'],
    ['SLCA', 'Silica Wafer Co', 'meridian', 33, 18, 0.38, 'Polished silicon wafers by the million.'],
    ['DXLT', 'Dexelt Analog', 'meridian', 71, 52, 0.32, 'Analog and power chips for cars and factories.'],
  ],
  energy: [
    ['VRDN', 'Verdane Energy', 'avalon', 64, 140, 0.28, 'Oil, gas and a growing renewables arm.', { wSector: 0.55, wMarket: 0.45 }],
    ['PTRA', 'Petra Fuels', 'meridian', 92, 260, 0.26, 'An integrated oil major with refineries on three continents.'],
    ['NHOL', 'Nordhaven Offshore', 'nordhaven', 22, 15, 0.42, 'Deep-water drilling rigs for hire.'],
    ['SOLN', 'Solenne Power', 'sundara', 18, 12, 0.5, 'Utility-scale solar developer.', { cycleBeta: 1.2 }],
    ['WNDR', 'Windrose Renewables', 'nordhaven', 34, 25, 0.38, 'Offshore wind farms.'],
    ['GSPK', 'Gaspeak Midstream', 'avalon', 41, 70, 0.2, 'Pipelines that pay a fat dividend.', { dividendYield: 0.06 }],
    ['URNX', 'Uranex Nuclear', 'avalon', 28, 9, 0.55, 'Uranium mines and small modular reactors.', { jumpsPerYear: 5 }],
    ['KYGS', 'Kaiyo Gas & Power', 'kaiyo', 15, 40, 0.16, 'Regulated utility for Kaiyo City.', { dividendYield: 0.045, cycleBeta: 0.3 }],
    ['AVUT', 'Avalon Utilities', 'avalon', 62, 90, 0.15, 'The regulated grid of Port Avalon.', { dividendYield: 0.04, cycleBeta: 0.25, duration: 3 }],
    ['HYDR', 'Hydra Hydrogen', 'meridian', 6.5, 3, 0.75, 'Fuel cells; perpetually two years from profit.', { jumpsPerYear: 6 }],
  ],
  materials: [
    ['OSTV', 'Ostrava Steel', 'meridian', 38, 22, 0.34, 'Steel for cars, ships and skyscrapers.', { halfLifeDays: 60 }],
    ['CPRM', 'Copperline Mining', 'sundara', 48, 55, 0.36, 'Copper: the metal of electrification.'],
    ['LIRO', 'Lirio Lithium', 'sundara', 26, 11, 0.55, 'Lithium brines in the salt flats.'],
    ['GLDF', 'Goldfield Royalties', 'avalon', 57, 30, 0.28, 'Gold streaming: a cut of other people\'s mines.', { cycleBeta: -0.2 }],
    ['CHMX', 'Chemex Industries', 'meridian', 103, 44, 0.26, 'Specialty chemicals and coatings.'],
    ['TMBR', 'Timberhall Forest', 'nordhaven', 31, 9, 0.24, 'Timberland, pulp and paper.'],
    ['RARE', 'Rareworks Metals', 'kaiyo', 14, 6, 0.6, 'Rare earths for magnets and missiles.', { jumpsPerYear: 5 }],
    ['CMNT', 'Cementa Group', 'meridian', 77, 33, 0.25, 'Cement and aggregates.'],
    ['ALUM', 'Aluvia Aluminium', 'nordhaven', 19, 16, 0.34, 'Aluminium smelted on cheap hydro power.'],
    ['FRTL', 'Fertilia Agro', 'sundara', 39, 21, 0.33, 'Fertilizers and crop chemicals.'],
  ],
  industrials: [
    ['ATLF', 'Atlas Freight', 'avalon', 71, 48, 0.27, 'Trucking and freight brokerage.'],
    ['SKYW', 'Skyward Aerospace', 'avalon', 156, 150, 0.27, 'Commercial jets and defense aircraft.'],
    ['RAIL', 'Railhaven Lines', 'avalon', 204, 95, 0.21, 'Freight railroads across the Republic.', { dividendYield: 0.02 }],
    ['MCHN', 'Machina Heavy', 'meridian', 88, 70, 0.3, 'Excavators, bulldozers and mining trucks.'],
    ['PORT', 'Port Avalon Terminals', 'avalon', 27, 12, 0.24, 'The container terminals of Port Avalon.'],
    ['DRNX', 'Dronix Logistics', 'kaiyo', 9.4, 5, 0.62, 'Drone delivery, mostly still in pilots.'],
    ['HLMR', 'Hallmer Engineering', 'nordhaven', 52, 26, 0.26, 'Bridges, tunnels and power plants.'],
    ['ELVX', 'Elevex Elevators', 'meridian', 66, 30, 0.2, 'Elevators and the service contracts that follow.'],
    ['SHPY', 'Shipyard Kaiyo', 'kaiyo', 21, 18, 0.35, 'Container ships and LNG carriers.'],
    ['AIRL', 'Avalon Air', 'avalon', 14, 9, 0.45, 'The flag carrier: very cyclical, thin margins.', { cycleBeta: 1.8 }],
  ],
  financials: [
    ['MRDB', 'Meridia Bank', 'meridian', 52, 180, 0.26, 'Universal bank of the Meridian Union.', { wMarket: 0.65, wSector: 0.4 }],
    ['AVBK', 'Bank of Port Avalon', 'avalon', 61, 240, 0.25, 'The Republic\'s biggest deposit franchise.'],
    ['VLTX', 'Vaultex Payments', 'avalon', 271, 330, 0.24, 'The card network on every wallet.', { dividendYield: 0.008 }],
    ['NRDA', 'Nordic Assurance', 'nordhaven', 44, 50, 0.19, 'Life and property insurance.', { dividendYield: 0.045, cycleBeta: 0.8 }],
    ['OBSD', 'Obsidian Capital', 'avalon', 112, 85, 0.33, 'Private equity and private credit.'],
    ['CRDT', 'Creditline Finance', 'avalon', 23, 14, 0.4, 'Consumer loans and buy-now-pay-later.', { cycleBeta: 1.9 }],
    ['XCHG', 'Exchange Holdings', 'avalon', 188, 60, 0.23, 'Runs the Port Avalon exchange; loves volatility.', { cycleBeta: 0.6 }],
    ['KYBK', 'Kaiyo Mitsuwa Bank', 'kaiyo', 8.2, 70, 0.27, 'Kaiyo\'s megabank.', { dividendYield: 0.035 }],
    ['SDRB', 'Sundara Rural Bank', 'sundara', 4.6, 8, 0.38, 'Microloans to farmers and shops.'],
    ['TRST', 'Trustwell Asset Management', 'meridian', 93, 40, 0.29, 'Mutual funds for the Meridian middle class.'],
  ],
  health: [
    ['LMNP', 'Lumen Pharma', 'avalon', 118, 35, 0.38, 'Mid-stage drug trials: big wins, big losses.', { cycleBeta: 0.4, wMarket: 0.35, wSector: 0.3, jumpsPerYear: 6, jumpUpMean: 0.12, jumpDownMean: 0.18 }],
    ['VTLS', 'Vitalis Health', 'avalon', 420, 280, 0.22, 'Health insurer and hospital network.', { jumpsPerYear: 3, jumpUpMean: 0.04, jumpDownMean: 0.06 }],
    ['GNOM', 'Genome Arc', 'avalon', 37, 8, 0.65, 'Gene editing; one trial away from glory or ruin.', { jumpsPerYear: 6, jumpUpMean: 0.15, jumpDownMean: 0.2 }],
    ['MEDX', 'Medix Devices', 'meridian', 128, 72, 0.28, 'Surgical robots and implants.', { jumpsPerYear: 3, jumpUpMean: 0.05, jumpDownMean: 0.06 }],
    ['CURA', 'Curalis Biotech', 'nordhaven', 74, 22, 0.5, 'Oncology pipeline with three late-stage trials.', { jumpsPerYear: 6 }],
    ['PHRM', 'Pharmaxa', 'meridian', 61, 190, 0.18, 'Big pharma: blockbusters and patent cliffs.', { dividendYield: 0.03, jumpsPerYear: 3, jumpUpMean: 0.04, jumpDownMean: 0.06 }],
    ['NRVA', 'Nervana Therapeutics', 'avalon', 18, 4, 0.8, 'Neuroscience moonshot, one drug, one shot.', { jumpsPerYear: 6, jumpUpMean: 0.2, jumpDownMean: 0.25 }],
    ['DNTA', 'Dentara Care', 'sundara', 22, 7, 0.26, 'Dental clinic chain.', { jumpsPerYear: 2, jumpUpMean: 0.04, jumpDownMean: 0.05 }],
    ['VAXN', 'Vaxonix', 'kaiyo', 51, 31, 0.35, 'Vaccines and mRNA platforms.'],
    ['HLTH', 'Helio Diagnostics', 'avalon', 83, 26, 0.27, 'Lab tests and at-home diagnostics.', { jumpsPerYear: 3, jumpUpMean: 0.05, jumpDownMean: 0.06 }],
  ],
  staples: [
    ['PLLS', 'Pallas Foods', 'avalon', 44, 90, 0.16, 'Packaged food in every pantry.', { wMarket: 0.45, wSector: 0.4 }],
    ['BRWR', 'Brewhall Beverages', 'meridian', 77, 110, 0.18, 'Beers, spirits and the bars that pour them.', { dividendYield: 0.028 }],
    ['CLNR', 'Cleanora Household', 'avalon', 132, 160, 0.15, 'Soap, detergent, diapers.', { dividendYield: 0.025 }],
    ['GRCR', 'Grocer\'s Union', 'avalon', 48, 60, 0.17, 'Supermarkets in every Avalon suburb.', { dividendYield: 0.02 }],
    ['TBCO', 'Tobac & Co', 'avalon', 39, 70, 0.17, 'A shrinking, very profitable tobacco business.', { dividendYield: 0.07 }],
    ['SNKS', 'Snackworks', 'sundara', 16, 18, 0.2, 'Chips, biscuits and instant noodles.'],
    ['DRYM', 'Dairymead', 'nordhaven', 29, 14, 0.16, 'Milk, cheese and yogurt.'],
    ['KOFE', 'Kaffa Coffee', 'avalon', 87, 95, 0.22, 'A coffee shop on every corner.', { cycleBeta: 0.7 }],
    ['BEAU', 'Belle Aura Cosmetics', 'meridian', 210, 85, 0.21, 'Prestige beauty and fragrance.', { cycleBeta: 0.8 }],
    ['RICE', 'Kaiyo Rice & Noodle', 'kaiyo', 11, 10, 0.15, 'Staples for Kaiyo\'s kitchens.'],
  ],
  discretionary: [
    ['CRVO', 'Corvo Motors', 'avalon', 210, 75, 0.55, 'Electric cars and a cult following.', { drift: 0.03, cycleBeta: 1.5, jumpsPerYear: 6, halfLifeDays: 60 }],
    ['VLMS', 'Velour Maison', 'meridian', 640, 160, 0.27, 'Luxury fashion house; sells to the top 1%.', { cycleBeta: 1.2 }],
    ['RIVA', 'Riviera Resorts', 'avalon', 74, 30, 0.38, 'Hotels, casinos-free resorts and cruises.', { cycleBeta: 1.6 }],
    ['STRD', 'Stride Athletic', 'avalon', 102, 140, 0.28, 'Sneakers and sportswear.'],
    ['HOMZ', 'Homezy', 'avalon', 288, 290, 0.22, 'Home improvement megastores.', { duration: 2 }],
    ['CHRN', 'Chronos Watchworks', 'nordhaven', 860, 45, 0.25, 'Hand-finished luxury watches.'],
    ['FSTY', 'Feastly Delivery', 'avalon', 33, 22, 0.48, 'Food delivery: growing fast, burning cash.'],
    ['KMOT', 'Kaiyo Motor', 'kaiyo', 24, 210, 0.26, 'The world\'s biggest carmaker by volume.'],
    ['ELEC', 'Electra EV', 'meridian', 55, 60, 0.58, 'Affordable electric cars from Meridia.', { jumpsPerYear: 5 }],
    ['YCHT', 'Yachtworks Marine', 'meridian', 145, 12, 0.35, 'Superyachts built to order.', { cycleBeta: 1.8 }],
  ],
  realestate: [
    ['AURH', 'Aurelius Holdings', 'avalon', 29, 18, 0.3, 'Diversified property landlord.', { halfLifeDays: 60, duration: 4 }],
    ['AVRT', 'Avalon Residential Trust', 'avalon', 54, 40, 0.22, 'Apartment buildings across Port Avalon.', { dividendYield: 0.045, duration: 4 }],
    ['OFFC', 'Officeline REIT', 'avalon', 31, 15, 0.3, 'Downtown office towers with rising vacancies.', { dividendYield: 0.065, duration: 5 }],
    ['WRHS', 'Warehaus Logistics', 'avalon', 118, 90, 0.23, 'Warehouses near every port and highway.', { dividendYield: 0.03, duration: 4 }],
    ['TOWR', 'Towerline Sites', 'avalon', 205, 95, 0.2, 'Cell towers leased to every carrier.', { dividendYield: 0.03, duration: 5 }],
    ['DTCR', 'Datacore REIT', 'avalon', 152, 65, 0.26, 'Data centers leased to cloud and AI labs.', { dividendYield: 0.025, duration: 4 }],
    ['MLLS', 'Mall & Main', 'avalon', 17, 7, 0.35, 'Shopping malls fighting the internet.', { dividendYield: 0.08, duration: 4 }],
    ['NRHM', 'Nordhaven Homes', 'nordhaven', 63, 20, 0.32, 'Home builder; lives and dies by mortgage rates.', { duration: 6 }],
    ['SKYL', 'Skyline Developers', 'kaiyo', 7.4, 12, 0.38, 'Towers in Kaiyo City.', { duration: 4 }],
    ['SNVL', 'Sundara Villas', 'sundara', 12, 6, 0.36, 'Beach villas and resort property.', { duration: 4 }],
  ],
  security: [
    ['SNTL', 'Sentinel Cyber', 'avalon', 88, 30, 0.33, 'Endpoint protection and incident response.', { cycleBeta: 0.2, wMarket: 0.35, wSector: 0.45, halfLifeDays: 60 }],
    ['FWLL', 'Firewall One', 'avalon', 145, 60, 0.32, 'Network firewalls for banks and governments.'],
    ['CIPH', 'Cipherion', 'nordhaven', 48, 15, 0.4, 'Post-quantum cryptography.'],
    ['AEGS', 'Aegis Defense Systems', 'avalon', 310, 110, 0.22, 'Missiles, radar and satellites.', { cycleBeta: 0.1 }],
    ['IDNT', 'Identix', 'avalon', 39, 10, 0.38, 'Identity and login security.'],
    ['GRDX', 'Guardex', 'meridian', 27, 8, 0.24, 'Guards, vaults and armored cars.'],
    ['HNYP', 'Honeypot Labs', 'avalon', 22, 4, 0.55, 'Deception tech: fake data that catches thieves.'],
    ['SOCX', 'SOCWorks', 'kaiyo', 31, 9, 0.33, 'Managed security operations centers.'],
    ['DRKN', 'Darknet Watch', 'sundara', 8.8, 2.5, 0.6, 'Threat intelligence from the underground.'],
    ['SHLD', 'Shieldline Insurance', 'avalon', 74, 18, 0.26, 'Cyber insurance; pays when the hackers win.', { dividendYield: 0.02 }],
  ],
  media: [
    ['FLXR', 'Flixara Streaming', 'avalon', 340, 150, 0.38, 'Streaming shows and films.'],
    ['TLCM', 'Telecomm Avalon', 'avalon', 32, 130, 0.16, 'Phone lines, fiber and 6G.', { dividendYield: 0.055, cycleBeta: 0.4 }],
    ['WIRE', 'Wireline News', 'avalon', 21, 12, 0.28, 'Publisher of The Wire.'],
    ['SATL', 'Satlink Orbital', 'meridian', 66, 45, 0.42, 'Satellite internet anywhere.'],
    ['MUSE', 'Muse Records', 'nordhaven', 43, 20, 0.3, 'Record labels and music rights.'],
    ['ADVR', 'Adverra', 'avalon', 57, 28, 0.35, 'Ad tech for everyone not named Ventana.'],
    ['KYTV', 'Kaiyo Broadcasting', 'kaiyo', 13, 9, 0.25, 'TV networks and anime studios.'],
    ['PODC', 'Podcastic', 'avalon', 11, 3, 0.58, 'Podcast network with one very famous host.'],
    ['ESPT', 'Esports Arena Group', 'sundara', 6.2, 2, 0.65, 'Esports teams and stadiums.'],
    ['CNMA', 'Cinemagna Studios', 'avalon', 88, 55, 0.3, 'Blockbuster films and theme parks.'],
  ],
};

function spreadForCap(marketCap: number): number {
  return marketCap >= 100e9 ? 2 : marketCap >= 40e9 ? 6 : marketCap >= 15e9 ? 12 : marketCap >= 5e9 ? 20 : 35;
}

function stockDef(sectorId: string, r: Row): AssetDef {
  const sec = SECTOR_BY_ID.get(sectorId)!;
  const [id, name, region, price, capB, vol, blurb, over] = r;
  const marketCap = capB * 1e9;
  return normalizeLoadings({
    id, name, assetClass: 'stock', sector: sectorId, region, initialPrice: price, vol, blurb,
    drift: 0.02, cycleBeta: sec.cycleBeta, wMarket: sec.wMarket, wSector: sec.wSector, wCrypto: 0,
    wRegion: region === 'avalon' ? 0.15 : 0.35,
    halfLifeDays: marketCap >= 50e9 ? sec.halfLifeDays : Math.max(sec.halfLifeDays, 60),
    jumpsPerYear: sec.jumpsPerYear, jumpUpMean: sec.jumpUpMean, jumpDownMean: sec.jumpDownMean, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: true,
    sharesOutstanding: marketCap / price,
    spreadBps: spreadForCap(marketCap), advNotional: marketCap * 0.004, qtyStep: 1,
    dividendYield: sec.dividendYield,
    ...(sectorId === 'realestate' && !over?.duration ? { duration: 4 } : {}),
    ...(over ?? {}),
  });
}

type CryptoRow = [string, string, number, number, number, string, Partial<AssetDef>?];

/** [id, name, price, vol, supply (units), blurb] */
const CRYPTO: CryptoRow[] = [
  ['AUC', 'Aurum Coin', 41000, 0.65, 19.5e6, 'The original coin; digital gold to its fans.', { spreadBps: 5, advNotional: 20e9, cycleBeta: 1.5 }],
  ['LTX', 'Lattice', 2300, 0.8, 120e6, 'Smart-contract chain that runs most of DeFi.', { spreadBps: 8, advNotional: 8e9, cycleBeta: 1.8 }],
  ['SYN', 'Synapse', 3.4, 1.1, 1.2e9, 'Token that pays for decentralized AI inference.', { cycleBeta: 2.2, wCrypto: 0.6, jumpsPerYear: 12, spreadBps: 60, advNotional: 300e6 }],
  ['VLT', 'Voltchain', 88, 0.95, 450e6, 'A fast layer-one with a loud community.', { spreadBps: 15, advNotional: 1.5e9 }],
  ['MRK', 'Merkle Root', 14, 0.9, 1e9, 'Bridges between chains.', { spreadBps: 25, advNotional: 500e6 }],
  ['PXL', 'PixelPunk', 0.42, 1.2, 8e9, 'Gaming and collectibles token.', { spreadBps: 50, advNotional: 200e6, jumpsPerYear: 12 }],
  ['HNY', 'HoneyDAO', 6.1, 1.1, 300e6, 'Lending protocol governance token.', { spreadBps: 40, advNotional: 250e6 }],
  ['GPU', 'RenderNet', 7.8, 1.0, 500e6, 'Rent idle GPUs on a decentralized network.', { spreadBps: 30, advNotional: 400e6 }],
  ['WOOF', 'Woofcoin', 0.0021, 1.6, 140e12, 'A meme with a dog on it. That is all.', { spreadBps: 80, advNotional: 600e6, jumpsPerYear: 16, jumpUpMean: 0.2, jumpDownMean: 0.2 }],
  ['ORC', 'Oracle Net', 18, 1.0, 600e6, 'Price feeds for smart contracts.', { spreadBps: 25, advNotional: 450e6 }],
  ['SHD', 'Shade', 160, 1.0, 18e6, 'Privacy coin; regulators hate it.', { spreadBps: 35, advNotional: 150e6, jumpsPerYear: 10 }],
  ['KAI', 'Kaiyo Pay', 1.3, 0.9, 5e9, 'Payments token backed by Kaiyo banks.', { spreadBps: 20, advNotional: 300e6 }],
  ['SUN', 'Sunbit', 0.88, 0.95, 6e9, 'Remittances across Sundara.', { spreadBps: 30, advNotional: 200e6 }],
  ['BRK', 'Bricks', 52, 0.7, 40e6, 'Tokenized real estate.', { spreadBps: 30, advNotional: 120e6, cycleBeta: 1.2 }],
  ['ZEN', 'Zenith', 260, 0.9, 50e6, 'Staking chain with a 6% yield.', { spreadBps: 20, advNotional: 700e6 }],
  // stablecoins: pinned to $1 by a fast pull; a rare depeg is the only real risk
  ['AUSD', 'Avalon Dollar Token', 1, 0.004, 60e9, 'A dollar stablecoin backed by Avalon T-bills. Boring on purpose, until it isn\'t.', { spreadBps: 2, advNotional: 30e9, cycleBeta: 0, wMarket: 0, wCrypto: 0.05, halfLifeDays: 0.5, jumpsPerYear: 0.25, jumpUpMean: 0.002, jumpUpProb: 0.05, jumpDownMean: 0.06, floor: 0.01 }],
  ['FLUX', 'FluxUSD', 1, 0.006, 8e9, 'An algorithmic stablecoin: keeps $1 with code, not reserves.', { spreadBps: 4, advNotional: 2e9, cycleBeta: 0, wMarket: 0, wCrypto: 0.1, halfLifeDays: 0.5, jumpsPerYear: 0.5, jumpUpMean: 0.002, jumpUpProb: 0.05, jumpDownMean: 0.15, floor: 0.001 }],
  // majors and alts
  ['NOVA', 'Nova', 145, 0.85, 400e6, 'A high-throughput chain loved by traders and outage memes.', { spreadBps: 8, advNotional: 3e9, cycleBeta: 1.9 }],
  ['STLR', 'Stellar Rail', 0.62, 0.8, 50e9, 'Cross-border settlement for banks that never adopted it.', { spreadBps: 12, advNotional: 1.2e9 }],
  ['ATOL', 'Atoll', 9.4, 0.95, 380e6, 'An internet of chains that talk to each other.', { spreadBps: 20, advNotional: 500e6 }],
  ['GRID', 'GridShare', 3.1, 1.05, 900e6, 'Peer-to-peer solar power trading on-chain.', { spreadBps: 35, advNotional: 180e6, cycleBeta: 1.4 }],
  ['VAULT', 'Vaultline', 0.95, 1.0, 2e9, 'Decentralized exchange token; fees go to holders.', { spreadBps: 30, advNotional: 250e6 }],
  ['ARC', 'Arcade', 0.31, 1.25, 4e9, 'Play-to-earn games. Mostly play, occasionally earn.', { spreadBps: 55, advNotional: 150e6, jumpsPerYear: 12 }],
  ['MIND', 'Mindshare', 12.5, 1.15, 250e6, 'Pays people to label AI training data.', { spreadBps: 40, advNotional: 220e6, jumpsPerYear: 10 }],
  // memecoins: huge vol, frequent jumps, they bleed between hype waves
  ['FROG', 'Frogcoin', 0.0000082, 1.9, 420e15, 'A frog. A movement. Mostly a frog.', { spreadBps: 90, advNotional: 400e6, jumpsPerYear: 20, jumpUpMean: 0.25, jumpDownMean: 0.22, drift: -0.15 }],
  ['MOON', 'MoonPup', 0.00041, 1.8, 1e15, 'Its roadmap is one word long.', { spreadBps: 100, advNotional: 150e6, jumpsPerYear: 18, jumpUpMean: 0.25, jumpDownMean: 0.25, drift: -0.2 }],
  ['GIGA', 'Gigachad', 0.033, 1.7, 9e12, 'Bought by people who also bought the gym membership.', { spreadBps: 90, advNotional: 120e6, jumpsPerYear: 16, jumpUpMean: 0.22, jumpDownMean: 0.22, drift: -0.15 }],
  ['HAMR', 'Hamster Wheel', 0.0012, 1.9, 2e14, 'Runs on a hamster. The hamster is fine.', { spreadBps: 110, advNotional: 80e6, jumpsPerYear: 20, jumpUpMean: 0.28, jumpDownMean: 0.25, drift: -0.25 }],
  ['BONK', 'Bonkers', 0.000019, 2.0, 90e15, 'Launched as a joke on a Friday. Still here.', { spreadBps: 100, advNotional: 200e6, jumpsPerYear: 22, jumpUpMean: 0.3, jumpDownMean: 0.26, drift: -0.2 }],
  ['CATZ', 'Catz', 0.0075, 1.75, 5e13, 'Dogs had their turn.', { spreadBps: 95, advNotional: 110e6, jumpsPerYear: 18, jumpUpMean: 0.24, jumpDownMean: 0.24, drift: -0.18 }],
];

function cryptoDef(r: CryptoRow): AssetDef {
  const [id, name, price, vol, supply, blurb, over] = r;
  return normalizeLoadings({
    id, name, assetClass: 'crypto', sector: 'crypto', initialPrice: price, vol, blurb,
    drift: 0, cycleBeta: 1.6, wMarket: 0.25, wSector: 0, wCrypto: 0.75,
    halfLifeDays: 120, jumpsPerYear: 8, jumpUpMean: 0.1, jumpDownMean: 0.14, jumpUpProb: 0.5,
    floor: 1e-7, circuitBreaker: false, spreadBps: 20, advNotional: 500e6, qtyStep: 0,
    sharesOutstanding: supply,
    ...(over ?? {}),
  });
}

type CommodityRow = [string, string, string, number, number, string, Partial<AssetDef>?];

const COMMODITIES: CommodityRow[] = [
  ['GOLD', 'Gold', 'metals', 2100, 0.15, 'Per ounce. The safe haven when everything else burns.', { cycleBeta: -0.4, wMarket: -0.15, wSector: 0.7, drift: 0.03 }],
  ['SILV', 'Silver', 'metals', 26, 0.28, 'Per ounce. Gold\'s jumpier cousin.', { cycleBeta: 0.2, wMarket: 0.05, wSector: 0.7, spreadBps: 6, advNotional: 6e9 }],
  ['OIL', 'Crude Oil', 'energy', 78, 0.35, 'Per barrel. Moves on wars, cartels and recessions. Firms into the summer driving season.', { cycleBeta: 0.8, wMarket: 0.3, wSector: 0.75, jumpsPerYear: 6, seasonal: { amp: 0.03, peakDay: 120 } }],
  ['NGAS', 'Natural Gas', 'energy', 2.9, 0.55, 'Per million BTU. Weather is everything: heating demand peaks every winter.', { cycleBeta: 0.4, wMarket: 0.15, wSector: 0.5, jumpsPerYear: 8, spreadBps: 10, advNotional: 4e9, seasonal: { amp: 0.12, peakDay: 0 } }],
  ['COPR', 'Copper', 'basemetals', 4.1, 0.25, 'Per pound. "Doctor Copper" reads the economy.', { cycleBeta: 1.0, wMarket: 0.35, wSector: 0.7, spreadBps: 5, advNotional: 8e9 }],
  ['LITH', 'Lithium', 'basemetals', 14, 0.45, 'Per kilo of carbonate. Battery boom and bust.', { cycleBeta: 1.2, wMarket: 0.25, wSector: 0.6, spreadBps: 20, advNotional: 1e9 }],
  ['WHEA', 'Wheat', 'agri', 6.2, 0.28, 'Per bushel. Droughts and harvests: tight before the harvest, cheap right after.', { cycleBeta: 0.1, wMarket: 0.05, wSector: 0.6, jumpsPerYear: 5, spreadBps: 8, advNotional: 2e9, seasonal: { amp: 0.06, peakDay: 105 } }],
  ['COFF', 'Coffee', 'agri', 1.9, 0.33, 'Per pound of arabica. Frost season in the growing belt keeps it bid.', { cycleBeta: 0.2, wMarket: 0.05, wSector: 0.5, jumpsPerYear: 5, spreadBps: 10, advNotional: 1e9, seasonal: { amp: 0.05, peakDay: 150 } }],
  ['CMPT', 'Compute', 'semis', 120, 0.4, 'Per 1,000 GPU-hours on the spot market (bible C1: $0.12/GPUh). What AI labs burn.', { cycleBeta: 0.6, wMarket: 0.2, wSector: 0.55, jumpsPerYear: 6, spreadBps: 15, advNotional: 2e9, halfLifeDays: 30 }],
  ['DATA', 'Data', 'tech', 50, 0.3, 'Per 1,000 data-quality units of licensed training data.', { cycleBeta: 0.5, wMarket: 0.2, wSector: 0.5, spreadBps: 20, advNotional: 800e6, halfLifeDays: 30 }],
  ['PWR', 'Power', 'energy', 65, 0.4, 'Per megawatt-hour on the Avalon grid. Data centers are thirsty, and summer air-con peaks the load.', { cycleBeta: 0.5, wMarket: 0.15, wSector: 0.5, jumpsPerYear: 6, spreadBps: 12, advNotional: 1.5e9, halfLifeDays: 20, seasonal: { amp: 0.08, peakDay: 140 } }],
];

function commodityDef(r: CommodityRow): AssetDef {
  const [id, name, sector, price, vol, blurb, over] = r;
  return normalizeLoadings({
    id, name, assetClass: 'commodity', sector, initialPrice: price, vol, blurb,
    drift: 0.02, cycleBeta: 0.3, wMarket: 0.2, wSector: 0.6, wCrypto: 0,
    halfLifeDays: 40, jumpsPerYear: 4, jumpUpMean: 0.05, jumpDownMean: 0.05, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 3, advNotional: 30e9, qtyStep: 0,
    ...(over ?? {}),
  });
}

const FOREX: [string, string, string, number, number, string][] = [
  ['NHK', 'Nordhaven krone', 'nordhaven', 0.094, 0.08, 'Price of one krone in Avalon dollars.'],
  ['MRE', 'Meridian mer', 'meridian', 1.08, 0.07, 'Price of one mer in Avalon dollars.'],
  ['SDR', 'Sundara sun', 'sundara', 0.27, 0.12, 'Price of one sun in Avalon dollars. Emerging-market swings.'],
  ['KYN', 'Kaiyo yen', 'kaiyo', 0.0068, 0.09, 'Price of one yen in Avalon dollars. Rallies in a panic.'],
];

function forexDef([id, name, region, price, vol, blurb]: (typeof FOREX)[number]): AssetDef {
  const haven = id === 'KYN';
  return normalizeLoadings({
    id, name, assetClass: 'forex', sector: 'fx', region, initialPrice: price, vol, blurb,
    drift: 0, cycleBeta: haven ? -0.2 : 0.1, wMarket: haven ? -0.25 : 0.15, wSector: 0.3, wCrypto: 0, wRegion: 0.55,
    halfLifeDays: 200, jumpsPerYear: 1.5, jumpUpMean: 0.02, jumpDownMean: 0.025, jumpUpProb: 0.5,
    floor: 1e-6, circuitBreaker: false, spreadBps: 1, advNotional: 100e9, qtyStep: 0,
  });
}

/**
 * Bond funds. Price vol is def.vol (the non-rate part: convexity, liquidity, spread noise) plus duration times the yield
 * changes the rates layer produces (rates.ts, booked as dayJump). The two add in quadrature, so the total sits above
 * def.vol: that is why AV10 and AV30 have vol ratios above 1 in bands.ts.
 * Government funds have no jump term (jumpsPerYear 0). A separate jump would double count the rate path, which the rates
 * layer already moves on each meeting and release. Credit funds keep their jumps: spread gaps and defaults.
 * def.vol for AV10 and AV30 is 5.5% and 11.5% (it was 4% and 7%). Their expectedVol is now def.vol alone; with the old jump
 * term it was 5.3% and 7.8%. Measured on 20 seeds, realized vol is 1.17 (AV10) and 1.19 (AV30) times expectedVol (bands.ts).
 */
const BONDS: AssetDef[] = [
  ['AV2Y', 'Avalon 2-Year Note Fund', 'y2', 1.9, 0.015, 0, 0, 0, 'Short government bonds: barely moves, pays the 2-year yield.'],
  ['AV10', 'Avalon 10-Year Bond Fund', 'y10', 8.5, 0.055, 0, 0, 0, 'The benchmark: falls when yields rise, rallies in a crisis.'],
  ['AV30', 'Avalon 30-Year Long Bond Fund', 'y30', 18, 0.115, 0, 0, 0, 'Long duration: a big rate bet in a bond wrapper.'],
  ['IGCB', 'Investment-Grade Credit Fund', 'y10', 6.5, 0.04, 0.012, 0.25, 0.2, 'Corporate bonds from solid companies.'],
  ['HYLD', 'High-Yield Credit Fund', 'y10', 4, 0.07, 0.04, 0.5, 1, 'Junk bonds: equity risk with a coupon.'],
].map(([id, name, yieldKey, duration, vol, spread, wM, jumps, blurb]) => normalizeLoadings({
  id: id as string, name: name as string, assetClass: 'bond', sector: 'rates', initialPrice: 100, vol: vol as number, blurb: blurb as string,
  drift: 0, cycleBeta: (wM as number) > 0.3 ? 0.4 : 0, wMarket: wM as number, wSector: 0.6, wCrypto: 0,
  halfLifeDays: 120, jumpsPerYear: jumps as number, jumpUpMean: 0.01, jumpDownMean: 0.03, jumpUpProb: 0.4,
  floor: 1, circuitBreaker: false, spreadBps: 2, advNotional: 20e9, qtyStep: 0,
  yieldKey: yieldKey as AssetDef['yieldKey'], duration: duration as number, carrySpread: spread as number,
}));

export interface CityDef {
  id: string;
  name: string;
  region: string;
  /** rank id required to buy property here */
  unlockRank: string;
  blurb: string;
  districts: { id: string; name: string; tier: 'working' | 'mid' | 'prime' | 'trophy'; vol: number; blurb: string }[];
}

export const CITIES: CityDef[] = [
  {
    id: 'avalon', name: 'Port Avalon', region: 'avalon', unlockRank: 'R0', blurb: 'The harbor capital where everyone starts.',
    districts: [
      { id: 'docks', name: 'Eastside Docks', tier: 'working', vol: 0.12, blurb: 'Warehouses turning into lofts.' },
      { id: 'oldharbor', name: 'Old Harbor', tier: 'mid', vol: 0.09, blurb: 'Cobbled streets and brownstones.' },
      { id: 'midtown', name: 'Midtown', tier: 'mid', vol: 0.1, blurb: 'Offices, towers and the exchange.' },
      { id: 'gilthill', name: 'Gilt Hill', tier: 'prime', vol: 0.08, blurb: 'Old money on the hill.' },
    ],
  },
  {
    id: 'nordhaven', name: 'Nordhaven City', region: 'nordhaven', unlockRank: 'R2', blurb: 'Fjords, design and quiet wealth.',
    districts: [
      { id: 'fjord', name: 'Fjord Quarter', tier: 'prime', vol: 0.08, blurb: 'Glass houses over the water.' },
      { id: 'oldtown', name: 'Gamla Town', tier: 'mid', vol: 0.08, blurb: 'Painted houses and design studios.' },
    ],
  },
  {
    id: 'meridia', name: 'Meridia', region: 'meridian', unlockRank: 'R2', blurb: 'Canals, banks and grand hotels.',
    districts: [
      { id: 'canal', name: 'Grand Canal', tier: 'prime', vol: 0.08, blurb: 'Palazzi with private moorings.' },
      { id: 'bizdist', name: 'Business District', tier: 'mid', vol: 0.11, blurb: 'Towers full of lawyers and bankers.' },
    ],
  },
  {
    id: 'sundara', name: 'Sundara Coast', region: 'sundara', unlockRank: 'R3', blurb: 'Beaches, boom towns and villas.',
    districts: [
      { id: 'palmbay', name: 'Palm Bay', tier: 'prime', vol: 0.14, blurb: 'Villas on the bay.' },
      { id: 'sunset', name: 'Sunset Strip', tier: 'working', vol: 0.15, blurb: 'Clubs, hostels and condos.' },
    ],
  },
  {
    id: 'kaiyo', name: 'Kaiyo City', region: 'kaiyo', unlockRank: 'R3', blurb: 'Neon, density and towers.',
    districts: [
      { id: 'heights', name: 'Shinbashi Heights', tier: 'prime', vol: 0.09, blurb: 'Penthouses above the skyline.' },
      { id: 'neon', name: 'Neon Ward', tier: 'mid', vol: 0.12, blurb: 'Micro-apartments and arcades.' },
    ],
  },
  {
    id: 'serena', name: 'Isla Serena', region: 'avalon', unlockRank: 'R4', blurb: 'A private archipelago for the very few.',
    districts: [
      { id: 'cays', name: 'The Cays', tier: 'trophy', vol: 0.1, blurb: 'Private islands, helipads included.' },
    ],
  },
];

export function districtAssetId(cityId: string, districtId: string): string {
  return `RE.${cityId}.${districtId}`;
}

const PROPERTY_INDICES: AssetDef[] = CITIES.flatMap((c) => c.districts.map((d) => normalizeLoadings({
  id: districtAssetId(c.id, d.id), name: `${d.name}, ${c.name}`, assetClass: 'realestate', sector: 'property',
  region: c.region, initialPrice: 100, vol: d.vol, blurb: d.blurb, listed: false,
  drift: d.tier === 'trophy' ? 0.05 : d.tier === 'prime' ? 0.04 : 0.03, cycleBeta: 0.8,
  wMarket: 0.3, wSector: 0.5, wCrypto: 0, wRegion: 0.45,
  halfLifeDays: 400, jumpsPerYear: 1, jumpUpMean: 0.03, jumpDownMean: 0.05, jumpUpProb: 0.4,
  floor: 1, circuitBreaker: false, spreadBps: 100, advNotional: 2e9, qtyStep: 0,
  yieldKey: 'y10', duration: 5,
})));

export const GAME_ASSETS: AssetDef[] = [
  ...SECTORS.flatMap((s) => STOCKS[s.id]!.map((r) => stockDef(s.id, r))),
  ...CRYPTO.map(cryptoDef),
  ...COMMODITIES.map(commodityDef),
  ...FOREX.map(forexDef),
  ...BONDS,
  ...PROPERTY_INDICES,
];

const stockIds = (pred: (a: AssetDef) => boolean) => GAME_ASSETS.filter((a) => a.assetClass === 'stock' && pred(a)).map((a) => a.id);

export const GAME_INDICES: IndexDef[] = [
  { id: 'GX', name: 'GX Composite', base: 1000, members: stockIds(() => true), rule: { assetClass: 'stock' } },
  { id: 'GXT', name: 'GX Technology', base: 1000, members: stockIds((a) => a.sector === 'tech' || a.sector === 'semis'), rule: { assetClass: 'stock', sectors: ['tech', 'semis'] } },
  { id: 'AV50', name: 'Avalon Leaders', base: 1000, members: stockIds((a) => a.region === 'avalon'), rule: { assetClass: 'stock', regions: ['avalon'] } },
  { id: 'CRX', name: 'Crypto Index', base: 1000, members: GAME_ASSETS.filter((a) => a.assetClass === 'crypto').map((a) => a.id), rule: { assetClass: 'crypto' } },
];

/** The biggest names get listed options (Derivatives license). */
export const OPTION_UNDERLYINGS: string[] = [
  ...GAME_ASSETS.filter((a) => a.assetClass === 'stock').sort((x, y) => (y.sharesOutstanding! * y.initialPrice) - (x.sharesOutstanding! * x.initialPrice) || x.id.localeCompare(y.id)).slice(0, 24).map((a) => a.id),
  'CRVO', 'GNOM', 'AUC', 'LTX', 'GOLD', 'OIL', 'AV10',
].filter((v, i, arr) => arr.indexOf(v) === i);

export function sectorName(id: string): string {
  return SECTOR_BY_ID.get(id)?.name ?? ({ crypto: 'Crypto', metals: 'Precious metals', basemetals: 'Base metals', agri: 'Agriculture', fx: 'Currencies', rates: 'Rates', property: 'Property' } as Record<string, string>)[id] ?? id;
}

/**
 * The world the game runs: the full universe, catalysts (quarterly earnings), the rates layer,
 * listed options and margin. 720 ticks per game day (5 s ticks, one game day per real hour).
 */
export function universeConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    ticksPerDay: 720,
    daysPerYear: 252,
    // GARCH 0.12 / 0.86 (persistence 0.98, as the bare engine's 0.08 / 0.9): with the close now printing the day's news in
    // full, the news residual no longer supplies the vol clustering. corr(|r_t|, |r_t-1|) was 0.142 at 0.08 (FAIL) and
    // 0.194 at 0.12 (8 seeds, tpd 24). The bare catalog keeps 0.08 / 0.9 (defaultConfig).
    garchAlpha: 0.12,
    garchBeta: 0.86,
    garchMin: 0.25,
    garchMax: 9,
    studentNu: 4,
    // momentum fix (staging engine, Quant): news is permanent, prints 70% at once, drifts in the rest
    permanentShare: 0.9,
    jumpPermanent: 1,
    jumpImmediate: 0.7,
    jumpCompensation: true,
    // alt-peak guard (Quant's C5): one-sided crowd flow > 25% ADV in a day or 50% ADV over 5 days freezes peak marks
    markGuard: { thr: 0.25, K: 0.5 },
    // market ecology, full: six trader pools set every game day's close (the closing auction); Quant/Tape gates passed 2026-10-09
    // newsPrint 1: the closing auction prints a day's idiosyncratic news in full (earnings, jumps, world events). At 0.5
    // the other half was a return the value pool traded the next day: 1-day momentum, IC1 +0.016 (V1-PHASE1 F2). Rates
    // keep their 0.5 print (ratePrint, the default), so the bond vol Tape calibrated does not move.
    ecology: { mode: 'full', weight: 1, newsPrint: 1, ratePrint: 0.5 },
    haltThreshold: 0.15,
    haltTicks: 120,
    initialRegime: 'expansion',
    trading: { ...DEFAULT_TRADING, archiveClosed: true, closedOrdersKept: 150 },
    volume: DEFAULT_VOLUME,
    regimes: DEFAULT_REGIMES,
    assets: GAME_ASSETS,
    indices: GAME_INDICES,
    // rumors per specs/quant-rumors.md: about 3 a game week across the market, 55% true
    catalysts: { ...DEFAULT_CATALYSTS, rumorProb: 0.32, rumorAccuracy: 0.55 },
    rates: DEFAULT_RATES,
    // shared world events (crash, bubble, crisis week, flash) at the spec's odds: specs/quant-world-events.md
    worldEvents: {},
    // NPC rival funds (Hale & Ward, Pinn Partners, Vetch): slices of the value and trend pools
    rivals: DEFAULT_RIVALS,
    // the evolving universe: NPC IPOs, bankruptcies, cash mergers and spin-offs (listings.ts)
    listings: {},
    // quarterly index review (indices.ts): seasoned listings join GX and their sector or region index, delisted names leave
    indexReview: {},
    // short squeezes (trading.ts): a day's forced covering of 20% of ADV or more is a squeeze, and feeds the retail headline
    squeeze: {},
    options: { ...DEFAULT_OPTIONS, underlyings: OPTION_UNDERLYINGS },
    margin: DEFAULT_MARGIN,
    ...overrides,
  };
}

/** Old indices kept for the bare-engine calibration config. */
export { DEFAULT_INDICES };
