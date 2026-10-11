import type { Order, OrderRequest, RngState, Side, WorldState } from '@/engine';
import type { UpgradeAxis } from '@/content/businesses';
import type { PlayerStats } from '@/content/progression';
import type { Msg } from '@/i18n';
import type { AnalystTier } from '@/content/learning';
import type { DayClose, PlayerLedger } from './ledger-types';
import type { CompanyWorld } from './company/types';
import type { CompanyAction } from './company/company';
import type { CompanySector } from '@/content/company';
import type { FundFees, FundMandate, FundsState } from './funds/types';
import type { LaunchpadState } from './launchpad/types';

/**
 * The persistent multiplayer world (bible Part II): one market engine plus everything players
 * own and do around it. Deterministic: `stepGame` and `applyCommand` use only seeded streams and
 * the command log, so the server can rebuild any moment from a snapshot plus the commands since.
 * Unlike the engine, the world layer mutates its state in place (the server owns one copy).
 */
export interface GameState {
  version: 2;
  seed: string;
  market: WorldState;
  players: Record<string, Player>;
  businesses: Record<string, Business>;
  bizSeq: number;
  properties: Record<string, Property>;
  propSeq: number;
  /** public feed, newest first */
  wire: WireItem[];
  wireSeq: number;
  chat: Record<string, ChatMessage[]>;
  chatSeq: number;
  alliances: Record<string, Alliance>;
  allianceSeq: number;
  /** player-to-player contracts (loans, transfers, revenue shares) */
  deals: Record<string, Deal>;
  dealSeq: number;
  /** achievement id -> the first player handle to unlock it (the public Wire names firsts). Absent in old saves. */
  firstUnlocks?: Record<string, string>;
  /** leaderboards, recomputed every BOARD_EVERY ticks */
  boards: Boards;
  /** collectibles index (limited/unique lifestyle resale), 1 = par */
  collectibles: number;
  economy: EconomyState;
  /** chapter (8-week season inside the persistent world) */
  chapter: { number: number; startTick: number; endTick: number };
  /** chapter winners, newest first */
  hallOfFame: { chapter: number; tick: number; richest: BoardRow[]; climber: BoardRow[] }[];
  /** Lab, Security and Court state live in their modules */
  lab: Record<string, LabState>;
  cyber: CyberState;
  court: CourtState;
  rng: { biz: RngState; npc: RngState; world: RngState; cyber: RngState; court: RngState; lab: RngState };
  /** per human player: trade ledger, ghosts, plans and day records (Phase 3). Absent in older saves; created on join. */
  ledgers?: Record<string, PlayerLedger>;
  /** the closing record of each game day (GX level and every asset's close), newest kept 400 days */
  dayCloses?: Record<number, DayClose>;
  /** the company world (stage A3). Absent in old saves and in worlds with no company: those behave as before. */
  companies?: CompanyWorld;
  /** player-run funds (ROADMAP 2.2). Absent in older saves; created on the first fund. */
  funds?: FundsState;
  /** the Launchpad (player-created memecoins, lead-launchpad.md). Absent until the first launch; worlds without one keep every fingerprint. */
  launchpad?: LaunchpadState;
  /** sponsor breaks (velvet-rewarded-ads.md, ROADMAP 2.7): the open breaks and the rewarded count per profile per game day. Absent until the first break. */
  sponsor?: SponsorState;
}

/** A simulated sponsor break (ROADMAP 2.7): one open card per player, and rewarded breaks counted per profile per game day. */
export interface SponsorState {
  /** rewarded breaks per profile key (the alliance owner, or the player alone), with the game day they were counted on */
  counts: Record<string, { day: number; n: number }>;
  /** the break a player has open (one at a time) */
  pending: Record<string, { id: string; startTick: number; brand: string }>;
  seq: number;
}

