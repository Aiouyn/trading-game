// The player is one person in the same arrays as everyone else. They see only what they
// know, and every order, loan and futures fill goes through the modules that already book it.
import { lifeHelp } from './arrival.ts';
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { borrowBar, borrowMargin, creditTightness, depositSight, marginLimit, productHaircuts, rateWhy, repayPerson, withdrawSight } from '../banking/index.ts';
import { LOT, submitBondOrder } from '../bonds/index.ts';
import { tradeFuture } from '../commodities/index.ts';
import { blockOf, controls, sharesOf, appointChief, companyPosts, foldFirm, foundCompany, sellDivision, steerCompany, takePublic, tenderOffer, type CompanyPost } from '../corporate/index.ts';
import { KIND, ROLES, VAL, borrowAll, buyIn, cutJobs, dealUnion, owner, payOut, promote, protectJobs, refinance, cityMemory, regard, sellAssets } from '../corporate/owner.ts';
import { consensusAll, revealsOf, signalsFor } from '../signals/index.ts';
import { coinPrice, launchCoin, orderCoin } from '../crypto/index.ts';
import { CEO_POSITION, GOODS, SECTOR_NAMES } from '../economy/content.ts';
import { BANK, CAPITAL, DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { ALIVE, RETIRED, joinFirm, labourOf, leaveJob, retargetLabour, setSimDay, succession, thought } from '../economy/people.ts';
import { reportOffence } from '../law/index.ts';
import { bookLevels, markHolding, markPlayerTrading, midPrice, saleProceeds } from '../markets/index.ts';
import { cancelAny, placeShareOrder, placeStop, runStops, settleCovers, shortMark, shortSell, shortsDay, stopRows, type StockLoan, type Stop } from './trading.ts';
import { matchOption, optionChain, optionWhy, tradeOption, type OptRow } from '../options/index.ts';
import { bidHome, homeBoard, letHome, mortgageHome, moveHome, sellHome, type HomeRow } from '../property/index.ts';
import { playerChronicle } from '../history/story.ts';
import { B_FRIEND, askFirm, contactsOf, knows, nudgeStanding, publish, regardOf, seatPerson, talk } from '../social/index.ts';
import { choiceSpec, coolLeft, dollars, explainNumber, explainThing, feeOf, lifeBoard, memoryOf, noteBoard, payGov, type ChoiceId, type ChoiceView, type LifeMemory, type StatId, type StatView } from './life.ts';
import { storyLines, tellWeek, type StoryLine } from './story.ts';
import { noteAct, skipTutorial, tutorialOf, type TutorialState, type TutorialView } from './tutorial.ts';
import { circleAct } from '../circle/index.ts';

export const PLAYER = 8;

export interface Heard { factId: number; eventId: number; from: number; day: number }
export interface ScorePoint { day: number; worth: number }
interface Share { who: number; bps: number }

export interface Will { heir: number; shares: Share[]; eventId: number }

export interface PlayerSeat {
  who: number;
  over: boolean;
  margin: boolean;
  arrived: number;
  moneyEv: number;
  payEv: number;
  payCents: number;
  spendEv: number;
  spendCents: number;
  cashSeen: number;
  cashDay: number;
  heard: Heard[];
  score: ScorePoint[];
  loans: StockLoan[];
  /** Stop and stop-limit orders, held here and checked every tick. */
  stops?: Stop[];
  line: number[];
  generation: number;
  founded: number;
  controlled: number;
  offices: number;
  convictions: number;
  officeWas: string;
  seenLaw: number[];
  will: Will | null;
  chair: number;
  handed: number;
  final: string;
  passed: number;
  counsel: number;
  statEv: Partial<Record<StatId, number>>;
  mark: Record<StatId, number> | null;
  trend: Partial<Record<StatId, -1 | 0 | 1>>;
  words: Partial<Record<StatId, string>>;
  cool: Partial<Record<ChoiceId, number>>;
  story: StoryLine[];
  tutor: TutorialState | null;
  seenNote: number;
  /** Employer index last observed. -2 means not sampled yet, so a reload does not invent a hire. */
  jobAt: number;
  jobNotes: { why: string; text: string; eventId: number; cause: number }[];
}

/** One entry in the command log. The day is the day the command was issued, before a wait advances the clock. */
export interface CommandRecord {
  day: number;
  playerId: string;
  cmd: Command;
  status: 'accepted' | 'rejected';
  why?: string;
}

/** Ledger hash after the close of `day` (the world has already moved on to the next morning). */
export interface DayMark { day: number; hash: string }

/** Enough to open the same scenario again. Absent fields mean "the scenario's own default". */
export interface ScriptNote {
  id: string;
  cash?: number;
  difficulty?: number;
  seed?: string;
}

/** Every player, keyed by id. `who` and `heard` mirror the first seat so modules that still read them see the one player V1 runs. */
export interface PlayerState {
  ids: string[];
  seat: Record<string, PlayerSeat>;
  log: CommandRecord[];
  days: DayMark[];
  script: ScriptNote | null;
  who: number;
  heard: Heard[];
}

export const DEFAULT_PLAYER = '1';

export type Command =
  | { kind: 'order'; side: 'buy' | 'sell' | 'short'; instr: string; qty: number; limit?: number; type?: 'market' | 'limit' | 'stop' | 'stop-limit'; stop?: number }
  | { kind: 'cancel'; orderId: number }
  | { kind: 'bond'; side: 'buy' | 'sell'; tenor: string; bonds: number; limit?: number }
  | { kind: 'fut'; side: 'long' | 'short' | 'flat'; good: string; qty: number; months: number; type?: 'market' | 'stop'; stop?: number }
  | { kind: 'coin'; side: 'buy' | 'sell'; coin: string; qty: number; limit?: number; type?: 'market' | 'limit' | 'stop' | 'stop-limit'; stop?: number }
  | { kind: 'launch'; name?: string; ticker?: string; buy?: number }
  | { kind: 'cash'; op: 'deposit' | 'withdraw' | 'borrow' | 'repay'; cents: number; product?: 'margin' | 'line' | 'term' }
  | { kind: 'talk'; slot: number }
  | { kind: 'ask'; slot: number; firm: string }
  | { kind: 'news' }
  | { kind: 'why'; id?: number; thing?: string }
  | { kind: 'holiday' }
  | { kind: 'donate' }
  | { kind: 'lawyer' }
  | { kind: 'clinic' }
  | { kind: 'overtime' }
  | { kind: 'wait'; days: number }
  | { kind: 'found'; name: string; sector: string; cents: number; loan: boolean }
  | { kind: 'ceo'; firm: string; op: 'report' | 'price' | 'hires' | 'dividend' | 'invest'; value?: number; auto?: boolean }
  | { kind: 'ipo'; firm: string; fraction: number }
  | { kind: 'bid'; firm: string; cents: number; multiple: number; paper: boolean }
  | { kind: 'board'; op: 'list' | 'chief' | 'merge' | 'sell'; firm?: string; slot?: number; into?: string; person?: string }
  | { kind: 'sheet' }
  | { kind: 'desk' }
  | { kind: 'quote'; firm: string }
  | { kind: 'court'; slot: number }
  | { kind: 'marry'; slot: number }
  | { kind: 'child' }
  | { kind: 'school'; nth: number }
  | { kind: 'will'; how: 'spouse' | 'child' | 'slot'; nth: number }
  | { kind: 'retire' }
  | { kind: 'hand'; firm: string }
  | { kind: 'die' }
  | { kind: 'help'; command: string }
  | { kind: 'opt'; instr: string }
  | { kind: 'optbuy'; right: 'C' | 'P'; instr: string; qty: number; months: number; strike: number }
  | { kind: 'write'; right: 'C' | 'P'; instr: string; qty: number; months: number; strike: number }
  | { kind: 'optclose'; id: string; instr: string; qty: number }
  | { kind: 'homes' }
  | { kind: 'homebid'; id: number; cents: number }
  | { kind: 'homesell'; id: number }
  | { kind: 'let'; id: number; cents: number }
  | { kind: 'move'; id: number }
  | { kind: 'mortgage'; id: number; cents: number }
  | { kind: 'tip'; fact: number }
  | { kind: 'report'; slot: number; text: string }
  | { kind: 'hints'; on: boolean }
  | { kind: 'story' }
  | { kind: 'sheet' }
  | { kind: 'reply'; msg: number; text: string }
  | { kind: 'lend'; slot: number; cents: number }
  | { kind: 'invite'; slot: number; place: string }
  | { kind: 'gift'; slot: number; cents: number }
  | { kind: 'introduce'; slot: number }
  | { kind: 'mail' }
  | { kind: 'jobs' }
  | { kind: 'apply'; n: number }
  | { kind: 'quit' }
  | { kind: 'raise' }
  | { kind: 'study'; field: string }
  | { kind: 'out'; op: 'places' | 'go' | 'approach' | 'round' | 'listen' | 'known' | 'business' | 'offer' | 'favour' | 'courses' | 'enrol'; arg?: string; n?: number; cents?: number }
  | { kind: 'signals' }
  | { kind: 'stake'; firm: string; cents: number; how: 'cash' | 'margin' | 'line' | 'partners' | 'buyout' }
  | { kind: 'owner'; op: 'cut' | 'protect' | 'promote' | 'sell-division' | 'refinance' | 'payout' | 'union'; firm?: string; n?: number; person?: string; cents?: number; buyer?: string; fraction?: number; deal?: 'deal' | 'refuse'; guarantee?: boolean };

export interface ActResult {
  status: 'accepted' | 'rejected';
  why?: string;
  orderId?: number;
  fill?: number;
  /** What an order cost or raised in cents, its average price in cents a share, and the fills it took. */
  cents?: number;
  avg?: number;
  fills?: { px: number; qty: number }[];
  eventId?: number;
  text?: string;
  days?: number;
  lines?: string[];
  /** Set when a wait stepped into a day whose books do not balance. */
  books?: string;
}

interface Quote { instr: string; px: number; eventId: number }
interface Line { eventId: number; day: number; text: string }
interface Priv { eventId: number; factId: number; day: number; from: string; text: string }

export interface PlayerView {
  date: { year: number; month: number; day: number; abs: number };
  name: string;
  age: number;
  alive: boolean;
  over: boolean;
  employer: string;
  firm: string;
  netWorth: number;
  cash: number;
  deposits: { bank: string; cents: number; eventId: number }[];
  loans: { kind: string; owed: number; rate: number; why: string; eventId: number }[];
  /** px is the market price a share last traded at; value = qty * px; sale is what the whole holding would fetch if sold now, per share (a large block sells below the print). */
  shares: { instr: string; name: string; qty: number; px: number; value: number; sale: number; saleValue: number; eventId: number }[];
  futures: { good: string; monthsAhead: number; net: number; px: number; eventId: number }[];
  coins: { id: string; name: string; qty: number; px: number; eventId: number }[];
  bonds: { instr: string; face: number; eventId: number }[];
  marginPosted: number;
  stockLoans: { instr: string; qty: number; face: number; eventId: number }[];
  orders: { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; stop?: number; eventId: number }[];
  contacts: { slot: number; name: string; kind: string; word: string; line: string }[];
  stats: StatView[];
  choices: ChoiceView[];
  prices: Quote[];
  news: Line[];
  private: Priv[];
  score: ScorePoint[];
  companies: CompanyPost[];
  health: number;
  final: string;
  family: {
    spouse: { index: number; name: string; alive: boolean; age: number } | null;
    children: { index: number; name: string; alive: boolean; age: number; school: number }[];
    will: string;
  };
  dynasty: {
    generation: number;
    worth: number;
    founded: number;
    controlled: number;
    offices: number;
    convictions: number;
    eventId: number;
    people: { index: number; name: string; role: string; alive: boolean; age: number; worth: number; eventId: number }[];
  };
  homes: HomeRow[];
  chain: OptRow[];
  /** The last 200 weekly lines that reached this player, each with its cause. */
  story: { day: number; text: string; eventId: number; weight: number }[];
  /** The first-paycheck lesson. `done` is true when it is finished, skipped, or this is not that scenario. */
  tutorial: TutorialView;
  /** Job changes since this seat was opened. `/view` carries them so the clock can stop. */
  interrupts: { why: string; text: string; eventId: number; cause: number }[];
  /** The player's private readings of coming quarters, newest first. */
  signals: SignalRow[];
  /** The street's number for each listed firm's coming quarter. */
  consensus: ConsensusRow[];
  /** Prints that settled the player's signals, newest first. */
  reveals: RevealRow[];
  credit: CreditView;
  /** Stakes the player holds in firms they bought into, with the choices made and who remembers them. */
  stake: StakeView[];
}

export interface SignalRow { id: number; text: string; kind: string; clarity: number; clearWord: string; legal: string; legalLine: string; firm: string; issuer: string; day: number; age: number; outcome: string; eventId: number }
export interface ConsensusRow { issuer: string; firm: string; profit: number; high: number; low: number; analysts: number; lagDays: number; hopeful: string; due: boolean; printInDays: number; employer: boolean; actual: number | null; surprise: number | null; eventId: number }
export interface RevealRow { issuer: string; firm: string; day: number; consensus: number; actual: number; surprise: number; px: number; pxAfter: number; signals: number; right: number; story: string; storyRight: boolean; mine: { text: string; outcome: string }[]; eventId: number }
export interface CreditView {
  tightness: number; word: string; limit: number; owed: number; room: number;
  products: { product: string; owed: number; rate: number; loans: number; open: boolean; haircut: number; note: string }[];
}
export interface StakeView {
  firm: string; name: string; shares: number; issued: number; percent: number; value: number; saleValue: number; controls: boolean; chair: boolean; how: string;
  choices: { op: string; text: string; day: number; eventId: number }[];
  remembers: { name: string; role: string; what: string; warm: boolean; acted: boolean; eventId: number }[];
  city: string[];
}

const COMMANDS: { topic: string; name: string; use: string; about: string }[] = [
  { topic: 'markets', name: 'desk', use: 'desk', about: 'A board of every listed stock: last, change, volume, P/E and your position.' },
  { topic: 'markets', name: 'quote', use: 'quote silicrest', about: 'Price, bid, ask, the last 20 closes, profit, staff, the top holders and the last 3 news lines.' },
  { topic: 'markets', name: 'buy', use: 'buy silicrest 10', about: 'Buy shares of a listed name.\nWithout a price it is a market order: it walks the book and tells you what it filled and the average price. @ PRICE makes it a limit; stop PRICE holds it as a stop order that fires on its own (stop 190 @ 188 for a stop-limit).' },
  { topic: 'markets', name: 'sell', use: 'sell silicrest 10', about: 'Sell shares you hold.\n@ PRICE is a limit. stop PRICE holds a stop order below the market that fires whether or not you are looking.' },
  { topic: 'markets', name: 'short', use: 'short silicrest 10', about: 'Borrow shares and sell them.\nYou post half the value in cash and pay a daily borrow fee. buy the name to cover. A price that runs against you, or a lender who wants the shares back, buys you in.' },
  { topic: 'markets', name: 'cancel', use: 'cancel 3', about: 'Cancel an open order by its number.\nA filled order is already done.' },
  { topic: 'bonds', name: 'bond', use: 'bond buy 10y 1', about: 'Buy or sell the bond on the run for that tenor.\nbond sell 2y 1 sells one bond.' },
  { topic: 'futures', name: 'fut', use: 'fut long oil 1 2', about: 'Go long or short a commodity future, month 0 to 5.\nfut close oil 2 flattens that month.' },
  { topic: 'options', name: 'opt', use: 'opt silicrest', about: 'List strikes, expiries, bid, ask and open interest.\nopt alone names the underlyings.' },
  { topic: 'options', name: 'call', use: 'call silicrest', about: 'Buy a call from the market maker at the ask.\ncall SYMBOL STRIKE MONTHS QTY; a strike of 0 is at the money.' },
  { topic: 'options', name: 'put', use: 'put silicrest 0 2 1', about: 'Buy a put from the market maker at the ask.\nThe strike is in dollars. Months run from 1 to 6.' },
  { topic: 'options', name: 'write', use: 'write put silicrest', about: 'Sell a call or a put to the market maker and post margin.\nwrite call SYMBOL STRIKE MONTHS QTY is the same shape.' },
  { topic: 'options', name: 'close', use: 'close optL:12', about: 'Close a contract, at the bid if you are long and the ask if you are short.\nclose SYMBOL flattens that name. At expiry an in-the-money contract is exercised for you, as it is for anyone.' },
  { topic: 'coins', name: 'coin', use: 'coin buy NAME 2', about: 'Buy or sell a coin.\nA trailing @ PRICE is a limit. A missing name lists the coins that trade.' },
  { topic: 'coins', name: 'launch', use: 'launch', about: 'Launch a coin of your own.\nThe market decides whether it trades.' },
  { topic: 'bank', name: 'deposit', use: 'deposit 500', about: 'Place cash in a time deposit.\nThe amount is in dollars.' },
  { topic: 'bank', name: 'withdraw', use: 'withdraw 500', about: 'Take cash back from a time deposit.\nThe amount is in dollars.' },
  { topic: 'bank', name: 'sheet', use: 'sheet', about: 'Print the balance sheet.\nCash, deposits, shares, loans, futures and bonds.' },
  { topic: 'bank', name: 'borrow', use: 'borrow 500 line', about: 'Borrow against shares: borrow AMOUNT margin|line|term (margin if you name none).\nA line is cheap but the bank may not roll it in a crunch; a term loan is fixed for three years. A refusal says why.' },
  { topic: 'bank', name: 'repay', use: 'repay 500', about: 'Repay your loans, margin first, then lines and term loans.\nThe amount is in dollars.' },
  { topic: 'property', name: 'homes', use: 'homes', about: 'List homes by neighbourhood, with price and rent.\nHomes you own are marked, and so is the one you live in.' },
  { topic: 'property', name: 'bid', use: 'bid 12', about: 'Bid for home 12 at the asking price, or bid 12 150000 to name dollars.\nA bank lends the shortfall on the same terms as for anyone. bid FIRM 2x cash is still a takeover bid.' },
  { topic: 'property', name: 'sell', use: 'sell 12', about: 'Sell home 12, which you own and do not live in.\nsell SYMBOL QTY still sells shares.' },
  { topic: 'property', name: 'let', use: 'let 12 900', about: 'Set the monthly rent in dollars and take a tenant.\nYou have to own the home and live somewhere else.' },
  { topic: 'property', name: 'move', use: 'move 12', about: 'Live in a home you own, or one you already rent.\nThe owned home you leave falls vacant, so you can let it.' },
  { topic: 'property', name: 'mortgage', use: 'mortgage 12', about: 'Borrow against a home you own from a bank that has room.\nmortgage 12 40000 asks for that many dollars.' },
  { topic: 'people', name: 'talk', use: 'talk 0', about: 'Talk to contact 0.\nWhat they know can pass to you.' },
  { topic: 'people', name: 'ask', use: 'ask 0 silicrest', about: 'Ask a contact about a firm.\nYou only hear what they are willing to say.' },
  { topic: 'people', name: 'court', use: 'court', about: 'Court a contact, or court with no number if there is an obvious one.\nA marriage needs a willing spouse.' },
  { topic: 'people', name: 'marry', use: 'marry 0', about: 'Marry contact 0.\nThe two households become one.' },
  { topic: 'people', name: 'child', use: 'child', about: 'Have a child, if the household can.\nThe child joins the family.' },
  { topic: 'people', name: 'school', use: 'school 0', about: 'Send child 0 to the next school.\nschool with no number is the eldest.' },
  { topic: 'people', name: 'will', use: 'will spouse', about: 'Name who inherits. will child 0 or will slot 1 names someone else.\nWhere the will is silent, the city rule stands.' },
  { topic: 'people', name: 'retire', use: 'retire', about: 'Retire from your job.\nA family firm you run passes by the succession rules.' },
  { topic: 'people', name: 'hand', use: 'hand silicrest', about: 'Hand a family firm to the next generation.\nA child has to be old enough.' },
  { topic: 'people', name: 'die', use: 'die', about: 'End this life.\nThe heir continues the house, or the house ends.' },
  { topic: 'company', name: 'found', use: 'found North Mill / MANUFACTURING 5000', about: 'Found a firm. Add loan to borrow the starting cash.\nThe sector is one the city already has.' },
  { topic: 'company', name: 'ceo', use: 'ceo frm_north', about: 'Read how your firm is doing, or set price, hires, dividend or invest.\nceo frm_north price auto puts the usual rule back.' },
  { topic: 'company', name: 'ipo', use: 'ipo frm_north 0.4', about: 'Sell part of your stake to the public.\nThe fraction is at most 0.9.' },
  { topic: 'company', name: 'bid', use: 'bid frm_north 2x cash', about: 'Offer cash or shares for a firm.\nA number like 2x is a multiple of the last price. bid HOME is a house, not a firm.' },
  { topic: 'company', name: 'board', use: 'board list', about: 'List the firms you can direct.\nboard chief FIRM PERSON names any person. merge and sell move a firm you control.' },
  { topic: 'owner', name: 'signals', use: 'signals', about: 'Read what your job, your friends and the street say about the quarters about to print.\nEach reading says how clear it is and whether trading on it is fair. The street number is beside it.' },
  { topic: 'owner', name: 'stake', use: 'stake frm_salar 150000 partners', about: 'Buy into the firm you work for: stake FIRM DOLLARS cash|margin|line|partners|buyout.\npartners asks friends who trust you to pledge cash; buyout has the firm buy shares back once you hold some. Past half the shares, or 30% with twice anyone else, the chair is yours.' },
  { topic: 'owner', name: 'cut', use: 'cut 5', about: 'Chair only: lay off the 5 lowest-skilled. Workers, the union rep and the press remember.\nPromised jobs broken are remembered worse.' },
  { topic: 'owner', name: 'protect', use: 'protect', about: 'Chair only: pay every worker a week and promise no cuts for a year.\nIt costs the firm cash and binds you.' },
  { topic: 'owner', name: 'promote', use: 'promote best', about: 'Chair only: put a worker in charge. promote best takes the most skilled; a contact slot or a full name also works.\nThe chief they passed over remembers.' },
  { topic: 'owner', name: 'sell-division', use: 'sell-division 30', about: 'Chair only: sell part of the plant and its staff to the richest rival, to meet payroll.\nsell-division 30 FIRM names the percent and the buyer.' },
  { topic: 'owner', name: 'refinance', use: 'refinance 20000', about: 'Chair only: borrow for the firm. Add guarantee and the bank lends double, with half your cash behind it.' },
  { topic: 'owner', name: 'payout', use: 'payout 5000', about: 'Chair only: a special dividend to every holder.\nPeople you laid off this year will not forget it.' },
  { topic: 'owner', name: 'union', use: 'union deal', about: 'Chair only: union deal meets the union at your plant; union refuse breaks with it.' },
  { topic: 'news', name: 'news', use: 'news', about: 'Show the stories you can read.\nPrivate lines are facts not yet in the paper.' },
  { topic: 'news', name: 'why', use: 'why cash', about: 'Show the cause of a number on the status line.\nwhy price NAME, why staff, why wage and why rate work too. why 41 still takes an event number.' },
  { topic: 'news', name: 'tip', use: 'tip 4', about: 'Give a paper a fact you know. The number is the fact on a private line.\nThat is the source a journalist prints.' },
  { topic: 'news', name: 'report', use: 'report 0 a theft', about: 'Report a crime by a contact. The words are the complaint.\nA street report is filed and is not itself a trial.' },
  { topic: 'life', name: 'holiday', use: 'holiday', about: 'Take a month away. Stress falls.\nIt costs money, and you cannot take another for a year.' },
  { topic: 'life', name: 'donate', use: 'donate', about: 'Give money to the city. Reputation rises.\nYou cannot give again for a season.' },
  { topic: 'life', name: 'lawyer', use: 'lawyer', about: 'Pay a lawyer. Regulator attention falls.\nThe fee is high, and the lawyer needs half a year before taking you again.' },
  { topic: 'life', name: 'clinic', use: 'clinic', about: 'See a doctor. Health rises.\nIt costs money, and the clinic will not see you again for a season.' },
  { topic: 'life', name: 'overtime', use: 'overtime', about: 'Work extra days. Cash rises.\nStress rises with it, and the firm will not pay it again for a month.' },
  { topic: 'work', name: 'jobs', use: 'jobs', about: 'List firms that are short of staff, the role and the wage, and what they ask in experience, schooling and health.\nEach line says how you compare.' },
  { topic: 'work', name: 'apply', use: 'apply 1', about: 'Apply for job 1. You compete with the other people who could take the shift.\nThe firm answers by letter a few days later.' },
  { topic: 'work', name: 'quit', use: 'quit', about: 'Leave your job. A layoff still follows seniority, the same rule as for anyone.' },
  { topic: 'work', name: 'raise', use: 'ask raise', about: 'Ask for a raise. It depends on your performance, how long you have been in the trade, and whether the firm is making money.\nA refusal is remembered.' },
  { topic: 'work', name: 'study', use: 'study clerk', about: 'Study a trade. It costs money and takes days, and it raises the schooling the jobs ask for.' },
  { topic: 'people', name: 'places', use: 'places', about: 'The six places to spend an evening, and who they draw.' },
  { topic: 'people', name: 'go', use: 'go cellar', about: 'Spend an evening at a bar, pub, café or club. It costs money and you see who is there.\nOne evening a day; the crowd comes from the real people of the city.' },
  { topic: 'people', name: 'approach', use: 'approach 2', about: 'Talk to one of the faces you saw tonight. A first meeting makes an acquaintance.\nSeeing them again builds trust. Three conversations an evening.' },
  { topic: 'people', name: 'round', use: 'round', about: 'Buy a round. The people you spoke to think the better of you.' },
  { topic: 'people', name: 'listen', use: 'listen', about: 'Spend the evening with your ears open. You may overhear something about a firm.' },
  { topic: 'people', name: 'known', use: 'known', about: 'The people you have met, how you met, and how they regard you.' },
  { topic: 'people', name: 'business', use: 'business 1', about: 'Talk shop with someone you know. They may say what their firm is up to.\nToo soon, and they close up.' },
  { topic: 'people', name: 'offer', use: 'offer 1', about: 'Offer someone you know a job at the firm you run.' },
  { topic: 'people', name: 'favour', use: 'favour 1 interview', about: 'Ask someone you know for intro, interview (a word at their firm), loan, lender (a word with their bank) or invest FIRM DOLLARS.\nAsk too much too soon and it costs trust. They remember favours.' },
  { topic: 'work', name: 'courses', use: 'courses', about: 'Evening courses: each has a fee and a number of weekly classes. Finishing one sharpens your read of its sectors.' },
  { topic: 'work', name: 'enrol', use: 'enrol law', about: 'Join a course. Your classmates become people you have met.' },
  { topic: 'time', name: 'wait', use: 'wait 1m', about: 'Let the city run for 1d, 1w, 1m or 1y.\nThe books are checked as the days pass.' },
  { topic: 'help', name: 'help', use: 'help bank', about: 'Explain one topic, using your own numbers.\nhelp alone lists every command by topic, with one example each.' },
  { topic: 'help', name: 'hints', use: 'hints off', about: 'Turn the beginner hints off, or hints on to bring them back.\nhints off also skips the first-paycheck lesson.' },
  { topic: 'help', name: 'sheet', use: 'sheet', about: 'Read your balance sheet: cash, what you own, and what you owe.\nIt is the first thing the lesson asks you to do.' },
  { topic: 'help', name: 'story', use: 'story', about: 'Write the chronicle of this life: what mattered, the family, the firms, and the city.\nThe same account is written at the end of a game.' },
  { topic: 'people', name: 'mail', use: 'mail', about: 'Read letters from the people you know.\nEach one names the event it comes from.' },
  { topic: 'people', name: 'reply', use: 'reply 3 yes', about: 'Answer letter 3 with yes, no, or a few words.\nA refusal changes the bond.' },
  { topic: 'people', name: 'lend', use: 'lend 500', about: 'Lend dollars to a friend, or lend 2 500 to contact 2.\nThe money moves, and they pay it back if they can.' },
  { topic: 'people', name: 'invite', use: 'invite dinner', about: 'Invite someone to dinner, a club or a charity gala.\ninvite 2 gala names the contact. It costs money and can introduce you.' },
  { topic: 'people', name: 'gift', use: 'gift 200', about: 'Give dollars to a friend, or gift 2 200 to contact 2.\nA gift can settle a promise.' },
  { topic: 'people', name: 'introduce', use: 'introduce', about: 'Ask a friend to introduce their contact.\nintroduce 2 names the contact. The new person starts with less trust.' },
];

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = row[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[n];
}

type CareerAct = (w: World, playerId: string, cmd: Command) => ActResult;
let careerAct: CareerAct | undefined;
/** Careers registers jobs, apply, quit, ask raise and study. The player module does not import it back. */
export function setCareerCommands(fn: CareerAct): void { careerAct = fn; }

type OutingAct = (w: World, playerId: string, cmd: Extract<Command, { kind: 'out' }>) => ActResult;
let outingAct: OutingAct | undefined;
/** Venues registers going out, the people met there, and courses. */
export function setOutingCommands(fn: OutingAct): void { outingAct = fn; }

function articles(s: string): string {
  return s.replace(/\ba ([AaEeIiOoUu])/g, 'an $1');
}

export function suggestCommand(head: string): string {
  const names = [...new Set(COMMANDS.map((c) => c.name))];
  let best = 'help', dist = 99;
  const h = head.toLowerCase();
  if (COMMANDS.some((c) => c.topic === h)) return `${h} is a help topic: type help ${h}.`;
  for (const name of names) {
    const d = editDistance(h, name);
    if (d < dist || (d === dist && name < best)) { dist = d; best = name; }
  }
  return `did you mean ${best}?`;
}

function helpSymbol(v: PlayerView): string {
  const held = v.shares[0];
  if (held) return held.instr.startsWith('eq:') ? held.instr.slice(3) : held.instr;
  const priced = v.prices.filter((p) => p.instr.startsWith('eq:') && p.px >= 100 && p.px <= v.cash);
  priced.sort((a, b) => b.px - a.px);
  if (priced[0]) return priced[0].instr.startsWith('eq:') ? priced[0].instr.slice(3) : priced[0].instr;
  return v.firm || 'silicrest';
}

function helpSituation(v: PlayerView, topic: string): string {
  const cash = dollars(v.cash);
  switch (topic) {
    case 'markets': {
      const held = v.shares.map((s) => `${s.qty} ${s.instr} at ${dollars(s.px)}`).join(', ');
      return held ? `You have ${cash} in cash and ${held}.` : `You have ${cash} in cash and no shares.`;
    }
    case 'bonds': {
      const face = v.bonds.reduce((a, b) => a + b.face, 0);
      return face ? `You have ${cash} in cash and ${dollars(face)} face of bonds.` : `You have ${cash} in cash and no bonds.`;
    }
    case 'futures': {
      const n = v.futures.length;
      return n
        ? `You have ${n} ${n === 1 ? 'future' : 'futures'} open and ${dollars(v.marginPosted)} posted as margin.`
        : `You have no futures. Cash is ${cash}.`;
    }
    case 'options': {
      const n = v.chain.filter((c) => c.net).length;
      return n
        ? `You have ${n} ${n === 1 ? 'option contract' : 'option contracts'} open. Cash is ${cash}.`
        : `You have no options open. Cash is ${cash}.`;
    }
    case 'work':
      return v.employer ? `You work at ${v.employer}. Cash is ${cash}.` : `You have no job. Cash is ${cash}.`;
    case 'coins':
      return v.coins.length
        ? `You hold ${v.coins.map((c) => `${c.qty} ${c.name}`).join(', ')}. Cash is ${cash}.`
        : `You hold no coins. Cash is ${cash}.`;
    case 'bank': {
      const dep = v.deposits.reduce((a, d) => a + d.cents, 0);
      const owed = v.loans.reduce((a, l) => a + l.owed, 0);
      const bits = [`You have ${cash} in cash`];
      bits.push(dep ? `${dollars(dep)} on time deposit` : 'no time deposit');
      bits.push(owed ? `and you owe ${dollars(owed)}` : 'and you owe nothing');
      return bits.join(', ') + '.';
    }
    case 'property': {
      const mine = v.homes.filter((h) => h.mine || h.live);
      return mine.length
        ? `You have ${mine.map((h) => `#${h.id} ${h.neighbourhood} at ${dollars(h.price)}`).join(', ')}. Cash is ${cash}.`
        : `You own no home. Cash is ${cash}.`;
    }
    case 'people': {
      const c = v.contacts[0];
      return c ? `Contact 0 is ${c.name}. ${c.line}.` : 'You have no contacts yet.';
    }
    case 'company':
      return v.employer
        ? `You work at ${v.employer} (${v.firm}). Cash is ${cash}. Net worth is ${dollars(v.netWorth)}.`
        : `You have no employer. Cash is ${cash}. Net worth is ${dollars(v.netWorth)}.`;
    case 'owner': {
      const st = v.stake[0];
      return st ? `You hold ${st.shares} of ${st.issued} shares of ${st.name} (${st.percent}%)${st.controls ? ' and chair it' : ', short of the chair'}.` : `You hold no stake in your employer. Cash is ${cash}.`;
    }
    case 'news': {
      const n = v.news[v.news.length - 1];
      const s = v.story[v.story.length - 1];
      return s ? `The latest line in your story is: ${s.text}` : n ? `The latest paper line is: ${n.text}` : 'Nothing has reached you yet.';
    }
    case 'life': {
      const stress = v.stats.find((s) => s.id === 'stress');
      const health = v.stats.find((s) => s.id === 'health');
      return `You are ${health?.word ?? 'unknown'} in health and ${stress?.word ?? 'unknown'} in stress. Cash is ${cash}.`;
    }
    case 'time':
      return `It is year ${v.date.year}, month ${v.date.month}, day ${v.date.day}. Cash is ${cash}.`;
    case 'help':
      return v.tutorial && !v.tutorial.done ? `The lesson is on “${v.tutorial.goal}”. ${v.tutorial.hint}` : 'help names a topic. hints off skips the lesson.';
    default:
      return '';
  }
}

export function helpLines(which: string, w?: World, playerId?: string): string[] {
  const q = which.trim().toLowerCase();
  const v = w ? view(w, playerId) : undefined;
  const sym = v ? helpSymbol(v) : 'silicrest';
  const use = (raw: string): string => raw.replace(/silicrest/gi, sym).replace(/frm_north\b/g, sym);
  if (!q) return lifeHelp([...new Set(COMMANDS.map((c) => c.topic))]);
  if (q === 'all') {
    const lines = ['commands'];
    let topic = '';
    for (const c of COMMANDS) {
      if (c.topic !== topic) { topic = c.topic; lines.push(topic); }
      lines.push(`  ${use(c.use)}`);
    }
    lines.push('quit leaves.');
    return lines;
  }
  const topicHits = COMMANDS.filter((c) => c.topic === q);
  const nameHits = COMMANDS.filter((c) => c.name === q);
  const hits = topicHits.length ? topicHits : nameHits;
  if (!hits.length) return [`no command ${q}. ${suggestCommand(q)}`];
  const lines: string[] = [];
  if (v) {
    const situation = helpSituation(v, hits[0].topic);
    if (situation) lines.push(situation);
  }
  for (const c of hits) {
    lines.push(use(c.use));
    for (const part of c.about.split('\n')) lines.push(part);
  }
  return lines;
}

function shareName(w: World, instr: string): string {
  const id = instr.startsWith('eq:') ? instr.slice(3) : instr;
  const firm = econ(w).firms.find((f) => f.id === id || f.id === instr);
  return firm?.name ?? '';
}

function optionLines(w: World, actor: string, instr: string): string[] {
  const all = optionChain(w, actor);
  if (!instr) {
    const names: string[] = [];
    for (const r of all) {
      const label = r.name || shareName(w, r.instr);
      if (label && !names.includes(label)) names.push(label);
    }
    return names.length ? ['Options are listed on ' + names.join(', ') + '.'] : [optionWhy(w, '') || 'No options are listed.'];
  }
  const key = stockInstr(w, instr) ?? instr;
  const rows = all.filter((r) => r.instr === key || r.name.toLowerCase() === instr.toLowerCase() || r.instr.toLowerCase().endsWith(instr.toLowerCase()));
  if (!rows.length) return [optionWhy(w, key) || `No options are listed on ${instr}.`];
  return rows.map((r) => {
    const side = r.right === 'C' ? 'call' : 'put';
    const name = r.name || shareName(w, r.instr) || instr;
    return `${side} on ${name}, strike ${(r.strike / 100).toFixed(2)}, ${countedMonths(r.months)}, bid ${(r.bid / 100).toFixed(2)}, ask ${(r.ask / 100).toFixed(2)}, open interest ${r.oi}${r.net ? `, you are ${r.net > 0 ? 'long' : 'short'} ${Math.abs(r.net)}` : ''}`;
  });
}

function countedMonths(n: number): string {
  return `${n} ${n === 1 ? 'month' : 'months'}`;
}

function homeLines(w: World, person: number): string[] {
  const rows = homeBoard(w, person);
  if (!rows.length) return ['no homes listed'];
  return rows.map((h) => `#${h.id} ${h.neighbourhood} price ${(h.price / 100).toFixed(0)} rent ${(h.rent / 100).toFixed(0)}${h.mine ? ' yours' : ''}${h.live ? (h.mine ? ' home' : ' rented') : ''}${h.vacant ? ' vacant' : ''}`);
}

const FUTURES: Record<string, string> = {
  OIL: 'CRUDE_OIL', CRUDE: 'CRUDE_OIL', CRUDE_OIL: 'CRUDE_OIL',
  GAS: 'NATURAL_GAS', NATURAL_GAS: 'NATURAL_GAS',
  COAL: 'COAL', IRON: 'IRON_ORE', IRON_ORE: 'IRON_ORE',
  COPPER: 'COPPER', LITHIUM: 'LITHIUM', GRAIN: 'GRAIN',
  LIVESTOCK: 'LIVESTOCK', CATTLE: 'LIVESTOCK',
};

const DEG = 16;
const econ = (w: World): EconState => w.state.economy as EconState;
const blankSeat = (): PlayerSeat => ({
  who: -1, over: false, margin: false, arrived: -1, heard: [], score: [], loans: [],
  moneyEv: -1, payEv: -1, payCents: 0, spendEv: -1, spendCents: 0, cashSeen: -1, cashDay: -1,
  line: [], generation: 1, founded: 0, controlled: 0, offices: 0, convictions: 0,
  officeWas: '', seenLaw: [], will: null, chair: -1, handed: -1, final: '', passed: -1,
  counsel: 0, statEv: {}, mark: null, trend: {}, words: {}, cool: {},
  story: [], tutor: null, seenNote: -1, jobAt: -2, jobNotes: [],
});
const blankRoster = (): PlayerState => {
  const heard: Heard[] = [];
  return { ids: [], seat: {}, log: [], days: [], script: null, who: -1, heard };
};
/** `who` and `heard` stay pointed at the first seat. `heard` is that seat's array, not a copy. */
function sync(st: PlayerState): void {
  const seat = st.ids.length ? st.seat[st.ids[0]] : undefined;
  if (!seat) { st.who = -1; return; }
  st.who = seat.who;
  st.heard = seat.heard;
}
function fillSeat(seat: PlayerSeat): PlayerSeat {
  if (!seat.line) seat.line = [];
  if (!seat.heard) seat.heard = [];
  if (!seat.score) seat.score = [];
  if (!seat.loans) seat.loans = [];
  if (seat.generation === undefined) seat.generation = 1;
  if (seat.founded === undefined) seat.founded = 0;
  if (seat.controlled === undefined) seat.controlled = 0;
  if (seat.offices === undefined) seat.offices = 0;
  if (seat.convictions === undefined) seat.convictions = 0;
  if (seat.officeWas === undefined) seat.officeWas = '';
  if (!seat.seenLaw) seat.seenLaw = [];
  if (seat.will === undefined) seat.will = null;
  if (seat.chair === undefined) seat.chair = -1;
  if (seat.handed === undefined) seat.handed = -1;
  if (seat.final === undefined) seat.final = '';
  if (seat.passed === undefined) seat.passed = -1;
  if (seat.over === undefined) seat.over = false;
  if (seat.margin === undefined) seat.margin = false;
  if (seat.arrived === undefined) seat.arrived = -1;
  if (seat.moneyEv === undefined) seat.moneyEv = -1;
  if (seat.payEv === undefined) seat.payEv = -1;
  if (seat.payCents === undefined) seat.payCents = 0;
  if (seat.spendEv === undefined) seat.spendEv = -1;
  if (seat.spendCents === undefined) seat.spendCents = 0;
  if (seat.cashSeen === undefined) seat.cashSeen = -1;
  if (seat.cashDay === undefined) seat.cashDay = -1;
  if (seat.who === undefined) seat.who = -1;
  if (seat.counsel === undefined) seat.counsel = 0;
  if (!seat.statEv) seat.statEv = {};
  if (seat.mark === undefined) seat.mark = null;
  if (!seat.trend) seat.trend = {};
  if (!seat.words) seat.words = {};
  if (!seat.cool) seat.cool = {};
  if (!seat.story) seat.story = [];
  if (seat.tutor === undefined) seat.tutor = null;
  if (seat.seenNote === undefined) seat.seenNote = -1;
  if (seat.jobAt === undefined || seat.jobAt === null) seat.jobAt = -2;
  if (!seat.jobNotes) seat.jobNotes = [];
  return seat;
}
const roster = (w: World): PlayerState => {
  const raw = w.state.player as PlayerState | PlayerSeat | undefined;
  if (!raw) {
    const st = blankRoster();
    w.state.player = st;
    return st;
  }
  const modern = raw as PlayerState;
  if (!modern.seat || !Array.isArray(modern.ids)) {
    const old = fillSeat(raw as PlayerSeat);
    const st = blankRoster();
    st.ids = [DEFAULT_PLAYER];
    st.seat[DEFAULT_PLAYER] = old;
    sync(st);
    w.state.player = st;
    return st;
  }
  if (!modern.log) modern.log = [];
  if (!modern.days) modern.days = [];
  if (modern.script === undefined) modern.script = null;
  for (const id of modern.ids) if (modern.seat[id]) fillSeat(modern.seat[id]);
  sync(modern);
  return modern;
};
export function soleSeat(w: World): PlayerSeat | undefined {
  const st = roster(w);
  const id = st.ids[0];
  return id ? st.seat[id] : undefined;
}
export function noteScript(w: World, script: ScriptNote | null): void {
  roster(w).script = script;
}
let afterDay: ((w: World) => void) | undefined;
/** Scenarios register the once-a-day review here so a wait can advance the clock inside act. */
export function onPlayerDay(fn: (w: World) => void): void { afterDay = fn; }
function noteClosedDay(w: World): void {
  const st = roster(w);
  const day = w.day - 1;
  if (day < 0) return;
  const hash = w.ledger.hash();
  const prev = st.days.length ? st.days[st.days.length - 1] : undefined;
  if (prev && prev.day === day) prev.hash = hash;
  else st.days.push({ day, hash });
}
const rejected = (why: string): ActResult => ({ status: 'rejected', why });
const whyOf = (e: unknown): string => e instanceof Error ? e.message : String(e);

export function playerIndex(w: World, playerId?: string): number {
  const st = roster(w);
  const id = playerId ?? st.ids[0];
  if (!id) return -1;
  const seat = st.seat[id];
  const P = econ(w).P;
  if (seat && seat.who >= 0 && seat.who < P.n && (P.flags[seat.who] & PLAYER) !== 0) return seat.who;
  // A named player who is not the first one is absent until ensurePlayer creates them.
  if (playerId && playerId !== st.ids[0]) return -1;
  for (let i = 0; i < P.n; i++) if ((P.flags[i] & PLAYER) !== 0) {
    if (seat) seat.who = i;
    sync(st);
    return i;
  }
  return -1;
}

function chooseFirm(w: World): Firm {
  const s = econ(w);
  const need = (w.state.social as { need?: number } | undefined)?.need ?? Math.ceil(s.P.n * 0.01);
  let best: Firm | undefined;
  for (const f of s.firms) {
    if (f.closed) continue;
    const n = f.staff.length;
    if (n < 16 || n + 1 >= need) continue;
    if (!best || n < best.staff.length) best = f;
  }
  if (best) return best;
  for (const f of s.firms) if (!f.closed && f.staff.length >= 16 && (!best || f.staff.length < best.staff.length)) best = f;
  return best ?? s.firms.find((f) => !f.closed) ?? s.firms[0];
}

function parentsOf(P: EconState['P'], born: number): [number, number] {
  for (let a = 0; a < P.n; a++) {
    const b = P.spouse[a];
    if (b <= a || !P.alive(a) || !P.alive(b)) continue;
    const gap = (born - Math.max(P.born[a], P.born[b])) / DAYS_PER_YEAR;
    if (gap < 20 || gap > 45) continue;
    return P.born[a] <= P.born[b] ? [a, b] : [b, a];
  }
  return [-1, -1];
}

function causeToday(w: World, kind: string, actor: string): number {
  const today = w.day;
  const n = w.events.count;
  const stop = Math.max(0, n - 12000);
  for (let id = n - 1; id >= stop; id--) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.day < today) break;
    if (e.kind === kind && e.actor === actor) return e.id;
  }
  return -1;
}

