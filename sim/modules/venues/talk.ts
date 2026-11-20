// What people at a bar say. Nobody has a canned line: each exchange draws on who they are (their trade and seat, their
// pay, their mood, their home, their family), what is happening to their firm this week, what they own, and what the two of
// you have already been through. A conversation is a ladder of exchanges: greeting, work, home, money, the city, and finally
// something said in confidence. Deeper rungs open as the bond grows. Nothing here draws from a random stream: the same people
// say the same things, in their own words, and a docker does not answer like a bank clerk.
import type { World } from '../../kernel/index.ts';
import { DEP, type EconState, type Firm } from '../economy/index.ts';
import { firmGap, roleTitle, seatsOpen } from '../careers/jobs.ts';
import { parcelView } from '../property/index.ts';
import { quietFact } from '../social/index.ts';
import { usd } from '../player/gamedate.ts';
import { handleOf } from '../crypto/index.ts';
import { findPast, lifeOf } from '../player/arrival.ts';

export type Topic = 'hello' | 'work' | 'home' | 'money' | 'city' | 'inside' | 'chat' | 'coins';
export const LADDER: Topic[] = ['hello', 'work', 'home', 'money', 'city', 'inside'];
/** The bond a rung needs before people open up about it. */
const NEED: Record<Topic, number> = { hello: 0, work: 12, home: 22, money: 30, city: 14, inside: 45, chat: 0, coins: 8 };
/** How much an exchange on a rung warms the bond. */
const WARM: Record<Topic, number> = { hello: 6, work: 4, home: 5, money: 4, city: 3, inside: 7, chat: 2, coins: 3 };

export const TOPIC_WORDS: Record<string, Topic> = {
  hello: 'hello', work: 'work', job: 'work', jobs: 'work', firm: 'work', home: 'home', family: 'home', life: 'home',
  money: 'money', cash: 'money', shares: 'money', city: 'city', news: 'city', inside: 'inside', private: 'inside', secret: 'inside', chat: 'chat',
  coins: 'coins', coin: 'coins', crypto: 'coins', launchpad: 'coins', memecoins: 'coins', tokens: 'coins',
};

const econ = (w: World): EconState => w.state.economy as EconState;
const unit = (x: number): number => x / 4294967296;
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}
function pick<T>(list: T[], salt: number): T { return list[salt % list.length]; }
const an = (word: string): string => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

export type Facet = 'warm' | 'formal' | 'blunt' | 'anxious' | 'proud';
/** The sort of work a person does, from the firm's trade and the seat: it decides the words they use. */
export type Trade = 'quay' | 'heavy' | 'plant' | 'clinic' | 'shop' | 'money' | 'tech' | 'press' | 'farm' | 'owner' | 'none';
export type Rank = 'hand' | 'office' | 'engineer' | 'manager' | 'director' | 'chief' | 'none';

export interface Profile {
  i: number; name: string; first: string; age: number;
  firm: Firm | undefined; chief: boolean; role: string; years: number;
  jobless: number; spouse: boolean; kids: number; district: string; ownsHome: boolean;
  wd: number; health: number; stress: number; mood: number;
  gap: number; seats: number; profit: number;
  decider: string;
  hold: { name: string; qty: number } | undefined;
  recent: { text: string; days: number } | undefined;
  facet: Facet;
  trade: Trade; rank: Rank; pay: number; headcount: number; cut: number;
  news: string;
}

export function facetOf(w: World, i: number): Facet {
  const P = econ(w).P;
  if (P.anxiety[i] >= 67) return 'anxious';
  if (P.diligence[i] >= 72) return 'formal';
  if (P.diligence[i] >= 55) return 'proud';
  if (P.kin[i] >= 67) return 'warm';
  if (P.greed[i] >= 60) return 'blunt';
  return 'warm';
}

function plainEvent(w: World, msg: string): string {
  const s = econ(w);
  return msg.split('||')[0].trim()
    .replace(/\bfrm_[a-z0-9_]+/gi, (m) => s.firms.find((f) => f.id === m)?.name ?? 'the firm')
    .replace(/\beq:[A-Za-z0-9_]+/g, (m) => s.firms.find((f) => 'eq:' + f.id === m)?.name ?? 'the shares')
    .replace(/\bp_(\d+)\b/g, (_m, n: string) => (Number(n) < s.P.n ? s.P.name(Number(n)) : 'someone'));
}