export interface Player {
  id: string;
  handle: string;
  country: string;
  joinedTick: number;
  lastSeenTick: number;
  online: boolean;
  /** NPC persona id, when this player is a bot */
  npc?: string;
  bio: string;
  /** highest exit-value net worth ever reached (markNetWorth); rank keys off it and is never lost */
  netWorthPeak: number;
  /** displayed net worth: markets mark-to-market */
  netWorth: number;
  /** net worth with markets at their crowd-exit liquidation value (alt-pump proof); peak, rank and boards use it */
  markNetWorth?: number;
  rankId: string;
  licenseId: string;
  prestige: number;
  reputation: number;
  notoriety: number;
  title: string;
  lifestyle: OwnedItem[];
  homePropId: string | null;
  stats: PlayerStats;
  achievements: Record<string, number>;
  /** this game day's contracts */
  contracts: ActiveContract[];
  contractsDay: number;
  /** snapshot used by contracts and day summaries */
  /** cash at the start of the game day (the sponsor-break offer reads it); absent in older saves */
  dayStart: { day: number; netWorth: number; gx: number; stats: PlayerStats; cash?: number };
  chapterStartNetWorth: number;
  watchlist: string[];
  alerts: PriceAlert[];
  alertSeq: number;
  /** analyst notes bought: asset → note */
  notes: Record<string, AnalystNote>;
  /** private notifications (fills, attacks, verdicts...), newest first */
  inbox: InboxItem[];
  inboxSeq: number;
  onboarding: { step: number; done: boolean; skipped: boolean };
  /** pending business income not yet credited to cash */
  pendingIncome: number;
  allianceId: string | null;
  /** new-player protection (bible 03 anti-grief): no hostile ops until this tick */
  shieldUntil: number;
  /** rival shown on the header (bible 04: a visible rival by minute 4) */
  rivalId: string | null;
  /** the most recent world tick the player opened their digest (While You Were Away) */
  digestSeenTick: number;
  /** cosmetic: opted into the Most Wanted board */
  mostWantedOptIn: boolean;
  /** temporary asset freeze from a verdict (Held), tick it lifts */
  heldUntil: number;
  /** public filing level already disclosed per asset (fraction of shares held) */
  filings: Record<string, number>;
  /** net worth when the digest was last opened */
  digestNetWorth: number;
  /** cash that cannot pay for analysts or desk upkeep (ad grants, fresh start) */
  restrictedCash?: number;
  /**
   * Cumulative cash from outside trading and income (sign-up and admin grants, transfers and loans, both sides). The day
   * baseline and the arrival baseline move with it (core.ts shiftBaselines), so both show trading and income only.
   */
  externalCash?: number;
  /** hired analyst (one at a time), null or absent when none */
  analyst?: { tier: AnalystTier; hiredDay: number; paidThroughDay: number } | null;
  /** Research Desk: unlocked once at Operator; lapsed when upkeep is not covered (files are kept) */
  desk?: { unlockedDay: number; paidThroughDay: number; lapsed: boolean } | null;
  /** Learn: lesson ids completed, server-side */
  lessons?: string[];
  /** goal ladder: opt-in (off by default) and the rungs done, with the tick each was done */
  goals?: { optIn: boolean; done: Record<string, number> };
  /** weekly challenge: the ISO weeks this player has used their one attempt (the attempt is claimed here, durably) */
  challengeWeeks?: string[];
  /** cash from ads and the fresh start, tagged and held 72 real hours (core.ts restrictedOf): it cannot pay for ops, margin, derivatives or transfers */
  adLots?: { amount: number; untilTick: number; kind: 'ad' | 'start' }[];
  /** the comeback (velvet-bankruptcy.md, ROADMAP 2.6): chapters, the fresh start, perks and the low-cash card. Absent until a comeback or a dismissal. */
  comeback?: ComebackState;
}

