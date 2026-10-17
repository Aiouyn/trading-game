/**
 * Progression content: achievements, hourly contracts (missions) and the NPC rivals that keep
 * the world alive when few humans are online (bible 04: "a visible rival by minute 4").
 */

/** Counters the world keeps per player; achievements and contracts read them. */
export interface PlayerStats {
  trades: number;
  winningTrades: number;
  /** closed trades (sells, short covers, option closes) with a non-zero result, so win rate divides wins by closes */
  closedTrades?: number;
  bestTrade: number;
  worstTrade: number;
  shortsWon: number;
  optionsWon: number;
  earningsWins: number;
  stopsTriggered: number;
  bizBought: number;
  bizUpgrades: number;
  bizSold: number;
  propsBought: number;
  rentCollected: number;
  lifeBought: number;
  notesBought: number;
  chats: number;
  contractsDone: number;
  daysActive: number;
  maxPositions: number;
  liquidations: number;
  bizIncome: number;
  /** cumulative owner costs paid out of cash: property and mortgage upkeep, lifestyle upkeep, analysts, the desk, shop costs */
  overheads?: number;
  dividends: number;
  researchDone: number;
  trainingRuns: number;
  scansRun: number;
  sessionsCut: number;
  casesWon: number;
  donations: number;
}

export function emptyStats(): PlayerStats {
  return {
    trades: 0, winningTrades: 0, bestTrade: 0, worstTrade: 0, shortsWon: 0, optionsWon: 0, earningsWins: 0,
    stopsTriggered: 0, bizBought: 0, bizUpgrades: 0, bizSold: 0, propsBought: 0, rentCollected: 0, lifeBought: 0,
    notesBought: 0, chats: 0, contractsDone: 0, daysActive: 0, maxPositions: 0, liquidations: 0, bizIncome: 0,
    dividends: 0, researchDone: 0, trainingRuns: 0, scansRun: 0, sessionsCut: 0, casesWon: 0, donations: 0,
  };
}

export interface AchievementCtx {
  stats: PlayerStats;
  netWorth: number;
  rankIdx: number;
  prestige: number;
  businesses: number;
  bizSectors: number;
  properties: number;
  cities: number;
  allianceMember: boolean;
  leaderboardRank: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  tier: 'bronze' | 'silver' | 'gold' | 'legend';
  check: (c: AchievementCtx) => boolean;
}

const A = (id: string, name: string, text: string, tier: AchievementDef['tier'], check: AchievementDef['check']): AchievementDef => ({ id, name, text, tier, check });

