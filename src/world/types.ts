import type { Order, OrderRequest, RngState, Side, WorldState } from '@/engine';
import type { UpgradeAxis } from '@/content/businesses';
import type { PlayerStats } from '@/content/progression';

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
  dayStart: { day: number; netWorth: number; gx: number; stats: PlayerStats };
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
}

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
  kind: 'fill' | 'order' | 'biz' | 'prop' | 'rank' | 'achievement' | 'contract' | 'alert' | 'margin' | 'deal' | 'alliance' | 'security' | 'court' | 'lab' | 'system';
  text: string;
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
  kind: 'macro' | 'rates' | 'move' | 'earnings' | 'preview' | 'rumor' | 'halt' | 'reopen' | 'biz' | 'purchase' | 'milestone' | 'filing' | 'court' | 'security' | 'alliance' | 'chapter' | 'liquidation' | 'world' | 'listing';
  tag: string;
  text: string;
  tone: 'gain' | 'loss' | 'warn' | 'info' | 'brass';
  assetId?: string;
  playerId?: string;
  /** a news move whose drift is still running: the Wire shows its priced-in band (newsBand), never the share */
  news?: 'jump' | 'earnings';
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
  stabilizer: { integral: number; sinkMult: number; lastSupply: number };
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
  kind: 'cyber intrusion' | 'model theft' | 'loan default' | 'contract breach';
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
  | { type: 'admin.advance'; ticks: number }
  /** dev and tests only: the server refuses admin.* from clients */
  | { type: 'admin.grant'; amount: number };

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