/** A player's chapter state (ROADMAP 2.6). The fresh start comes at most once per 8 real weeks, kept here so a save cannot reset it. */
export interface ComebackState {
  /** the player's chapter number (1 at the start, +1 per fresh start) */
  chapter: number;
  /** the tick the current chapter began */
  chapterStartTick: number;
  /** the highest net worth in the current chapter */
  peak: number;
  /** the tick of the last fresh start (absent before the first) */
  freshTick?: number;
  /** a close in progress: the positions are sold, then the account is reset once it is flat */
  closing?: { tick: number; perk: ComebackPerk; forced: boolean; netWorth: number };
  /** a forced close (equity below zero): the chapter screen opens; `blocked` when the cooldown stops a fresh start */
  bust?: { tick: number; blocked: boolean };
  /** the perk for the new chapter: lessons (fee rebate) and wind (business income) run for 7 real days */
  perk?: { id: ComebackPerk; untilTick: number };
  /** Old contacts: one T1 business at 50% off, used once */
  voucher?: boolean;
  /** leverage is capped at 1x until this tick (7 real days after a fresh start) */
  leverageUntil?: number;
  /** the low-cash card is hidden until this tick (a dismissal lasts a real day) */
  dismissedUntil?: number;
  /** the chapter that closed last: its peak, end value and the three largest realized losses */
  last?: { chapter: number; startTick: number; endTick: number; peak: number; end: number; losses: { id: string; assetId: string; pnl: number }[] };
}

export type ComebackPerk = 'contacts' | 'lessons' | 'wind';

export interface OwnedItem {
  uid: string;
  itemId: string;
  paid: number;
  boughtTick: number;
}

export interface PriceAlert {
  id: string;
  assetId: string;
  above: boolean;
  price: number;
}

export interface AnalystNote {
  assetId: string;
  tick: number;
  /** analyst fair value (noisy read of fundamental value) */
  fairValue: number;
  /** ±% confidence band */
  band: number;
  rating: 'Strong buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong sell';
  /** analyst desk who wrote it */
  desk: string;
}

export interface InboxItem {
  id: string;
  tick: number;
  kind: 'fill' | 'order' | 'biz' | 'prop' | 'rank' | 'achievement' | 'contract' | 'alert' | 'margin' | 'deal' | 'alliance' | 'security' | 'court' | 'lab' | 'system' | 'close' | 'work' | 'plan' | 'fund';
  text: string;
  /** the same line as a message descriptor (en.json / fr.json key), rendered in the viewer's language */
  msg?: Msg;
  /** the closed game day a 'close' notice is about (its card opens from the notice) */
  day?: number;
  tone: 'gain' | 'loss' | 'warn' | 'info' | 'brass';
  read?: boolean;
}

export interface ActiveContract {
  id: string;
  defId: string;
  text: string;
  done: boolean;
  claimed: boolean;
  reward: number;
}

export interface Business {
  id: string;
  defId: string;
  ownerId: string;
  cityId: string;
  name: string;
  boughtTick: number;
  /** cash put in (purchase + upgrades), for the sale price and net worth */
  invested: number;
  levels: Record<UpgradeAxis, number>;
  /** active incident */
  event: { id: string; mult: number; untilTick: number } | null;
  /** current income per game day (recomputed with market share) */
  incomePerDay: number;
  /** market share in its city-sector pool, 0..1 */
  share: number;
  earned: number;
  /** the owner's management: crew, price, quality, marketing, maintenance, manager (Phase 4 A1) */
  shop: ShopState;
}

/** Management state of one shop. Owner-only detail: the public view shows counts, not these. */
export interface ShopState {
  /** working capacity in base-demand units (0.5 to 2, step 0.25) */
  crew: number;
  /** price multiplier in effect */
  price: number;
  /** a price set on a game day takes effect at the next game day boundary */
  pendingPrice: number | null;
  /** game day of the last price change (-1 never) */
  priceDay: number;
  /** quality level 0 to 3 */
  quality: number;
  /** marketing spend level 0 to 3 */
  marketing: number;
  /** a maintained shop holds its condition at 100 for a small daily fee */
  maintained: boolean;
  /** 0 to 100; decays unless maintained; below 50 halves revenue */
  condition: number;
  /** owner-visible rolling review score, 0.3 to 1.6 (start 1.0) */
  reviews: number;
  /** 0 to 1, moves with load on crew */
  morale: number;
  /** share of demand lost to the queue on the last game day, 0 to 1 */
  queue: number;
  /** demand index on the last recompute */
  demand: number;
  /** manager stars 0 (none) to 3; the manager keeps the shop on autopilot within its skill */
  managerStars: number;
  /** game day the manager was hired (-1 none) */
  managerDay: number;
  /** tick of the last owner command on this shop (attrition counts from here) */
  lastAttendedTick: number;
  /** `earned` at the last game day boundary */
  earnedMark: number;
  /** operating costs paid to date (wages, opex, marketing, quality, maintenance, manager) */
  costs: number;
  /** trailing daily net income (earned less costs), up to the last 7 game days */
  net: number[];
}