const TRADE_OF: Record<string, Trade> = {
  TRANSPORT: 'quay', MINING: 'heavy', CONSTRUCTION: 'heavy', METALS: 'heavy', ENERGY: 'heavy', MANUFACTURING: 'plant', CHEMICALS: 'plant',
  HEALTHCARE: 'clinic', RETAIL: 'shop', FINANCE: 'money', TECHNOLOGY: 'tech', MEDIA: 'press', AGRICULTURE: 'farm',
};
function rankOf(role: string, chief: boolean): Rank {
  if (chief) return 'chief';
  const r = role.toLowerCase();
  if (/director|editor$/.test(r)) return 'director';
  if (/manager|boss|superintendent/.test(r)) return 'manager';
  if (/engineer|agronomist|metallurgist/.test(r)) return 'engineer';
  if (/clerk|bookkeeper|officer|accountant|buyer|analyst|underwriter|surveyor|assistant|copy/.test(r)) return 'office';
  return r ? 'hand' : 'none';
}
function weeklyPay(w: World, i: number, f: Firm | undefined): number {
  const s = econ(w);
  if (!f) return 0;
  const prem = (w.state.labour as { prem?: ArrayLike<number> } | undefined)?.prem;
  const m = prem && f.idx < prem.length && prem[f.idx] > 0 ? prem[f.idx] : 1;
  return Math.round(s.P.skill[i] * s.wage * 7 * m);
}
/** What this person's firm did lately that they would know: a cut, a hiring drive, a result, a swing in the shares. */
function firmNews(w: World, f: Firm | undefined, short = false): string {
  if (!f) return '';
  const ago = (d: number): string => (d <= 1 ? 'yesterday' : d < 7 ? `${d} days ago` : d < 14 ? 'last week' : d < 30 ? `${Math.round(d / 7)} weeks ago` : 'last month');
  for (const e of w.events.recent(['earnings.report', 'firm.layoffs', 'firm.cashCrunch', 'mkt.move', 'firm.ceoFired', 'firm.succession'], 160).reverse()) {
    if (w.day - e.day > 45) break;
    if (e.actor !== f.id && !e.msg.includes(f.name) && !e.msg.includes(f.id)) continue;
    if (e.kind === 'earnings.report') {
      const v = /\((beat|miss)[^)]*?([\d.]+)%\)/.exec(e.msg);
      return v ? `the quarter ${v[1] === 'beat' ? 'beat' : 'missed'} the street by ${v[2]}%` : 'the quarter came in on the number';
    }
    // A firm that is short of hands again does not talk about its old cuts as news.
    if (e.kind === 'firm.layoffs') { if (short) continue; return `the cuts ${ago(w.day - e.day)}`; }
    if (e.kind === 'firm.cashCrunch') return `the wages coming up short ${ago(w.day - e.day)}`;
    if (e.kind === 'mkt.move') {
      const m = /\(([+-][\d.]+)%\)/.exec(e.msg);
      if (m) return `the shares ${m[1].startsWith('-') ? 'falling' : 'jumping'} ${m[1].replace(/^[+-]/, '')}% in a day`;
    }
    if (e.kind === 'firm.ceoFired' || e.kind === 'firm.succession') return 'the change at the top';
  }
  return '';
}

export function profileOf(w: World, i: number): Profile {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  const firm = e >= 0 ? s.firms[e] : undefined;
  const chief = !!firm && firm.ceo === i;
  const gap = firm ? firmGap(w, firm) : 0;
  const wage = Math.max(1, s.wage);
  const wd = w.ledger.balS(P.slot[i], DEP) / wage;
  const live = (w.state.property as { live?: ArrayLike<number> } | undefined)?.live;
  const parcel = live && i < live.length ? live[i] : -1;
  const pv = parcel >= 0 ? parcelView(w, parcel) : undefined;
  let hold: Profile['hold'];
  const held = w.ledger.heldInstrs(P.id(i));
  if (held) {
    let best = 0;
    for (const instr of held) {
      if (!instr.startsWith('eq:') || (firm && instr === 'eq:' + firm.id)) continue;
      const qty = w.ledger.balance(P.id(i), instr);
      if (qty > best) {
        const f = s.firms.find((x) => 'eq:' + x.id === instr);
        if (f) { best = qty; hold = { name: f.name, qty: Math.floor(qty) }; }
      }
    }
  }
  const ev = P.lastEv[i] >= 0 ? w.events.get(P.lastEv[i]) : undefined;
  const recent = ev && w.day - ev.day <= 40 && !/^life\./.test(ev.kind) ? { text: plainEvent(w, ev.msg), days: w.day - ev.day } : undefined;
  let decider = '';
  if (firm) {
    const boss = firm.ceo >= 0 && firm.ceo !== i && firm.ceo < P.n && P.alive(firm.ceo) ? firm.ceo : -1;
    decider = boss >= 0 ? P.name(boss) : '';
  }
  const role = firm && P.occ[i] > 0 ? roleTitle(firm.sector, P.occ[i]) : chief ? 'chief' : '';
  const owner = chief && firm !== undefined && firm.workers < 60;
  return {
    i, name: P.name(i), first: P.name(i).split(' ')[0], age: P.age(w, i), firm, chief,
    role,
    years: P.occYrs[i], jobless: P.jobless[i],
    spouse: P.spouse[i] >= 0 && P.alive(P.spouse[i]), kids: P.nkids[i],
    district: pv?.neighbourhood ?? '', ownsHome: pv ? pv.owner === i : false,
    wd, health: P.health[i], stress: P.stress[i], mood: P.mood[i],
    gap, seats: firm ? seatsOpen(w, firm) : 0, profit: firm?.lastProfit ?? 0,
    decider, hold, recent, facet: facetOf(w, i),
    trade: owner ? 'owner' : firm ? TRADE_OF[firm.sector] ?? 'plant' : 'none',
    rank: firm ? rankOf(role, chief) : 'none',
    pay: weeklyPay(w, i, firm), headcount: firm?.workers ?? 0,
    cut: firm ? Math.max(0, (firm.bornWorkers || firm.workers) - firm.workers) : 0,
    news: firmNews(w, firm, gap > 1),
  };
}

/** A firm somewhere else that really is short of hands, so a jobless person can point to it. */
export function aFirmHiring(w: World, salt: number, not: number): Firm | undefined {
  const open = econ(w).firms.filter((f) => !f.closed && f.idx !== not && seatsOpen(w, f) >= 1);
  return open.length ? pick(open, salt) : undefined;
}

export interface Said { topic: Topic; text: string; delta: number; gated: boolean; gist: string }

export interface Ctx {
  me: number; who: number; venue: string; venueName: string;
  score: number; depth: number; covered: string[]; recog?: string; first: boolean;
  salt: number; word?: Topic;
  /** What the two of you have been through, so a regular remembers you. */
  memory?: { days: number; gist: string; helped: number; refused: number; youOwe: boolean; venue: string; met: number };
  regular?: boolean;
}

