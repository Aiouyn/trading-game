// What people at a bar say. Nobody has a canned line: each exchange draws on who they are (job, firm, home, family),
// what they own, what is happening to them this week, and how well they know the player. A conversation is a
// ladder of exchanges: greeting, work, home, money, the city, and finally something said in confidence. Deeper
// rungs open as the bond grows. Nothing here draws from a random stream: the same people say the same things.
import type { World } from '../../kernel/index.ts';
import { DEP, type EconState, type Firm } from '../economy/index.ts';
import { firmGap, roleTitle } from '../careers/jobs.ts';
import { parcelView } from '../property/index.ts';
import { quietFact } from '../social/index.ts';
import { usd } from '../player/gamedate.ts';
import { findPast, lifeOf } from '../player/arrival.ts';

export type Topic = 'hello' | 'work' | 'home' | 'money' | 'city' | 'inside' | 'chat';
export const LADDER: Topic[] = ['hello', 'work', 'home', 'money', 'city', 'inside'];
/** The bond a rung needs before people open up about it. */
const NEED: Record<Topic, number> = { hello: 0, work: 12, home: 22, money: 30, city: 14, inside: 45, chat: 0 };
/** How much an exchange on a rung warms the bond. */
const WARM: Record<Topic, number> = { hello: 6, work: 4, home: 5, money: 4, city: 3, inside: 7, chat: 2 };

export const TOPIC_WORDS: Record<string, Topic> = {
  hello: 'hello', work: 'work', job: 'work', jobs: 'work', firm: 'work', home: 'home', family: 'home', life: 'home',
  money: 'money', cash: 'money', shares: 'money', city: 'city', news: 'city', inside: 'inside', private: 'inside', secret: 'inside', chat: 'chat',
};

const econ = (w: World): EconState => w.state.economy as EconState;
const unit = (x: number): number => x / 4294967296;
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}
function pick<T>(list: T[], salt: number): T { return list[salt % list.length]; }

export type Facet = 'warm' | 'formal' | 'blunt' | 'anxious' | 'proud';
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
  return {
    i, name: P.name(i), first: P.name(i).split(' ')[0], age: P.age(w, i), firm, chief,
    role: firm && P.occ[i] > 0 ? roleTitle(firm.sector, P.occ[i]) : chief ? 'chief' : '',
    years: P.occYrs[i], jobless: P.jobless[i],
    spouse: P.spouse[i] >= 0 && P.alive(P.spouse[i]), kids: P.nkids[i],
    district: pv?.neighbourhood ?? '', ownsHome: pv ? pv.owner === i : false,
    wd, health: P.health[i], stress: P.stress[i], mood: P.mood[i],
    gap, seats: gap > 1 ? Math.floor(gap) : 0, profit: firm?.lastProfit ?? 0,
    decider, hold, recent, facet: facetOf(w, i),
  };
}

/** A firm somewhere else that really is short of hands, so a jobless person can point to it. */
export function aFirmHiring(w: World, salt: number, not: number): Firm | undefined {
  const open = econ(w).firms.filter((f) => !f.closed && f.idx !== not && firmGap(w, f) > 1);
  return open.length ? pick(open, salt) : undefined;
}

export interface Said { topic: Topic; text: string; delta: number; gated: boolean; gist: string }

export interface Ctx {
  me: number; who: number; venue: string; venueName: string;
  score: number; depth: number; covered: string[]; recog?: string; first: boolean;
  salt: number; word?: Topic;
}