export interface Property {
  id: string;
  ownerId: string;
  cityId: string;
  districtId: string;
  typeId: string;
  /** value at purchase and the district index then (value follows the index) */
  baseValue: number;
  baseIndex: number;
  /** renovation multiplier on value and rent */
  improvement: number;
  mortgage: number;
  mortgageRate: number;
  boughtTick: number;
  paid: number;
  rentEarned: number;
}

export interface WireItem {
  id: string;
  tick: number;
  kind: 'macro' | 'rates' | 'move' | 'earnings' | 'preview' | 'rumor' | 'halt' | 'reopen' | 'biz' | 'purchase' | 'milestone' | 'filing' | 'court' | 'security' | 'alliance' | 'chapter' | 'liquidation' | 'world' | 'listing' | 'index' | 'squeeze' | 'launchpad';
  /** the same line as a message descriptor (en.json / fr.json key), when the line is the world's own copy (Launchpad) */
  msg?: Msg;
  tag: string;
  text: string;
  tone: 'gain' | 'loss' | 'warn' | 'info' | 'brass';
  assetId?: string;
  playerId?: string;
  /** a news move whose drift is still running: the Wire shows its priced-in band (newsBand), never the share */
  news?: 'jump' | 'earnings';
  /** structured facts behind a world-event or index-review story, for the Calendar and the event banner (the text is the story) */
  ev?: WireEvent;
}

/** A world event (id, kind, phase) or an index review (index id, effective day, members it adds and removes). */
export interface WireEvent {
  type: 'world' | 'index';
  id: string;
  phase: 'announced' | 'start' | 'end' | 'effective';
  kind?: 'crash' | 'bubble' | 'crisis' | 'flash';
  /** world end only: game days it lasted, and the GX move since it began */
  lastedDays?: number;
  gxMove?: number;
  /** index only */
  indexId?: string;
  day?: number;
  adds?: string[];
  removes?: string[];
}

export interface ChatMessage {
  id: string;
  tick: number;
  playerId: string;
  handle: string;
  text: string;
}

export interface Alliance {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  members: Record<string, 'owner' | 'officer' | 'member'>;
  treasury: number;
  createdTick: number;
  motto: string;
  /** shared defense: a share of each member's security budget covers everyone */
  sharedDefense: number;
}

export type DealKind = 'loan' | 'transfer' | 'revshare';

export interface Deal {
  id: string;
  kind: DealKind;
  fromId: string;
  toId: string;
  amount: number;
  /** annual rate for loans, share (0..1) for revenue shares */
  rate: number;
  /** game days */
  termDays: number;
  status: 'offered' | 'active' | 'repaid' | 'defaulted' | 'declined' | 'cancelled';
  createdTick: number;
  startTick?: number;
  /** outstanding for loans */
  outstanding?: number;
  paid: number;
  note: string;
}

export interface Boards {
  tick: number;
  netWorth: BoardRow[];
  chapter: BoardRow[];
  climber: BoardRow[];
  tycoon: BoardRow[];
  trader: BoardRow[];
  prestige: BoardRow[];
  landlord: BoardRow[];
  alliance: BoardRow[];
  mostWanted: BoardRow[];
  defender: BoardRow[];
  /** per country code */
  country: Record<string, BoardRow[]>;
  /** 1-based global net worth position of every player */
  nwRank: Record<string, number>;
}