// ----------------------------------------------------------------------------- vocabulary

const WHAT: Record<Trade, string[]> = {
  quay: [
    'I move boxes between the ships and the lorries, and the cranes set the pace', 'I work the lines on the quay, tying off whatever the tide brings in',
    'I drive freight out of the port and back, and the clock on the dash is the only boss I trust', 'I am on the docks, loading and unloading until the tally comes right',
    'I check cargo against the manifest before it goes anywhere', 'I dispatch the trucks, which means I take the blame when one is late',
  ],
  heavy: [
    'I am on a site where everything is heavy and nothing is on time', 'I work the pit and the plant, three shifts a week in the dust',
    'I work with steel and stone from the first light', 'I keep the machines turning while the rest of the shift sleeps',
    'I am out in the weather most days, and the work follows the contracts', 'I carry the load, and the foreman counts the hours',
  ],
  plant: [
    'I am on the line, and the line does not stop for anybody', 'I run a machine that makes the same thing ten thousand times a week',
    'I look after the process in a plant that smells of whatever we made last', 'I work the factory floor, where the shift bell is the only music',
    'I check quality, which means telling people their batch is wrong', 'I load the vats and read the gauges, and I try not to get distracted',
  ],
  clinic: [
    'I am on the ward most nights, and sleep is something I do in the afternoon', 'I keep the clinic running, one chart and one bed at a time',
    'I look after patients, and the paperwork looks after me', 'I am in the care side, where there is never enough of anybody',
  ],
  shop: [
    'I am on the shop floor, smiling at people who have not made up their minds', 'I stock the shelves, and the customers un-stock them',
    'I serve the counter all day and count the till all evening', 'I do the buying, which means I say no to eight suppliers for every one I say yes to',
  ],
  money: [
    'I sit with other people\'s money all day and try not to mix it up with mine', 'I am at a desk with a ledger, a phone and a cold coffee',
    'I read balance sheets for a living, and they are mostly bad news', 'I price risk for the bank, which is a polite way of saying I say no',
    'I process the day\'s transfers and balance them to the cent before anyone goes home',
  ],
  tech: [
    'I build things that mostly work, for people who want them to always work', 'I am in the lab, where the clock counts experiments, not hours',
    'I write the code that other people are rude about', 'I look after the systems, and I am only noticed when they break',
  ],
  press: [
    'I work in the press, where everything is urgent for about an hour', 'I chase people for quotes and then fight the editor about them',
    'I set the copy, check the facts and sleep when the paper is out',
  ],
  farm: [
    'I work the land, and the land does not care about my plans', 'I look after the stock and the machines, and the weather decides the rest',
    'I am on the farm from before the light, and we sell by the quintal',
  ],
  owner: [
    'I run a small firm, which means I do every job nobody else will', 'I am the owner, the book-keeper and the person who unlocks the door',
    'I started this with my own money, and now it runs on everybody else\'s',
  ],
  none: [],
};
const RANK_LINE: Record<Rank, string[]> = {
  hand: ['I do the work and the others decide', 'I take the shift I am given', 'Nobody asks me what I think, and I am fine with that'],
  office: ['I keep the paper moving', 'I am in the office, where everything is a form', 'I do the counting and the chasing'],
  engineer: ['I solve the problems nobody saw coming', 'I am the one they send for when it stops', 'I design the fix and then I explain it twice'],
  manager: ['I am the one in the middle, between the floor and the people upstairs', 'I run a team and answer for all of them', 'I make the rota and take the complaints'],
  director: ['I sit where the budget gets argued', 'I answer to the board and to the floor, in that order', 'I decide what gets cut'],
  chief: ['I run it, so every problem is mine', 'I answer to the owners and the bank', 'I make the calls and I carry the blame'],
  none: [],
};
const GRIPE: Record<Trade, string[]> = {
  quay: ['The overtime is real and the thanks is not', 'When a ship is late, we are the ones who stay', 'My back tells me the forecast better than the radio'],
  heavy: ['The pay does not match the weight', 'Every contract is the last one until the next', 'The dust gets into everything, even the beer'],
  plant: ['The shift pattern ate my weekends', 'They count the minutes on the line, not the people', 'The targets go up and the staff does not'],
  clinic: ['There is never enough of anything but patients', 'The nights get longer every year', 'They want a smile on top of the forms'],
  shop: ['The customers are never wrong, which is the problem', 'My feet have opinions about the floor', 'The rota changes when the weather does'],
  money: ['Every quarter someone wants a number to be different', 'The hours are long, the lunches are short', 'I am paid to worry, and I am very good at it'],
  tech: ['Everything is a deadline and nothing is a plan', 'They ask for a miracle with a budget for a sandwich', 'I fix the same bug twice in two names'],
  press: ['The deadline eats the facts', 'Everyone wants to be in the paper, until they are', 'There is always one more call to make'],
  farm: ['The prices fall when the harvest is good and fall when it is bad', 'The weather laughs at the forecast', 'My knees know when the frost is coming'],
  owner: ['The bank and the taxman both want me on the phone', 'I pay everyone else before myself', 'There is no night off in it'],
  none: [],
};
const PRIDE: Record<Trade, string[]> = {
  quay: ['But when the cargo is clear at dusk, it feels like a day', 'I like seeing a hold go empty'],
  heavy: ['But I can point at what we built', 'The crew is solid, and that counts for a lot'],
  plant: ['But what leaves the line is mine, in a way', 'We hit the number last week and I won the bet'],
  clinic: ['But somebody walked out on their own two feet today', 'I would not trade it, not even on the bad nights'],
  shop: ['But the regulars ask for me by name', 'I like a Saturday when it runs well'],
  money: ['But when the books balance, it is a small, quiet joy', 'I am good at it, and that is enough'],
  tech: ['But it works, today, because of what I did', 'I like the moment it finally runs'],
  press: ['But my name was on the front page once', 'I like being first to know'],
  farm: ['But I like the air', 'Nothing beats a good field in August'],
  owner: ['But it is mine, and nobody can take that', 'I like having my name on the door'],
  none: [],
};

