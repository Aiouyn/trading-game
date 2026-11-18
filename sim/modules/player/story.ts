// One story a week for this player: the few events that reach them, as a sentence with its cause.
// A chain that ends in their pay, their loan or their shares is one line, not one line per hop.
import type { World } from '../../kernel/index.ts';
import type { Ev } from '../../kernel/events.ts';
import { SHOCKS } from '../economy/content.ts';
import { DEP, type EconState } from '../economy/index.ts';
import { dollarsMentioned } from '../history/prose.ts';
import { contactsOf } from '../social/index.ts';

export interface StoryLine {
  day: number;
  text: string;
  eventId: number;
  weight: number;
  /** Dollars at stake, in cents. A month is ranked by this. */
  stake?: number;
  /** Set when a later week of the same month should fold into this line. */
  fold?: string;
}

/** Seat fields this file reads and writes. The player module owns the object. */
export interface StorySeat {
  who: number;
  arrived: number;
  heard: { factId: number }[];
  story?: StoryLine[];
}

const econ = (w: World): EconState => w.state.economy as EconState;

const BASE: Record<string, number> = {
  'player.arrive': 40_000,
  'player.twist': 120_000,
  'player.heir': 200_000,
  'player.died': 400_000,
  'player.wed': 150_000,
  'player.birth': 180_000,
  'player.health': 60_000,
  'player.retire': 50_000,
  'player.home': 40_000,
  'person.died': 250_000,
  'person.breakdown': 80_000,
  'health.injury': 90_000,
  'firm.layoffs': 70_000,
  'firm.cashCrunch': 90_000,
  'firm.failed': 300_000,
  'firm.default': 300_000,
  'firm.ceoFired': 120_000,
  'firm.succession': 80_000,
  'firm.takeover': 200_000,
  'firm.price': 25_000,
  'firm.stockout': 20_000,
  'firm.inputShort': 20_000,
  'mkt.move': 35_000,
  'cb.rate': 50_000,
  'macro.wage': 30_000,
  'macro.cpi': 20_000,
  'macro.jobs': 15_000,
  'loan.grant': 40_000,
  'loan.margin': 150_000,
  'loan.line': 150_000,
  'loan.default': 200_000,
  'loan.refused': 30_000,
  'property.repossess': 250_000,
  'property.evict': 180_000,
  'property.mortgage': 40_000,
  'property.sale': 30_000,
  'bank.fail': 400_000,
  'bank.run': 200_000,
  'law.verdict': 300_000,
  'law.judgment': 300_000,
};

const SKIP = new Set([
  'player.stat', 'player.scenario', 'macro.demand', 'macro.cpi.who', 'macro.jobs.who', 'macro.pay',
  'firm.ask', 'firm.staff', 'firm.insider', 'mkt.open', 'mkt.who', 'genesis',
  'life.pay', 'life.spend', 'life.cash',
]);

function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const n = Math.abs(Math.round(cents));
  return sign + '$' + (n / 100).toLocaleString('en-US', { maximumFractionDigits: n % 100 === 0 ? 0 : 2 });
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function firmName(s: EconState, id: string | undefined): string {
  if (!id) return '';
  if (id === 'bank_1') return 'the bank';
  const f = s.firms.find((x) => x.id === id);
  return f?.name ?? '';
}

function personName(s: EconState, id: string | undefined): string {
  if (!id || !id.startsWith('p_')) return '';
  const i = Number(id.slice(2));
  return i >= 0 && i < s.P.n ? s.P.name(i) : '';
}

function soften(s: EconState, text: string): string {
  return text
    .replace(/\beq:frm_([a-z0-9_]+)/gi, (_, key: string) => {
      const name = firmName(s, 'frm_' + key);
      return name ? `${name} shares` : key;
    })
    .replace(/\beq:bank_1\b/g, 'the bank\'s shares')
    .replace(/\bfrm_([a-z0-9_]+)/gi, (_, key: string) => firmName(s, 'frm_' + key) || key)
    .replace(/\bbank_1\b/g, 'the bank')
    .replace(/\bp_(\d+)\b/g, (_, n: string) => personName(s, 'p_' + n) || 'someone');
}