export interface BoardRow {
  id: string;
  name: string;
  value: number;
  rankId?: string;
  country?: string;
  npc?: boolean;
}

export interface EconomyState {
  /** cumulative $ created and destroyed by source */
  faucets: Record<string, number>;
  sinks: Record<string, number>;
  /** money supply index (1 at world start); the Net Worth Index divides by it */
  moneyIndex: number;
  /** stabilizer: a PI controller nudges sink rates when money grows too fast */
  stabilizer: {
    integral: number;
    sinkMult: number;
    lastSupply: number;
    /** the last supplies, oldest first (ruling O-6: the 7-day window); optional, so an old save loads */
    hist?: number[];
  };
}

// ---- AI Lab (bible 05) ----
export interface LabState {
  /** owned GPUs by tier (count) */
  gpus: Record<string, number>;
  /** reserved compute contract: PFLOP-days per game day until tick */
  reserved: { perDay: number; untilTick: number } | null;
  /** data-quality units on hand (decays) */
  data: number;
  /** synthetic share of the data on hand (model collapse above 40%) */
  dataSynth: number;
  /** completed research nodes */
  research: string[];
  /** research in progress */
  researching: { nodeId: string; doneTick: number } | null;
  models: Model[];
  training: TrainingRun | null;
  researchers: number;
  /** trading bots the player deployed */
  bots: TradingBot[];
  /** signal subscriptions the player gets from their own analyst model */
  lastSignalTick: number;
  modelSeq: number;
}

export interface Model {
  id: string;
  name: string;
  kind: 'trading' | 'analyst' | 'security';
  /** Model Capability Score */
  mcs: number;
  createdTick: number;
  /** watermark residue from distillation (0 = clean) */
  residue: number;
}

export interface TrainingRun {
  kind: Model['kind'];
  name: string;
  budget: number;
  pflopDays: number;
  dqu: number;
  careful: boolean;
  startTick: number;
  doneTick: number;
  expectedMcs: number;
  failOdds: number;
}

export interface TradingBot {
  id: string;
  modelId: string;
  strategy: 'momentum' | 'meanrev' | 'earnings' | 'value' | 'trend';
  assets: string[];
  /** max share of equity the bot may use */
  allocation: number;
  active: boolean;
  pnl: number;
  trades: number;
  lastRunTick: number;
  /** per-asset memory (EMA for trend bots) */
  memory: Record<string, number>;
}

// ---- Security (bible 03: hidden sessions, abstract) ----
export type SessionStrength = 'whisper' | 'tap' | 'siphon';

export interface ConnectionEntry {
  id: string;
  ownerId: string;
  /** what the entry looks like in the Connections panel: hostile and legit share fields */
  kind: 'data feed' | 'broker API' | 'analytics' | 'backup' | 'partner' | 'monitoring';
  codename: string;
  firstSeenTick: number;
  lastHandshakeTick: number;
  load: number;
  tag: 'trusted' | 'watch' | null;
  flagged: boolean;
  /** server-only: hostile session details (never sent to the victim) */
  hostile?: { attackerId: string; strength: SessionStrength; progress: number; modelId: string };
}

export interface Clue {
  id: string;
  ownerId: string;
  tick: number;
  kind: 'slowdown' | 'odd usage' | 'off-hours handshake';
  entryId?: string;
  /** server-only: whether it came from a real session */
  real?: boolean;
}

export interface CyberState {
  entries: Record<string, ConnectionEntry>;
  clues: Clue[];
  seq: number;
  /** security budget per player ($ per game day) and defense tier */
  defense: Record<string, { budget: number; tier: number; lastScanTick: number; lockdownUntil: number; shieldUntil: number }>;
  /** attacker cooldowns: `${attacker}>${victim}` → tick */
  cooldowns: Record<string, number>;
  /** evidence points on (attacker, victim) */
  evidence: Record<string, number>;
  /** attacker's ops in flight for the UI */
  ops: CyberOp[];
}

