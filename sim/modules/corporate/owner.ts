// Owning what you work for. A player builds a stake in their own employer, takes control, and then
// every choice an owner makes (cut, protect, promote, sell, borrow, pay out, bargain) is written down by the
// people it touched: workers, the union representative, managers, rivals, journalists, partners.
// Years later those memories decide who sells to you, who talks to the press, who testifies. They belong to
// the person who acted; a child inherits the shares, the debts and a part of the memory.
import { type World } from '../../kernel/index.ts';
import { DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm, leaveJob } from '../economy/people.ts';
import { borrowMargin, type Product } from '../banking/index.ts';
import { contactsOf, nudgeLink, nudgeStanding } from '../social/index.ts';
import { unionDeal } from '../labour/index.ts';
import { blockOf, controls, findFirm, hurdle, offerPrice, quote, raiseCash, ready, rootOf, setChair, sharesOf } from './index.ts';

export const LAID_OFF = 1, PROTECTED = 2, PROMOTED = 3, BETRAYED = 4, PARTNER = 5, SOLD = 6, PAID = 7, HIT = 8;
export const KIND = ['', 'laid off', 'protected', 'promoted', 'betrayed', 'partnered with', 'sold on', 'paid fairly', 'left holding the bill'];
export const VAL = [0, -1, 1, 1.2, -1.6, 1, -0.6, 0.35, -1];
export const ROLES = ['worker', 'union rep', 'manager', 'rival', 'journalist', 'partner', 'shareholder'];
const R_WORKER = 0, R_UNION = 1, R_MANAGER = 2, R_RIVAL = 3, R_PRESS = 4, R_PARTNER = 5, R_HOLDER = 6;

export interface Memo { who: number; by: number; firm: number; kind: number; role: number; day: number; ev: number; w: number; fired: number; out: number }
interface Pledge { firm: number; who: number; cents: number; ev: number; called: boolean }
interface Held { firm: number; by: number; day: number; ev: number; how: string; partners?: number[] }
export interface Choice { firm: number; by: number; day: number; ev: number; op: string }
export interface OwnerState {
  memos: Memo[]; pledges: Pledge[]; held: Held[]; choices?: Choice[];
  cutDay: number[]; keepUntil: number[]; keepers: number[][]; keepBy?: number[];
  inherit: Record<number, number>; lastWho: number; heirEv: number; leaks: number; allies: number; witnesses: number; guarantees: number; cursor: number;
}
interface PlayerPeek { who?: number }
interface MediaPeek { outlets?: { readership: number; journalists: number[] }[] }
interface LawPeek { cases?: { phase: number; off: number }[]; offences?: { id: number; person: number }[] }
type Done = { why: string } | { text: string; eventId: number };

const econ = (w: World): EconState => w.state.economy as EconState;

export function owner(w: World): OwnerState {
  const c = ready(w) as unknown as { owner?: OwnerState };
  if (!c.owner) c.owner = { memos: [], pledges: [], held: [], inherit: {}, cutDay: [], keepUntil: [], keepers: [], lastWho: -1, heirEv: -1, leaks: 0, allies: 0, witnesses: 0, guarantees: 0, cursor: 0 };
  return c.owner;
}

const dollars = (cents: number): string => `$${(Math.round(cents) / 100).toFixed(2)}`;

/** 1 for the person, 0.6 for their parent, 0.36 for a grandparent: a memory of a parent weighs less on the child. */
function weightOf(P: EconState['P'], who: number, by: number, inh: Record<number, number>): number {
  let cur = who, f = 1;
  for (let g = 0; g < 4 && cur >= 0; g++) {
    if (cur === by) return f;
    cur = inh[cur] ?? P.parent[cur];
    f *= 0.6;
  }
  return 0;
}

function pressOf(w: World): number[] {
  const m = w.state.media as MediaPeek | undefined;
  if (!m?.outlets) return [];
  const s = econ(w);
  const out: number[] = [];
  for (const o of [...m.outlets].sort((a, b) => b.readership - a.readership).slice(0, 3)) {
    const j = o.journalists.find((x) => x >= 0 && x < s.P.n && s.P.alive(x));
    if (j !== undefined) out.push(j);
  }
  return out;
}