function cap(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function unperiod(text: string): string {
  return text.replace(/[.]+$/, '').trim();
}

/** A module may put the real cause after ` || `. The sentence uses that, not an earlier event. */
function bareMsg(msg: string): string {
  const i = msg.indexOf(' || ');
  return i < 0 ? msg : msg.slice(0, i);
}

function statedCause(msg: string): string {
  const i = msg.indexOf(' || ');
  return i < 0 ? '' : msg.slice(i + 4).trim().replace(/\.$/, '');
}

interface Circle {
  i: number;
  pid: string;
  name: string;
  employerId: string;
  employerName: string;
  /** Goods the employer and the holdings make, so a shock can be seen to reach the player. */
  goods: string[];
  /** Actor id -> how close, and a phrase for them. */
  close: Map<string, { n: number; phrase: string }>;
  held: Map<string, number>;
  cash: number;
  deposits: number;
  mortgage: number;
  loan: number;
  employed: boolean;
}

function circleOf(w: World, seat: StorySeat, i: number): Circle {
  const s = econ(w), P = s.P;
  const close = new Map<string, { n: number; phrase: string }>();
  const put = (id: string, n: number, phrase: string): void => {
    const prev = close.get(id);
    if (!prev || n > prev.n) close.set(id, { n, phrase });
  };
  const pid = P.id(i);
  put(pid, 8, 'You');
  const sp = P.spouse[i];
  if (sp >= 0 && sp < P.n) put(P.id(sp), 6, `Your spouse ${P.name(sp)}`);
  for (const k of P.kids(i)) if (k >= 0 && k < P.n) put(P.id(k), 6, `Your child ${P.name(k)}`);
  const parent = P.parent[i];
  if (parent >= 0 && parent < P.n) put(P.id(parent), 5, `Your parent ${P.name(parent)}`);
  for (const c of contactsOf(w, i)) {
    if (c.who === i || c.who < 0 || c.who >= P.n) continue;
    put(P.id(c.who), 3, `${P.name(c.who)}, whom you know`);
  }
  const emp = P.employer[i];
  const firm = emp >= 0 ? s.firms[emp] : undefined;
  if (firm) put(firm.id, 5, `Your employer ${firm.name}`);
  const held = new Map<string, number>();
  const stocks = (w.state.markets as { stocks?: { instr: string; issuer: string; last: number }[] } | undefined)?.stocks ?? [];
  for (const st of stocks) {
    const qty = Math.floor(w.ledger.balance(pid, st.instr));
    if (qty < 1) continue;
    held.set(st.issuer, qty * st.last);
    const name = firmName(s, st.issuer) || st.issuer;
    put(st.issuer, 4, `${name}, which you hold`);
  }
  const goods: string[] = [];
  if (firm) goods.push(firm.good);
  for (const id of held.keys()) {
    const f = s.firms.find((x) => x.id === id);
    if (f && !goods.includes(f.good)) goods.push(f.good);
  }
  const facts = (w.state.social as { facts?: { id: number; firms: number[] }[] } | undefined)?.facts;
  if (facts) for (const h of seat.heard) {
    const fact = facts[h.factId];
    if (!fact) continue;
    for (const fi of fact.firms) {
      const f = s.firms[fi];
      if (f) put(f.id, 2, f.name);
    }
  }
  let deposits = 0;
  const banks = (w.state.banking as { banks?: { depo: string }[] } | undefined)?.banks ?? [];
  for (const b of banks) deposits += Math.floor(w.ledger.balance(pid, b.depo));
  let mortgage = 0, loan = 0;
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnKind: Uint8Array } | undefined;
  if (book) for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i) continue;
    const owed = Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (book.lnKind[k] === 1) mortgage += owed;
    else loan += owed;
  }
  return {
    i, pid, name: P.name(i),
    employerId: firm?.id ?? '',
    employerName: firm?.name ?? '',
    goods,
    close, held,
    cash: Math.floor(w.ledger.balance(pid, DEP)),
    deposits, mortgage, loan,
    employed: !!firm,
  };
}

function shockTouch(kind: string, good: string): boolean {
  if (!kind.startsWith('shock.') || !good) return false;
  const id = kind.slice(6);
  const def = SHOCKS.find((x) => x.id.toLowerCase() === id);
  if (!def) return false;
  return def.prod[good] !== undefined || def.prod.ALL !== undefined || def.demand[good] !== undefined;
}