export interface CyberOp {
  id: string;
  attackerId: string;
  victimId: string;
  strength: SessionStrength;
  modelId: string;
  tick: number;
  result: 'planted' | 'failed' | 'detected';
  entryId?: string;
}

// ---- Court (bible 03) ----
export interface CourtCase {
  id: string;
  plaintiffId: string;
  defendantId: string;
  /** insider: opened by the backstop on surveillance points (spec 6.2); the victim is a holder of the stock */
  kind: 'cyber intrusion' | 'model theft' | 'loan default' | 'contract breach' | 'fund abuse' | 'insider' | 'rug';
  /** rug: the token the flag is on */
  tokenId?: string;
  /** fund abuse: the harm to the fund (the fund's loss against the manager's personal price), the manager's gain on the flagged trades (disgorged), and the fund it concerns */
  harm?: number;
  gain?: number;
  fundId?: string;
  /** fund abuse: the Victim Compensation Fund's advance, paid to the non-manager investors (never into the fund), against the unpaid award */
  vcfAdvance?: number;
  evidence: number;
  /** filing bar: civil 40, tribunal 55, criminal 70 */
  bar: number;
  counselPlaintiff: number;
  counselDefendant: number;
  filedTick: number;
  hearingTick: number;
  status: 'filed' | 'won' | 'lost' | 'settled' | 'dismissed';
  damages: number;
  fine: number;
  verdictText?: string;
  /** the verdict as an i18n descriptor (the rug verdict is through the keys; verdictText is its English for old clients) */
  verdictMsg?: { key: string; vars?: Record<string, string | number> };
  settlementOffer?: number;
}

export interface CourtState {
  cases: Record<string, CourtCase>;
  seq: number;
}