function remember(w: World, who: number, by: number, f: Firm, kind: number, role: number, weight: number, ev: number): void {
  const o = owner(w);
  if (who < 0 || who === by || !econ(w).P.alive(who)) return;
  o.memos.push({ who, by, firm: f.idx, kind, role, day: w.day, ev, w: weight, fired: 0, out: -1 });
  if (o.memos.length > 6000) { o.memos.splice(0, o.memos.length - 5000); o.cursor = 0; }
}

/** What one person now feels about an owner and their house: above zero is warm, below is a grudge. */
export function regard(w: World, holder: number, ownerPerson: number): number {
  const P = econ(w).P, o = owner(w);
  let sum = 0;
  for (const m of o.memos) {
    if (m.who !== holder) continue;
    const lw = weightOf(P, ownerPerson, m.by, o.inherit);
    if (lw <= 0) continue;
    const years = (w.day - m.day) / 360;
    sum += VAL[m.kind] * m.w * lw * Math.pow(0.5, years / 8);
  }
  return sum;
}

/** Applied to a tender price: friends sell at the market, people with a grudge want a premium. */
export function adjustBar(w: World, ownerPerson: number, holderId: string, bar: number, last: number): number {
  if (!holderId.startsWith('p_') || !(last > 0)) return bar;
  const r = regard(w, +holderId.slice(2), ownerPerson);
  if (r >= 0.8) return Math.max(1, Math.min(bar, Math.ceil(last)));
  if (r <= -0.8) return Math.ceil(bar * 1.5);
  return bar;
}

function unitPrice(w: World, s: EconState, f: Firm): number {
  const q = f.listed ? quote(w, f) : undefined;
  return q && q.last > 0 ? q.last : offerPrice(w, s, f).price;
}

function repOf(w: World, f: Firm): number {
  const lab = w.state.labour as { unions?: { sector: string; leader: number }[] } | undefined;
  const u = lab?.unions?.find((x) => x.sector === f.sector);
  return u && u.leader >= 0 && econ(w).P.alive(u.leader) ? u.leader : -1;
}

/** Ask the banks in turn until the amount is met: one bank's room may cover only part of it. */
export function borrowAll(w: World, person: number, cents: number, cause: number, product: Product = 'margin'): { taken: number; rate: number; why?: string } {
  let taken = 0, rate = 0, why: string | undefined;
  for (let n = 0; n < 8 && taken < cents; n++) {
    const r = borrowMargin(w, person, cents - taken, cause, product);
    if (r.taken < 1) { why = r.why; break; }
    rate = taken > 0 ? (rate * taken + r.rate * r.taken) / (taken + r.taken) : r.rate;
    taken += r.taken;
  }
  return { taken, rate, why };
}