// ----------------------------------------------------------------------------- the rungs

function open(p: Profile, c: Ctx): string {
  const s = c.salt;
  const lead: Record<Facet, string[]> = {
    warm: [
      `${p.first} waves you onto the next stool. "Sit down, sit down. I'm ${p.first}. Haven't seen you in here before."`,
      `${p.first} grins. "A new face! I'm ${p.first}. First drink's the hardest."`,
      `"You look like you need a chair," says ${p.first}, pulling one out. "${p.first}. And you are?"`,
      `${p.first} lifts a glass your way. "Welcome. I'm ${p.first}. Don't mind the noise, it is mostly mine."`,
    ],
    formal: [
      `${p.name} inclines their head. "Good evening. ${p.name}. I don't think we have met."`,
      `"${p.name}," they say, and offer a dry, firm handshake. "And you are?"`,
      `"I don't believe we have been introduced," says ${p.name}. "Let me remedy that."`,
    ],
    blunt: [
      `${p.first} looks you up and down. "New. I'm ${p.first}. Don't take the end stool, it's spoken for."`,
      `"Another stranger," says ${p.first}. "Fine. ${p.first}. Buy your own."`,
      `"You lost?" ${p.first} grunts. "No? Then sit. ${p.first}."`,
    ],
    anxious: [
      `${p.first} startles, then smiles. "Oh. Hello. Sorry, I was miles away. ${p.first}."`,
      `"Hello?" ${p.first} glances at the door, then back. "Yes, sorry. ${p.first}."`,
      `${p.first} fidgets with a beer mat. "Hi. I'm ${p.first}. I am not usually this jumpy."`,
    ],
    proud: [
      `"${p.name}," says ${p.first}, as if you ought to know it. "And you would be...?"`,
      `${p.first} straightens. "${p.first}. People round here know me. You're new."`,
      `"Haven't seen you here," says ${p.first}, with the air of someone who sees everyone. "${p.first}."`,
    ],
  };
  let text = pick(lead[p.facet], s);
  if (c.recog) text = `${p.first} looks twice, then points. "I know you. We ${c.recog}, years back. ${p.first}, remember?" The memory is a little hazy on both sides, but it is warm.`;
  return text;
}

/** A regular remembers you: when you last spoke, what about, and whether you were good to them. */
function recall(p: Profile, c: Ctx): string {
  const m = c.memory;
  if (!m || m.met < 1) return '';
  const when = m.days <= 0 ? 'earlier tonight' : m.days === 1 ? 'yesterday' : m.days < 8 ? `${m.days} days ago` : m.days < 40 ? `${Math.round(m.days / 7)} weeks ago` : 'a good while back';
  const about = m.gist ? `, about ${m.gist}` : '';
  const here = c.regular ? ' I am in here most weeks, so you will always find me.' : '';
  if (m.refused > 0 && m.helped === 0) return `${p.first} gives you a measured nod. "You again. ${cap(when)}, you asked too much, too soon${about ? `, when we were on ${m.gist}` : ''}. I have not forgotten."`;
  if (m.youOwe) return `${p.first} raises an eyebrow. "Back at last. You still owe me one from ${when}, you know. First round is yours."`;
  if (c.venue === 'scene') {
    return pick([
      `${p.first} spots you across the table. "You came! We last spoke ${when}${about}. Sit by me."`,
      `"There you are," says ${p.first}. "${cap(when)}${about ? `, we were on ${m.gist}` : ''}. Glad you could make it."`,
    ], c.salt);
  }
  if (m.helped > 0) return `${p.first} lights up. "There you are! ${cap(when)} you came through for me, and I do not forget that."`;
  return pick([
    `${p.first} spots you. "Back again. We spoke ${when}${about}, if I remember right.${here}"`,
    `"Hey, it's you," says ${p.first}. "${cap(when)}, wasn't it${about}? Pull up a stool.${here}"`,
    `${p.first} nods at the free stool. "I wondered if you would come back. Last time was ${when}${about}.${here}"`,
  ], c.salt);
}
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function pastNod(w: World, p: Profile, c: Ctx): string {
  const life = lifeOf(w);
  const past = findPast(life?.past);
  const sector = p.firm?.sector ?? '';
  if (!past || !past.sector || sector !== past.sector || c.recog) return '';
  return ` ${p.first} sizes up your hands. "${past.name}? I can always tell. Same trade here."`;
}

function payClause(p: Profile, s: number): string {
  if (!p.pay) return '';
  const pay = usd(p.pay);
  if (p.wd < 60) return pick([` I clear about ${pay} a week and it is gone by Thursday.`, ` The wage is ${pay} a week, and the rent knows it.`], s);
  if (p.rank === 'hand') return pick([` It pays about ${pay} a week.`, ` I take home about ${pay}. It is not nothing.`], s);
  return pick([` About ${pay} a week.`, ` The pay is ${pay} a week, and I know what the next firm offers.`], s);
}