/** The public Wire names an unlock only when it is rare: the legend tier. Firsts in the world are named too (world/players.ts). */
export function isRareAchievement(a: AchievementDef): boolean {
  return a.tier === 'legend';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  A('first-trade', 'Opening Bell', 'Make your first trade.', 'bronze', (c) => c.stats.trades >= 1),
  A('first-win', 'In the Green', 'Close a trade at a profit.', 'bronze', (c) => c.stats.winningTrades >= 1),
  A('ten-wins', 'Hot Hand', 'Close 10 profitable trades.', 'silver', (c) => c.stats.winningTrades >= 10),
  A('hundred-trades', 'Tape Reader', 'Make 100 trades.', 'silver', (c) => c.stats.trades >= 100),
  A('thousand-trades', 'Floor Veteran', 'Make 1,000 trades.', 'gold', (c) => c.stats.trades >= 1000),
  A('big-win', 'Home Run', 'Make $10,000 on a single trade.', 'silver', (c) => c.stats.bestTrade >= 10_000),
  A('huge-win', 'Grand Slam', 'Make $1M on a single trade.', 'gold', (c) => c.stats.bestTrade >= 1_000_000),
  A('stop-saved', 'Saved by the Stop', 'Have a stop order close a position for you.', 'bronze', (c) => c.stats.stopsTriggered >= 1),
  A('short-win', 'Against the Crowd', 'Profit on a short.', 'silver', (c) => c.stats.shortsWon >= 1),
  A('option-win', 'Convexity', 'Profit on an option.', 'silver', (c) => c.stats.optionsWon >= 1),
  A('earnings-win', 'Read the Room', 'Profit from a position held through an earnings report.', 'silver', (c) => c.stats.earningsWins >= 1),
  A('diversified', 'Diversified', 'Hold 8 positions at once.', 'bronze', (c) => c.stats.maxPositions >= 8),
  A('liquidated', 'Lesson Learned', 'Get liquidated on margin. It happens.', 'bronze', (c) => c.stats.liquidations >= 1),
  A('first-biz', 'Open for Business', 'Buy your first business.', 'bronze', (c) => c.stats.bizBought >= 1),
  A('five-biz', 'Small Empire', 'Own 5 businesses.', 'silver', (c) => c.businesses >= 5),
  A('twenty-biz', 'Portfolio Company', 'Own 20 businesses.', 'gold', (c) => c.businesses >= 20),
  A('sectors-5', 'Conglomerate Minded', 'Own businesses in 5 sectors.', 'silver', (c) => c.bizSectors >= 5),
  A('sectors-13', 'Everything Store', 'Own businesses in all 13 sectors.', 'legend', (c) => c.bizSectors >= 13),
  A('upgrader', 'Continuous Improvement', 'Buy 25 business upgrades.', 'silver', (c) => c.stats.bizUpgrades >= 25),
  A('biz-income-1m', 'Cash Machine', 'Earn $1M from businesses.', 'gold', (c) => c.stats.bizIncome >= 1_000_000),
  A('first-prop', 'Landlord', 'Buy your first property.', 'bronze', (c) => c.stats.propsBought >= 1),
  A('props-10', 'Property Portfolio', 'Own 10 properties.', 'gold', (c) => c.properties >= 10),
  A('cities-3', 'Jet Setter', 'Own property in 3 cities.', 'gold', (c) => c.cities >= 3),
  A('first-luxury', 'Treat Yourself', 'Buy your first lifestyle item.', 'bronze', (c) => c.stats.lifeBought >= 1),
  A('prestige-100', 'Noticed', 'Reach 100 Prestige.', 'silver', (c) => c.prestige >= 100),
  A('prestige-1000', 'Famous', 'Reach 1,000 Prestige.', 'gold', (c) => c.prestige >= 1000),
  A('prestige-10000', 'Iconic', 'Reach 10,000 Prestige.', 'legend', (c) => c.prestige >= 10_000),
  A('philanthropist', 'Philanthropist', 'Give $1M to good causes.', 'gold', (c) => c.stats.donations >= 1_000_000),
  A('nw-10k', 'Five Figures', 'Reach $10,000 net worth.', 'bronze', (c) => c.netWorth >= 10_000),
  A('nw-100k', 'Six Figures', 'Reach $100,000 net worth.', 'silver', (c) => c.netWorth >= 100_000),
  A('nw-1m', 'Millionaire', 'Reach $1M net worth.', 'gold', (c) => c.netWorth >= 1_000_000),
  A('nw-1b', 'Billionaire', 'Reach $1B net worth.', 'legend', (c) => c.netWorth >= 1_000_000_000),
  A('rank-hustler', 'Hustler', 'Reach rank Hustler.', 'bronze', (c) => c.rankIdx >= 1),
  A('rank-owner', 'Owner', 'Reach rank Owner.', 'silver', (c) => c.rankIdx >= 2),
  A('rank-operator', 'Operator', 'Reach rank Operator.', 'gold', (c) => c.rankIdx >= 3),
  A('rank-mogul', 'Mogul', 'Reach rank Mogul.', 'gold', (c) => c.rankIdx >= 4),
  A('rank-titan', 'Titan', 'Reach rank Titan.', 'legend', (c) => c.rankIdx >= 5),
  A('rank-dynasty', 'Dynasty', 'Reach rank Dynasty.', 'legend', (c) => c.rankIdx >= 6),
  A('top-100', 'Gilt List', 'Enter the global top 100.', 'gold', (c) => c.leaderboardRank > 0 && c.leaderboardRank <= 100),
  A('top-10', 'Household Name', 'Enter the global top 10.', 'legend', (c) => c.leaderboardRank > 0 && c.leaderboardRank <= 10),
  A('number-one', 'Number One', 'Top the global leaderboard.', 'legend', (c) => c.leaderboardRank === 1),
  A('alliance', 'Strength in Numbers', 'Join an alliance.', 'bronze', (c) => c.allianceMember),
  A('social', 'Trash Talker', 'Send 20 chat messages.', 'bronze', (c) => c.stats.chats >= 20),
  A('contracts-10', 'Reliable', 'Complete 10 hourly contracts.', 'silver', (c) => c.stats.contractsDone >= 10),
  A('contracts-100', 'Contractor', 'Complete 100 hourly contracts.', 'gold', (c) => c.stats.contractsDone >= 100),
  A('analyst', 'Do Your Homework', 'Buy 10 analyst notes.', 'silver', (c) => c.stats.notesBought >= 10),
  A('researcher', 'Lab Rat', 'Complete an AI research project.', 'silver', (c) => c.stats.researchDone >= 1),
  A('trainer', 'First Model', 'Finish a training run.', 'silver', (c) => c.stats.trainingRuns >= 1),
  A('defender', 'Locked Down', 'Disconnect a hostile session.', 'silver', (c) => c.stats.sessionsCut >= 1),
  A('litigator', 'Day in Court', 'Win a court case.', 'gold', (c) => c.stats.casesWon >= 1),
  A('regular', 'Regular', 'Be active on 7 different game days.', 'bronze', (c) => c.stats.daysActive >= 7),
];