/** Build a stake in the firm that employs you. how: savings, loan, partners or mbo. */
export function buyIn(w: World, person: number, key: string, howIn: string, cents: number, product: Product = 'margin'): Done {
  const how = howIn === 'cash' ? 'savings' : howIn === 'margin' || howIn === 'line' ? 'loan' : howIn === 'buyout' ? 'mbo' : howIn;
  if (howIn === 'line') product = 'line';
  const f = findFirm(w, key);
  const s = econ(w), P = s.P, L = w.ledger, c = ready(w), o = owner(w);
  if (!f) return { why: 'no such firm' };
  const pid = P.id(person);
  const have = (id: string): number => Math.floor(L.balance(id, 'eq:' + f.id));
  if (P.employer[person] !== f.idx && f.ceo !== person && have(pid) < 1) return { why: `you do not work for ${f.name}` };
  if (!(cents > 0)) return { why: 'name an amount' };
  const total = sharesOf(w, f);
  if (total < 2) return { why: `${f.name} has no shares to buy` };
  const last = unitPrice(w, s, f);
  const ev = w.events.emit('player.owner.buyin', `${P.name(person)} sets out to buy into ${f.name}, ${how}, with up to ${dollars(cents)}`, rootOf(s, f), pid);
  const partners: number[] = [];
  const share = new Map<string, number>();
  let payers: string[] = [pid];
  let budget = 0;
  if (how === 'savings' || how === 'loan' || how === 'partners') {
    let reserve = 0;
    if (how === 'loan') {
      const before = Math.floor(L.balance(pid, DEP));
      const need = cents - before;
      if (need > 0) {
        const got = borrowAll(w, person, need, ev, product);
        if (got.taken < 1 && before < 1) return { why: `the bank will not lend: ${got.why ?? 'no collateral'}` };
      }
      // keep a year of the interest in hand: a loan that eats your cash is how a buyer goes bankrupt
      reserve = Math.round(Math.max(0, Math.floor(L.balance(pid, DEP)) - before) * 0.25);
    }
    const own = Math.max(0, Math.min(cents, Math.floor(L.balance(pid, DEP)) - reserve));
    budget = own;
    share.set(pid, own);
    if (how === 'partners') {
      // The friends with the most to put in come first: a rich friend further down the list is still asked.
      const asks = contactsOf(w, person)
        .filter((ct) => ct.trust >= 35 && P.adult(w, ct.who))
        .map((ct) => ({ who: ct.who, pledge: Math.floor(L.balance(P.id(ct.who), DEP) * 0.4) }))
        .filter((a) => a.pledge >= 1000)
        .sort((x, y) => y.pledge - x.pledge || x.who - y.who);
      for (const a of asks.slice(0, 8)) {
        partners.push(a.who);
        share.set(P.id(a.who), a.pledge);
        budget += a.pledge;
      }
      payers = [pid, ...partners.map((p) => P.id(p))];
    }
  } else if (how === 'mbo') {
    if (have(pid) < 1) return { why: 'build a stake first: a management buyout retires the shares the firm buys back' };
    raiseCash(w, s, f, cents, ev);
    const floor = Math.round(f.eff * s.wage * 14);
    budget = Math.max(0, Math.min(cents, Math.floor(L.balance(f.id, DEP)) - floor));
    payers = [f.id];
    share.set(f.id, budget);
  } else return { why: 'buy in with cash, margin, partners or buyout' };
  budget = Math.min(budget, Math.round(cents));
  if (budget < 1) return { why: 'you cannot raise anything' };
  // Partners from earlier buy-ins still stand with you: you do not buy from them, and their shares count towards the chair.
  const crew = new Set<number>(partners);
  for (const h of o.held) if (h.firm === f.idx && h.by === person) for (const p of h.partners ?? []) if (P.alive(p)) crew.add(p);
  const mine = new Set<string>([pid, f.id, ...[...crew].map((p) => P.id(p))]);
  const sellers: { id: string; n: number; bar: number }[] = [];
  for (const [id, n] of L.holders('eq:' + f.id).entries()) {
    if (n <= 0 || mine.has(id)) continue;
    const base = hurdle(s, id, last, f.ceo >= 0 && id === P.id(f.ceo));
    sellers.push({ id, n: Math.floor(n), bar: adjustBar(w, person, id, base, last) });
  }
  sellers.sort((a, b) => a.bar - b.bar || (a.id < b.id ? -1 : 1));
  let px = 0, got = 0;
  const take: { id: string; n: number }[] = [];
  for (const sl of sellers) {
    const p = Math.max(px, sl.bar);
    const afford = Math.floor(budget / p) - got;
    if (afford < 1) break;
    const n = Math.min(sl.n, afford);
    px = p; got += n;
    take.push({ id: sl.id, n });
    if (n < sl.n) break;
  }
  if (got < 1) return { why: `nobody will sell ${f.name} shares for what you can raise` };
  const cost = got * px;
  const wsum = payers.reduce((a, id) => a + (share.get(id) ?? 0), 0);
  const pays = new Map<string, number>(), gets = new Map<string, number>();
  let leftC = cost, leftS = got;
  payers.forEach((id, k) => {
    const frac = (share.get(id) ?? 0) / wsum;
    const part = k === payers.length - 1 ? leftC : Math.min(leftC, Math.floor(cost * frac));
    const nsh = k === payers.length - 1 ? leftS : Math.min(leftS, Math.floor(got * frac));
    pays.set(id, part); gets.set(id, nsh);
    leftC -= part; leftS -= nsh;
  });
  // every seller is paid px a share, drawn from the payers in turn
  const queue = payers.map((id) => ({ id, cash: pays.get(id) ?? 0, sh: gets.get(id) ?? 0 }));
  for (const t of take) {
    let owed = t.n * px, shares = t.n;
    for (const q of queue) {
      if (owed <= 0 && shares <= 0) break;
      const give = Math.min(owed, q.cash);
      if (give > 0) {
        if (!pay(w, q.id, t.id, give, 'buyin.cash', ev)) return { why: 'the cash did not go out' };
        q.cash -= give; owed -= give;
      }
      if (how !== 'mbo') {
        const mv = Math.min(shares, q.sh);
        if (mv > 0 && L.move('eq:' + f.id, t.id, q.id, mv, 'buyin.shares', ev)) { q.sh -= mv; shares -= mv; }
      }
    }
    if (how === 'mbo' && !L.redeem('eq:' + f.id, t.id, t.n, 'buyout.retire', ev)) return { why: 'the shares did not come back' };
    if (owed > 0 || (how !== 'mbo' && shares > 0)) return { why: 'the purchase did not settle' };
  }
  const fair = last > 0 ? px / last : 1;
  for (const t of take.slice(0, 12)) if (t.id.startsWith('p_')) remember(w, +t.id.slice(2), person, f, PAID, R_HOLDER, fair > 1.1 ? 0.9 : 0.4, ev);
  for (const pt of partners) remember(w, pt, person, f, PARTNER, R_PARTNER, 1.2, ev);
  const issued = Math.max(1, Math.floor(L.issued.get('eq:' + f.id) ?? 0));
  const now = blockOf(w, person, f);
  const together = now + [...crew].reduce((a, p) => a + have(P.id(p)), 0);
  o.held.push({ firm: f.idx, by: person, day: w.day, ev, how, partners: partners.slice() });
  const mineGot = gets.get(pid) ?? 0;
  const text = how === 'mbo' ? `${f.name} buys back ${got} shares at ${dollars(px)}; you hold ${now} of ${issued}` : `${P.name(person)} buys ${mineGot} shares of ${f.name} at ${dollars(px)} (${howIn})${partners.length ? `; ${partners.length} partners buy ${got - mineGot} more beside you` : ''}; you hold ${now} of ${issued}${together > now ? `, with partners ${together}` : ''}`;
  // A register with no big holder is run by whoever holds a clear lead: 30% and twice anyone else.
  const outside = [...L.holders('eq:' + f.id).entries()].filter(([id]) => id !== pid && id !== f.id && ![...crew].some((p) => P.id(p) === id));
  const biggest = outside.reduce((a, [, n]) => Math.max(a, n), 0);
  const sway = together * 10 >= issued * 3 && together >= 2 * biggest;
  if ((together * 2 > issued || sway) && !controls(w, person, f)) {
    setChair(c, f, person);
    const cev = w.events.emit('player.owner.control', `${P.name(person)} takes the chair of ${f.name}${partners.length ? ` with ${partners.length} partners from their circle` : ''}`, [ev], f.id);
    return { text: `${text}; the chair is yours`, eventId: cev };
  }
  if (controls(w, person, f)) return { text: `${text}; you control it`, eventId: ev };
  const need = Math.max(0, Math.min(Math.floor(issued / 2) + 1, Math.ceil(issued * 0.3)) - together);
  return { text: `${text}; about ${need} more shares for the chair (30% with a clear lead, or half)`, eventId: ev };
}