function becauseBit(w: World, id: number): string {
  const e = w.events.get(id);
  if (!e) return '';
  const side = e.msg.split('||')[1];
  if (side) return side.trim().replace(/\.+$/, '');
  if (e.kind === 'firm.failed') return 'the firm cannot pay what it owes';
  if (e.kind === 'firm.layoffs') {
    const cut = e.msg.split(':')[0]?.trim() ?? '';
    if (cut && !/lays off/i.test(cut)) return cut.replace(/\.$/, '');
    return 'the firm cut its staff';
  }
  return '';
}

function noteJobSeat(w: World, st: PlayerSeat): void {
  const i = st.who;
  const s = econ(w), P = s.P;
  if (i < 0 || i >= P.n || !P.alive(i)) return;
  const now = P.employer[i];
  if (st.jobAt < -1) { st.jobAt = now; return; }
  if (st.jobAt === now) return;
  const prev = st.jobAt;
  st.jobAt = now;
  const name = P.name(i);
  const named = (idx: number): string => {
    const f = idx >= 0 && idx < s.firms.length ? s.firms[idx] : undefined;
    return f?.name || 'a firm';
  };
  let why = 'quit';
  let cause = -1;
  let text = '';
  if (now >= 0 && prev < 0) {
    why = 'hire';
    cause = causeToday(w, 'career.hired', P.id(i));
    text = `${name} is hired at ${named(now)}`;
  } else if (now >= 0) {
    why = 'hire';
    cause = causeToday(w, 'career.hired', P.id(i));
    text = `${name} leaves ${named(prev)} for ${named(now)}`;
  } else {
    const old = prev >= 0 && prev < s.firms.length ? s.firms[prev] : undefined;
    const retired = causeToday(w, 'player.retire', P.id(i));
    if (old?.closed) {
      why = 'bankruptcy';
      cause = causeToday(w, 'firm.failed', old.id);
      if (cause < 0) cause = causeToday(w, 'firm.layoffs', old.id);
      text = `${name} leaves ${old.name}`;
    } else if (old && old.layoffEv !== undefined && old.layoffEv >= 0 && P.lastEv[i] === old.layoffEv) {
      why = 'layoff';
      cause = old.layoffEv;
      text = `${name} is laid off by ${old.name}`;
    } else if (retired >= 0) {
      why = 'retire';
      cause = retired;
      text = `${name} retires from ${named(prev)}`;
    } else {
      why = 'quit';
      cause = causeToday(w, 'career.quit', P.id(i));
      text = `${name} leaves ${named(prev)}`;
    }
  }
  const bit = cause >= 0 ? becauseBit(w, cause) : '';
  if (bit) text = `${text} because ${bit}`;
  const fallback = st.arrived >= 0 ? st.arrived : w.genesis;
  const ev = w.events.emit('player.job', text, [cause >= 0 ? cause : fallback], P.id(i));
  st.jobNotes.push({ why, text, eventId: ev, cause: cause >= 0 ? cause : ev });
}