/** Hourly contracts: three per game day, picked from this pool, rewards scale with net worth. */
export interface ContractDef {
  id: string;
  text: string;
  /** counter to read and how much it must grow during the game day */
  stat: keyof PlayerStats | 'netWorthGain' | 'beatIndex';
  target: number;
  /** reward as a fraction of net worth (capped in the world layer) */
  reward: number;
  minRank: number;
}

export const CONTRACTS: ContractDef[] = [
  { id: 'trades-3', text: 'Make 3 trades this hour', stat: 'trades', target: 3, reward: 0.01, minRank: 0 },
  { id: 'win-1', text: 'Close a trade in profit this hour', stat: 'winningTrades', target: 1, reward: 0.015, minRank: 0 },
  { id: 'win-3', text: 'Close 3 trades in profit this hour', stat: 'winningTrades', target: 3, reward: 0.03, minRank: 1 },
  { id: 'biz-1', text: 'Buy a business this hour', stat: 'bizBought', target: 1, reward: 0.015, minRank: 0 },
  { id: 'upg-2', text: 'Buy 2 business upgrades this hour', stat: 'bizUpgrades', target: 2, reward: 0.015, minRank: 0 },
  { id: 'nw-2', text: 'Grow your net worth 2% this hour', stat: 'netWorthGain', target: 0.02, reward: 0.02, minRank: 0 },
  { id: 'nw-5', text: 'Grow your net worth 5% this hour', stat: 'netWorthGain', target: 0.05, reward: 0.04, minRank: 1 },
  { id: 'beat', text: 'Beat the GX index by 0.5% this hour', stat: 'beatIndex', target: 0.005, reward: 0.02, minRank: 0 },
  { id: 'note-1', text: 'Buy an analyst note', stat: 'notesBought', target: 1, reward: 0.01, minRank: 1 },
  { id: 'prop-1', text: 'Buy a property', stat: 'propsBought', target: 1, reward: 0.02, minRank: 1 },
  { id: 'life-1', text: 'Buy something nice', stat: 'lifeBought', target: 1, reward: 0.01, minRank: 0 },
  { id: 'chat-1', text: 'Say hi in world chat', stat: 'chats', target: 1, reward: 0.005, minRank: 0 },
  { id: 'short-1', text: 'Profit on a short', stat: 'shortsWon', target: 1, reward: 0.03, minRank: 2 },
  { id: 'option-1', text: 'Profit on an option', stat: 'optionsWon', target: 1, reward: 0.03, minRank: 3 },
  { id: 'scan-1', text: 'Run a security scan', stat: 'scansRun', target: 1, reward: 0.01, minRank: 3 },
];

export type NpcStyle = 'momentum' | 'value' | 'dividend' | 'crypto' | 'tycoon' | 'whale' | 'contrarian' | 'macro' | 'landlord' | 'gambler';