/** Cut jobs. The lowest-skilled go first; workers, the union rep, the manager and the press all note it. */
export function cutJobs(w: World, person: number, key: string, n: number): Done {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  const s = econ(w), P = s.P, o = owner(w);
  const count = Math.max(1, Math.min(Math.floor(n), f.staff.length - 3));
  if (f.staff.length < 5) return { why: `${f.name} is too small to cut` };
  const list = [...f.staff].filter((i) => i !== person && i !== f.ceo).sort((a, b) => P.skill[a] - P.skill[b] || a - b).slice(0, count);
  const ev = w.events.emit('player.owner.layoff', `${P.name(person)} lays off ${list.length} of ${f.name}`, rootOf(s, f), f.id);
  const rep = repOf(w, f);
  const promised = o.keepUntil[f.idx] > w.day ? o.keepers[f.idx] ?? [] : [];
  for (const i of list) leaveJob(s, i);
  list.slice(0, 40).forEach((i) => remember(w, i, person, f, LAID_OFF, R_WORKER, 1, ev));
  if (rep >= 0) remember(w, rep, person, f, LAID_OFF, R_UNION, 1.4, ev);
  if (f.ceo >= 0 && f.ceo !== person) remember(w, f.ceo, person, f, LAID_OFF, R_MANAGER, 0.6, ev);
  if (list.length >= 3) for (const j of pressOf(w)) remember(w, j, person, f, LAID_OFF, R_PRESS, 1.2, ev);
  let broke = 0;
  for (const i of promised) if (P.alive(i) && P.employer[i] === f.idx) { remember(w, i, person, f, BETRAYED, R_WORKER, 1.2, ev); broke++; }
  while (o.cutDay.length <= f.idx) o.cutDay.push(-1e9);
  o.cutDay[f.idx] = w.day;
  f.keepUntil = 0;
  nudgeStanding(w, person, -Math.min(6, 1 + list.length / 8));
  return { text: `${list.length} jobs go at ${f.name}${broke ? `; ${broke} workers you promised to keep feel betrayed` : ''}`, eventId: ev };
}