function open(p: Profile, c: Ctx): string {
  const lead: Record<Facet, string[]> = {
    warm: [`${p.first} waves you onto the next stool. "Sit down, sit down. I'm ${p.first}. Haven't seen you in here before."`, `${p.first} grins. "A new face! I'm ${p.first}. First drink's the hardest."`],
    formal: [`${p.name} inclines their head. "Good evening. ${p.name}. I don't think we have met."`, `"${p.name}," they say, and offer a dry, firm handshake. "And you are?"`],
    blunt: [`${p.first} looks you up and down. "New. I'm ${p.first}. Don't take the end stool, it's spoken for."`, `"Another stranger," says ${p.first}. "Fine. ${p.first}. Buy your own."`],
    anxious: [`${p.first} startles, then smiles. "Oh. Hello. Sorry, I was miles away. ${p.first}."`, `"Hello?" ${p.first} glances at the door, then back. "Yes, sorry. ${p.first}."`],
    proud: [`"${p.name}," says ${p.first}, as if you ought to know it. "And you would be...?"`, `${p.first} straightens. "${p.first}. People round here know me. You're new."`],
  };
  let text = pick(lead[p.facet], c.salt);
  if (c.recog) text = `${p.first} looks twice, then points. "I know you. We ${c.recog}, years back. ${p.first}, remember?" The memory is a little hazy on both sides, but it is warm.`;
  return text;
}

function pastNod(w: World, p: Profile, c: Ctx): string {
  const life = lifeOf(w);
  const past = findPast(life?.past);
  const sector = p.firm?.sector ?? '';
  if (!past || !past.sector || sector !== past.sector || c.recog) return '';
  return ` ${p.first} sizes up your hands. "${past.name}? I can always tell. Same trade here."`;
}

export function workTalk(w: World, p: Profile, c: Ctx): string {
  const f = p.firm;
  if (!f) {
    const hiring = aFirmHiring(w, c.salt, -1);
    const weeks = Math.max(1, Math.round(p.jobless / 7));
    const state = p.jobless > 6 ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} without work.` : 'Between jobs.';
    const tip = hiring ? ` ${hiring.name} is taking people on, ${Math.max(1, Math.floor(firmGap(w, hiring)))} seats at least. Go in early.` : ' Nobody is taking anyone on, not this week.';
    return `${p.first} turns the glass in their hands. "${state}${tip}"`;
  }
  const seats = p.seats > 0 ? `${p.seats} ${p.seats === 1 ? 'seat is' : 'seats are'} open` : '';
  const vouch = c.score >= 28 ? ` Say ${p.first} sent you and it won't hurt.` : '';
  const state = p.seats > 0
    ? `We are short of hands at ${f.name}: ${seats} right now${p.decider ? `, and ${p.decider} decides who fills them` : ''}.${vouch}`
    : p.gap < -1
      ? `${f.name} is carrying more people than it needs. Nobody says it out loud, but I'd not be buying a house.`
      : f.lastProfit < 0
        ? `It is a thin year at ${f.name}. Orders are slow and the talk upstairs is about costs.`
        : `${f.name} is steady. Not exciting, but the wages arrive.`;
  if (p.chief) {
    const month = f.lastProfit > 0 ? `We made ${usd(f.lastProfit)} last month, so I can't complain` : f.lastProfit < 0 ? `We lost ${usd(-f.lastProfit)} last month and I'm not sleeping` : 'We broke about even last month';
    return `${p.first} leans back. "I run ${f.name}. ${month}. ${p.seats > 0 ? `I'm hiring: ${seats}, and the decision is mine.` : 'Hiring is on hold.'}"`;
  }
  const job = p.role ? `${p.role} at ${f.name}` : `at ${f.name}`;
  const years = p.years > 0 ? `, ${p.years} ${p.years === 1 ? 'year' : 'years'} now` : '';
  return `${p.first} says: "I'm ${p.role ? (/^[aeiou]/i.test(p.role) ? 'an ' : 'a ') : 'working '}${job}${years}. ${state}"`;
}

function homeTalk(p: Profile, c: Ctx): string {
  const bits: string[] = [];
  if (p.district) bits.push(`${p.ownsHome ? 'We own a place in' : 'We rent in'} ${p.district}`);
  if (p.kids > 0) bits.push(`${p.kids === 1 ? 'one child' : `${p.kids} children`} at home`);
  else if (p.spouse) bits.push('a quiet house with just the two of us');
  const worry = p.health < 45 ? 'My back is not what it was.' : p.stress > 120 ? 'I have not slept properly in a month.' : p.mood > 75 ? 'Honestly, life is good right now.' : p.wd < 60 ? 'The rent eats most of it, if you must know.' : 'We get by.';
  if (!bits.length) return `${p.first} shrugs. "Not much to tell. Home is a room and a kettle. ${worry}"`;
  return `${p.first} warms to it. "${bits.join(', ')}. ${worry}"`;
}