export interface NpcPersona {
  id: string;
  handle: string;
  country: string;
  style: NpcStyle;
  bio: string;
  /** starting wealth: most start small like players, a few are established whales */
  start: number;
}

export const NPCS: NpcPersona[] = [
  { id: 'npc-mika', handle: 'mika_q', country: 'NH', style: 'momentum', bio: 'Chases strength. Never fights the tape.', start: 5_000 },
  { id: 'npc-vega', handle: 'vega', country: 'AV', style: 'value', bio: 'Buys what everyone hates. Sleeps well.', start: 60_000 },
  { id: 'npc-ostrova', handle: 'Ostrova', country: 'MU', style: 'dividend', bio: 'Collects coupons like stamps.', start: 250_000 },
  { id: 'npc-degen', handle: 'wenmoon', country: 'SD', style: 'crypto', bio: 'Diamond hands. Paper portfolio.', start: 8_000 },
  { id: 'npc-baron', handle: 'BaronVonCart', country: 'AV', style: 'tycoon', bio: 'Started with one food cart. Now owns the street.', start: 5_000 },
  { id: 'npc-whale', handle: 'Leviathan', country: 'MU', style: 'whale', bio: 'Nobody knows who runs this account.', start: 80_000_000 },
  { id: 'npc-kai', handle: 'kai.trades', country: 'KY', style: 'contrarian', bio: 'Fades every rally.', start: 12_000 },
  { id: 'npc-hawk', handle: 'RateHawk', country: 'AV', style: 'macro', bio: 'Trades the central bank, nothing else.', start: 400_000 },
  { id: 'npc-brick', handle: 'BrickByBrick', country: 'AV', style: 'landlord', bio: 'Never sold a building. Never will.', start: 150_000 },
  { id: 'npc-yolo', handle: 'yolo_capital', country: 'SD', style: 'gambler', bio: 'All in, every time.', start: 5_000 },
  { id: 'npc-lena', handle: 'LenaFjord', country: 'NH', style: 'value', bio: 'Patient money from the fjords.', start: 2_000_000 },
  { id: 'npc-tanaka', handle: 'Tanaka_K', country: 'KY', style: 'tycoon', bio: 'Builds factories, then buys their suppliers.', start: 900_000 },
  { id: 'npc-sol', handle: 'SolBeach', country: 'SD', style: 'landlord', bio: 'Villas on every beach in Sundara.', start: 30_000 },
  { id: 'npc-quant', handle: 'sigma_six', country: 'AV', style: 'momentum', bio: 'Runs a model. Mostly trusts it.', start: 5_000_000 },
  { id: 'npc-rosa', handle: 'RosaMeridia', country: 'MU', style: 'dividend', bio: 'Old money, older stocks.', start: 18_000_000 },
  { id: 'npc-ghost', handle: 'gh0st', country: 'NH', style: 'crypto', bio: 'Early to everything.', start: 1_500_000 },
  { id: 'npc-chef', handle: 'ChefMarco', country: 'MU', style: 'tycoon', bio: 'Restaurants first, empire second.', start: 5_000 },
  { id: 'npc-ape', handle: 'apestrong', country: 'AV', style: 'gambler', bio: 'Options only. Weekly expiries.', start: 25_000 },
  { id: 'npc-iris', handle: 'iris.vc', country: 'AV', style: 'value', bio: 'Former venture capitalist, now just rich.', start: 300_000_000 },
  { id: 'npc-dune', handle: 'DuneOil', country: 'SD', style: 'macro', bio: 'Oil, gold and nothing in between.', start: 7_000_000 },
  { id: 'npc-nova', handle: 'nova', country: 'KY', style: 'momentum', bio: 'Speed is the edge.', start: 5_000 },
  { id: 'npc-atlas', handle: 'AtlasHoldings', country: 'AV', style: 'whale', bio: 'Family office. Very quiet. Very large.', start: 1_200_000_000 },
  { id: 'npc-pip', handle: 'pip_pip', country: 'NH', style: 'contrarian', bio: 'Buys the dip. Then the dip under the dip.', start: 40_000 },
  { id: 'npc-sunny', handle: 'SunnyRentals', country: 'SD', style: 'landlord', bio: 'Rents rooms to tourists.', start: 5_000 },
];