/** Protect jobs: a week's wages to every worker now, and a promise of no cuts for a year. */
export function protectJobs(w: World, person: number, key: string): Done {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  const s = econ(w), P = s.P, o = owner(w);
  const each = Math.round(s.wage * 7);
  raiseCash(w, s, f, each * f.staff.length, rootOf(s, f)[0] ?? w.genesis);
  const ev = w.events.emit('player.owner.protect', `${P.name(person)} promises ${f.name}'s ${f.staff.length} workers their jobs for a year and pays each a week's wages (${dollars(each)} each, ${dollars(each * f.staff.length)} in all)`, rootOf(s, f), f.id);
  let paid = 0;
  for (const i of f.staff) if (pay(w, f.id, P.id(i), each, 'player.owner.retention', ev)) paid++;
  const keep = f.staff.filter((i) => i !== person).slice(0, 40);
  keep.forEach((i) => remember(w, i, person, f, PROTECTED, R_WORKER, 1, ev));
  const rep = repOf(w, f);
  if (rep >= 0) remember(w, rep, person, f, PROTECTED, R_UNION, 1.4, ev);
  if (f.ceo >= 0 && f.ceo !== person) remember(w, f.ceo, person, f, PROTECTED, R_MANAGER, 0.6, ev);
  for (const j of pressOf(w)) remember(w, j, person, f, PROTECTED, R_PRESS, 0.8, ev);
  while (o.keepUntil.length <= f.idx) { o.keepUntil.push(0); o.keepers.push([]); }
  o.keepUntil[f.idx] = w.day + 360;
  o.keepers[f.idx] = keep;
  f.keepUntil = w.day + 360;
  o.keepBy ??= [];
  while (o.keepBy.length <= f.idx) o.keepBy.push(-1);
  o.keepBy[f.idx] = person;
  nudgeStanding(w, person, 2);
  return { text: `${paid} workers of ${f.name} are paid ${dollars(each)} each (${dollars(each * paid)} of payroll) and promised no cuts for a year while the firm can pay`, eventId: ev };
}

/** The firm could not pay, so the no-cuts promise broke. Those who were promised remember it as a betrayal. */
export function promiseBroken(w: World, f: Firm, ev: number): void {
  const o = owner(w), P = econ(w).P;
  const by = o.keepBy?.[f.idx] ?? -1;
  o.keepUntil[f.idx] = 0;
  if (by < 0) return;
  const keepers = o.keepers[f.idx] ?? [];
  for (const i of keepers) if (P.alive(i)) remember(w, i, by, f, BETRAYED, R_WORKER, 1.2, ev);
  const rep = repOf(w, f);
  if (rep >= 0) remember(w, rep, by, f, BETRAYED, R_UNION, 1.4, ev);
  nudgeStanding(w, by, -2);
}

/** Put a worker in charge: they remember, and so does the chief they passed over. */
export function promote(w: World, person: number, key: string, who: number): Done {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  const s = econ(w), P = s.P;
  if (!(who >= 0 && who < P.n) || P.employer[who] !== f.idx) return { why: 'promote someone who works there' };
  const old = f.ceo;
  const ev = w.events.emit('player.owner.promote', `${P.name(person)} puts ${P.name(who)} in charge of ${f.name}`, rootOf(s, f), f.id);
  f.ceo = who;
  remember(w, who, person, f, PROMOTED, R_MANAGER, 1.3, ev);
  if (old >= 0 && old !== person && old !== who) remember(w, old, person, f, BETRAYED, R_MANAGER, 0.8, ev);
  return { text: `${P.name(who)} runs ${f.name}`, eventId: ev };
}