function closeness(ev: Ev, c: Circle): number {
  if (SKIP.has(ev.kind)) return 0;
  const hit = ev.actor ? c.close.get(ev.actor) : undefined;
  let n = hit?.n ?? 0;
  if (ev.kind === 'cb.rate' && (c.cash > 0 || c.deposits > 0 || c.loan > 0 || c.mortgage > 0 || c.employed)) n = Math.max(n, 4);
  if (ev.kind === 'macro.wage' && c.employed) n = Math.max(n, 4);
  if (ev.kind === 'macro.cpi' && c.employed) n = Math.max(n, 2);
  if (ev.kind === 'macro.jobs' && c.employed) n = Math.max(n, 2);
  if (ev.kind.startsWith('shock.')) {
    const touched = c.goods.some((g) => shockTouch(ev.kind, g));
    n = Math.max(n, touched ? 5 : 2);
  }
  if (!n && c.employerName && ev.msg.includes(c.employerName)) n = 5;
  if (!n && ev.msg.includes(c.name)) n = 7;
  return n;
}

function stake(ev: Ev, c: Circle): number {
  let n = dollarsMentioned(ev.msg);
  const pct = /([+-]?\d+(?:\.\d+)?)%/.exec(ev.msg);
  if (pct && ev.actor && c.held.has(ev.actor)) {
    const move = Math.round((c.held.get(ev.actor) ?? 0) * Math.abs(Number(pct[1])) / 100);
    if (move > n) n = move;
  }
  return n;
}

function baseOf(kind: string): number {
  if (kind.startsWith('shock.')) return 100_000;
  return BASE[kind] ?? 8_000;
}

function weekEvents(w: World, fromDay: number, toDay: number): Ev[] {
  const out: Ev[] = [];
  for (let id = w.events.count - 1; id >= 0; id--) {
    const e = w.events.get(id);
    if (!e) break;
    if (e.day < fromDay) break;
    if (e.day <= toDay) out.push(e);
  }
  out.reverse();
  return out;
}

/** A cause fragment: one clause, cut on a word, with a leading capital left on a name. */
function asCause(msg: string): string {
  const cut = (msg.split(/[;]/)[0] ?? msg).trim();
  let bit = cut;
  if (bit.length > 150) {
    const slice = bit.slice(0, 150);
    const sp = slice.lastIndexOf(' ');
    bit = (sp > 70 ? slice.slice(0, sp) : slice).trim();
  }
  const first = bit.split(' ')[0] ?? '';
  if (/^(the|a|an|sales|wages|prices|household|unemployment|jobs|news|could|no|sold)/i.test(first)) {
    return bit.charAt(0).toLowerCase() + bit.slice(1);
  }
  return bit;
}

function markBareDollars(text: string): string {
  const usd = (n: string): string => '$' + Number(n).toLocaleString('en-US');
  return text
    .replace(/orders machinery for (\d+)/g, (_, n: string) => `orders machinery for ${usd(n)}`)
    .replace(/a profit of (\d+) dollars/g, (_, n: string) => `a profit of ${usd(n)}`)
    .replace(/loan of (\d+) from/g, (_, n: string) => `loan of ${usd(n)} from`)
    .replace(/borrows (\d+)/g, (_, n: string) => `borrows ${usd(n)}`)
    .replace(/profit of (\d+) leaks/g, (_, n: string) => `profit of ${usd(n)} leaks`)
    .replace(/loss of (\d+) leaks/g, (_, n: string) => `loss of ${usd(n)} leaks`)
    .replace(/wage at (\d+) a day/g, (_, n: string) => `wage at $${n} a day`);
}