// ---- Commands (everything a player can do) ----
export type Command =
  | { type: 'join'; handle: string; country: string }
  | { type: 'presence'; online: boolean }
  | { type: 'order.place'; order: Omit<OrderRequest, 'playerId'> }
  | { type: 'order.cancel'; orderId: string }
  | { type: 'order.modify'; orderId: string; qty?: number; limitPrice?: number; stopPrice?: number; trailPct?: number }
  | { type: 'position.close'; assetId: string }
  | { type: 'option.trade'; contractId: string; side: Side; qty: number }
  | { type: 'biz.buy'; defId: string; cityId: string; name?: string }
  | { type: 'biz.upgrade'; bizId: string; axis: UpgradeAxis }
  | { type: 'biz.sell'; bizId: string }
  | { type: 'biz.rename'; bizId: string; name: string }
  | { type: 'biz.crew'; bizId: string; crew: number }
  | { type: 'biz.price'; bizId: string; price: number }
  | { type: 'biz.quality'; bizId: string; level: number }
  | { type: 'biz.marketing'; bizId: string; level: number }
  | { type: 'biz.maintain'; bizId: string; on: boolean }
  | { type: 'biz.manager.hire'; bizId: string; stars: number }
  | { type: 'biz.manager.fire'; bizId: string }
  | { type: 'prop.buy'; cityId: string; districtId: string; typeId: string; ltv: number }
  | { type: 'prop.sell'; propId: string }
  | { type: 'prop.renovate'; propId: string }
  | { type: 'prop.home'; propId: string | null }
  | { type: 'prop.repay'; propId: string; amount: number }
  | { type: 'life.buy'; itemId: string }
  | { type: 'life.sell'; uid: string }
  | { type: 'note.buy'; assetId: string }
  | { type: 'watch.set'; assetIds: string[] }
  | { type: 'alert.add'; assetId: string; above: boolean; price: number }
  | { type: 'alert.remove'; alertId: string }
  | { type: 'contract.claim'; contractId: string }
  | { type: 'onboarding'; step: number; skipped?: boolean; done?: boolean }
  | { type: 'profile'; bio?: string; country?: string; title?: string; mostWantedOptIn?: boolean }
  | { type: 'inbox.read' }
  | { type: 'digest.seen' }
  | { type: 'close.seen'; day: number }
  | { type: 'chat.send'; channel: string; text: string }
  | { type: 'alliance.create'; name: string; tag: string; motto: string }
  | { type: 'alliance.join'; allianceId: string }
  | { type: 'alliance.leave' }
  | { type: 'alliance.deposit'; amount: number }
  | { type: 'alliance.withdraw'; amount: number }
  | { type: 'alliance.promote'; playerId: string }
  | { type: 'alliance.kick'; playerId: string }
  | { type: 'deal.offer'; kind: Deal['kind']; toId: string; amount: number; rate: number; termDays: number; note: string }
  | { type: 'deal.respond'; dealId: string; accept: boolean }
  | { type: 'deal.cancel'; dealId: string }
  | { type: 'deal.repay'; dealId: string; amount: number }
  | { type: 'lab.gpu'; tier: string; qty: number }
  | { type: 'lab.reserve'; perDay: number; days: number }
  | { type: 'lab.data'; source: string; qty: number }
  | { type: 'lab.research'; nodeId: string }
  | { type: 'lab.hire'; qty: number }
  | { type: 'lab.train'; kind: Model['kind']; name: string; budget: number; careful: boolean }
  | { type: 'lab.bot'; modelId: string; strategy: TradingBot['strategy']; assets: string[]; allocation: number }
  | { type: 'lab.botToggle'; botId: string; active: boolean }
  | { type: 'lab.signal' }
  | { type: 'sec.budget'; budget: number }
  | { type: 'sec.scan' }
  | { type: 'sec.tag'; entryId: string; tag: 'trusted' | 'watch' | null }
  | { type: 'sec.disconnect'; entryId: string }
  | { type: 'sec.lockdown' }
  | { type: 'sec.plant'; victimId: string; strength: SessionStrength; modelId: string }
  | { type: 'court.file'; defendantId: string; kind: CourtCase['kind']; counsel: number }
  | { type: 'court.settle'; caseId: string; amount: number }
  | { type: 'court.acceptSettlement'; caseId: string }
  | { type: 'donate'; amount: number; cause: string }
  | { type: 'analyst.hire'; tier: AnalystTier }
  | { type: 'analyst.fire' }
  | { type: 'desk.unlock' }
  | { type: 'desk.resume' }
  /** a Research Desk query: an asset over a closed window (clamped to closed days); the result is the dossier */
  | { type: 'desk.query'; assetId: string; from: number; to: number }
  /** one of the player's saved desk files (readable while the desk is locked) */
  | { type: 'desk.file'; no: number }
  /** the journal detail of one of the player's closed trades (read-only) */
  | { type: 'journal.detail'; tripId: string }
  | { type: 'lesson.complete'; lessonId: string }
  | { type: 'goals.optIn'; on: boolean }
  | { type: 'challenge.claim'; weekKey: string }
  | { type: 'recurring.add'; assetId: string; dollars: number; everyDays: number }
  | { type: 'recurring.cancel'; planId: string }
  | { type: 'drip.set'; assetId: string; on: boolean }
  | { type: 'block.start'; assetId: string; side: Side; qty: number; slices: number }
  | { type: 'block.cancel'; planId: string }
  | { type: 'company.found'; name: string; sector: CompanySector; cityId: string; capital: number }
  | { type: 'company.act'; companyId: string; action: CompanyAction }
  /** B1 (company/bridge.ts): the IPO book, its subscriptions, sell-only plans, buybacks, loans, repayments and dividends */
  | { type: 'company.ipo'; companyId: string; floatPct: number }
  | { type: 'company.ipoOrder'; companyId: string; shares: number }
  | { type: 'company.plan'; companyId: string; qtyPerDay: number; days: number[]; minSellPrice: number }
  | { type: 'company.planCancel'; companyId: string; planId: string }
  | { type: 'company.buyback'; companyId: string; size: number; fromDay: number; toDay: number }
  | { type: 'company.loan'; companyId: string; amount: number; guarantee?: boolean; acknowledged?: boolean }
  | { type: 'company.repay'; companyId: string; debtId: string; amount: number }
  | { type: 'company.dividend'; companyId: string; perShare: number }
  | { type: 'company.bid'; companyId: string; price: number }
  /** player-run funds (funds/index.ts): the manager opens a fund with a stake, changes its mandate, and trades it */
  | { type: 'fund.create'; name: string; mandate: FundMandate; fees: FundFees; stake: number }
  | { type: 'fund.mandate'; fundId: string; mandate: FundMandate }
  | { type: 'fund.trade'; fundId: string; assetId: string; side: Side; qty: number; orderType?: 'market' | 'limit'; limitPrice?: number }
  | { type: 'fund.deposit'; fundId: string; amount: number }
  | { type: 'fund.redeem'; fundId: string; units: number }
  /** the Launchpad (lead-launchpad.md): launch a token (cents of dev buy optional), buy and sell on its curve, buy a buzz item, cancel an untraded launch, file a rug case */
  | { type: 'lp.launch'; name: string; ticker: string; tagline: string; allocation: number; devBuyCents?: number }
  | { type: 'lp.buy'; ticker: string; spendCents: number; maxSlip?: number }
  | { type: 'lp.sell'; ticker: string; tokens: number; maxSlip?: number }
  | { type: 'lp.buzz'; ticker: string; kind: 'board' | 'wire' }
  | { type: 'lp.cancel'; ticker: string }
  | { type: 'lp.file'; ticker: string }
  /** sponsor breaks (velvet-rewarded-ads.md): open a 15-second card, then finish it (a full watch pays; a skip after 5 s pays nothing) */
  | { type: 'ad.start' }
  | { type: 'ad.finish'; id: string; skip: boolean }
  /** the fresh start (chapter screen, held to confirm): closes the positions and starts the next chapter with $5,000 */
  | { type: 'comeback.confirm'; perk: ComebackPerk }
  /** the low-cash card is dismissed for a real day */
  | { type: 'comeback.dismiss' }
  | { type: 'admin.advance'; ticks: number }
  /** dev and tests only: the server refuses admin.* from clients */
  | { type: 'admin.grant'; amount: number }
  /** dev and tests only: a test price shock (shockPrice: lnP moves, the value does not) */
  | { type: 'admin.shock'; assetId: string; pct: number }
  /** dev and tests only: backdates a player's join by `ticks` (the account-age rules, without a long advance) */
  | { type: 'admin.age'; playerId: string; ticks: number }
  /** dev and tests only: a founder's company has the filed quarters and filed value the IPO rules read (adminIpoReady) */
  | { type: 'admin.ipoReady'; playerId: string }
  /** dev and tests only: a founder's company is late-tier with two filed quarters (adminFiledLate, the Filings tab) */
  | { type: 'admin.filedLate'; playerId: string }
  /** dev and tests only: a next-gen launch credit at a quality score (adminLaunchCredit, the R&D launch block) */
  | { type: 'admin.launchCredit'; playerId: string; score: number }
  /** dev and tests only: fills a token's curve up to graduation (the e2e seam for the graduation path) */
  | { type: 'admin.lpFill'; ticker: string };

export interface CommandResult {
  ok: boolean;
  error?: string;
  /** e.g. the placed order, the new business id */
  data?: unknown;
}

export interface StepOutput {
  /** public wire items added this tick */
  wire: WireItem[];
  /** private notifications by player */
  inbox: Record<string, InboxItem[]>;
  /** fills this tick (for tapes and toasts) */
  fills: { playerId: string; assetId: string; side: Side; qty: number; price: number; fee: number; orderId: string }[];
  /** orders that closed this tick without completing */
  closed: Order[];
  /** chat messages added this tick (NPC chatter) */
  chat: ChatMessage[];
  /** rank-ups this tick */
  rankUps: { playerId: string; rankId: string }[];
}