/** Sell part of the plant and its staff to a rival to meet payroll. */
export function sellAssets(w: World, person: number, key: string, buyerKey: string, fraction: number): Done {
  const f = findFirm(w, key), buyer = findFirm(w, buyerKey);
  if (!f || !buyer) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  if (buyer.idx === f.idx) return { why: 'it cannot buy itself' };
  const s = econ(w), L = w.ledger, P = s.P;
  const part = Math.min(0.8, Math.max(0.05, fraction));
  const cap = L.instruments.has('capital') ? L.balance(f.id, 'capital') : 0;
  const give = cap * part;
  const cause = rootOf(s, f)[0] ?? w.genesis;
  const cost = Math.max(100, Math.round(f.eff * s.wage * 90 * part));
  raiseCash(w, s, buyer, cost, cause);
  if (Math.floor(L.balance(buyer.id, DEP)) < cost) return { why: `${buyer.name} cannot pay ${dollars(cost)}` };
  const ev = w.events.emit('player.owner.sell', `${P.name(person)} sells ${Math.round(part * 100)}% of ${f.name} to ${buyer.name} for ${dollars(cost)} to cover the payroll`, rootOf(s, f), f.id);
  if (!pay(w, buyer.id, f.id, cost, 'division.sale', ev)) return { why: 'the buyer did not pay' };
  if (give > 1e-8) { L.consume('capital', f.id, give, 'division.plant', ev); L.produce('capital', buyer.id, give, 'division.plant', ev); }
  const move = [...f.staff].filter((i) => i !== person && i !== f.ceo).slice(0, Math.floor(f.staff.length * part));
  for (const i of move) joinFirm(s, i, buyer);
  move.slice(0, 40).forEach((i) => remember(w, i, person, f, SOLD, R_WORKER, 1, ev));
  if (buyer.ceo >= 0) remember(w, buyer.ceo, person, f, PAID, R_RIVAL, 0.7, ev);
  const rep = repOf(w, f);
  if (rep >= 0) remember(w, rep, person, f, SOLD, R_UNION, 1.2, ev);
  for (const j of pressOf(w)) remember(w, j, person, f, SOLD, R_PRESS, 0.7, ev);
  return { text: `${buyer.name} pays ${dollars(cost)}; ${move.length} workers move with the plant`, eventId: ev };
}

/** Borrow for the firm. A personal guarantee lets it borrow twice as much, and puts half your cash behind the loan. */
export function refinance(w: World, person: number, key: string, cents: number, guarantee: boolean): Done {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  const s = econ(w), P = s.P, L = w.ledger, o = owner(w);
  const lend = (w.state.banking as { lendFirm?: (w: World, s: EconState, f: Firm, cents: number, cause: number) => boolean } | undefined)?.lendFirm;
  if (!lend) return { why: 'no bank lends to firms' };
  const ask = guarantee ? cents : Math.floor(cents / 2);
  const before = Math.floor(L.balance(f.id, DEP));
  const ev = w.events.emit('player.owner.refinance', `${P.name(person)} refinances ${f.name} for ${dollars(ask)}${guarantee ? ' on a personal guarantee' : ''}`, rootOf(s, f), f.id);
  if (!lend(w, s, f, ask, ev)) return { why: 'the bank refuses' };
  const got = Math.floor(L.balance(f.id, DEP)) - before;
  if (guarantee) {
    const pledge = Math.floor(L.balance(P.id(person), DEP) * 0.5);
    o.pledges.push({ firm: f.idx, who: person, cents: pledge, ev, called: false });
    return { text: `${f.name} borrows ${dollars(got)}; ${dollars(pledge)} of your family's money stands behind it`, eventId: ev };
  }
  return { text: `${f.name} borrows ${dollars(got)} (the bank would give twice that on your guarantee)`, eventId: ev };
}