/** The job this person already holds is the baseline, not an interrupt. */
export function rememberJob(w: World): void {
  const players = roster(w);
  const P = econ(w).P;
  for (const id of players.ids) {
    const st = players.seat[id];
    if (!st || st.who < 0 || st.who >= P.n) continue;
    st.jobAt = P.employer[st.who];
  }
}

function spawn(w: World, playerId = DEFAULT_PLAYER): number {
  const s = econ(w), P = s.P, players = roster(w);
  let st = players.seat[playerId];
  if (!st) {
    st = blankSeat();
    players.seat[playerId] = st;
    players.ids.push(playerId);
  }
  const born = w.day - 30 * DAYS_PER_YEAR;
  const [mom, dad] = parentsOf(P, born);
  const i = P.add(w, born, mom, dad);
  P.flags[i] |= PLAYER;
  const firm = chooseFirm(w);
  joinFirm(s, i, firm);
  // Newest staff are laid off first. A person who just sat down should not be the first out the door.
  const staff = firm.staff;
  const at = staff.indexOf(i);
  if (at > 0) {
    staff.splice(at, 1);
    staff.splice(Math.min(1, staff.length), 0, i);
    for (let k = 0; k < staff.length; k++) P.staffPos[staff[k]] = k;
  }
  if (P.adult(w, i)) s.laborForce++;
  const ev = w.events.emit('player.arrive', `${P.name(i)} arrives, aged 30, and takes a job at ${firm.name}`, [s.macroEv], P.id(i));
  const cents = Math.round(s.wage * 1500);
  if (!pay(w, BANK, P.id(i), cents, 'player.endowment', ev)) throw new Error('player endowment failed');
  P.incEma[i] = s.wage * P.skill[i] * (1 - s.taxRate);
  P.lastEv[i] = ev;
  seatPerson(w, i, 16);
  st.who = i;
  st.over = false;
  st.arrived = ev;
  const held = Math.floor(w.ledger.balance(P.id(i), DEP));
  st.moneyEv = w.events.emit('life.cash', `You hold ${dollars(held)} in cash`, [ev]);
  st.cashSeen = held;
  st.cashDay = w.day;
  if (!st.line.includes(i)) st.line.push(i);
  st.score.push({ day: w.day, worth: Math.round(worth(w, i)) });
  sync(players);
  if (w.state.markets) markPlayerTrading(w);
  rememberJob(w);
  return i;
}

export function ensurePlayer(w: World, playerId = DEFAULT_PLAYER): number {
  if (w.state.markets) markPlayerTrading(w);
  const have = playerIndex(w, playerId);
  if (have >= 0) return have;
  return spawn(w, playerId);
}

function markPrice(w: World): (instr: string) => number {
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number }[]; price?: (instr: string) => number } | undefined);
  const crypto = w.state.crypto as { majors?: { id: string; last: number }[]; memes?: { id: string; pool: string; rugged: boolean }[] } | undefined;
  return (instr: string): number => {
    const hit = stocks?.stocks?.find((s) => s.instr === instr);
    if (hit) return hit.last;
    if (instr.startsWith('eq:') && stocks?.price) {
      const px = stocks.price(instr);
      if (px > 0) return px;
    }
    const major = crypto?.majors?.find((m) => m.id === instr);
    if (major) return major.last;
    const meme = crypto?.memes?.find((m) => m.id === instr);
    if (meme && !meme.rugged) {
      const tok = w.ledger.balance(meme.pool, meme.id);
      if (tok > 0) return w.ledger.balance(meme.pool, DEP) / tok;
    }
    return 0;
  };
}

function goodUnit(s: EconState, good: string): number {
  let n = 0, p = 0;
  for (const f of s.firms) if (f.good === good && !f.closed) { p += f.price; n++; }
  return n ? p / n : 0;
}

/** One share of a private firm, at book: machinery at what it costs to replace. */
function bookShare(w: World, firmId: string): number {
  const s = econ(w);
  const f = s.firms.find((x) => x.id === firmId && !x.closed);
  if (!f) return 0;
  const sh = Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
  if (sh < 1) return 0;
  const def = GOODS[f.good];
  const capPx = def ? 360 * s.wage / Math.max(0.01, def.prod) : 0;
  const eq = Math.round(w.ledger.netWorth(f.id, (instr) => instr === CAPITAL ? capPx : instr.startsWith('good:') ? goodUnit(s, instr.slice(5)) : 0));
  return eq / sh;
}

let pricingBook = false;
/** A controlling block (30% of the shares, or the chair) is valued at no less than 60% of the market price: a thin book's bid says what a panic sale fetches, not what the block is worth to the person who chairs the firm. */
function controlFloor(w: World, person: number, instr: string, qty: number): number {
  const out = w.ledger.issued.get(instr) ?? 0;
  if (qty < 1 || !(out > 0)) return 0;
  const f = econ(w).firms.find((x) => !x.closed && instr === 'eq:' + x.id);
  if (qty / out < 0.3 && !(f && controls(w, person, f))) return 0;
  const last = (w.state.markets as { stocks?: { instr: string; last: number }[] } | undefined)?.stocks?.find((x) => x.instr === instr)?.last ?? 0;
  return Math.round(last * 0.6);
}

/** Borrowed shares are owed at today's price, not the price they were sold at. */
function shortAdjust(w: World, i: number): number {
  const r = roster(w);
  for (const k of r.ids) {
    const seat = r.seat[k];
    if (seat && seat.who === i && seat.loans.length) return shortMark(w, seat);
  }
  return 0;
}

function worth(w: World, i: number): number {
  const id = econ(w).P.id(i);
  const tape = markPrice(w);
  return shortAdjust(w, i) + w.ledger.netWorth(id, (instr) => {
    const qty = Math.floor(w.ledger.balance(id, instr));
    const marked = markHolding(w, id, instr, qty);
    if (marked >= 0) return Math.max(marked, controlFloor(w, i, instr, qty));
    const px = tape(instr);
    if (px > 0) return px;
    if (pricingBook || !instr.startsWith('eq:')) return 0;
    const f = econ(w).firms.find((x) => !x.closed && instr === 'eq:' + x.id);
    if (!f || f.listed || (f.founder !== i && f.ceo !== i)) return 0;
    pricingBook = true;
    try { return bookShare(w, f.id); }
    finally { pricingBook = false; }
  });
}