export function workTalk(w: World, p: Profile, c: Ctx): string {
  const f = p.firm;
  const s = mix(p.i, 11, c.salt);
  if (!f) {
    const hiring = aFirmHiring(w, c.salt, -1);
    const weeks = Math.max(1, Math.round(p.jobless / 7));
    const state = p.jobless > 6 ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} without work.` : 'Between jobs.';
    const tip = hiring ? ` ${hiring.name} is taking people on, ${seatsOpen(w, hiring)} ${seatsOpen(w, hiring) === 1 ? 'seat' : 'seats'} open. Go in early.` : ' Nobody is taking anyone on, not this week.';
    const mood = p.mood < 40 ? ' I am running out of patience.' : p.wd < 40 ? ' The savings are nearly gone.' : ' I am not panicking yet.';
    return `${p.first} turns the glass in their hands. "${state}${mood}${tip}"`;
  }
  const seats = p.seats > 0 ? `${p.seats} ${p.seats === 1 ? 'seat is' : 'seats are'} open` : '';
  const vouch = c.score >= 28 ? ` Say ${p.first} sent you and it won't hurt.` : '';
  const trouble = p.gap < -1 ? 'cut' : p.profit < 0 ? 'thin' : p.seats > 0 ? 'hiring' : 'steady';
  const news = p.news ? ' ' + pick([`Everyone is still talking about ${p.news}.`, `The break room has not stopped on about ${p.news}.`, `Nobody here has got over ${p.news}.`, `We are all still chewing over ${p.news}.`], s >>> 9) : '';
  const state = trouble === 'hiring'
    ? pick([
      `We are short of hands at ${f.name}: ${seats} right now${p.decider ? `, and ${p.decider} decides who fills them` : ''}.${vouch}`,
      `${f.name} cannot find people. ${cap(seats)}, and the rest of us cover the gap.${vouch}`,
      `Half the floor at ${f.name} is doing two jobs. ${cap(seats)}.${vouch}`,
    ], s)
    : trouble === 'cut'
      ? pick([
        `${f.name} is carrying more people than it needs${p.cut > 0 ? `, ${p.cut} fewer than when I started this year` : ''}. Nobody says it out loud, but I'd not be buying a house.`,
        `There is a cold wind through ${f.name}. Sales are down, and so are the numbers on the board.${p.cut > 0 ? ` We are ${p.cut} lighter already.` : ''}`,
      ], s)
      : trouble === 'thin'
        ? pick([
          `It is a thin year at ${f.name}. Orders are slow and the talk upstairs is about costs.`,
          `${f.name} lost money last month, and everyone can feel it in the canteen.`,
        ], s)
        : pick([
          `${f.name} is steady. Not exciting, but the wages arrive.`,
          `Orders at ${f.name} are decent, and nobody is shouting.`,
          `${f.name} had a fair month. Nobody is hiring, nobody is cutting.`,
        ], s);
  if (p.chief) {
    const month = f.lastProfit > 0 ? `We made ${usd(f.lastProfit)} last month, so I can't complain` : f.lastProfit < 0 ? `We lost ${usd(-f.lastProfit)} last month and I'm not sleeping` : 'We broke about even last month';
    return `${p.first} leans back. "I run ${f.name}. ${month}. ${p.seats > 0 ? `I'm hiring: ${seats}, and the decision is mine.` : 'Hiring is on hold.'}${p.cut > 4 ? ` I had to let ${p.cut} go this year, and I know their names.` : ''}${news}"`;
  }
  const what = pick(WHAT[p.trade].length ? WHAT[p.trade] : ['I work at the firm'], s);
  const who = p.role ? `${an(p.role)} at ${f.name}` : `at ${f.name}`;
  const years = p.years > 0 ? `, ${p.years} ${p.years === 1 ? 'year' : 'years'} now` : '';
  const rankLine = pick(RANK_LINE[p.rank].length ? RANK_LINE[p.rank] : [''], s >>> 3);
  const feel = p.mood >= 60 ? pick(PRIDE[p.trade].length ? PRIDE[p.trade] : [''], s >>> 5) : pick(GRIPE[p.trade].length ? GRIPE[p.trade] : [''], s >>> 5);
  const bits = [`I am ${who}${years}.`, what ? `${cap(what)}.` : '', rankLine ? `${cap(rankLine)}.` : '', feel ? `${feel}.` : '', state].filter(Boolean).join(' ');
  return `${p.first} says: "${bits}${payClause(p, s >>> 7)}${news}"`;
}