/** A special dividend to every holder. People laid off in the last year hear of it. */
export function payOut(w: World, person: number, key: string, cents: number): Done {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  const s = econ(w), L = w.ledger, P = s.P, o = owner(w);
  const sum = Math.min(cents, Math.floor(L.balance(f.id, DEP)) - Math.round(f.eff * s.wage * 14));
  if (sum < 100) return { why: `${f.name} has no cash to spare` };
  const holders = [...L.holders('eq:' + f.id).entries()].filter(([id, n]) => n > 0 && id !== f.id);
  const total = holders.reduce((a, [, n]) => a + n, 0);
  if (!(total > 0)) return { why: 'nobody holds shares' };
  const ev = w.events.emit('player.owner.dividend', `${P.name(person)} pays out ${dollars(sum)} from ${f.name}`, rootOf(s, f), f.id);
  let left = sum;
  holders.forEach(([id, n], k) => {
    const part = k === holders.length - 1 ? left : Math.min(left, Math.floor(sum * n / total));
    if (part > 0 && pay(w, f.id, id, part, 'player.owner.dividend', ev)) left -= part;
  });
  let sore = 0;
  if (o.cutDay[f.idx] !== undefined && w.day - o.cutDay[f.idx] < 360) {
    for (const m of o.memos) if (m.firm === f.idx && m.kind === LAID_OFF && m.by === person && w.day - m.day < 360 && m.w < 3) { m.w *= 1.6; sore++; }
    const rep = repOf(w, f);
    if (sore && rep >= 0) remember(w, rep, person, f, BETRAYED, R_UNION, 1.5, ev);
  }
  return { text: `${dollars(sum - left)} paid out${sore ? `; ${sore} people laid off this year will not forget it` : ''}`, eventId: ev };
}

/** Deal with the union at your plant: concede a premium or break with it. */
export function dealUnion(w: World, person: number, key: string, op: 'concede' | 'break'): Done {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  const s = econ(w);
  const own = w.events.emit('player.owner.union', `${s.P.name(person)} chooses to ${op === 'concede' ? 'meet' : 'break'} the union at ${f.name}`, rootOf(s, f).slice(0, 1), f.id);
  const r = unionDeal(w, f.idx, op, own);
  if (!r) return { why: `no union at ${f.name}` };
  const kind = op === 'concede' ? PROTECTED : BETRAYED;
  if (r.leader >= 0) remember(w, r.leader, person, f, kind, R_UNION, 1.5, own);
  for (const i of f.staff.filter((x) => x !== person).slice(0, 30)) remember(w, i, person, f, kind, R_WORKER, 0.6, own);
  nudgeStanding(w, person, op === 'concede' ? 1 : -2);
  return { text: r.text, eventId: r.ev };
}

/** Months: guarantees are called, an heir takes the house's memory, and old decisions come back. */
export function ownerMonth(w: World): void {
  const o = owner(w);
  const s = econ(w), P = s.P, L = w.ledger;
  const cur = (w.state.player as PlayerPeek | undefined)?.who ?? -1;
  if (cur >= 0 && o.lastWho >= 0 && cur !== o.lastWho && !P.alive(o.lastWho)) {
    o.inherit[cur] = o.lastWho;
    const n = o.memos.filter((m) => weightOf(P, cur, m.by, o.inherit) > 0).length;
    const mine = o.held.filter((h) => h.by === o.lastWho).length;
    const debts = o.pledges.filter((p) => p.who === o.lastWho && !p.called).length;
    if (n || mine || debts) {
      const cause = P.lastEv[cur] >= 0 ? P.lastEv[cur] : w.genesis;
      o.heirEv = w.events.emit('player.owner.heir', `${P.name(cur)} inherits ${P.name(o.lastWho)}'s shares, ${debts} guaranteed loans, and the memory of ${n} people who dealt with them`, [cause], P.id(cur));
      for (const p of o.pledges) if (p.who === o.lastWho && !p.called) p.who = cur;
    }
  }
  if (cur >= 0) o.lastWho = cur;
  for (const p of o.pledges) {
    if (p.called) continue;
    const f = s.firms[p.firm];
    if (f && !f.closed) continue;
    p.called = true;
    const owed = Math.min(p.cents, Math.floor(L.balance(P.id(p.who), DEP)));
    if (owed > 0 && pay(w, P.id(p.who), 'bank_1', owed, 'player.owner.guarantee', p.ev)) {
      const ev = w.events.emit('player.owner.guarantee', `${f?.name ?? 'the firm'} fails and the bank collects ${dollars(owed)} of ${P.name(p.who)}'s family money`, [p.ev], P.id(p.who));
      o.guarantees++;
      if (f) for (const k of [P.spouse[p.who], ...P.kids(p.who)]) if (k >= 0 && P.alive(k)) remember(w, k, p.who, f, HIT, R_PARTNER, 1, ev);
    }
  }
  if (cur < 0 || !o.memos.length) return;
  fall(w, o, cur);
}