function chronicle(w: World, i: number, text: string, cause: number): void {
  const h = w.state.history as { entries?: { year: number; day: number; kind: string; people: string[]; firms: string[]; text: string; cause: string }[] } | undefined;
  if (!h?.entries || cause < 0) return;
  const P = econ(w).P;
  const e = P.employer[i];
  const firm = e >= 0 ? econ(w).firms[e]?.name : '';
  const sentence = /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
  h.entries.push({
    year: Math.floor(w.day / DAYS_PER_YEAR) + 1,
    day: w.day,
    kind: 'player',
    people: [P.name(i)],
    firms: firm ? [firm] : [],
    text: sentence,
    cause: w.events.explain(cause, 6).join('\n'),
  });
}

function stockInstr(w: World, sym: string): string | undefined {
  const stocks = (w.state.markets as { stocks?: { instr: string }[] } | undefined)?.stocks ?? [];
  const k = sym.toLowerCase();
  for (const s of stocks) if (s.instr.toLowerCase() === k || s.instr.slice(3).toLowerCase() === k) return s.instr;
  for (const f of econ(w).firms) {
    if (f.closed) continue;
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return 'eq:' + f.id;
  }
  if (k === 'bank' || k === 'bank_1') return 'eq:bank_1';
  return undefined;
}

function onRun(w: World, tenor: string): { id: string; last: number; issueEv: number } | undefined {
  const bonds = (w.state.bonds as { bonds?: { id: string; tenor: string; onRun: boolean; faceLeft: number; last: number; issueEv: number }[] } | undefined)?.bonds ?? [];
  if (tenor.startsWith('bond:')) return bonds.find((b) => b.id === tenor && b.faceLeft > 0);
  let hit: { id: string; last: number; issueEv: number } | undefined;
  for (const b of bonds) if (b.onRun && b.faceLeft > 0 && b.tenor === tenor) hit = b;
  return hit;
}

function me(w: World, playerId: string): { st: PlayerSeat; i: number; id: string } | ActResult {
  const st = roster(w).seat[playerId];
  if (!st) return rejected('no player');
  const i = playerIndex(w, playerId);
  if (i < 0) return rejected('no player');
  return { st, i, id: econ(w).P.id(i) };
}
function isMe(x: { st: PlayerSeat; i: number; id: string } | ActResult): x is { st: PlayerSeat; i: number; id: string } {
  return 'id' in x;
}

function remember(st: PlayerSeat, i: number): void {
  if (i >= 0 && !st.line.includes(i)) st.line.push(i);
}

function bondsOf(w: World): { contact: Int32Array; bond: Uint8Array } | undefined {
  const st = w.state.social as { contact?: Int32Array; bond?: Uint8Array } | undefined;
  if (!st?.contact || !st.bond) return undefined;
  return { contact: st.contact, bond: st.bond };
}

function friendship(w: World, person: number, slot: number): number {
  const st = bondsOf(w);
  if (!st || slot < 0 || slot >= DEG) return 0;
  const p = person * DEG + slot;
  if (st.contact[p] < 0) return 0;
  return st.bond[p * 4 + B_FRIEND] ?? 0;
}

function liftFriend(w: World, person: number, slot: number, who: number): void {
  const st = bondsOf(w);
  if (!st) return;
  const bump = (i: number, k: number): void => {
    const q = (i * DEG + k) * 4 + B_FRIEND;
    // A work contact starts at 22. The city's pairing bar is friendship past 49, so one courtship clears it.
    const n = st.bond[q] + 28;
    st.bond[q] = n > 100 ? 100 : n;
  };
  bump(person, slot);
  const b = who * DEG;
  for (let k = 0; k < DEG; k++) if (st.contact[b + k] === person) { bump(who, k); break; }
}

function canPair(w: World, a: number, b: number): string | undefined {
  const P = econ(w).P;
  if (a === b) return 'you cannot marry yourself';
  if (!P.alive(a) || !P.alive(b)) return 'one of you has died';
  if (P.spouse[a] >= 0 || P.spouse[b] >= 0) return 'one of you is already married';
  const aa = P.age(w, a), bb = P.age(w, b);
  if (aa < 20 || aa > 50 || bb < 20 || bb > 50) return 'the pairing rules stop at 20 and 50';
  if (P.family[a] === P.family[b] || P.parent[a] === b || P.parent[b] === a) return 'you are already family';
  if (P.kids(a).includes(b) || P.kids(b).includes(a)) return 'you are already family';
  return undefined;
}

function pairSlot(w: World, i: number, slot: number): { slot: number; who: number } | { why: string } {
  const list = contactsOf(w, i);
  if (slot >= 0) {
    const c = list.find((x) => x.slot === slot);
    if (!c) return { why: 'no such contact' };
    const why = canPair(w, i, c.who);
    if (why) return { why };
    return { slot: c.slot, who: c.who };
  }
  for (const c of list) if (!canPair(w, i, c.who)) return { slot: c.slot, who: c.who };
  return { why: 'no contact passes the pairing rules' };
}

function causeOf(w: World, st: PlayerSeat): number {
  return st.arrived >= 0 ? st.arrived : econ(w).macroEv >= 0 ? econ(w).macroEv : w.genesis;
}

/** Point why-cash at a move the player just made, so the day's close does not tell it twice. */
function rememberMove(st: PlayerSeat, ev: number, cents: number, day: number, dir: 'pay' | 'spend'): void {
  st.moneyEv = ev;
  st.cashDay = day;
  st.statEv.cash = ev;
  if (dir === 'pay') { st.payEv = ev; st.payCents = cents; }
  else { st.spendEv = ev; st.spendCents = cents; }
}

/** The cash that moved because the city paid or the player spent. One event, in the player's own words. */
function noteMoney(w: World, st: PlayerSeat, i: number): void {
  const P = econ(w).P;
  const id = P.id(i);
  const cash = Math.floor(w.ledger.balance(id, DEP));
  if (!(st.cashSeen >= 0)) { st.cashSeen = cash; return; }
  if (st.cashDay === w.day) { st.cashSeen = cash; return; }
  const delta = cash - st.cashSeen;
  st.cashSeen = cash;
  if (delta === 0) return;
  const cause = st.moneyEv >= 0 ? st.moneyEv : causeOf(w, st);
  if (delta > 0) {
    const emp = P.employer[i];
    const firm = emp >= 0 ? econ(w).firms[emp] : undefined;
    const by = firm ? ` by ${firm.name}` : '';
    const ev = w.events.emit('life.pay', `You are paid ${dollars(delta)}${by}`, [cause]);
    st.moneyEv = ev;
    st.payEv = ev;
    st.payCents = delta;
    st.statEv.cash = ev;
  } else {
    const ev = w.events.emit('life.spend', `You spend ${dollars(-delta)}`, [cause]);
    st.moneyEv = ev;
    st.spendEv = ev;
    st.spendCents = -delta;
    st.statEv.cash = ev;
  }
}

function coinNames(w: World): string {
  const c = w.state.crypto as { majors?: { name: string }[]; memes?: { name: string; live: boolean; rugged: boolean }[] } | undefined;
  if (!c) return '';
  const names: string[] = [];
  for (const m of c.majors ?? []) if (m.name) names.push(m.name);
  for (const m of c.memes ?? []) if (m.live && !m.rugged && m.name) names.push(m.name);
  return names.join(', ');
}

function knownPrivate(w: World, i: number, firmKey: string): { eventId: number; msg: string } | undefined {
  const f = firmByKey(w, firmKey);
  if (!f) return;
  const facts = (w.state.social as { facts?: { id: number; eventId: number; msg: string; pub: boolean; drop: boolean; firms: number[]; instrs: string[] }[] } | undefined)?.facts ?? [];
  for (let n = facts.length - 1; n >= 0; n--) {
    const fact = facts[n];
    if (!fact || fact.drop || fact.pub || !fact.msg) continue;
    const about = fact.firms.includes(f.idx) || fact.instrs.includes('eq:' + f.id);
    if (!about || !knows(w, i, fact.id)) continue;
    return { eventId: fact.eventId, msg: fact.msg };
  }
  return undefined;
}

function rememberWords(w: World, st: PlayerSeat, i: number): void {
  const board = lifeBoard(w, i, st, Math.round(worth(w, i)));
  for (const s of board.stats) st.words[s.id] = s.word;
}

function stepDays(w: World, st: PlayerSeat, days: number): ActResult | undefined {
  const people = econ(w).P;
  for (let d = 0; d < days; d++) {
    w.step();
    afterDay?.(w);
    noteClosedDay(w);
    const bad = w.ledger.check();
    if (bad.length) {
      const why = bad.slice(0, 8).join('; ');
      return { status: 'rejected', why, books: why };
    }
    const person = st.who;
    if (st.over || person < 0 || person >= people.n || !people.alive(person)) break;
  }
  return undefined;
}

function liveChoice(w: World, st: PlayerSeat, i: number, id: string, kind: ChoiceId): ActResult {
  const P = econ(w).P;
  const spec = choiceSpec(kind);
  const left = coolLeft(st, kind, w.day);
  if (left > 0) return rejected(`not for another ${left} days`);
  const cause = causeOf(w, st);
  if (kind === 'overtime') {
    const emp = P.employer[i];
    const firm = emp >= 0 ? econ(w).firms[emp] : undefined;
    if (!firm || firm.closed) return rejected('you have no employer to pay overtime');
    const bonus = Math.round(econ(w).wage * Math.max(0.5, P.skill[i]) * 5);
    if (Math.floor(w.ledger.balance(firm.id, DEP)) < bonus) return rejected('the firm cannot pay overtime');
    if (!pay(w, firm.id, id, bonus, 'wages', cause)) return rejected('the firm cannot pay overtime');
    const ev = w.events.emit('player.overtime', `${P.name(i)} works extra days at ${firm.name} for ${dollars(bonus)}`, [cause], id);
    P.stress[i] += 28;
    st.cool.overtime = w.day + spec.cool;
    rememberMove(st, ev, bonus, w.day, 'pay');
    st.statEv.worth = ev;
    st.statEv.stress = ev;
    rememberWords(w, st, i);
    return { status: 'accepted', eventId: ev, text: `${firm.name} pays ${dollars(bonus)} for the extra days` };
  }
  if (kind === 'clinic' && P.health[i] >= 100) return rejected('you are already well');
  const cost = feeOf(w, spec.days);
  if (Math.floor(w.ledger.balance(id, DEP)) < cost) return rejected('not enough cash');
  if (kind === 'lawyer') {
    const staff = (w.state.law as { staff?: number[] } | undefined)?.staff ?? [];
    const lawyer = staff.find((p) => p !== i && p >= 0 && p < P.n && P.alive(p));
    const named = lawyer !== undefined ? P.name(lawyer) : 'the city';
    const paid = lawyer !== undefined ? pay(w, id, P.id(lawyer), cost, 'player.lawyer', cause) : payGov(w, id, cost, 'player.lawyer', cause);
    if (!paid) return rejected('not enough cash');
    const ev = w.events.emit('player.lawyer', `${P.name(i)} pays ${named} ${dollars(cost)} to speak to the regulator`, [cause], id);
    st.counsel = Math.min(80, (st.counsel || 0) + 30);
    st.cool.lawyer = w.day + spec.cool;
    rememberMove(st, ev, cost, w.day, 'spend');
    st.statEv.attention = ev;
    rememberWords(w, st, i);
    return { status: 'accepted', eventId: ev, text: `${named} takes the brief` };
  }
  const verb = kind === 'holiday' ? 'takes a month away' : kind === 'donate' ? 'gives to the city' : 'sees a doctor';
  if (!payGov(w, id, cost, `player.${kind}`, cause)) return rejected('not enough cash');
  const ev = w.events.emit(`player.${kind}`, `${P.name(i)} ${verb}, paying ${dollars(cost)}`, [cause], id);
  st.cool[kind] = w.day + spec.cool;
  rememberMove(st, ev, cost, w.day, 'spend');
  st.statEv.worth = ev;
  if (kind === 'holiday') {
    P.stress[i] = Math.max(0, P.stress[i] - 80);
    st.statEv.stress = ev;
    rememberWords(w, st, i);
    const stepped = stepDays(w, st, 30);
    if (stepped) return stepped;
    return { status: 'accepted', eventId: ev, days: 30, text: 'a month away' };
  }
  if (kind === 'donate') {
    const n = nudgeStanding(w, i, 6);
    st.statEv.reputation = ev;
    rememberWords(w, st, i);
    return { status: 'accepted', eventId: ev, text: n ? `${n} people think better of you` : 'you give' };
  }
  P.health[i] = Math.min(100, P.health[i] + 12);
  st.statEv.health = ev;
  rememberWords(w, st, i);
  return { status: 'accepted', eventId: ev, text: 'the doctor sees you' };
}

function firmByKey(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase();
  for (const f of econ(w).firms) {
    if (f.closed) continue;
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return f;
  }
  return undefined;
}

function household(w: World, st: PlayerSeat): number[] {
  const P = econ(w).P;
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (i: number): void => {
    if (i < 0 || i >= P.n || seen.has(i)) return;
    seen.add(i);
    out.push(i);
  };
  for (const i of st.line) add(i);
  add(st.who);
  const me = st.who;
  if (me >= 0 && me < P.n) {
    add(P.spouse[me]);
    for (const k of P.kids(me)) add(k);
    add(P.parent[me]);
  }
  return out;
}

function houseWorth(w: World, ids: number[]): number {
  const P = econ(w).P;
  const price = markPrice(w);
  let n = 0;
  for (const i of ids) if (P.alive(i)) n += w.ledger.netWorth(P.id(i), price);
  return Math.round(n);
}

function refreshFirms(w: World, st: PlayerSeat): void {
  const members = new Set(household(w, st));
  let founded = 0, controlled = 0;
  for (const f of econ(w).firms) {
    if (members.has(f.founder)) founded++;
    if (!f.closed && members.has(f.ceo)) controlled++;
  }
  st.founded = founded;
  st.controlled = controlled;
}

function refreshLife(w: World, st: PlayerSeat): void {
  const P = econ(w).P;
  const members = new Set(household(w, st));
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  if (pol) {
    const seats: [string, number][] = [
      ['leader', pol.leader ?? -1],
      ['finance', pol.finance ?? -1],
      ['governor', pol.governor ?? -1],
      ['regulator', pol.regulator ?? -1],
    ];
    let key = '';
    for (const [name, who] of seats) {
      if (!members.has(who)) continue;
      const bit = `${name}:${who};`;
      key += bit;
      if (!st.officeWas.includes(bit)) st.offices++;
    }
    st.officeWas = key;
  }
  const ids = new Set<string>();
  for (const i of members) ids.add(P.id(i));
  for (const e of w.events.recent(['law.verdict', 'law.judgment'], 40)) {
    if (!e.msg.includes('convicted') || !e.actor || !ids.has(e.actor)) continue;
    if (st.seenLaw.includes(e.id)) continue;
    st.seenLaw.push(e.id);
    st.convictions++;
  }
}

function personBit(w: World, i: number): { index: number; name: string; alive: boolean; age: number } | null {
  const P = econ(w).P;
  if (i < 0 || i >= P.n) return null;
  return { index: i, name: P.name(i), alive: P.alive(i), age: P.age(w, i) };
}

function willText(w: World, st: PlayerSeat): string {
  const will = st.will;
  if (!will) return 'no will';
  const P = econ(w).P;
  const heir = will.heir >= 0 && will.heir < P.n ? P.name(will.heir) : 'nobody';
  if (!will.shares.length) return `${heir} continues the house; the city's rule splits the estate`;
  const bits = will.shares.map((s) => `${s.who >= 0 && s.who < P.n ? P.name(s.who) : 'someone'} ${Math.round(s.bps / 100)}%`);
  return `${heir} continues the house; ${bits.join(', ')}`;
}

function dynastyOf(w: World, st: PlayerSeat): PlayerView['dynasty'] {
  const P = econ(w).P;
  const ids = household(w, st);
  const price = markPrice(w);
  const me = st.who;
  const people = ids.map((i) => {
    let role = 'kin';
    if (i === me) role = 'you';
    else if (me >= 0 && i === P.spouse[me]) role = 'spouse';
    else if (me >= 0 && P.parent[i] === me) role = 'child';
    else if (me >= 0 && P.parent[me] === i) role = 'parent';
    return {
      index: i, name: P.name(i), role, alive: P.alive(i), age: P.age(w, i),
      worth: P.alive(i) ? Math.round(w.ledger.netWorth(P.id(i), price)) : 0,
      eventId: P.lastEv[i] >= 0 ? P.lastEv[i] : (st.arrived >= 0 ? st.arrived : w.genesis),
    };
  });
  return {
    generation: st.generation,
    worth: houseWorth(w, ids),
    eventId: st.statEv?.worth ?? (st.arrived >= 0 ? st.arrived : w.genesis),
    founded: st.founded,
    controlled: st.controlled,
    offices: st.offices,
    convictions: st.convictions,
    people,
  };
}

function epitaph(w: World, st: PlayerSeat, dead: number): string {
  const P = econ(w).P;
  const d = dynastyOf(w, st);
  return `${P.name(dead)} has died, and nobody is left to take the name. The house ends. Generation ${d.generation}. Family net worth ${(d.worth / 100).toFixed(0)} dollars. Firms founded ${d.founded}, controlled ${d.controlled}. Offices held ${d.offices}. Convictions ${d.convictions}.`;
}

function livingHeir(w: World, dead: number, st: PlayerSeat): number {
  const P = econ(w).P;
  const ok = (h: number): boolean => h >= 0 && h < P.n && h !== dead && P.alive(h);
  const will = st.will;
  if (will && ok(will.heir)) {
    const child = P.parent[will.heir] === dead || P.kids(dead).includes(will.heir);
    const spouse = will.heir === P.spouse[dead];
    const named = contactsOf(w, dead).some((c) => c.who === will.heir) || will.shares.some((s) => s.who === will.heir);
    if (child || spouse || named) return will.heir;
  }
  const sp = P.spouse[dead];
  if (ok(sp)) return sp;
  const kids = P.kids(dead).filter(ok);
  kids.sort((a, b) => P.born[a] - P.born[b] || a - b);
  const adult = kids.find((k) => P.age(w, k) >= 18);
  if (adult !== undefined) return adult;
  if (kids.length) return kids[0];
  if (will) for (const s of will.shares) if (ok(s.who)) return s.who;
  return -1;
}