function homeTalk(p: Profile, c: Ctx): string {
  const s = mix(p.i, 13, c.salt);
  const bits: string[] = [];
  const we = p.spouse || p.kids > 0;
  if (p.chief && p.firm) {
    const where = p.district ? ` in ${p.district}` : '';
    const lines = p.wd > 400
      ? [`The house${where} is too big for ${we ? 'us' : 'one person'}, and I am hardly in it. ${p.firm.name} has the rest of me.`, `I keep a house${where} and a car that waits outside ${p.firm.name} more than it waits outside the house.`, `${we ? 'My family sees' : 'I see'} the house${where} on Sundays. The board sees me the other six days.`]
      : [`People think a chief lives on the hill. I live${where}, ${p.ownsHome ? 'in a house the bank still half owns' : 'in rooms I rent like anyone'}, and ${p.firm.name} pays me less than you would guess.`, `Home is${where}, and it is quiet, which is what I need after a day at ${p.firm.name}.`];
    const tail = p.stress > 100 ? ' I have not had an evening off in a month.' : p.kids > 0 ? ` The ${p.kids === 1 ? 'child thinks' : 'children think'} I work in a car.` : '';
    return `${p.first} turns the glass slowly. "${pick(lines, s)}${tail}"`;
  }
  if (p.district) {
    const own = p.ownsHome;
    const opts = we
      ? [own ? `We own a place in ${p.district}` : `We rent in ${p.district}`, own ? `Our house is in ${p.district}, and the mortgage is in every room of it` : `We have a flat in ${p.district}, two rooms and a view of the next wall`, own ? `We bought in ${p.district} before the prices went silly` : `We are renting in ${p.district} until something better comes up`]
      : [own ? `I own a little place in ${p.district}` : `I rent a room in ${p.district}`, own ? `My place is in ${p.district}, and it is mine, which still surprises me` : `I have rooms in ${p.district}, above a shop that opens too early`, own ? `I bought in ${p.district} on my own, which my mother still thinks was brave` : `I live in ${p.district}, on my own, and I like the quiet`];
    bits.push(p.wd > 500 && !own ? `I could buy, but I rent in ${p.district} and keep the money working` : pick(opts, s >>> 2));
  }
  if (p.kids > 0) bits.push(pick([`${p.kids === 1 ? 'one child' : `${p.kids} children`} at home`, `${p.kids === 1 ? 'a child who eats' : `${p.kids} kids who eat`} everything`], s));
  else if (p.spouse) bits.push(pick(['a quiet house with just the two of us', 'a partner who still laughs at my jokes'], s));
  const worry = p.health < 45 ? pick(['My back is not what it was.', 'The doctor says I should slow down, and I say the doctor can pay my rent.'], s)
    : p.stress > 120 ? pick(['I have not slept properly in a month.', 'I lie awake doing sums.'], s)
    : p.mood > 75 ? pick(['Honestly, life is good right now.', 'I am happier than I have a right to be.'], s)
    : p.wd < 60 ? pick(['The rent eats most of it, if you must know.', 'Every month the landlord arrives before the wage does.'], s)
    : pick(we ? ['We get by.', 'We manage, most months.', 'Nothing much to report, and we like it that way.', 'Sunday is ours, and that is enough.'] : ['I get by.', 'Nothing to report, and I like it that way.', 'It is a small life, but it is mine.', 'I keep it simple: work, a meal, a book.'], s);
  const trade = p.trade === 'quay' ? 'Evenings I am home by eight if a ship behaves.' : p.trade === 'money' ? 'I take the paperwork home, and the paperwork takes me.' : p.trade === 'clinic' ? 'My shifts mean the family eats without me, half the week.' : p.trade === 'shop' ? 'The weekends are not mine to plan.' : p.trade === 'owner' ? 'The firm comes home with me, whether I like it or not.' : '';
  const tail = [worry, trade].filter(Boolean).join(' ');
  if (!bits.length) return `${p.first} shrugs. "Not much to tell. Home is a room and a kettle. ${tail}"`;
  return `${p.first} warms to it. "${bits.join(', ')}. ${tail}"`;
}

function moneyTalk(w: World, p: Profile, c: Ctx): string {
  void w;
  const s = mix(p.i, 17, c.salt);
  if (p.hold) {
    return `${p.first} taps the bar. "${p.wd > 300
      ? pick([`I keep a few shares in ${p.hold.name}, ${p.hold.qty} of them. Only a little saved up, mind.`, `${p.hold.qty} shares of ${p.hold.name} are my cushion. I check the price more than I should.`], s)
      : pick([`I put most of what I have into ${p.hold.name}, ${p.hold.qty} shares, so I watch it like a hawk.`, `${p.hold.name} is my whole nest egg, ${p.hold.qty} shares. If it falls, I fall with it.`], s)}"`;
  }
  if (p.wd > 700) return `${p.first} says, lightly, "${pick(['Money is not the problem. The problem is finding something worth buying.', 'There is plenty of it, and it all wants to be somewhere safe.', `I have more cash than I know what to do with. ${p.trade === 'money' ? 'That is the sad part of my trade.' : 'Do not tell my accountant.'}`], s)}"`;
  if (p.wd < 40) return `${p.first} laughs without much humour. "${pick(['Payday to payday. I count in days, not dollars.', 'I am overdrawn on hope and the account is not far behind.', `The ${p.pay ? usd(p.pay) : 'wage'} lands on a Friday and is spoken for by Saturday.`], s)}"`;
  if (p.rank === 'chief' || p.trade === 'owner') return `${p.first} says "${pick(['A firm eats cash. What is left is what I take, and it is never the number I plan.', 'The money is in the firm, not in my pocket. That is how it works.'], s)}"`;
  return `${p.first} says "${pick(['I put a little by every month. It is not much. It is something.', 'I save what I can and I do not look at the total, so I do not get ideas.', 'A bit in the bank, a bit under the floorboard. Do not quote me.'], s)}"`;
}