/** Old decisions come back. A friend sells you a block at the market; an enemy talks to the press or the court. */
function fall(w: World, o: OwnerState, cur: number): void {
  const s = econ(w), P = s.P, L = w.ledger;
  const rng = w.rng('player.owner.memory');
  const press = new Set(pressOf(w));
  const law = w.state.law as LawPeek | undefined;
  const trouble = !!law?.cases?.some((c) => c.phase >= 1 && c.phase <= 2 && weightOf(P, cur, (law.offences ?? []).find((x) => x && x.id === c.off)?.person ?? -1, o.inherit) > 0);
  const me = P.name(cur);
  const n = o.memos.length;
  for (let looked = 0; looked < Math.min(n, 400); looked++) {
    const k = (o.cursor + looked) % n;
    const m = o.memos[k];
    if (m.fired >= 1 || w.day - m.day < 540 || m.kind === PAID) continue;
    const lw = weightOf(P, cur, m.by, o.inherit);
    if (lw <= 0 || !P.alive(m.who) || m.who === cur) continue;
    if (!rng.chance(0.03 * lw)) continue;
    const f = s.firms[m.firm];
    const who = P.name(m.who);
    const what = `${who} (${ROLES[m.role]}), ${KIND[m.kind]} by ${P.name(m.by)} at ${f?.name ?? 'a firm'}`;
    const heir = m.by !== cur ? ` Now it is ${me}, the heir, who meets it.` : '';
    if (VAL[m.kind] > 0) {
      const block = f ? Math.floor(L.balance(P.id(m.who), 'eq:' + f.id)) : 0;
      const last = f ? unitPrice(w, s, f) : 0;
      const cost = block * last;
      if (f && block > 0 && cost > 0 && Math.floor(L.balance(P.id(cur), DEP)) > cost) {
        const ev = w.events.emit('player.owner.ally', `${what}, remembers it and sells ${me} ${block} shares at the market price, no premium.${heir}`, [m.ev], P.id(cur));
        if (pay(w, P.id(cur), P.id(m.who), cost, 'player.owner.allySale', ev) && L.move('eq:' + f.id, P.id(m.who), P.id(cur), block, 'player.owner.allySale', ev)) {
          m.fired = 1; m.out = ev; o.allies++;
          nudgeLink(w, m.who, cur, 6);
          continue;
        }
      }
      const ev = w.events.emit('player.owner.ally', `${what}, remembers it and speaks well of ${me}.${heir}`, [m.ev], P.id(cur));
      m.fired = 1; m.out = ev; o.allies++;
      nudgeLink(w, m.who, cur, 6); nudgeStanding(w, cur, 1);
      continue;
    }
    let kind = 'player.owner.grudge', text = `${what}, still holds it against ${me} and turns away.${heir}`, hit = -1;
    if (trouble) { kind = 'player.owner.witness'; text = `${what}, is called as a witness against ${me}.${heir}`; o.witnesses++; hit = -6; }
    else if (press.has(m.who) || contactsOf(w, m.who).some((c) => press.has(c.who))) { kind = 'player.owner.leak'; text = `${what}, gives the press the story about ${me}.${heir}`; o.leaks++; hit = -4; }
    const ev = w.events.emit(kind, text, [m.ev], P.id(cur));
    m.fired = 1; m.out = ev;
    nudgeLink(w, m.who, cur, -12);
    nudgeStanding(w, cur, hit);
  }
  o.cursor = (o.cursor + 400) % Math.max(1, n);
}

/** The city's memory of a person and their parents, in words, weightiest first. */
export function cityMemory(w: World, person: number): string[] {
  const P = econ(w).P, o = owner(w);
  return o.memos.filter((m) => weightOf(P, person, m.by, o.inherit) > 0 && P.alive(m.who))
    .sort((a, b) => Math.abs(VAL[b.kind] * b.w) - Math.abs(VAL[a.kind] * a.w) || a.day - b.day).slice(0, 8)
    .map((m) => `${P.name(m.who)} (${ROLES[m.role]}) was ${KIND[m.kind]} by ${P.name(m.by)}${m.out >= 0 ? ' and has acted on it' : ''}`);
}

export function ownerStats(w: World): Record<string, number> {
  const o = owner(w);
  return { memos: o.memos.length, allies: o.allies, leaks: o.leaks, witnesses: o.witnesses, called: o.guarantees };
}