function continueAs(w: World, dead: number, heir: number, cause: number, st: PlayerSeat): number {
  const P = econ(w).P;
  P.flags[dead] &= ~PLAYER;
  P.flags[heir] |= PLAYER;
  st.who = heir;
  st.over = false;
  st.passed = dead;
  st.generation += 1;
  st.will = null;
  st.chair = -1;
  remember(st, heir);
  const held = Math.floor(w.ledger.balance(P.id(heir), DEP));
  st.cashSeen = held;
  st.cashDay = w.day;
  st.payEv = -1;
  st.payCents = 0;
  st.spendEv = -1;
  st.spendCents = 0;
  const ev = w.events.emit(
    'player.heir',
    `${P.name(heir)} (${P.age(w, heir)}) takes up the life ${P.name(dead)} left. Skill ${P.skill[heir].toFixed(2)}, health ${P.health[heir]}, and the contacts and reputation already their own`,
    [cause],
    P.id(heir),
  );
  P.lastEv[heir] = ev;
  st.moneyEv = w.events.emit('life.cash', `You hold ${dollars(held)} in cash`, [ev]);
  chronicle(w, heir, `${P.name(heir)} continues the house after ${P.name(dead)}`, ev);
  refreshFirms(w, st);
  sync(roster(w));
  return ev;
}

function endHouse(w: World, dead: number, cause: number, st: PlayerSeat): void {
  const P = econ(w).P;
  st.over = true;
  st.passed = dead;
  st.final = epitaph(w, st, dead);
  chronicle(w, dead, st.final, cause);
  P.lastEv[dead] = cause;
  sync(roster(w));
}

function moveEstate(w: World, i: number, shares: Share[], ev: number): void {
  const s = econ(w), L = w.ledger, P = s.P, me = P.slot[i];
  const alive = shares.filter((r) => r.who >= 0 && r.who < P.n && r.who !== i && P.alive(r.who) && r.bps > 0);
  const holdings = s.shareIds.filter((id) => L.balS(me, id) > 0);
  const cashNow = L.balS(me, DEP);
  if (!alive.length) {
    if (cashNow > 0) L.moveS(DEP, me, s.govSlot, cashNow, 'estate.escheat', ev);
    for (const id of holdings) {
      const n = L.balS(me, id);
      if (n > 0) L.moveS(id, me, s.govSlot, n, 'estate.escheat', ev);
    }
    return;
  }
  const sum = alive.reduce((t, r) => t + r.bps, 0);
  alive.forEach((r, k) => {
    const last = k === alive.length - 1;
    const to = P.slot[r.who];
    const cash = last ? L.balS(me, DEP) : Math.floor(cashNow * r.bps / sum);
    if (cash > 0) L.moveS(DEP, me, to, cash, 'estate.inherit', ev);
    for (const id of holdings) {
      const n = L.balS(me, id);
      const q = last ? n : Math.floor(n * r.bps / sum);
      if (q > 0) L.moveS(id, me, to, q, 'estate.inherit', ev);
    }
    P.lastEv[r.who] = ev;
  });
}

function cityShares(w: World, i: number): Share[] {
  const P = econ(w).P;
  const sp = P.spouse[i];
  const heirs = sp >= 0 && P.alive(sp) ? [sp] : P.kids(i).filter((k) => P.alive(k));
  if (!heirs.length) return [];
  const bps = Math.floor(10000 / heirs.length);
  return heirs.map((who, k) => ({ who, bps: k === heirs.length - 1 ? 10000 - bps * (heirs.length - 1) : bps }));
}

function scenarioEndsOnRuin(w: World): boolean {
  const sc = w.state.scenario as { goal?: { kind?: string }; continueAfter?: boolean; outcome?: string } | undefined;
  if (!sc || sc.outcome || sc.continueAfter) return false;
  const k = sc.goal?.kind;
  return !!k && k !== 'none';
}

function mirrorMargin(w: World, st: PlayerSeat, i: number): void {
  const id = econ(w).P.id(i);
  if (st.seenNote < 0) st.seenNote = w.events.count;
  const from = st.seenNote;
  const n = w.events.count;
  st.seenNote = n;
  for (let e = from; e < n; e++) {
    const ev = w.events.get(e);
    if (!ev || ev.actor !== id) continue;
    if (ev.kind === 'loan.margin' || ev.kind === 'loan.line' || ev.kind === 'opt.marginCall') {
      w.events.emit('player.margin', ev.kind === 'loan.line' ? 'The bank calls your credit line. You have three trading days to pay it down, or the bank sells the shares for whatever the book will pay.' : 'The bank calls your margin. You have three trading days to pay it down, or the bank sells the shares for whatever the book will pay.', [ev.id], id);
    } else if (ev.kind === 'court.bankruptcy') {
      w.events.emit('player.bankrupt', 'The court declares you bankrupt. Your assets are sold, creditors are paid, and you cannot borrow for six years.', [ev.id], id);
      if (scenarioEndsOnRuin(w)) {
        st.over = true;
        st.final = 'You are bankrupt. The court sold what you had and wrote off the rest.';
      }
    }
  }
}

function noticeBoard(w: World, st: PlayerSeat, i: number): void {
  const s = econ(w), P = s.P;
  const chair = st.chair;
  if (chair >= 0 && chair < s.firms.length && s.firms[chair].ceo !== i) {
    const held = s.firms[chair];
    if (st.handed !== chair) {
      const id = w.events.last('firm.ceoFired');
      const ev = id !== undefined ? w.events.get(id) : undefined;
      const cause = ev && ev.actor === held.id ? ev.id : causeOf(w, st);
      chronicle(w, i, `the board removes ${P.name(i)} from ${held.name}`, cause);
    }
    st.chair = -1;
    st.handed = -1;
  }
  const e = P.employer[i];
  if (e >= 0 && s.firms[e].ceo === i) st.chair = e;
}

function ageYear(w: World, i: number, st: PlayerSeat): void {
  const s = econ(w), P = s.P;
  if (P.age(w, i) < 40 || P.health[i] <= 40) return;
  const before = labourOf(P, i, w.day);
  P.health[i]--;
  const after = labourOf(P, i, w.day);
  retargetLabour(s, i, before, after);
  if (P.health[i] === 60 || P.health[i] === 45 || P.health[i] === 30) {
    const ev = w.events.emit('player.health', `${P.name(i)} is ${P.age(w, i)} and health has fallen to ${P.health[i]}`, [causeOf(w, st)], P.id(i));
    chronicle(w, i, `${P.name(i)} feels the years; health ${P.health[i]}`, ev);
  }
}

function marginRate(w: World, i: number): number {
  const s = econ(w), P = s.P;
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnKind: Uint8Array; lnRate: Float64Array; owed: Float64Array } | undefined;
  if (book) {
    for (let k = book.ln - 1; k >= 0; k--) {
      if (book.lnOpen[k] && book.lnPerson[k] === i && book.lnKind[k] === 3 && book.lnRate[k] > 0) return book.lnRate[k];
    }
  }
  const income = Math.max(1, P.incEma[i]);
  const tenure = P.employer[i] >= 0 ? Math.max(0, Math.floor((w.day - P.born[i]) / DAYS_PER_YEAR) - 18) : 0;
  const owed = book && i < book.owed.length ? book.owed[i] : 0;
  const load = owed / (income * 360);
  const spread = 0.025 + Math.min(0.08, 0.06 * load) + (tenure < 2 ? 0.02 : tenure < 5 ? 0.01 : 0);
  return s.policyRate + spread + 0.012;
}

function directs(post: CompanyPost | undefined): boolean {
  if (!post) return false;
  if (post.role === 'chief executive' || post.role === 'chairman') return true;
  return post.shares > 0 && post.stake * 2 > post.shares;
}

function resolvePerson(w: World, i: number, token: string): number | undefined {
  const P = econ(w).P;
  const t = token.trim();
  if (!t) return undefined;
  const low = t.toLowerCase();
  if (low === 'me' || low === 'self' || low === 'i') return i;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    const contact = contactsOf(w, i).find((c) => c.slot === n)?.who;
    if (contact !== undefined) return contact;
    if (n >= 0 && n < P.n && P.alive(n)) return n;
    return undefined;
  }
  for (let k = 0; k < P.n; k++) if (P.alive(k) && P.name(k).toLowerCase() === low) return k;
  return undefined;
}

interface TapeStock { instr: string; issuer: string; last: number; prev: number; vol: number; hist: { c: number }[] }

function tapeOf(w: World): TapeStock[] {
  return (w.state.markets as { stocks?: TapeStock[] } | undefined)?.stocks ?? [];
}

function peOf(w: World, st: TapeStock): string {
  const f = econ(w).firms.find((x) => x.id === st.issuer && !x.closed);
  const shares = Math.floor(w.ledger.issued.get(st.instr) ?? 0);
  if (!f || shares < 1) return 'n/a';
  const eps = f.lastProfit * 12 / shares;
  if (!(eps > 1)) return 'n/a';
  return (st.last / eps).toFixed(1);
}

function sheetLines(w: World, playerId: string): string[] {
  const v = view(w, playerId);
  const lines = ['Balance sheet', `  cash ${dollars(v.cash)}`, `  net worth ${dollars(v.netWorth)}`];
  for (const d of v.deposits) lines.push(`  deposit ${d.bank} ${dollars(d.cents)}  [${d.eventId}]`);
  for (const s of v.shares) lines.push(`  ${s.instr} ${s.qty} @ ${dollars(s.px)} = ${dollars(s.value)} at market; a sale now would fetch ${dollars(s.saleValue)}  [${s.eventId}]`);
  for (const l of v.loans) lines.push(`  loan ${l.kind} ${dollars(l.owed)} @ ${(l.rate * 100).toFixed(2)}% (${l.why})  [${l.eventId}]`);
  for (const f of v.futures) lines.push(`  future ${f.good} m+${f.monthsAhead} ${f.net > 0 ? 'long' : 'short'} ${Math.abs(f.net)} @ ${dollars(f.px)}  [${f.eventId}]`);
  if (v.marginPosted) lines.push(`  futures margin ${dollars(v.marginPosted)}`);
  for (const c of v.coins) lines.push(`  ${c.name} ${c.qty} @ ${dollars(c.px)}  [${c.eventId}]`);
  for (const b of v.bonds) lines.push(`  ${b.instr} face ${dollars(b.face)}  [${b.eventId}]`);
  for (const l of v.stockLoans) lines.push(`  stock loan ${l.instr} ${l.qty} face ${dollars(l.face)}  [${l.eventId}]`);
  for (const st of v.stake) lines.push(`  stake ${st.name} ${st.shares} of ${st.issued} shares (${st.percent}%)${st.controls ? ', you chair it' : ''}`);
  if (v.score.length) lines.push(`  score ${v.score.map((p) => `day ${p.day} ${dollars(p.worth)}`).join(', ')}`);
  return lines;
}

function signalLines(w: World, playerId: string): string[] {
  const v = view(w, playerId);
  const lines: string[] = [];
  if (!v.signals.length) lines.push('No readings yet. They come a week before the firms you can see print: your own job, friends who work at a printing firm, and the street.');
  for (const s of v.signals.slice(0, 8)) {
    lines.push(`[${s.eventId}] day ${s.age === 0 ? 'today' : s.age + ' ago'}, ${s.firm}: ${s.text}. ${s.clearWord} ${s.kind} reading${s.outcome === 'open' ? '' : ', ' + s.outcome}. ${s.legalLine}`);
  }
  const due = v.consensus.filter((c) => c.due).slice(0, 6);
  for (const c of due) lines.push(`street: ${c.firm} expected to make ${dollars(c.profit)} (${dollars(c.low)} to ${dollars(c.high)}, ${c.analysts} analysts, books ${c.lagDays} days old, ${c.hopeful}), prints in ${c.printInDays} days`);
  for (const r of v.reveals.slice(0, 3)) lines.push(`[${r.eventId}] ${r.firm} printed ${dollars(r.actual)} against ${dollars(r.consensus)}: ${r.right} of ${r.signals} of your readings pointed the right way`);
  return lines;
}

function deskLines(w: World, actor: string): string[] {
  const stocks = tapeOf(w);
  if (!stocks.length) return ['no stocks listed'];
  const lines = ['name  last  change  volume  P/E  position'];
  for (const st of stocks) {
    const name = econ(w).firms.find((x) => x.id === st.issuer)?.name ?? st.issuer;
    const chg = st.last - st.prev;
    const qty = Math.floor(w.ledger.balance(actor, st.instr));
    lines.push(`${name}  ${dollars(st.last)}  ${chg > 0 ? '+' : ''}${dollars(chg)}  vol ${st.vol}  P/E ${peOf(w, st)}  pos ${qty}`);
  }
  return lines;
}

function quoteLines(w: World, key: string): string[] | undefined {
  const firm = firmByKey(w, key);
  const instr = stockInstr(w, key) ?? (firm ? 'eq:' + firm.id : undefined);
  if (!firm && !instr) return undefined;
  const st = tapeOf(w).find((s) => s.instr === instr);
  const lv = instr ? bookLevels(w, instr, 1) : { bids: [], asks: [] };
  const bid = lv.bids.length ? lv.bids[0].px : -1, ask = lv.asks.length ? lv.asks[0].px : -1;
  const name = firm?.name ?? key;
  const lines = [`${name}  last ${dollars(st ? st.last : 0)}  bid ${bid < 0 ? 'none' : dollars(bid)}  ask ${ask < 0 ? 'none' : dollars(ask)}`];
  const closes = (st?.hist ?? []).slice(-20).map((b) => dollars(b.c));
  lines.push('closes: ' + (closes.length ? closes.join(' ') : 'none'));
  if (!firm) return lines;
  lines.push(`profit ${dollars(firm.lastProfit)}  staff ${firm.workers}`);
  const P = econ(w).P;
  const holders = [...w.ledger.holders('eq:' + firm.id)].filter(([, n]) => n > 0);
  holders.sort((a, b) => b[1] - a[1]);
  const top = holders.slice(0, 5).map(([hid, n]) => {
    let who = hid;
    if (hid.startsWith('p_')) {
      const k = Number(hid.slice(2));
      if (k >= 0 && k < P.n) who = P.name(k);
    }
    return `${who} ${Math.floor(n)}`;
  });
  lines.push('holders: ' + (top.length ? top.join(', ') : 'none'));
  const facts = (w.state.social as { facts?: { msg: string; pub: boolean; drop: boolean; firms: number[] }[] } | undefined)?.facts ?? [];
  const news: string[] = [];
  const needle = firm.name.toLowerCase();
  for (let k = facts.length - 1; k >= 0 && news.length < 3; k--) {
    const fact = facts[k];
    if (!fact || fact.drop || !fact.pub) continue;
    if (fact.firms.includes(firm.idx) || fact.msg.toLowerCase().includes(needle)) news.push(fact.msg);
  }
  lines.push('news: ' + (news.length ? news.join(' | ') : 'none'));
  return lines;
}

/** The firm this person chairs or controls: their employer first, then any they hold a majority or the chair of. */
function ownedFirm(w: World, i: number): Firm | undefined {
  const s = econ(w);
  const job = s.P.employer[i] >= 0 ? s.firms[s.P.employer[i]] : undefined;
  if (job && !job.closed && controls(w, i, job)) return job;
  for (const o of owner(w).held) {
    const f = s.firms[o.firm];
    if (f && !f.closed && o.by === i && controls(w, i, f)) return f;
  }
  return companyPosts(w, i).map((c) => firmByKey(w, c.id)).find((f) => f && controls(w, i, f));
}

/** The rival with the most cash in the same sector (any sector when it has no rival). */
function richRival(w: World, f: Firm): Firm | undefined {
  const s = econ(w);
  const pool = s.firms.filter((o) => !o.closed && o.idx !== f.idx);
  const same = pool.filter((o) => o.sector === f.sector);
  return (same.length ? same : pool).sort((a, b) => w.ledger.balance(b.id, DEP) - w.ledger.balance(a.id, DEP) || a.idx - b.idx)[0];
}