function cityTalk(w: World, p: Profile, c: Ctx): string {
  const s = econ(w);
  const mix1 = mix(p.i, 19, c.salt);
  const u = (s.unemployment * 100).toFixed(1);
  const lines = [
    `"They say unemployment is ${u}% this month. ${p.jobless > 0 ? 'I do not need a paper to tell me.' : p.trade === 'money' ? 'In my trade it is a column in a report.' : 'Mine is the kind of job people queue for.'}"`,
    `"Prices again. Every week the basket costs more. ${p.kids > 0 ? 'Ask anyone with children.' : 'Ask anyone with a mouth.'}"`,
    `"The harbour is the heart of this city. When the ships are late, everyone feels it by Friday."`,
    p.trade === 'quay' ? `"The tides do not care about the market, but the market does care about the tides."` : p.trade === 'money' ? `"Rates, rates, rates. Everyone has a view and nobody has a position."` : p.trade === 'heavy' ? `"The city is built by people who do not live in the good districts."` : `"This city never stops, and neither do the rents."`,
  ];
  // What the papers carried this morning, in the speaker's own trade.
  const eds = (w.state.media as { paper?: { editions: { day: number; edition: string; stories: { headline: string; section: string; body: string; kicker: string }[] }[] } } | undefined)?.paper?.editions ?? [];
  const recent = eds.filter((e) => e.day >= w.day - 2).flatMap((e) => e.stories).filter((st) => !/^(Firm profile|Who runs it|The pay packet|The list|The numbers|Pay|Out last night|The diary|Next up)$/.test(st.kicker));
  const mine = recent.filter((st) => (p.trade === 'money' && /markets|bank|companies/.test(st.section)) || (p.trade === 'quay' && /port|industry/.test(st.section)) || (p.firm && st.headline.includes(p.firm.name)) || (p.trade === 'heavy' && /industry|labour/.test(st.section)));
  const story = mine[0] ?? recent[mix1 % Math.max(1, recent.length)];
  if (story && story.headline.length > 15) {
    const frames = [
      `${p.first} nods at the paper on the bar. "${story.headline}. You see how it goes."`,
      `${p.first} taps the paper. "Did you see this? ${story.headline}. ${p.trade === 'quay' ? 'The quay will feel that.' : p.trade === 'money' ? 'Somebody on the desk is smiling today.' : 'Typical.'}"`,
      `${p.first} says, "The paper has it: ${story.headline.replace(/\.$/, '')}. Not that anyone asked me."`,
    ];
    return pick(frames, mix1);
  }
  return `${p.first} says ${pick(lines, mix1)}`;
}

function insideTalk(w: World, p: Profile, c: Ctx): { text: string; gist: string } {
  const f = quietFact(w, p.i);
  if (f && c.score >= 45) {
    const msg = plainEvent(w, f.msg);
    return { text: `${p.first} checks who is listening. "Between us: ${msg} You did not hear it from me. It is not in the paper, and trading on it is your own risk."`, gist: 'something not yet public' };
  }
  if (p.recent) {
    return { text: `${p.first} lowers their voice. "Since you ask. ${p.recent.text}. That is why I am here tonight."`, gist: 'what is on their mind' };
  }
  if (p.firm && p.seats > 0 && p.decider) return { text: `${p.first} leans in. "Honestly? ${p.decider} will see someone this week about the open seats. Be there early."`, gist: 'who decides on hiring' };
  if (p.firm && p.gap < -1) return { text: `${p.first} leans in. "I have heard they are looking at the payroll at ${p.firm.name}. Newest first. Keep your head down."`, gist: 'cuts at their firm' };
  const s = mix(p.i, 29, c.salt);
  const own = p.chief && p.firm ? [`I run ${p.firm.name}, so everything I know is either public or a crime to repeat. I will tell you this much: the board is nervous, and boards are always nervous.`, `The truth about running ${p.firm.name}? Nobody tells me anything until it is too late to fix.`]
    : p.trade === 'money' ? ['If I knew anything worth trading, I would not be drinking here.', 'Half my desk is guessing and the other half is pretending not to.']
    : p.trade === 'quay' ? ['The only secret on the quay is which crane driver is sleeping with which foreman, and you do not want that.', 'Ships come in late because the paperwork does, not the weather. That is the whole secret.']
    : p.trade === 'clinic' ? ['We are short on the wards and nobody will say so in public. That is all I have.', 'The secret is that the night shift runs the hospital.']
    : p.trade === 'tech' ? ['We are behind on the project, as everyone always is. Do not tell the investors.', 'The demo works. The product does not, yet.']
    : p.trade === 'shop' ? ['The shrinkage numbers are terrible, and it is not the customers.', 'We are told to push the dear brand. That is the only secret in retail.']
    : p.jobless > 0 ? ['I have not told my family how long I have been looking. That is my secret.', 'I spend the mornings in the library so it looks like I go somewhere.']
    : p.mood < 40 ? ['I am thinking of leaving the city. Do not repeat it.', 'Some weeks I do not know why I bother. That stays here.']
    : ['Nothing worth a price. I just like that you listen.', 'I have no secrets worth the name, only a few opinions I keep to myself.', 'If I had a secret, you would be the one I told.'];
  return { text: `${p.first} ${pick(['hesitates, then smiles.', 'looks into the glass.', 'lowers their voice anyway.', 'shrugs.'], s >>> 4)} "${pick(own, s)}"`, gist: 'their trust' };
}