function moneyTalk(w: World, p: Profile, c: Ctx): string {
  void w;
  if (p.hold) return `${p.first} taps the bar. "I keep a few shares in ${p.hold.name}, ${p.hold.qty} of them. ${p.wd > 300 ? 'It is only a little saved up, mind.' : 'It is most of what I have, so I watch it like a hawk.'}"`;
  if (p.wd > 700) return `${p.first} says, lightly, "Money is not the problem. The problem is finding something worth buying."`;
  if (p.wd < 40) return `${p.first} laughs without much humour. "Payday to payday. I count in days, not dollars."`;
  return `${p.first} says "I put a little by every month. It is not much. It is something."`;
}

function cityTalk(w: World, p: Profile, c: Ctx): string {
  const s = econ(w);
  const u = (s.unemployment * 100).toFixed(1);
  const lines = [
    `"They say unemployment is ${u}% this month. ${p.jobless > 0 ? 'I do not need a paper to tell me.' : 'Mine is the kind of job people queue for.'}"`,
    `"Prices again. Every week the basket costs more. ${p.kids > 0 ? 'Ask anyone with children.' : 'Ask anyone with a mouth.'}"`,
    `"The harbour is the heart of this city. When the ships are late, everyone feels it by Friday."`,
  ];
  const col = w.events.recent(['media.column'], 6).reverse().find((e) => w.day - e.day <= 10);
  if (col) {
    const m = /^([^:|]{3,40}): (.+)$/.exec(col.msg.split('||')[0]);
    if (m) {
      const line = m[2].split(' — ')[0].split(/[.!?]\s/)[0].slice(0, 120).replace(/[.]+$/, '');
      if (line.length > 20) return `${p.first} nods at the paper on the bar. "${m[1].trim()}: ${line.replace(/[.,\s]+$/, '')}. You see how it goes."`;
    }
  }
  return `${p.first} says ${pick(lines, c.salt)}`;
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
  return { text: `${p.first} hesitates, then smiles. "There is nothing I'd call a secret. I like talking to you. That is rare enough."`, gist: 'their trust' };
}

function chatTalk(p: Profile, c: Ctx): string {
  const l = [
    `${p.first} laughs. "Another one? Fine. Ask me anything."`,
    `${p.first} clinks your glass. "Good company is the cheapest thing here."`,
    `${p.first} tells a long story about a ferry, a goat and a customs officer. You are not sure it is true. It is very funny.`,
  ];
  return pick(l, c.salt);
}

/** One exchange. `c.covered` are the rungs already climbed with this person; the next unclimbed rung is chosen unless a topic is asked for. */
export function converse(w: World, c: Ctx): Said {
  const p = profileOf(w, c.who);
  let topic: Topic = c.word ?? (c.first ? 'hello' : LADDER.find((t) => !c.covered.includes(t)) ?? 'chat');
  if (c.first) topic = 'hello';
  const gated = c.score < NEED[topic] && topic !== 'hello';
  if (gated) {
    const sharp = c.covered.includes(topic) ? '' : ` ${p.first} changes the subject.`;
    const why = topic === 'inside' ? 'That is not something to say over one drink.' : topic === 'money' ? 'We have not known each other that long.' : 'That is a bit much for a first few drinks.';
    return { topic, text: `${p.first} smiles, but the answer is thin. "${why}"${sharp}`, delta: 1, gated: true, gist: 'they were not ready' };
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
    default: text = chatTalk(p, c); gist = 'small talk';
  }
  const repeat = c.covered.includes(topic) && topic !== 'chat';
  const shared = p.firm && (lifeOf(w)?.past ? findPast(lifeOf(w)?.past)?.sector === p.firm.sector : false) ? 2 : 0;
  const delta = Math.max(1, WARM[topic] + shared - (repeat ? 3 : 0) + (c.recog && topic === 'hello' ? 8 : 0));
  return { topic, text, delta, gated: false, gist };
}

export { unit, mix };