function actSeat(w: World, playerId: string, cmd: Command): ActResult {
  const who = me(w, playerId);
  if (!isMe(who)) return who;
  const { st, i, id } = who;
  const P = econ(w).P;
  const dead = st.over || !P.alive(i);
  if (dead) {
    st.over = true;
    if (cmd.kind !== 'news' && cmd.kind !== 'signals' && cmd.kind !== 'why' && cmd.kind !== 'help' && cmd.kind !== 'hints' && cmd.kind !== 'story' && cmd.kind !== 'sheet') return rejected(st.final || 'you have died');
  }
  switch (cmd.kind) {
    case 'order': {
      const instr = stockInstr(w, cmd.instr);
      if (!instr) return rejected(`not listed ${cmd.instr}`);
      if (!Number.isSafeInteger(cmd.qty) || cmd.qty < 1) return rejected('qty must be a positive integer');
      markPlayerTrading(w);
      const label = shareName(w, instr) || 'the shares';
      const stopped = cmd.type === 'stop' || cmd.type === 'stop-limit' || cmd.stop !== undefined;
      if (stopped) {
        if (cmd.stop === undefined) return rejected('a stop order needs a stop price');
        if (cmd.type === 'stop-limit' && cmd.limit === undefined) return rejected('a stop-limit order needs a limit price');
        const lim = cmd.type === 'stop' ? undefined : cmd.limit;
        return placeStop(w, st, { kind: 'share', side: cmd.side, instr, qty: cmd.qty, stop: cmd.stop, limit: lim, label });
      }
      const limit = cmd.type === 'market' ? undefined : cmd.limit;
      if (cmd.side === 'short') return shortSell(w, st, id, instr, cmd.qty, limit, label);
      return placeShareOrder(w, st, id, instr, cmd.side, cmd.qty, limit, label);
    }
    case 'cancel': {
      const what = cancelAny(w, st, id, cmd.orderId);
      if (!what) return rejected('that order is not open');
      return { status: 'accepted', text: `cancelled ${what} ${cmd.orderId}` };
    }
    case 'bond': {
      const b = onRun(w, cmd.tenor);
      if (!b) return rejected(`no bond on the run for ${cmd.tenor}`);
      if (!Number.isSafeInteger(cmd.bonds) || cmd.bonds < 1) return rejected('qty is a number of bonds');
      try {
        const orderId = submitBondOrder(w, id, b.id, cmd.side, cmd.bonds * LOT, cmd.limit);
        return { status: 'accepted', orderId, eventId: b.issueEv, text: `${cmd.side} ${cmd.bonds} ${b.id}` };
      } catch (e) { return rejected(whyOf(e)); }
    }
    case 'fut': {
      const good = FUTURES[cmd.good.toUpperCase()] ?? cmd.good.toUpperCase();
      if (cmd.type === 'stop' || cmd.stop !== undefined) {
        if (cmd.stop === undefined) return rejected('a stop order needs a stop price');
        return placeStop(w, st, { kind: 'fut', side: cmd.side, instr: good, qty: cmd.qty, stop: cmd.stop, months: cmd.months, label: `${good} m+${cmd.months}` });
      }
      const r = tradeFuture(w, id, good, cmd.months, cmd.qty, cmd.side);
      if (r.why) return rejected(r.why);
      const root = (w.state.commodities as { root?: number } | undefined)?.root ?? st.arrived;
      const word = cmd.side === 'flat' ? 'closed' : cmd.side;
      return { status: 'accepted', fill: r.qty, eventId: root, text: `${word} ${r.qty} ${good} m+${cmd.months} @ ${(r.px / 100).toFixed(2)}, position ${r.net}` };
    }
    case 'coin': {
      if (cmd.type === 'stop' || cmd.type === 'stop-limit' || cmd.stop !== undefined) {
        if (cmd.stop === undefined) return rejected('a stop order needs a stop price');
        const q = coinPrice(w, cmd.coin);
        if (!q) {
          const names = coinNames(w);
          return rejected(names ? `no coin ${cmd.coin}. coins: ${names}` : `no coin ${cmd.coin}`);
        }
        const lim = cmd.type === 'stop' ? undefined : cmd.limit;
        return placeStop(w, st, { kind: 'coin', side: cmd.side, instr: q.id, qty: cmd.qty, stop: cmd.stop, limit: lim, label: q.name });
      }
      const r = orderCoin(w, id, cmd.coin, cmd.side, cmd.qty, cmd.type === 'market' ? undefined : cmd.limit);
      if (r.why) {
        if (r.why.startsWith('no coin')) {
          const names = coinNames(w);
          return rejected(names ? `${r.why}. coins: ${names}` : r.why);
        }
        return rejected(r.why);
      }
      const verb = cmd.side === 'buy' ? 'bought' : 'sold';
      const dollar = (n: number): string => dollars(Math.round(n));
      let text: string;
      if (r.filled > 0) {
        text = `${verb} ${r.filled} ${r.name} for ${dollar(r.cents)}, average ${dollar(r.avg)} a coin`;
        if (r.fills.length > 1) text += `. Fills: ${r.fills.slice(0, 4).map((f) => `${f.qty} at ${dollar(f.px)}`).join(', ')}`;
        if (r.orderId !== undefined) text += `. The other ${r.asked - r.filled} rest at ${dollar(cmd.limit ?? 0)}`;
        else if (r.filled < r.asked && !r.id.startsWith('coin:me:')) text += `. The dealers had no more within reach: ${r.asked - r.filled} did not fill`;
      } else text = `${cmd.side} ${cmd.coin} at ${dollar(cmd.limit ?? 0)}: resting until the price comes`;
      return { status: 'accepted', orderId: r.orderId, fill: r.filled, cents: Math.round(r.cents), avg: r.avg, fills: r.fills, text };
    }
    case 'launch': {
      const r = launchCoin(w, i, { name: cmd.name, ticker: cmd.ticker, buy: cmd.buy });
      if (r.why || !r.id) return rejected(r.why ?? 'the launch did not clear');
      return { status: 'accepted', eventId: w.events.last('crypto.launch'), text: `launched ${r.name} ($${r.ticker}, ${r.id})` };
    }
    case 'cash': {
      const cause = st.moneyEv >= 0 ? st.moneyEv : (st.arrived >= 0 ? st.arrived : econ(w).macroEv);
      switch (cmd.op) {
        case 'deposit': {
          const n = depositSight(w, id, cmd.cents, cause);
          if (n < 1) return rejected('nothing to deposit');
          return { status: 'accepted', fill: n, text: `deposited ${(n / 100).toFixed(2)}` };
        }
        case 'withdraw': {
          const n = withdrawSight(w, id, cmd.cents, cause);
          if (n < 1) return rejected('no time deposit to withdraw');
          return { status: 'accepted', fill: n, text: `withdrew ${(n / 100).toFixed(2)}` };
        }
        case 'borrow': {
          let cents = cmd.cents;
          const scene = w.state.scenario as { who?: number; loan?: number; outcome?: string } | undefined;
          if (scene && !scene.outcome && scene.who === i && scene.loan !== undefined && scene.loan !== 1) {
            if (scene.loan <= 0) return rejected('this scenario does not lend');
            cents = Math.max(1, Math.floor(cmd.cents * scene.loan));
          }
          const limit = marginLimit(w, i);
          const r = borrowAll(w, i, cents, cause, cmd.product ?? 'margin');
          st.margin = true;
          const rate = r.rate > 0 ? r.rate : marginRate(w, i);
          const pct = (rate * 100).toFixed(2);
          const cap = '$' + (limit / 100).toFixed(2);
          if (r.taken < 1) {
            const product = cmd.product ?? 'margin';
            if (!r.why) return { status: 'accepted', text: `margin account open. The bank will lend up to ${cap} at ${pct}%` };
            const bar = limit < 100 && !/court|stopped|margin call|dead|not writing/.test(r.why) ? 'not enough collateral: hold shares first, the bank lends against them' : r.why;
            return rejected(`no ${product === 'line' ? 'credit line' : product === 'term' ? 'term loan' : 'margin loan'}: ${bar}. Limit ${cap}`);
          }
          const grant = w.events.last('loan.grant');
          if (grant !== undefined && grant >= 0) rememberMove(st, grant, r.taken, w.day, 'pay');
          return { status: 'accepted', fill: r.taken, eventId: grant, text: `borrowed ${(r.taken / 100).toFixed(2)} on a ${cmd.product === 'line' ? 'credit line' : cmd.product === 'term' ? 'term loan' : 'margin loan'} at ${pct}% (${rateWhy(w, i, cmd.product ?? 'margin')}). Limit ${cap}${cmd.product === 'line' ? '. A line is cheap but the bank may not roll it in a crunch' : cmd.product === 'term' ? '. Fixed for three years' : '. Margin account open'}` };
        }
        case 'repay': {
          const n = repayPerson(w, i, cmd.cents, cause);
          if (n < 1) return rejected('nothing repaid');
          return { status: 'accepted', fill: n, text: `repaid ${(n / 100).toFixed(2)}` };
        }
        default: {
          const never: never = cmd.op;
          return never;
        }
      }
    }
    case 'talk': {
      const r = talk(w, i, cmd.slot);
      if (r.who < 0) return rejected(r.why ?? 'nobody there');
      // The talk itself changes how they stand with you; show that, since the talk prints nothing else.
      const line = view(w, playerId).contacts.find((c) => c.slot === cmd.slot)?.line;
      return { status: 'accepted', text: `talked with ${P.name(r.who)}${line ? `. ${line}` : ''}` };
    }
    case 'ask': {
      const firm = cmd.firm || (P.employer[i] >= 0 ? econ(w).firms[P.employer[i]].id : '');
      if (!firm) return rejected('ask needs a firm');
      const r = askFirm(w, i, cmd.slot, firm);
      for (const f of r.facts) if (!st.heard.some((h) => h.factId === f.factId)) st.heard.push({ factId: f.factId, eventId: f.eventId, from: f.from, day: f.day });
      if (!r.facts.length) {
        const known = knownPrivate(w, i, firm);
        if (known) return { status: 'accepted', eventId: known.eventId, text: `you already know: ${known.msg}` };
        return rejected(r.why ?? 'they had nothing to add');
      }
      const who = P.name(r.facts[0].from);
      const told = r.facts.map((f) => f.msg).join(' ');
      return { status: 'accepted', eventId: r.facts[0].eventId, fill: r.facts.length, text: `${who} told you: ${told}` };
    }
    case 'news': {
      const lines = view(w, playerId).news.map((n) => `[${n.eventId}] day ${n.day}: ${n.text}`);
      return { status: 'accepted', lines, text: lines.length ? `${lines.length} stories` : 'no news' };
    }
    case 'why': {
      const nw = Math.round(worth(w, i));
      if (!cmd.thing && cmd.id !== undefined) {
        const hit = explainNumber(w, cmd.id, st, i);
        if ('error' in hit) return rejected(hit.error);
        const lines = w.events.explain(hit.id, 8);
        if (!lines.length) return rejected('that event is gone from the log');
        return { status: 'accepted', lines, eventId: hit.id };
      }
      let id = cmd.id;
      if (cmd.thing) {
        const hit = explainThing(w, cmd.thing, st, nw);
        if ('error' in hit) return rejected(hit.error);
        id = hit.id;
      }
      if (id === undefined || id < 0) return rejected('usage: why <thing>');
      if (!cmd.thing) {
        const screen = view(w, playerId);
        const ids = new Set<number>();
        const take = (n: number | undefined): void => { if (n !== undefined && n >= 0) ids.add(n); };
        for (const x of screen.news) take(x.eventId);
        for (const x of screen.private) take(x.eventId);
        for (const x of screen.prices) take(x.eventId);
        for (const x of screen.orders) take(x.eventId);
        for (const x of screen.shares) take(x.eventId);
        for (const x of screen.loans) take(x.eventId);
        for (const x of screen.deposits) take(x.eventId);
        for (const x of screen.futures) take(x.eventId);
        for (const x of screen.coins) take(x.eventId);
        for (const x of screen.bonds) take(x.eventId);
        for (const x of screen.stats) take(x.eventId);
        for (const x of screen.story) take(x.eventId);
        take(st.arrived);
        if (!ids.has(id)) return rejected('you have not seen that');
      }
      const lines = w.events.explain(id, 8);
      if (!lines.length) return rejected('that event is gone from the log');
      return { status: 'accepted', lines, eventId: id };
    }
    case 'holiday':
    case 'donate':
    case 'lawyer':
    case 'clinic':
    case 'overtime':
      return liveChoice(w, st, i, id, cmd.kind);
    case 'wait': {
      if (!Number.isSafeInteger(cmd.days) || cmd.days < 1) return rejected('wait needs a length of time');
      const bad = stepDays(w, st, cmd.days);
      if (bad) return bad;
      return { status: 'accepted', days: cmd.days, text: `wait ${cmd.days}d` };
    }
    case 'found': {
      const people = econ(w).P;
      const job = people.employer[i];
      const jobName = job >= 0 ? econ(w).firms[job]?.name ?? '' : '';
      const before = Math.floor(w.ledger.balance(id, DEP));
      const r = foundCompany(w, i, cmd.name, cmd.sector.toUpperCase(), cmd.cents, cmd.loan);
      if ('why' in r) {
        if (r.why.startsWith('unknown sector')) return rejected(`${r.why}. sectors: ${SECTOR_NAMES.join(', ')}`);
        return rejected(r.why);
      }
      refreshFirms(w, st);
      const after = Math.floor(w.ledger.balance(id, DEP));
      let text = `you found ${r.name} (${r.id}), making ${r.good}`;
      if (job >= 0 && people.employer[i] !== job && jobName) text += `. left ${jobName}`;
      const moved = before - after;
      const prior = st.moneyEv >= 0 ? st.moneyEv : causeOf(w, st);
      if (moved > 0) {
        text += `. ${dollars(moved)} cash moved into the firm`;
        rememberMove(st, w.events.emit('life.spend', `You spend ${dollars(moved)} to found ${r.name}`, [prior]), moved, w.day, 'spend');
      } else if (moved < 0) {
        text += `. ${dollars(-moved)} cash came back`;
        rememberMove(st, w.events.emit('life.pay', `You are paid ${dollars(-moved)} back from ${r.name}`, [prior]), -moved, w.day, 'pay');
      }
      return { status: 'accepted', text };
    }
    case 'ceo': {
      const f = firmByKey(w, cmd.firm);
      if (!f) return rejected('no such firm');
      const post = companyPosts(w, i).find((c) => c.id === f.id);
      if (!directs(post)) return rejected(`you do not control ${f.name}`);
      if (f.ceo !== i) {
        const named = appointChief(w, i, cmd.firm, i);
        if ('why' in named) return rejected(named.why);
      }
      const r = steerCompany(w, i, cmd.firm, cmd.op, cmd.value, cmd.auto === true);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', lines: r.lines };
    }
    case 'ipo': {
      const r = takePublic(w, i, cmd.firm, cmd.fraction);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', text: r.text };
    }
    case 'bid': {
      const f = firmByKey(w, cmd.firm);
      if (f && directs(companyPosts(w, i).find((c) => c.id === f.id))) return rejected(`you already control ${f.name}`);
      const r = tenderOffer(w, i, cmd.firm, cmd.cents, cmd.multiple, cmd.paper);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', text: r.text };
    }
    case 'board': {
      if (cmd.op === 'list') {
        const rows = companyPosts(w, i);
        const lines = rows.length ? rows.map((c) => `${c.role} of ${c.name} (${c.id}) — ${c.stake} of ${c.shares} shares, ${c.listed ? 'listed' : 'private'}, profit $${(c.profit / 100).toFixed(2)}`) : ['you hold no board seat'];
        return { status: 'accepted', lines };
      }
      if (!cmd.firm) return rejected('name the firm');
      if (cmd.op === 'chief') {
        const token = cmd.person ?? (cmd.slot !== undefined ? String(cmd.slot) : '');
        const who = resolvePerson(w, i, token);
        if (who === undefined) return rejected('no such person');
        const r = appointChief(w, i, cmd.firm, who);
        if ('why' in r) return rejected(r.why);
        return { status: 'accepted', text: r.text };
      }
      if (!cmd.into) return rejected(cmd.op === 'merge' ? 'name the firm it folds into' : 'name the buyer');
      const r = cmd.op === 'merge' ? foldFirm(w, i, cmd.firm, cmd.into) : sellDivision(w, i, cmd.firm, cmd.into);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', text: r.text };
    }
    case 'court': {
      const hit = pairSlot(w, i, cmd.slot);
      if ('why' in hit) return rejected(hit.why);
      const talked = talk(w, i, hit.slot);
      if (talked.who < 0) return rejected(talked.why ?? 'nobody there');
      liftFriend(w, i, hit.slot, hit.who);
      const fr = friendship(w, i, hit.slot);
      const ev = w.events.emit('player.court', `${P.name(i)} courts ${P.name(hit.who)} (friendship ${fr})`, [causeOf(w, st)], id);
      chronicle(w, i, `${P.name(i)} courts ${P.name(hit.who)}`, ev);
      const ready = fr > 49 ? ' The pairing rules would allow a marriage.' : ' Friendship is not past 49 yet.';
      return { status: 'accepted', eventId: ev, text: `courted ${P.name(hit.who)}, friendship ${fr}.${ready}` };
    }
    case 'marry': {
      const hit = pairSlot(w, i, cmd.slot);
      if ('why' in hit) return rejected(hit.why);
      if (!(friendship(w, i, hit.slot) > 49)) return rejected(`friendship is ${friendship(w, i, hit.slot)}; the pairing rules want it past 49`);
      P.spouse[i] = hit.who;
      P.spouse[hit.who] = i;
      const ev = w.events.emit('player.wed', `${P.name(i)} marries ${P.name(hit.who)}, on the same pairing rules as anyone else`, [causeOf(w, st)], id);
      const s = econ(w);
      thought(w, s, i, -80, 'a wedding', ev);
      thought(w, s, hit.who, -80, 'a wedding', ev);
      seatPerson(w, i, 16);
      seatPerson(w, hit.who, 16);
      remember(st, hit.who);
      P.lastEv[i] = ev;
      chronicle(w, i, `${P.name(i)} marries ${P.name(hit.who)}`, ev);
      return { status: 'accepted', eventId: ev, text: `married ${P.name(hit.who)}` };
    }
    case 'child': {
      const q = P.spouse[i];
      if (q < 0 || !P.alive(q)) return rejected('you have no spouse');
      const young = Math.min(P.age(w, i), P.age(w, q));
      if (young < 20 || young > 42 || P.nkids[i] >= 4) return rejected('the birth rules stop outside 20 to 42, and at four children');
      const child = P.add(w, w.day, i, q);
      const ev = w.events.emit('player.birth', `${P.name(i)} and ${P.name(q)} have a child, ${P.name(child)}`, [causeOf(w, st)], id);
      const s = econ(w);
      thought(w, s, i, -60, 'a birth', ev);
      thought(w, s, q, -60, 'a birth', ev);
      seatPerson(w, child, 8);
      remember(st, child);
      P.lastEv[i] = ev;
      chronicle(w, i, `${P.name(child)} is born to ${P.name(i)} and ${P.name(q)}`, ev);
      return { status: 'accepted', eventId: ev, text: `${P.name(child)} is born` };
    }
    case 'school': {
      const kids = P.kids(i).filter((k) => P.alive(k));
      const child = kids[cmd.nth];
      if (child === undefined) return rejected('no such child');
      if (P.school[child] >= 18) return rejected('schooling already runs to 18 years');
      const cost = Math.round(econ(w).wage * 100);
      if (Math.floor(w.ledger.balance(id, DEP)) < cost) return rejected('you cannot pay the school');
      const cause = causeOf(w, st);
      if (!pay(w, id, GOV, cost, 'player.school', cause)) return rejected('the payment did not clear');
      const ev = w.events.emit('player.school', `${P.name(i)} pays for a year of schooling for ${P.name(child)}`, [cause], id);
      P.school[child] = Math.min(18, P.school[child] + 1);
      chronicle(w, i, `${P.name(child)} now has ${P.school[child]} years of school, paid by ${P.name(i)}`, ev);
      return { status: 'accepted', eventId: ev, fill: cost, text: `paid for ${P.name(child)}; school ${P.school[child]}` };
    }
    case 'will': {
      let heir = -1;
      let shares: Share[] = [];
      if (cmd.how === 'spouse') {
        const sp = P.spouse[i];
        if (sp < 0 || !P.alive(sp)) return rejected('you have no spouse');
        heir = sp;
      } else if (cmd.how === 'child') {
        const kids = P.kids(i).filter((k) => P.alive(k));
        const child = kids[cmd.nth];
        if (child === undefined) return rejected('no such child');
        heir = child;
        const sp = P.spouse[i];
        shares = sp >= 0 && P.alive(sp)
          ? [{ who: sp, bps: 5000 }, { who: child, bps: 5000 }]
          : [{ who: child, bps: 10000 }];
      } else if (cmd.how === 'slot') {
        const c = contactsOf(w, i).find((x) => x.slot === cmd.nth);
        if (!c || !P.alive(c.who) || c.who === i) return rejected('no such contact');
        heir = c.who;
      } else {
        const never: never = cmd.how;
        return never;
      }
      const split = shares.length
        ? shares.map((s) => `${P.name(s.who)} ${Math.round(s.bps / 100)}%`).join(', ')
        : 'the city\'s rule, a living spouse or else the children in equal parts, or the state if nobody is left';
      const ev = w.events.emit('player.will', `${P.name(i)} writes a will. ${P.name(heir)} continues the house. The estate: ${split}`, [causeOf(w, st)], id);
      st.will = { heir, shares, eventId: ev };
      chronicle(w, i, `${P.name(i)} writes a will naming ${P.name(heir)}`, ev);
      return { status: 'accepted', eventId: ev, text: willText(w, st) };
    }
    case 'retire': {
      if (P.retired(i)) return rejected('you have already retired');
      const s = econ(w);
      const e = P.employer[i], f = e >= 0 ? s.firms[e] : undefined, wasCeo = f?.ceo === i;
      const ev = w.events.emit('player.retire', `${P.name(i)} retires at ${P.age(w, i)}`, [causeOf(w, st)], id);
      P.flags[i] |= RETIRED;
      setSimDay(w.day);
      leaveJob(s, i);
      if (f && wasCeo) {
        st.handed = f.idx;
        succession(w, s, f, i, 'retired', ev);
      }
      chronicle(w, i, `${P.name(i)} retires`, ev);
      refreshFirms(w, st);
      return { status: 'accepted', eventId: ev, text: 'retired' };
    }
    case 'hand': {
      const f = firmByKey(w, cmd.firm);
      if (!f) return rejected('no such firm');
      if (f.ceo !== i) return rejected('you do not hold that seat');
      if (!f.family) return rejected('succession searches the children only in a family firm');
      const retire = CEO_POSITION.retireAge;
      const kids = P.kids(i).filter((c) => P.alive(c) && P.adult(w, c) && P.age(w, c) >= 23 && P.age(w, c) < retire - 1);
      if (!kids.length) return rejected('no child is old enough for the succession rules');
      const ev = w.events.emit('player.hand', `${P.name(i)} hands ${f.name} to the next generation`, [causeOf(w, st)], id);
      st.handed = f.idx;
      setSimDay(w.day);
      succession(w, econ(w), f, i, 'handed the seat on', ev);
      chronicle(w, i, `${P.name(i)} hands ${f.name} on`, ev);
      refreshFirms(w, st);
      return { status: 'accepted', eventId: ev, text: `${f.name} passes by the succession rules` };
    }
    case 'die': {
      const cause = st.will?.eventId ?? causeOf(w, st);
      const shares = st.will && st.will.shares.length ? st.will.shares : cityShares(w, i);
      const named = st.will && st.will.heir >= 0 && st.will.heir < P.n ? P.name(st.will.heir) : '';
      const ev = w.events.emit('player.died', `${P.name(i)} dies aged ${P.age(w, i)}. ${named ? `The will names ${named}. ` : ''}The estate follows the will, and the city's rule where the will is silent`, [cause], id);
      moveEstate(w, i, shares, ev);
      P.flags[i] &= ~ALIVE;
      const sp = P.spouse[i];
      if (sp >= 0 && sp < P.n) P.spouse[sp] = -1;
      setSimDay(w.day);
      const e = P.employer[i], f = e >= 0 ? econ(w).firms[e] : undefined, wasCeo = f?.ceo === i;
      leaveJob(econ(w), i);
      if (f && wasCeo) succession(w, econ(w), f, i, 'died', ev);
      const heir = livingHeir(w, i, st);
      if (heir < 0) {
        endHouse(w, i, ev, st);
        return { status: 'accepted', eventId: ev, lines: w.events.explain(ev, 6), text: st.final };
      }
      const heirEv = continueAs(w, i, heir, ev, st);
      return { status: 'accepted', eventId: heirEv, lines: w.events.explain(heirEv, 6), text: `${P.name(heir)} continues the house` };
    }
    case 'help':
      return { status: 'accepted', lines: helpLines(cmd.command, w, playerId) };
    case 'opt':
      return { status: 'accepted', lines: optionLines(w, id, cmd.instr) };
    case 'optbuy':
    case 'write': {
      const instr = stockInstr(w, cmd.instr);
      if (!instr) return rejected(`not listed ${cmd.instr}`);
      const row = matchOption(w, instr, cmd.right, cmd.strike, cmd.months);
      if (!row) return rejected(optionWhy(w, instr) || 'no listed contract');
      const cause = causeOf(w, st);
      const got = tradeOption(w, id, row.id, cmd.kind === 'write' ? 'write' : 'buy', cmd.qty, cause);
      if (got.qty < 1) return rejected(got.why || 'no fill');
      const side = cmd.right === 'C' ? 'call' : 'put';
      const name = row.name || shareName(w, instr) || 'the shares';
      const word = cmd.kind === 'write' ? 'writes' : 'buys';
      const because = cmd.kind === 'write' ? 'you wrote it yourself' : 'you bought it yourself';
      const ev = w.events.emit('player.option', `${P.name(i)} ${word} a ${side} on ${name} shares || ${because}`, [cause], id);
      const verb = cmd.kind === 'write' ? 'wrote' : 'bought';
      return { status: 'accepted', eventId: ev, fill: got.qty, text: `${verb} ${got.qty} ${side} on ${name} at $${(got.px / 100).toFixed(2)}` };
    }
    case 'optclose': {
      const cause = causeOf(w, st);
      if (cmd.id) {
        const got = tradeOption(w, id, cmd.id, 'close', cmd.qty, cause);
        if (got.qty < 1) return rejected(got.why || 'no fill');
        const ev = w.events.emit('player.option', `${P.name(i)} closes an option || you closed it yourself`, [cause], id);
        return { status: 'accepted', eventId: ev, fill: got.qty, text: `closed ${got.qty} at $${(got.px / 100).toFixed(2)}` };
      }
      const instr = stockInstr(w, cmd.instr);
      if (!instr) return rejected(`not listed ${cmd.instr}`);
      const open = optionChain(w, id).filter((r) => r.instr === instr && r.net !== 0);
      if (!open.length) return rejected('you have no position');
      const lines: string[] = [];
      for (const r of open) {
        const got = tradeOption(w, id, r.id, 'close', cmd.qty || Math.abs(r.net), cause);
        if (got.qty > 0) {
          const side = r.right === 'C' ? 'call' : 'put';
          const name = r.name || shareName(w, r.instr) || 'the shares';
          lines.push(`closed ${got.qty} ${side} on ${name} at $${(got.px / 100).toFixed(2)}`);
        }
      }
      if (!lines.length) return rejected('the close did not print');
      const ev = w.events.emit('player.option', `${P.name(i)} closes an option || you closed it yourself`, [cause], id);
      return { status: 'accepted', eventId: ev, lines };
    }
    case 'homes':
      return { status: 'accepted', lines: homeLines(w, i) };
    case 'homebid': {
      const cause = causeOf(w, st);
      const got = bidHome(w, i, cmd.id, cmd.cents, cause);
      if (got.why) return rejected(got.why);
      const ev = w.events.emit('player.home', `${P.name(i)} bids for a home`, [cause], id);
      return { status: 'accepted', eventId: ev, text: articles(got.text) };
    }
    case 'homesell': {
      const cause = causeOf(w, st);
      const got = sellHome(w, i, cmd.id, cause);
      if (got.why) return rejected(got.why);
      const ev = w.events.emit('player.home', `${P.name(i)} sells a home`, [cause], id);
      return { status: 'accepted', eventId: ev, text: articles(got.text) };
    }
    case 'let': {
      const cause = causeOf(w, st);
      const got = letHome(w, i, cmd.id, cmd.cents, cause);
      if (got.why) return rejected(got.why);
      const ev = w.events.emit('player.home', `${P.name(i)} lets a home`, [cause], id);
      return { status: 'accepted', eventId: ev, text: articles(got.text) };
    }
    case 'move': {
      const got = moveHome(w, i, cmd.id);
      if (got.why) return rejected(got.why);
      const ev = w.events.emit('player.home', `${P.name(i)} moves house`, [causeOf(w, st)], id);
      return { status: 'accepted', eventId: ev, text: articles(got.text) };
    }
    case 'mortgage': {
      const barred = borrowBar(w, i);
      if (barred) return rejected(barred);
      const cause = causeOf(w, st);
      const got = mortgageHome(w, i, cmd.id, cmd.cents, cause);
      if (got.why) return rejected(got.why);
      const ev = w.events.emit('player.home', `${P.name(i)} mortgages a home`, [cause], id);
      return { status: 'accepted', eventId: ev, text: articles(got.text) };
    }
    case 'tip': {
      if (!knows(w, i, cmd.fact)) return rejected('you do not know that');
      const facts = (w.state.social as { facts?: { pub?: boolean }[] } | undefined)?.facts;
      const fact = facts?.[cmd.fact];
      if (!fact) return rejected('no such fact');
      if (fact.pub) return rejected('the paper already has it');
      const ev = w.events.emit('player.tip', `${P.name(i)} gives a paper a story`, [causeOf(w, st)], id);
      publish(w, cmd.fact);
      return { status: 'accepted', eventId: ev, text: 'the paper has it' };
    }
    case 'report': {
      const who = contactsOf(w, i).find((c) => c.slot === cmd.slot)?.who;
      if (who === undefined || who < 0) return rejected('no such contact');
      const ev = w.events.emit('player.report', `${P.name(i)} reports a crime: ${cmd.text}`, [causeOf(w, st)], id);
      reportOffence(w, { person: who, firm: -1, gain: 0, text: cmd.text, cause: ev });
      return { status: 'accepted', eventId: ev, text: 'reported' };
    }
    case 'hints': {
      const scene = w.state.scenario as { hintsOn?: boolean } | undefined;
      if (!scene) return rejected('this is not a taught scenario');
      scene.hintsOn = cmd.on;
      if (!cmd.on) skipTutorial(w, st);
      return { status: 'accepted', text: cmd.on ? 'hints on' : 'hints off' };
    }
    case 'story': {
      const lines = playerChronicle(w, i >= 0 ? Math.round(worth(w, i)) : 0).text.split('\n');
      return { status: 'accepted', lines, text: 'the chronicle' };
    }
    case 'sheet':
      return { status: 'accepted', lines: sheetLines(w, playerId) };
    case 'desk':
      return { status: 'accepted', lines: deskLines(w, id) };
    case 'quote': {
      const lines = quoteLines(w, cmd.firm);
      if (!lines) return rejected(`no such firm ${cmd.firm}`);
      return { status: 'accepted', lines };
    }
    case 'reply':
    case 'lend':
    case 'invite':
    case 'gift':
    case 'introduce':
    case 'mail':
      return circleAct(w, i, id, cmd);
    case 'signals': return { status: 'accepted', lines: signalLines(w, playerId) };
    case 'stake': {
      const f = firmByKey(w, cmd.firm);
      if (!f) return rejected(`no firm ${cmd.firm}. Try stake FIRM DOLLARS cash|margin|partners|buyout`);
      const r = buyIn(w, i, f.id, cmd.how, cmd.cents, cmd.how === 'line' ? 'line' : 'margin');
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', eventId: r.eventId, text: r.text };
    }
    case 'owner': {
      const f = cmd.firm ? firmByKey(w, cmd.firm) : ownedFirm(w, i);
      if (!f) return rejected(cmd.firm ? `no firm ${cmd.firm}` : 'you do not chair a firm yet: build a stake first, stake FIRM DOLLARS');
      let r: { why: string } | { text: string; eventId: number };
      switch (cmd.op) {
        case 'cut': r = cutJobs(w, i, f.id, cmd.n ?? 0); break;
        case 'protect': r = protectJobs(w, i, f.id); break;
        case 'promote': {
          const tok = (cmd.person ?? '').trim().toLowerCase();
          const P = econ(w).P;
          const best = [...f.staff].filter((k) => k !== i && k !== f.ceo).sort((a, b) => P.skill[b] - P.skill[a] || a - b)[0];
          const who = tok === '' || tok === 'best' ? best : resolvePerson(w, i, cmd.person ?? '');
          r = who === undefined ? { why: 'promote whom? name a worker, or promote best for the most skilled' } : promote(w, i, f.id, who);
          break;
        }
        case 'sell-division': {
          const buyer = cmd.buyer ? firmByKey(w, cmd.buyer) : richRival(w, f);
          r = !buyer ? { why: 'no rival firm can pay for a division' } : sellAssets(w, i, f.id, buyer.id, cmd.fraction ?? 0.3);
          break;
        }
        case 'refinance': r = refinance(w, i, f.id, cmd.cents ?? 0, cmd.guarantee === true); break;
        case 'payout': r = payOut(w, i, f.id, cmd.cents ?? 0); break;
        case 'union': r = dealUnion(w, i, f.id, cmd.deal === 'refuse' ? 'break' : 'concede'); break;
        default: return rejected('unknown owner choice');
      }
      if ('why' in r) return rejected(r.why);
      const oo = owner(w);
      (oo.choices ??= []).push({ firm: f.idx, by: i, day: w.day, ev: r.eventId, op: cmd.op });
      return { status: 'accepted', eventId: r.eventId, text: r.text };
    }
    case 'jobs':
    case 'apply':
    case 'quit':
    case 'raise':
    case 'study': {
      if (!careerAct) return rejected('the labour market is not open');
      return careerAct(w, playerId, cmd);
    }
    case 'out': {
      if (!outingAct) return rejected('the city is not open');
      return outingAct(w, playerId, cmd);
    }
    default: {
      const never: never = cmd;
      return never;
    }
  }
}