/** Coins: the crypto crowd talks launches and devs, the well off are polite and sceptical, a hand on a wage is wary, a chief keeps away. */
function coinTalk(w: World, p: Profile, c: Ctx): { text: string; delta: number } {
  const s = mix(p.i, 31, c.salt);
  const P = econ(w).P;
  const dev = (w.state.crypto as { dev?: Record<string, { dumps: number; good: number; launches: number }> } | undefined)?.dev?.[String(c.me)];
  const handle = c.me >= 0 ? handleOf(c.me) : '';
  const crowd = c.venue === 'neon' || c.venue === 'beaker' || P.age(w, p.i) < 30;
  const memes = (w.state.crypto as { memes?: { ticker: string; live: boolean; peak?: number; bornPx: number; rugged?: boolean }[] } | undefined)?.memes ?? [];
  const live = memes.filter((m) => m.live);
  const hot = live.slice().sort((a, b) => (b.peak ?? 0) / Math.max(1e-9, b.bornPx) - (a.peak ?? 0) / Math.max(1e-9, a.bornPx))[0];
  const rugged = memes.filter((m) => m.rugged).length;
  const mine = dev && dev.dumps ? ` ${crowd ? `Wait, you are ${handle}? You sold on your own holders. People here remember that.` : 'And I have heard about your coins, so do not try to sell me one.'}`
    : dev && dev.good ? ` ${crowd ? `You are ${handle}? Your last coin ran and you held. That is rarer than you think.` : 'I hear your coin did well. Good for you.'}` : '';
  let text: string;
  let delta = WARM.coins;
  if (p.chief) { text = pick([`${p.first} keeps off that board. A chief of ${p.firm?.name ?? 'a firm'} who is seen there loses the board.`, `Shareholders of ${p.firm?.name ?? 'the firm'} would have ${p.first}'s head for a dog coin.`], s); delta = 1; }
  else if (crowd) {
    text = pick([
      `${p.first} counts ${live.length} live coins tonight${hot ? `, and ${hot.ticker} is the one this room is in` : ''}. Three in the wallet, and ${p.first} believes in none of them.`,
      `${p.first} says it is the dev. If the dev holds, you hold. If the dev sells, you are the exit.${rugged ? ` ${rugged} pools pulled so far; ${p.first} was in two.` : ''}`,
      `${hot ? `${hot.ticker} ran ${Math.max(1, (hot.peak ?? hot.bornPx) / Math.max(1e-9, hot.bornPx)).toFixed(1)} times off the launch. ` : ''}${p.first} bought late, as always. That is the whole story.`,
    ], s);
    delta = WARM.coins + 2;
  } else if (p.wd > 400) text = pick([`${p.first} let a nephew explain them once. Someone was getting rich, and it was not the nephew.`, `${p.first} keeps money where a court can find it. Coins are for people who enjoy losing.`], s);
  else text = pick([`On ${p.first}'s wage at ${p.firm?.name ?? 'work'}? Gambling, and that is all a coin is.`, `Someone ${p.firm ? `at ${p.firm.name}` : 'at work'} lost a month's pay on a coin with a dog on it. ${p.first} does not need a second lesson.`, `${p.first} hears the young ones at ${p.firm?.name ?? 'the bar'} talk about it, and is not sure they understand it either.`], s);
  if (dev?.dumps && crowd) delta = -2;
  return { text: `${p.first} ${crowd ? 'lights up' : 'raises an eyebrow'}. "${text}${mine}"`, delta };
}

function chatTalk(p: Profile, c: Ctx): string {
  const l = [
    `${p.first} laughs. "Another one? Fine. Ask me anything."`,
    `${p.first} clinks your glass. "Good company is the cheapest thing here."`,
    `${p.first} tells a long story about a ferry, a goat and a customs officer. You are not sure it is true. It is very funny.`,
    `${p.first} tells you the best seat in the place, the worst beer on the menu, and why the barman has not spoken to the owner since March.`,
    `${p.first} argues, cheerfully, about whether the tram or the ferry is the slower way to be late.`,
  ];
  return pick(l, mix(p.i, 23, c.salt));
}

/** One exchange. `c.covered` are the rungs already climbed with this person; the next unclimbed rung is chosen unless a topic is asked for. */
export function converse(w: World, c: Ctx): Said {
  const p = profileOf(w, c.who);
  // "Keep talking" moves on to the next rung they are ready for. Only a topic you ask for can be one they are not ready for.
  let topic: Topic = c.word ?? (c.first ? 'hello' : LADDER.find((t) => !c.covered.includes(t) && c.score >= NEED[t]) ?? 'chat');
  if (c.first) topic = 'hello';
  const gated = c.score < NEED[topic] && topic !== 'hello';
  const remembered = !c.first && c.memory && c.memory.met >= 1 && c.depth > 0 && !c.word ? recall(p, c) : '';
  if (gated) {
    const sharp = c.covered.includes(topic) ? '' : ` ${p.first} changes the subject.`;
    const why = topic === 'inside' ? 'That is not something to say over one drink.' : topic === 'money' ? 'We have not known each other that long.' : 'That is a bit much for a first few drinks.';
    return { topic, text: `${remembered ? remembered + ' ' : ''}${p.first} smiles, but the answer is thin. "${why}"${sharp}`, delta: 1, gated: true, gist: 'they were not ready' };
  }
  let text = '';
  let gist = '';
  switch (topic) {
    case 'hello': text = open(p, c) + pastNod(w, p, c); gist = 'who they are'; break;
    case 'work': text = workTalk(w, p, c); gist = p.firm ? `what is happening at ${p.firm.name}` : 'the search for work'; break;
    case 'home': text = homeTalk(p, c); gist = 'home and family'; break;
    case 'money': text = moneyTalk(w, p, c); gist = 'money'; break;
    case 'city': text = cityTalk(w, p, c); gist = 'the city'; break;
    case 'inside': { const r = insideTalk(w, p, c); text = r.text; gist = r.gist; break; }
    case 'coins': { const r = coinTalk(w, p, c); text = r.text; gist = 'coins'; if (remembered) text = `${remembered} ${text}`; return { topic, text, delta: r.delta, gated: false, gist }; }
    default: text = chatTalk(p, c); gist = 'small talk';
  }
  if (remembered) text = `${remembered} ${text}`;
  const repeat = c.covered.includes(topic) && topic !== 'chat';
  const shared = p.firm && (lifeOf(w)?.past ? findPast(lifeOf(w)?.past)?.sector === p.firm.sector : false) ? 2 : 0;
  const delta = Math.max(1, WARM[topic] + shared - (repeat ? 3 : 0) + (c.recog && topic === 'hello' ? 8 : 0) + (remembered ? 1 : 0));
  return { topic, text, delta, gated: false, gist };
}

export { unit, mix };