function clause(s: EconState, ev: Ev): string {
  const msg = unperiod(soften(s, bareMsg(ev.msg)));
  if (ev.kind === 'earnings.report' || ev.kind === 'news.story') {
    const profit = /profit (\$[\d.,]+[kKmMbB]?)/.exec(msg);
    const name = /([A-Za-z][A-Za-z' ]{2,40}) Q\d/.exec(msg);
    if (profit) return `${name?.[1] ?? 'the firm'} posted profit of ${profit[1]}`;
  }
  if (ev.kind === 'cb.rate') {
    const m = /policy rate ([0-9.]+)% -> ([0-9.]+)%/.exec(ev.msg);
    if (m) {
      const dir = Number(m[2]) > Number(m[1]) ? 'raised' : Number(m[2]) < Number(m[1]) ? 'cut' : 'held';
      return `the central bank ${dir} the policy rate from ${m[1]}% to ${m[2]}%`;
    }
  }
  if (ev.kind === 'mkt.move') {
    const m = /close (\d+) -> (\d+) \(([+-][\d.]+)%\)/.exec(ev.msg);
    if (m) {
      const dir = Number(m[2]) < Number(m[1]) ? 'fell' : 'rose';
      const name = firmName(s, ev.actor) || 'the shares';
      return `${name} shares ${dir} ${m[3].replace(/^[+-]/, '')}% to ${dollars(Number(m[2]))}`;
    }
  }
  if (ev.kind === 'firm.price') {
    const m = /^(.+?) price ([+-][\d.]+)%/.exec(msg);
    if (m) {
      const dir = m[2].startsWith('-') ? 'fell' : 'rose';
      return `${m[1]} ${dir} ${m[2].replace(/^[+-]/, '')}%`;
    }
  }
  if (ev.kind === 'macro.wage') return msg.replace(/^wages /i, 'wages ');
  if (ev.kind === 'macro.cpi') return msg.replace(/^CPI /i, 'prices ');
  if (ev.kind === 'macro.jobs') return msg;
  if (ev.kind.startsWith('shock.')) return msg.charAt(0).toLowerCase() + msg.slice(1);
  if (ev.kind === 'player.arrive') {
    const m = /takes a job at (.+)$/.exec(msg);
    if (m) return `you took a job at ${m[1]}`;
  }
  if (ev.kind === 'genesis') return '';
  return asCause(msg);
}

/** Up to two earlier causes, as "a after b". Skips the event itself and anything already said. */
function because(w: World, ev: Ev, avoid: string): string {
  const s = econ(w);
  const parts: string[] = [];
  const seen = new Set<number>([ev.id]);
  const walk = (id: number, depth: number): void => {
    if (depth > 4 || parts.length >= 2) return;
    const e = w.events.get(id);
    if (!e || seen.has(e.id)) return;
    seen.add(e.id);
    if (e.kind !== 'genesis' && e.kind !== 'player.stat' && e.kind !== 'macro.demand') {
      const bit = clause(s, e);
      const key = bit.slice(0, 24);
      const profit = /profit of (\$[\d.,]+[kKmMbB]?)/.exec(bit);
      const repeated = !!(profit && avoid.includes(profit[1]));
      if (bit && !repeated && !parts.includes(bit) && !(avoid && key && avoid.toLowerCase().includes(key.toLowerCase()))) parts.push(bit);
    }
    for (const c of e.causes) walk(c, depth + 1);
  };
  for (const c of ev.causes) walk(c, 0);
  return parts.join(' after ');
}

function secondPerson(msg: string, name: string): string {
  const lead = msg.startsWith(name + ' ') ? msg.slice(name.length + 1) : '';
  if (!lead) return msg.replaceAll(name, 'you');
  const verb: Record<string, string> = {
    arrives: 'arrive', takes: 'take', works: 'work', pays: 'pay', gives: 'give', sees: 'see',
    retires: 'retire', dies: 'die', marries: 'marry', courts: 'court', writes: 'write', hands: 'hand',
    reports: 'report', moves: 'move', mortgages: 'mortgage', lets: 'let', sells: 'sell', bids: 'bid',
    buys: 'buy', leaves: 'leave', starts: 'start', finishes: 'finish',
    is: 'are', has: 'have', counts: 'count', quits: 'quit', loses: 'lose', joins: 'join',
  };
  const fixed = lead.replace(/^[a-z]+/, (v) => verb[v] ?? v);
  return 'You ' + fixed;
}

function effectOf(w: World, ev: Ev, c: Circle): string {
  const s = econ(w);
  const msg = unperiod(soften(s, bareMsg(ev.msg)));
  const hit = ev.actor ? c.close.get(ev.actor) : undefined;
  const sub = hit?.phrase ?? '';
  if (ev.actor === c.pid || msg.startsWith(c.name)) {
    if (ev.kind === 'player.arrive') {
      if (/holds no job/.test(msg)) return 'You hold no job';
      const at = /takes a job at (.+)$/.exec(msg);
      if (at) return `You take a job at ${at[1]}`;
      return `You take a job at ${c.employerName || 'a firm'}`;
    }
    if (ev.kind === 'loan.grant') {
      const m = /takes a (.+) of (\d+) from (\S+) at ([\d.]+)%/.exec(msg);
      if (m) {
        const kind = /^[aeiou]/i.test(m[1]) ? `an ${m[1]}` : `a ${m[1]}`;
        return `You take ${kind} of $${Number(m[2]).toLocaleString('en-US')} from ${m[3].replace(/_/g, ' ')} at ${m[4]}%`;
      }
    }
    if (ev.kind === 'loan.margin') return `The bank calls your margin loan`;
    if (ev.kind === 'loan.line') return `The bank calls your credit line`;
    return unperiod(secondPerson(msg, c.name));
  }
  if (ev.kind === 'earnings.report' || ev.kind === 'news.story') {
    const profit = /profit (\$[\d.,]+[kKmMbB]?)/.exec(msg);
    const name = /([A-Za-z][A-Za-z' ]{2,40}) Q\d/.exec(msg);
    const who = name?.[1] ?? (sub ? sub.replace(/, which you hold$/, '') : '');
    if (profit && who) return `${who} reports profit of ${profit[1]} for the quarter`;
  }
  if (ev.kind === 'firm.layoffs') {
    const who = sub ? (sub.includes(',') ? `${sub},` : sub) : '';
    return who ? `${who} cut jobs` : cap(msg);
  }
  if (ev.kind === 'firm.cashCrunch') return `${sub || 'A firm'} could not meet its wage bill`;
  if (ev.kind === 'firm.default' || ev.kind === 'firm.failed') return `${sub || 'A firm'} failed`;
  if (ev.kind === 'firm.ceoFired') return `${sub || 'A firm'} removed its chief`;
  if (ev.kind === 'mkt.move') {
    const bit = clause(s, ev);
    return cap(bit || msg);
  }
  if (ev.kind === 'cb.rate') return rateReach(ev, c);
  if (ev.kind === 'macro.wage') return `Your pay moves with the city wage: ${msg}`;
  if (ev.kind === 'macro.cpi') return `Prices move, and so does what your pay buys: ${msg.replace(/^CPI /i, '')}`;
  if (ev.kind === 'macro.jobs') return `The city is hiring around you: ${msg}`;
  if (ev.kind.startsWith('shock.')) {
    const where = c.employerName ? `, and ${c.employerName} works in that weather` : '';
    return cap(msg) + where;
  }
  if (sub && (ev.kind.startsWith('firm.') || ev.kind.startsWith('loan.') || ev.kind.startsWith('property.'))) {
    const name = firmName(s, ev.actor) || personName(s, ev.actor);
    const rest = name && msg.toLowerCase().startsWith(name.toLowerCase())
      ? msg.slice(name.length).replace(/^[\s,:–-]+/, '')
      : '';
    const who = sub.includes(',') ? `${sub},` : sub;
    if (rest) return `${who} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
    return `${who}: ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`;
  }
  return cap(msg);
}

function rateReach(ev: Ev, c: Circle): string {
  const bits: string[] = [];
  if (c.mortgage > 0) bits.push(`the ${dollars(c.mortgage)} mortgage on your home`);
  if (c.loan > 0) bits.push(`the ${dollars(c.loan)} you owe`);
  if (c.deposits > 0) bits.push(`the ${dollars(c.deposits)} on time deposit`);
  if (c.cash > 0) bits.push(`the ${dollars(c.cash)} in cash`);
  const m = /policy rate ([0-9.]+)% -> ([0-9.]+)%/.exec(ev.msg);
  const move = m ? `the policy rate going from ${m[1]}% to ${m[2]}%` : 'the policy rate moving';
  if (!bits.length) return `The central bank changes ${move}, and your wage at ${c.employerName || 'work'} sits under it`;
  return `The rate move reaches ${joinAnd(bits)}`;
}

function sentence(w: World, ev: Ev, c: Circle): string {
  const effect = unperiod(effectOf(w, ev, c));
  const stated = statedCause(ev.msg);
  if (stated) return markBareDollars(`${effect}, because ${stated}.`);
  if (ev.kind === 'player.arrive') {
    if (/holds no job/.test(ev.msg)) return `${effect}.`;
    const wage = dollars(econ(w).wage);
    return `${effect}, because the city wage is ${wage} a day and ${c.employerName || 'the firm'} had room on the line.`;
  }
  let cause = because(w, ev, effect);
  if (ev.kind === 'cb.rate') {
    const bit = clause(econ(w), ev);
    cause = cause ? `${bit} after ${cause}` : bit;
  }
  if (!cause) {
    const s = econ(w);
    const own = clause(s, ev);
    const head = own.slice(0, 32).toLowerCase();
    if (own && head && !effect.toLowerCase().includes(head)) cause = own;
    else if (c.employed && s.wageEv) cause = clause(s, w.events.get(s.wageEv) ?? ev) || `the city wage is ${dollars(s.wage)} a day`;
    else cause = 'the books of the city';
  }
  return markBareDollars(`${effect}, because ${cause}.`);
}

function personal(ev: Ev, c: Circle): boolean {
  return ev.actor === c.pid && (ev.kind.startsWith('player.') || ev.kind.startsWith('loan.') || ev.kind.startsWith('property.') || ev.kind.startsWith('health.') || ev.kind.startsWith('law.'));
}

function foldCauses(w: World, ev: Ev, ids: Set<number>, into: Set<number>): void {
  const seen = new Set<number>();
  const walk = (id: number, depth: number): void => {
    if (depth > 5 || seen.has(id)) return;
    seen.add(id);
    if (ids.has(id) && id !== ev.id) into.add(id);
    const e = w.events.get(id);
    if (!e) return;
    for (const c of e.causes) walk(c, depth + 1);
  };
  for (const c of ev.causes) walk(c, 0);
}

interface Scored { ev: Ev; weight: number; close: number }

function paycheck(w: World, c: Circle, day: number): StoryLine | undefined {
  const s = econ(w);
  if (!c.employed) {
    const cause = w.events.last('macro.jobs') ?? s.macroEv;
    const ev = cause !== undefined ? w.events.get(cause) : undefined;
    return {
      day,
      eventId: ev?.id ?? (c.close.size ? s.macroEv : w.genesis),
      weight: 1,
      stake: 0,
      fold: 'wage',
      text: `You drew no wage this week, because ${ev ? clause(s, ev) : 'you have no employer'}.`,
    };
  }
  const net = Math.round(s.wage * Math.max(0.4, econ(w).P.skill[c.i]) * 7 * (1 - (s.taxRate || 0)));
  const causeId = s.wageEv || s.macroEv || w.genesis;
  const ev = w.events.get(causeId);
  const wageKind = ev?.kind === 'macro.wage' || ev?.kind === 'macro.cpi' || ev?.kind === 'macro.jobs' || ev?.kind === 'cb.rate';
  const why = ev && wageKind ? clause(s, ev) : `the city wage is ${dollars(s.wage)} a day`;
  return {
    day,
    eventId: causeId,
    weight: net,
    stake: net,
    fold: 'wage',
    text: `${c.employerName} paid you ${dollars(net)} this week, because ${why}.`,
  };
}

/** One wage line per month, and one layoff line per firm per month. Rank the month by dollars at stake. */
function placeLine(story: StoryLine[], line: StoryLine): void {
  if (line.fold === 'wage') line.text = line.text.replace(/this week/g, 'this month');
  if (line.fold) {
    const month = Math.floor(line.day / 30);
    const prev = story.find((x) => x.fold === line.fold && Math.floor(x.day / 30) === month);
    if (prev) {
      if (line.fold === 'wage') {
        const sum = (prev.stake ?? 0) + (line.stake ?? 0);
        const paying = (line.stake ?? 0) > 0 ? line.text : (/paid you /.test(prev.text) ? prev.text : line.text);
        prev.stake = sum;
        prev.weight = Math.max(sum, 1);
        prev.text = /paid you /.test(paying)
          ? paying.replace(/paid you \$[\d,]+(?:\.\d+)?/, `paid you ${dollars(sum)}`)
          : paying;
        if ((line.stake ?? 0) > 0) prev.eventId = line.eventId;
        prev.day = line.day;
      } else if ((line.stake ?? 0) > (prev.stake ?? 0) || ((line.stake ?? 0) === (prev.stake ?? 0) && line.weight > prev.weight)) {
        prev.text = line.text;
        prev.stake = line.stake ?? 0;
        prev.weight = line.weight;
        prev.eventId = line.eventId;
        prev.day = line.day;
      }
      return;
    }
  }
  story.push(line);
}

function rankStory(story: StoryLine[]): void {
  story.sort((a, b) =>
    Math.floor(a.day / 30) - Math.floor(b.day / 30)
    || (b.stake ?? 0) - (a.stake ?? 0)
    || b.weight - a.weight
    || a.day - b.day
    || a.eventId - b.eventId);
}

/** Pick this week's stories and append them. Keeps the last 200 lines on the seat. */
export function tellWeek(w: World, seat: StorySeat, i: number): void {
  const s = econ(w), P = s.P;
  if (i < 0 || i >= P.n || !P.alive(i)) return;
  if (!seat.story) seat.story = [];
  const from = Math.max(0, w.day - 6);
  const c = circleOf(w, seat, i);
  const raw = weekEvents(w, from, w.day);
  const scored: Scored[] = [];
  for (const ev of raw) {
    const n = closeness(ev, c);
    if (n <= 0) continue;
    const weight = Math.round((baseOf(ev.kind) + stake(ev, c)) * n);
    scored.push({ ev, weight, close: n });
  }
  const ids = new Set(scored.map((x) => x.ev.id));
  const folded = new Set<number>();
  const people = scored.filter((x) => personal(x.ev, c));
  for (const x of people) foldCauses(w, x.ev, ids, folded);
  const rest = scored.filter((x) => !personal(x.ev, c) && !folded.has(x.ev.id));
  rest.sort((a, b) => b.close - a.close || b.weight - a.weight || a.ev.id - b.ev.id);
  for (const x of rest) {
    if (folded.has(x.ev.id)) continue;
    foldCauses(w, x.ev, ids, folded);
  }
  const kept: Scored[] = [];
  for (const x of people) if (!folded.has(x.ev.id)) kept.push(x);
  for (const x of rest) if (!folded.has(x.ev.id)) kept.push(x);
  kept.sort((a, b) => b.weight - a.weight || b.close - a.close || a.ev.id - b.ev.id);
  const seenLayoff = new Set<string>();
  const unique: Scored[] = [];
  for (const x of kept) {
    if (x.ev.kind === 'firm.layoffs') {
      const key = x.ev.actor || String(x.ev.id);
      if (seenLayoff.has(key)) continue;
      seenLayoff.add(key);
    }
    unique.push(x);
  }
  const picked = unique.slice(0, 5).sort((a, b) => a.ev.day - b.ev.day || a.ev.id - b.ev.id);
  const lines: StoryLine[] = picked.map((x) => {
    const text = sentence(w, x.ev, c);
    const line: StoryLine = {
      day: x.ev.day,
      eventId: x.ev.id,
      weight: x.weight,
      stake: Math.max(stake(x.ev, c), dollarsMentioned(text)),
      text,
    };
    if (x.ev.kind === 'firm.layoffs') line.fold = 'layoff:' + (x.ev.actor || x.ev.id);
    return line;
  });
  if (!lines.length) {
    const pay = paycheck(w, c, w.day);
    if (pay) lines.push(pay);
  }
  const have = new Set(seat.story.map((x) => x.eventId + ':' + x.day));
  for (const line of lines) {
    if (!line.fold) {
      const key = line.eventId + ':' + line.day;
      if (have.has(key)) continue;
      have.add(key);
    }
    placeLine(seat.story, line);
  }
  rankStory(seat.story);
  if (seat.story.length > 200) seat.story.splice(0, seat.story.length - 200);
}

export function storyLines(seat: StorySeat | undefined): StoryLine[] {
  return seat?.story ?? [];
}