export function act(w: World, playerIdOrCmd: string | Command, cmd?: Command): ActResult {
  const playerId = typeof playerIdOrCmd === 'string' ? playerIdOrCmd : (roster(w).ids[0] ?? DEFAULT_PLAYER);
  const command = typeof playerIdOrCmd === 'string' ? cmd : playerIdOrCmd;
  if (!command) return rejected('missing command');
  const day = w.day;
  const result = actSeat(w, playerId, command);
  const row: CommandRecord = { day, playerId, cmd: command, status: result.status };
  if (result.why) row.why = result.why;
  roster(w).log.push(row);
  if (result.status === 'accepted') {
    const seat = roster(w).seat[playerId];
    const i = playerIndex(w, playerId);
    if (seat && i >= 0) noteAct(w, seat, i, command);
    if (seat) noteJobSeat(w, seat);
  }
  return result;
}

interface Fact { id: number; eventId: number; day: number; msg: string; pub: boolean; drop: boolean; firms: number[]; instrs?: string[]; tag?: string }

export function view(w: World, playerId?: string): PlayerView {
  const players = roster(w);
  const key = playerId ?? players.ids[0];
  const st = (key && players.seat[key]) ? players.seat[key] : blankSeat();
  const s = econ(w), P = s.P;
  const i = playerIndex(w, playerId);
  const id = i >= 0 ? P.id(i) : '';
  const price = markPrice(w);
  const abs = w.day;
  const doy = abs % DAYS_PER_YEAR;
  const employer = i >= 0 && P.employer[i] >= 0 ? s.firms[P.employer[i]] : undefined;
  const mktRoot = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  const futRoot = (w.state.commodities as { root?: number } | undefined)?.root ?? w.genesis;
  const coinRoot = (w.state.crypto as { root?: number } | undefined)?.root ?? w.genesis;
  const arrived = st.arrived >= 0 ? st.arrived : w.genesis;
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number; issuer: string }[] } | undefined)?.stocks ?? [];
  const shares = i < 0 ? [] : stocks.filter((stc) => w.ledger.balance(id, stc.instr) > 0).map((stc) => ({
    instr: stc.instr, name: s.firms.find((f) => f.id === stc.issuer)?.name ?? '', qty: w.ledger.balance(id, stc.instr), px: stc.last, eventId: mktRoot,
    ...(() => {
      // Held at the mid price; what a sale would fetch is a separate figure, walked down the bids.
      const q = Math.floor(w.ledger.balance(id, stc.instr));
      const mark = midPrice(w, stc.instr);
      const proceeds = saleProceeds(w, stc.instr, q, id);
      return { px: mark, value: q * mark, sale: q > 0 ? proceeds / q : 0, saleValue: proceeds };
    })(),
  }));
  const banks = (w.state.banking as { banks?: { id: string; depo: string }[] } | undefined)?.banks ?? [];
  const deposits = i < 0 ? [] : banks.flatMap((b) => {
    const cents = Math.floor(w.ledger.balance(id, b.depo));
    return cents > 0 ? [{ bank: b.id, cents, eventId: arrived }] : [];
  });
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnKind: Uint8Array; lnRate: Float64Array } | undefined;
  const loans: PlayerView['loans'] = [];
  if (book && i >= 0) for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i) continue;
    const owed = Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (owed <= 0) continue;
    const kind = book.lnKind[k] === 1 ? 'mortgage' : book.lnKind[k] === 3 ? 'margin' : book.lnKind[k] === 5 ? 'credit line' : book.lnKind[k] === 6 ? 'term loan' : book.lnKind[k] === 4 ? 'unsecured' : 'consumer';
    const floats = book.lnKind[k] === 3 || book.lnKind[k] === 5;
    const why = floats ? rateWhy(w, i, book.lnKind[k] === 5 ? 'line' : 'margin') : book.lnKind[k] === 6 ? rateWhy(w, i, 'term') : 'fixed when taken out';
    loans.push({ kind, owed, rate: book.lnRate[k], why, eventId: (book as unknown as { rateEv?: Record<number, number> }).rateEv?.[k] ?? w.events.last('loan.grant') ?? arrived });
  }
  const cmd = w.state.commodities as { books?: { good: string; tenors: { month: number; longId: string; shortId: string; px: number }[] }[] } | undefined;
  const futures: PlayerView['futures'] = [];
  if (cmd?.books && i >= 0) for (const b of cmd.books) for (const t of b.tenors) {
    const net = Math.round(w.ledger.balance(id, t.longId) - w.ledger.balance(id, t.shortId));
    if (net === 0) continue;
    futures.push({ good: b.good, monthsAhead: t.month - w.month, net, px: t.px, eventId: futRoot });
  }
  const crypto = w.state.crypto as { majors?: { id: string; name: string; last: number }[]; memes?: { id: string; name: string; pool: string; rugged: boolean; launchEv: number }[] } | undefined;
  const coins: PlayerView['coins'] = [];
  if (i >= 0 && crypto?.majors) for (const m of crypto.majors) {
    const qty = Math.floor(w.ledger.balance(id, m.id));
    if (qty > 0) coins.push({ id: m.id, name: m.name, qty, px: m.last, eventId: coinRoot });
  }
  if (i >= 0 && crypto?.memes) for (const m of crypto.memes) {
    const qty = Math.floor(w.ledger.balance(id, m.id));
    if (qty > 0) {
      const tok = w.ledger.balance(m.pool, m.id);
      const px = !m.rugged && tok > 0 ? w.ledger.balance(m.pool, DEP) / tok : 0;
      coins.push({ id: m.id, name: m.name, qty, px, eventId: m.launchEv });
    }
  }
  const orders: PlayerView['orders'] = [];
  const mOrders = (w.state.markets as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of mOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'shares', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: mktRoot });
  if (i >= 0) for (const r of stopRows(st)) orders.push(r);
  const bOrders = (w.state.bonds as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of bOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'bonds', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: arrived });
  const cOrders = (w.state.crypto as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of cOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'crypto', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: coinRoot });
  const contacts = i < 0 ? [] : contactsOf(w, i).map((c) => {
    const g = regardOf(w, i, c.slot);
    return { slot: c.slot, name: P.name(c.who), kind: c.kind === 1 ? 'family' : 'work', word: g.word, line: g.line };
  });
  const prices: Quote[] = stocks.map((stc) => ({ instr: stc.instr, px: stc.last, eventId: mktRoot }));
  const bondBook = (w.state.bonds as { bonds?: { id: string; tenor: string; onRun: boolean; faceLeft: number; last: number; issueEv: number }[] } | undefined)?.bonds ?? [];
  const bonds: PlayerView['bonds'] = [];
  for (const b of bondBook) {
    if (b.onRun && b.faceLeft > 0) prices.push({ instr: b.id, px: b.last, eventId: b.issueEv });
    if (i >= 0) {
      const face = Math.floor(w.ledger.balance(id, b.id));
      if (face > 0) bonds.push({ instr: b.id, face, eventId: b.issueEv });
    }
  }
  if (cmd?.books) for (const b of cmd.books) for (const t of b.tenors) if (t.month === w.month) prices.push({ instr: `fut:${b.good}`, px: t.px, eventId: futRoot });
  if (crypto?.majors) for (const m of crypto.majors) prices.push({ instr: m.id, px: m.last, eventId: coinRoot });
  const facts = (w.state.social as { facts?: Fact[] } | undefined)?.facts ?? [];
  const news: Line[] = [];
  // A results week is more than eight lines. The page keeps a month so a printed profit can be read.
  // The player's own firm, holdings and stakes come first, so a day of price closes cannot crowd them out.
  const companies = i >= 0 ? companyPosts(w, i) : [];
  if (i >= 0) {
    const mineFirms = new Set<number>();
    const mineInstrs = new Set<string>();
    if (P.employer[i] >= 0) mineFirms.add(P.employer[i]);
    for (const sh of shares) mineInstrs.add(sh.instr);
    for (const c of companies) { const fi = s.firms.find((x) => x.id === c.id); if (fi) mineFirms.add(fi.idx); mineInstrs.add('eq:' + c.id); }
    const own = (fact: Fact): boolean => fact.firms.some((x) => mineFirms.has(x)) || (fact.instrs ?? []).some((x) => mineInstrs.has(x));
    const first: Line[] = [], rest: Line[] = [];
    for (let f = facts.length - 1; f >= Math.max(0, facts.length - 3000) && (first.length < 24 || rest.length < 24); f--) {
      const fact = facts[f];
      if (!fact || fact.drop || !fact.pub || !knows(w, i, fact.id)) continue;
      const line = { eventId: fact.eventId, day: fact.day, text: fact.msg };
      if (own(fact)) { if (first.length < 24) first.push(line); } else if (rest.length < 24) rest.push(line);
    }
    const keep = first.slice(0, 12);
    for (const l of [...first.slice(12), ...rest]) { if (keep.length >= 24) break; keep.push(l); }
    keep.sort((a, b) => a.day - b.day || a.eventId - b.eventId);
    news.push(...keep);
  }
  const priv: Priv[] = [];
  if (i >= 0) {
    for (const h of st.heard) {
      const fact = facts[h.factId];
      if (!fact || fact.drop || fact.pub || !knows(w, i, fact.id)) continue;
      priv.push({ eventId: fact.eventId, factId: fact.id, day: h.day, from: P.name(h.from), text: fact.msg });
    }
    // Staff are told the month's figure directly. Asking a nervous colleague is not the only way to know.
    for (let f = facts.length - 1; f >= 0 && priv.length < 12; f--) {
      const fact = facts[f];
      if (!fact || fact.drop || fact.pub || fact.tag !== 'insider.profit' || w.day - fact.day > 12) continue;
      if (priv.some((p) => p.factId === fact.id) || !knows(w, i, fact.id)) continue;
      priv.push({ eventId: fact.eventId, factId: fact.id, day: fact.day, from: 'the desk', text: fact.msg });
    }
  }
  return {
    date: { year: Math.floor(abs / DAYS_PER_YEAR) + 1, month: Math.floor(doy / 30) + 1, day: (doy % 30) + 1, abs },
    name: i >= 0 ? P.name(i) : '',
    age: i >= 0 ? P.age(w, i) : 0,
    alive: i >= 0 && P.alive(i),
    over: st.over || (i >= 0 && !P.alive(i)),
    employer: employer?.name ?? '',
    firm: employer?.id ?? '',
    netWorth: i >= 0 ? Math.round(worth(w, i)) : 0,
    cash: i >= 0 ? Math.floor(w.ledger.balance(id, DEP)) : 0,
    deposits, loans, shares, futures, coins,
    marginPosted: i >= 0 ? Math.round(w.ledger.balance(id, 'cmdty:margin')) : 0,
    stockLoans: st.loans.map((l) => ({ instr: l.instr, qty: l.qty, face: l.face, eventId: arrived })),
    orders, contacts, prices, news, private: priv, bonds, score: st.score,
    ...(() => {
      const board = lifeBoard(w, i, st, i >= 0 ? Math.round(worth(w, i)) : 0);
      return { stats: board.stats, choices: board.choices };
    })(),
    companies,
    health: i >= 0 ? P.health[i] : 0,
    final: st.final,
    family: {
      spouse: i >= 0 ? personBit(w, P.spouse[i]) : null,
      children: i >= 0 ? P.kids(i).map((k) => {
        const bit = personBit(w, k);
        return bit ? { ...bit, school: P.school[k] } : { index: k, name: '', alive: false, age: 0, school: 0 };
      }) : [],
      will: willText(w, st),
    },
    dynasty: dynastyOf(w, st),
    homes: homeBoard(w, i),
    chain: (process.argv[1] ?? '').includes('worker') ? [] : optionChain(w, id),
    story: storyLines(st),
    tutorial: tutorialOf(w, st, i),
    interrupts: st.jobNotes.map((n) => ({ why: n.why, text: n.text, eventId: n.eventId, cause: n.cause })),
    ...edgeOf(w, i, key ?? ''),
    credit: creditOf(w, i, loans),
    stake: stakesOf(w, i),
  };
}

function tightWord(t: number): string { return t < 0.25 ? 'easy' : t < 0.5 ? 'steady' : t < 0.8 ? 'tight' : 'shut'; }

function edgeOf(w: World, i: number, id: string): Pick<PlayerView, 'signals' | 'consensus' | 'reveals'> {
  if (i < 0) return { signals: [], consensus: [], reveals: [] };
  const sigs = signalsFor(w, id, 30);
  const signals: SignalRow[] = sigs.map((x) => ({
    id: x.id, text: x.text, kind: x.kind, clarity: x.clarity, clearWord: x.clearWord, legal: x.legal, legalLine: x.legalLine,
    firm: x.name, issuer: x.issuer, day: x.day, age: w.day - x.day, outcome: x.outcome, eventId: x.event,
  }));
  const s = econ(w), P = s.P;
  const job = P.employer[i] >= 0 ? s.firms[P.employer[i]] : undefined;
  const month = w.day % 30;
  const consensus: ConsensusRow[] = consensusAll(w).map((c) => {
    const due = c.actual === null && w.day - c.day < 30;
    return {
      issuer: c.issuer, firm: c.name, profit: c.profit, high: c.high, low: c.low, analysts: c.analysts, lagDays: c.lagDays,
      hopeful: c.tilt > 0.02 ? 'runs hopeful' : c.tilt < -0.02 ? 'runs cautious' : 'about right',
      due, printInDays: due ? Math.max(0, 29 - month) : -1, employer: !!job && c.firm === job.name, actual: c.actual, surprise: c.surprise, eventId: c.event >= 0 ? c.event : w.genesis,
    };
  }).sort((a, b) => Number(b.employer) - Number(a.employer) || Number(b.due) - Number(a.due) || (a.firm < b.firm ? -1 : 1));
  const mineReports = new Set(sigs.filter((x) => x.report >= 0).map((x) => x.report));
  const reveals: RevealRow[] = revealsOf(w, 80).filter((r) => mineReports.has(r.event)).slice(0, 12).map((r) => ({
    issuer: r.issuer, firm: r.name, day: r.day, consensus: r.consensus, actual: r.actual, surprise: r.surprise, px: r.px, pxAfter: r.pxAfter,
    signals: r.signals, right: r.right, story: r.story, storyRight: r.storyRight,
    mine: sigs.filter((x) => x.report === r.event).map((x) => ({ text: x.text, outcome: x.outcome })), eventId: r.event,
  }));
  return { signals, consensus, reveals };
}

function creditOf(w: World, i: number, loans: PlayerView['loans']): CreditView {
  const tight = creditTightness(w);
  const limit = i >= 0 ? marginLimit(w, i) : 0;
  const by = new Map<string, { owed: number; rate: number; loans: number }>();
  for (const l of loans) {
    if (l.kind !== 'margin' && l.kind !== 'credit line' && l.kind !== 'term loan') continue;
    const row = by.get(l.kind) ?? { owed: 0, rate: 0, loans: 0 };
    row.rate = (row.rate * row.owed + l.rate * l.owed) / Math.max(1, row.owed + l.owed);
    row.owed += l.owed; row.loans++;
    by.set(l.kind, row);
  }
  const owed = [...by.values()].reduce((a, r) => a + r.owed, 0);
  const row = (product: string, open: boolean, note: string): CreditView['products'][number] => {
    const r = by.get(product) ?? { owed: 0, rate: 0, loans: 0 };
    const hc = productHaircuts(w);
    return { product, owed: r.owed, rate: +r.rate.toFixed(4), loans: r.loans, open, haircut: +(product === 'term loan' ? hc.term : product === 'credit line' ? hc.line : hc.margin).toFixed(3), note };
  };
  return {
    tightness: +tight.toFixed(2), word: tightWord(tight), limit, owed, room: Math.max(0, limit - owed),
    products: [
      row('margin', tight < 0.9, 'floats, and is called when the shares slip'),
      row('credit line', tight < 0.5, tight < 0.5 ? 'cheaper, but due every quarter and not rolled in a crunch' : 'lenders are not writing credit lines now'),
      row('term loan', tight < 0.8, 'deeper haircut, fixed for three years, not called while paid'),
    ],
  };
}

function stakesOf(w: World, i: number): StakeView[] {
  if (i < 0) return [];
  const s = econ(w), P = s.P, o = owner(w), id = P.id(i);
  const mine = (by: number): boolean => by === i || o.inherit[i] === by;
  const firms = new Set<number>();
  for (const h of o.held) if (mine(h.by)) firms.add(h.firm);
  const out: StakeView[] = [];
  for (const fi of firms) {
    const f = s.firms[fi];
    if (!f || f.closed) continue;
    const have = Math.floor(w.ledger.balance(id, 'eq:' + f.id));
    if (have < 1) continue;
    const issued = Math.max(1, Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0));
    const px = f.listed ? Math.round(f.price) : 0;
    const bought = o.held.filter((h) => h.firm === fi && mine(h.by)).map((h) => ({ op: `stake ${h.how}`, text: w.events.get(h.ev)?.msg ?? 'bought in', day: h.day, eventId: h.ev }));
    const choices = [...bought, ...(o.choices ?? []).filter((c) => c.firm === fi && mine(c.by)).map((c) => ({ op: c.op, text: w.events.get(c.ev)?.msg ?? c.op, day: c.day, eventId: c.ev }))].sort((x, y) => x.day - y.day || x.eventId - y.eventId).slice(-12);
    const memos = o.memos.filter((m) => m.firm === fi && mine(m.by) && P.alive(m.who)).sort((a, b) => Math.abs(VAL[b.kind] * b.w) - Math.abs(VAL[a.kind] * a.w) || a.day - b.day);
    const seen = new Set<number>();
    const remembers: StakeView['remembers'] = [];
    for (const m of memos) {
      if (seen.has(m.who) || remembers.length >= 8) continue;
      seen.add(m.who);
      remembers.push({ name: P.name(m.who), role: ROLES[m.role] ?? 'person', what: KIND[m.kind] ?? '', warm: regard(w, m.who, i) >= 0, acted: m.out >= 0, eventId: m.ev });
    }
    const held = o.held.find((h) => h.firm === fi && mine(h.by));
    const ctl = controls(w, i, f);
    out.push({
      firm: f.id, name: f.name, shares: have, issued, percent: +(have / issued * 100).toFixed(1), value: have * (px > 0 ? px : 0), saleValue: f.listed ? have * Math.max(0, markHolding(w, id, 'eq:' + f.id, have)) : 0,
      controls: ctl, chair: ctl, how: held?.how ?? '', choices, remembers, city: [],
    });
  }
  if (out.length) out[0].city = cityMemory(w, i);
  return out;
}

export const player: Module = {
  id: 'player',
  init(w) {
    roster(w);
    if (w.state.deferPlayer) return;
    if (process.argv.includes('--load')) return;
    if (playerIndex(w) < 0) spawn(w, DEFAULT_PLAYER);
  },
  tick(w) {
    const players = roster(w);
    const P = econ(w).P;
    for (const id of players.ids) {
      const st = players.seat[id];
      if (!st || st.who < 0 || st.who >= P.n || !P.alive(st.who)) continue;
      if (!st.stops?.length && !st.loans.length) continue;
      const pid = P.id(st.who);
      runStops(w, st, pid, (instr, qty, limit, label) => shortSell(w, st, pid, instr, qty, limit, label));
      if (st.loans.length) settleCovers(w, st, pid, st.arrived >= 0 ? st.arrived : w.genesis);
    }
  },
  dayClose(w) {
    const players = roster(w);
    const P = econ(w).P;
    for (const id of players.ids) {
      const st = players.seat[id];
      if (!st || st.who < 0) continue;
      const i = st.who;
      if (i >= P.n) continue;
      if (P.alive(i) && st.loans.length) shortsDay(w, st, P.id(i));
      if (!P.alive(i)) {
        if (st.over || st.passed === i) continue;
        const died = w.events.last('person.died');
        const ev = died !== undefined ? w.events.get(died) : undefined;
        const cause = ev?.actor === P.id(i) ? ev.id : causeOf(w, st);
        const heir = livingHeir(w, i, st);
        if (heir < 0) endHouse(w, i, cause, st);
        else continueAs(w, i, heir, cause, st);
        continue;
      }
      mirrorMargin(w, st, i);
      noticeBoard(w, st, i);
      noteMoney(w, st, i);
      noteBoard(w, i, st, Math.round(worth(w, i)));
      if ((w.day + 1) % 7 === 0) tellWeek(w, st, i);
      if (w.day > 0 && w.day % DAYS_PER_YEAR === 0 && (st.score.length === 0 || st.score[st.score.length - 1].day !== w.day)) {
        ageYear(w, i, st);
        const nw = Math.round(worth(w, i));
        st.score.push({ day: w.day, worth: nw });
        const cause = econ(w).macroEv || st.arrived;
        chronicle(w, i, `${P.name(i)} marks the year with a net worth of ${(nw / 100).toFixed(0)} dollars`, cause);
        refreshFirms(w, st);
        refreshLife(w, st);
      }
      noteJobSeat(w, st);
    }
    sync(players);
  },
  monthEnd(w) {
    const players = roster(w);
    for (const id of players.ids) {
      const st = players.seat[id];
      if (st) noteJobSeat(w, st);
    }
  },
  stats(w) {
    const i = playerIndex(w);
    if (i < 0) return { player: 0 };
    const P = econ(w).P, st = soleSeat(w);
    if (!st) return { player: 0 };
    return {
      player: Math.round(worth(w, i) / 100),
      playerAlive: P.alive(i) ? 1 : 0,
      dynasty: st.generation,
      house: Math.round(houseWorth(w, household(w, st)) / 100),
    };
  },
};
