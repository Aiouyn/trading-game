// Parties, elections, lobbying.
// Two to four parties come from sim/content/politics.txt. Politicians are people already in the
// arrays. Every fourth year each adult votes from work, real income, inflation, wealth and what
// their contacts think. The winner moves taxes and spending toward its platform, eases them before
// an election, and answers a slump or a failing bank. Firms and the rich donate through the ledger.
// A party that lives off one sector subsidises it and looks the other way; a very large gift is
// bribery, which the law module can investigate when it is loaded.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { GOODS, SECTOR_NAMES } from '../economy/content.ts';
import {
  BANK, BOND, DEP, GOV, pay, setBenefitRate, setDividendTax, setIncomeTax, setInflationTarget,
  setProfitTax, setSpendPriority, setSpendScale, type EconState,
} from '../economy/index.ts';
import { PRISON, type People } from '../economy/people.ts';

const DEG = 16;
const ADULT = 18 * DAYS_PER_YEAR;
const TERM = 48;

interface Party {
  id: string;
  name: string;
  tax: number;
  profit: number;
  dividend: number;
  benefit: number;
  infl: number;
  regulation: number;
  independence: number;
  dovish: number;
  spend: Record<string, number>;
  actor: string;
}

interface Poll { votes: Float64Array; turned: number; eligible: number }

interface LawOff {
  id: number; kind: string; day: number; person: number; firm: number; bank: string;
  gain: number; qty: number; vol: number; knowers: number; factId: number; factEvent: number;
  tradeEvent: number; event: number; solid: boolean; used: boolean;
}
interface LawSt { staff: number[]; offences: LawOff[]; seenKey: Set<string>; nextId: number; yOff: number }

interface Pol {
  gov: number;
  terms: number;
  leader: number;
  finance: number;
  governor: number;
  regulator: number;
  dovish: number;
  approval: number;
  margin: number;
  electEv: number;
  govEv: number;
  platformEv: number;
  slump: boolean;
  slumpEv: number;
  told: number;
  bribeYear: number;
  bribeN: number;
  boost: string;
  bailed: Record<string, number>;
  favor: Float64Array;
  partyOf: Int8Array;
  incSnap: Float64Array;
  elections: string[];
  lastVote: string;
}

interface Soc { contact: Int32Array; trust: Uint8Array; cap: number }
interface BankRow { id: string; failed: boolean; runEv: number; depo: string }

const file = fileURLToPath(new URL('../../content/politics.txt', import.meta.url));
const PARTIES: Party[] = parseRaws(readFileSync(file, 'utf8'), 'politics.txt').filter((r) => r.type === 'PARTY').map((raw) => {
  const r = new RawReader(raw);
  const id = raw.id;
  return {
    id, name: r.str('NAME'), tax: r.num('TAX'), profit: r.num('PROFIT'), dividend: r.num('DIVIDEND'),
    benefit: r.num('BENEFIT'), infl: r.num('INFLATION'), regulation: r.num('REGULATION'),
    independence: r.num('INDEPENDENCE'), dovish: r.num('DOVISH'), spend: r.pairs('SPEND'),
    actor: 'pol_' + id.toLowerCase(),
  };
});
if (PARTIES.length < 2 || PARTIES.length > 4) throw new Error(`politics.txt needs 2 to 4 parties, found ${PARTIES.length}`);

const LEAN = new Float64Array(8);
const econ = (w: World): EconState => w.state.economy as EconState;
const pol = (w: World): Pol => w.state.politics as Pol;
const clip = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function stepToward(cur: number, goal: number, step: number): number {
  if (cur < goal - 1e-9) return Math.min(goal, cur + step);
  if (cur > goal + 1e-9) return Math.max(goal, cur - step);
  return goal;
}
function yoyOf(s: EconState): number {
  const n = s.cpiHist.length;
  if (n < 13) return 0;
  return s.cpi / s.cpiHist[n - 13] - 1;
}
function realInc(s: EconState, i: number): number {
  return s.P.incEma[i] / Math.max(0.2, s.cpi);
}
function canVote(P: People, w: World, i: number): boolean {
  return P.alive(i) && (P.flags[i] & PRISON) === 0 && w.day - P.born[i] >= ADULT;
}
function isElection(w: World): boolean {
  return w.month >= TERM - 1 && w.month % TERM === TERM - 1;
}
function campaignMonth(w: World): boolean {
  const m = w.month % TERM;
  return m >= TERM - 12 && m < TERM - 1;
}

function causes(w: World, st: Pol, extra: number[]): number[] {
  const out: number[] = [];
  const add = (id?: number): void => { if (id !== undefined && id >= 0 && !out.includes(id)) out.push(id); };
  add(st.platformEv);
  add(st.electEv);
  add(st.govEv);
  add(w.events.last('macro.jobs'));
  add(w.events.last('macro.cpi'));
  for (const id of extra) add(id);
  if (!out.length) out.push(w.genesis);
  return out;
}

function grow(st: Pol, n: number): void {
  if (n <= st.partyOf.length) return;
  let m = Math.max(16, st.partyOf.length);
  while (m < n) m *= 2;
  const partyOf = new Int8Array(m);
  partyOf.fill(-1);
  partyOf.set(st.partyOf);
  const incSnap = new Float64Array(m);
  incSnap.set(st.incSnap);
  st.partyOf = partyOf;
  st.incSnap = incSnap;
}

function snapIncome(w: World): void {
  const s = econ(w), st = pol(w), P = s.P;
  grow(st, P.n);
  for (let i = 0; i < P.n; i++) st.incSnap[i] = realInc(s, i);
}

function treasury(w: World, to: string, cents: number, reason: string, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return false;
  const api = (w.state.bonds as { api?: { pay(w: World, to: string, cents: number, reason: string, cause: number): void } } | undefined)?.api;
  if (api) { api.pay(w, to, a, reason, cause); return true; }
  const have = Math.floor(w.ledger.balance(GOV, DEP));
  if (have < a) {
    const need = a - have + 50_000_00;
    w.ledger.issue(BOND, BANK, need, 'gov.borrow', cause);
    w.ledger.issue(DEP, GOV, need, 'gov.borrow', cause);
  }
  return pay(w, GOV, to, a, reason, cause);
}

function pick(w: World, avoid: Set<number>, regulator: boolean): number {
  const s = econ(w), P = s.P;
  let best = -1, score = -1;
  for (let i = 0; i < P.n; i++) {
    if (avoid.has(i) || !P.adult(w, i) || (P.flags[i] & PRISON) !== 0) continue;
    const age = P.age(w, i);
    if (age < 30 || age > 70) continue;
    const emp = P.employer[i];
    const ceo = emp >= 0 && s.firms[emp]?.ceo === i;
    if (regulator && (ceo || age > 58)) continue;
    const sc = P.skill[i];
    if (sc > score || (sc === score && (best < 0 || i < best))) { score = sc; best = i; }
  }
  if (best >= 0) return best;
  for (let i = 0; i < P.n; i++) if (!avoid.has(i) && P.adult(w, i)) return i;
  return 0;
}

function seatRegulator(w: World, person: number): void {
  const law = w.state.law as LawSt | undefined;
  if (!law?.staff || person < 0) return;
  const staff = law.staff;
  const at = staff.indexOf(person);
  if (at > 0) staff.splice(at, 1);
  if (at !== 0) {
    if (staff.length >= 6) staff.pop();
    staff.unshift(person);
  }
}

function fillOffices(w: World, replace: boolean): void {
  const st = pol(w), P = econ(w).P;
  const dead = (i: number): boolean => i < 0 || i >= P.n || !P.alive(i) || (P.flags[i] & PRISON) !== 0;
  const avoid = new Set<number>();
  const take = (cur: number, regulator: boolean): number => {
    if (!replace && !dead(cur)) { avoid.add(cur); return cur; }
    const n = pick(w, avoid, regulator);
    avoid.add(n);
    return n;
  };
  st.leader = take(st.leader, false);
  st.finance = take(st.finance, false);
  st.governor = take(st.governor, false);
  st.regulator = take(st.regulator, true);
  seatRegulator(w, st.regulator);
}

function dovishOf(party: Party, P: People, governor: number): number {
  const pulled = party.dovish * (1 - party.independence) + 0.5 * party.independence;
  if (governor < 0 || governor >= P.n) return pulled;
  const personal = (P.diligence[governor] - P.greed[governor]) / 2000;
  return clip(pulled + personal, 0, 1);
}

function leanOf(w: World, i: number): void {
  LEAN.fill(0);
  const soc = w.state.social as Soc | undefined;
  if (!soc || i >= soc.cap) return;
  const st = pol(w), b = i * DEG;
  for (let k = 0; k < DEG; k++) {
    const c = soc.contact[b + k];
    if (c < 0 || c >= st.partyOf.length) continue;
    const q = st.partyOf[c];
    if (q < 0 || q >= PARTIES.length) continue;
    LEAN[q] += (soc.trust[b + k] / 100) * 0.04;
  }
}

function utility(w: World, i: number, p: number, infl: number): number {
  const s = econ(w), st = pol(w), P = s.P, party = PARTIES[p];
  const retired = (P.flags[i] & 2) !== 0;
  const job = P.employer[i] >= 0 && !retired;
  const wealth = w.ledger.balS(P.slot[i], DEP);
  const rich = wealth > s.wage * 900;
  const poor = wealth < s.wage * 80;
  const base = st.incSnap[i];
  const ch = base > 1 ? clip(realInc(s, i) / base - 1, -0.4, 0.4) : 0;
  const bloc = mix(i, 3, 11) % 100;
  const home = bloc < 34 ? 0 : bloc < 67 ? 1 : 2;
  let u = p === home ? 0.55 : 0;
  if (!job && !retired) u += party.benefit * 3.1 - party.tax * 0.5;
  else u += (0.2 - party.tax) * 1.5 + (0.42 - party.benefit) * 0.25;
  if (rich) u += (0.14 - party.tax) * 2.4 + (0.32 - party.dividend) * 1.8 + (0.45 - party.regulation) * 0.7;
  if (poor && job) u += party.benefit * 0.5;
  if (retired) u += party.benefit * 1.1 - party.tax * 0.3;
  u -= Math.max(0, infl - 0.02) * (party.infl - 0.012) * 55;
  u += LEAN[p];
  if (p === st.gov) {
    u += ch * 1.6;
    if (!job && !retired) u -= 0.85;
    if (infl > 0.045) u -= (infl - 0.045) * 7;
    u -= 0.1 * st.terms;
  }
  return u;
}

function tally(w: World, cast: boolean): Poll {
  const s = econ(w), st = pol(w), P = s.P;
  const votes = new Float64Array(PARTIES.length);
  const infl = yoyOf(s);
  let turned = 0, eligible = 0;
  const salt = st.elections.length + 1;
  for (let i = 0; i < P.n; i++) {
    if (!canVote(P, w, i)) continue;
    eligible++;
    const retired = (P.flags[i] & 2) !== 0;
    const jobless = P.employer[i] < 0 && !retired;
    const base = st.incSnap[i];
    const ch = base > 1 ? Math.abs(realInc(s, i) / base - 1) : 0;
    let pTurn = 58;
    if (jobless) pTurn += 12;
    if (retired) pTurn += 6;
    if (P.age(w, i) > 50) pTurn += 8;
    if (P.stress[i] > 140) pTurn -= 12;
    if (ch > 0.08) pTurn += 6;
    pTurn = clip(pTurn, 28, 90);
    if (mix(i, salt, 5) % 100 >= pTurn) continue;
    turned++;
    leanOf(w, i);
    let best = 0, bs = -1e18;
    for (let p = 0; p < PARTIES.length; p++) {
      const sc = utility(w, i, p, infl);
      if (sc > bs) { bs = sc; best = p; }
    }
    votes[best]++;
    if (cast) st.partyOf[i] = best;
  }
  return { votes, turned, eligible };
}

function shares(poll: Poll): string {
  const parts: string[] = [];
  for (let p = 0; p < PARTIES.length; p++) {
    const sh = poll.turned > 0 ? (poll.votes[p] / poll.turned) * 100 : 0;
    parts.push(`${PARTIES[p].name} ${sh.toFixed(1)}%`);
  }
  return parts.join(', ');
}

function winner(poll: Poll, gov: number): number {
  let best = gov, n = -1;
  for (let p = 0; p < PARTIES.length; p++) if (poll.votes[p] > n) { n = poll.votes[p]; best = p; }
  return best;
}
function marginOf(poll: Poll): number {
  let a = 0, b = 0;
  for (let p = 0; p < PARTIES.length; p++) {
    const v = poll.votes[p];
    if (v >= a) { b = a; a = v; }
    else if (v > b) b = v;
  }
  return poll.turned > 0 ? (a - b) / poll.turned : 0;
}

function adopt(w: World, exact: boolean): void {
  const s = econ(w), st = pol(w), party = PARTIES[st.gov], P = s.P;
  const camp = !exact && campaignMonth(w);
  let tax = party.tax, benefit = party.benefit, scale = 1;
  let why = `moving toward the ${party.name} platform`;
  if (camp) { tax -= 0.008; benefit += 0.012; scale = 1.03; why = 'the election ahead'; }
  if (st.slump) { tax -= 0.006; benefit += 0.01; scale = Math.max(scale, 1.04); why = 'the slump'; }
  tax = clip(tax, 0.05, 0.32);
  benefit = clip(benefit, 0.2, 0.65);
  const profit = exact ? party.profit : stepToward(s.profitTax ?? party.profit, party.profit, 0.0025);
  const dividend = exact ? party.dividend : stepToward(s.divRate ?? party.dividend, party.dividend, 0.004);
  const ben = exact ? benefit : stepToward(s.benefitRate ?? benefit, benefit, 0.0025);
  const dove = dovishOf(party, P, st.governor);
  const target = clip(0.02 + (dove - 0.5) * 0.01, 0.015, 0.028);
  const pi = exact ? target : stepToward(s.inflTarget ?? target, target, 0.001);
  setIncomeTax(w, tax);
  setProfitTax(w, profit);
  setDividendTax(w, dividend);
  setBenefitRate(w, ben);
  setInflationTarget(w, pi);
  setSpendScale(w, scale);
  st.dovish = dove;
  applySpend(w, party);
  const sig = Math.round(tax * 1000) * 1000000 + Math.round(profit * 1000) * 1000 + Math.round(dividend * 1000);
  if (exact) st.told = sig;
  else if (sig !== st.told) {
    st.told = sig;
    const msg = `income tax aim ${(tax * 100).toFixed(1)}%, profit tax ${(profit * 100).toFixed(1)}%, dividend tax ${(dividend * 100).toFixed(0)}%, benefits ${(ben * 100).toFixed(1)}% of the wage: ${why}`;
    w.events.emit('politics.tax', msg, causes(w, st, []), P.id(st.leader));
  }
}

function applySpend(w: World, party: Party): void {
  const st = pol(w), s = econ(w);
  const pri: Record<string, number> = {};
  let shifted = false;
  for (const g of Object.values(GOODS)) {
    if (!(g.gov > 0)) continue;
    let weight = (party.spend[g.good] ?? 1) * (g.sector === st.boost ? 1.15 : 1);
    if (Math.abs(weight - 1) > 0.02) shifted = true;
    weight = clip(weight, 0.35, 2.8);
    pri[g.good] = weight;
  }
  if (!shifted) { s.spendPri = undefined; return; }
  s.spendPri = {};
  for (const [good, weight] of Object.entries(pri)) setSpendPriority(w, good, weight);
}

function firmChoice(fProfit: number, gov: number): number {
  let best = gov, score = -1e9;
  for (let p = 0; p < PARTIES.length; p++) {
    const party = PARTIES[p];
    const sc = -party.profit * 3 - party.regulation + (p === gov ? 0.18 : 0) + (fProfit > 0 ? (0.22 - party.profit) : 0);
    if (sc > score) { score = sc; best = p; }
  }
  return best;
}

function donations(w: World): void {
  if (w.month % 3 !== 2) return;
  const s = econ(w), st = pol(w), P = s.P, L = w.ledger;
  const cause = causes(w, st, []);
  let topAmt = 0, topWho = '', topParty = st.gov, topPerson = -1, topFirm = -1;
  const give = (from: string, party: number, amount: number, person: number, firm: number, sector: number): void => {
    const a = Math.round(amount);
    if (a <= 0) return;
    if (!pay(w, from, PARTIES[party].actor, a, 'politics.donation', cause[0])) return;
    if (party === st.gov && sector >= 0) st.favor[sector] += a;
    if (a > topAmt) { topAmt = a; topWho = from; topParty = party; topPerson = person; topFirm = firm; }
  };
  for (const f of s.firms) {
    if (f.closed || !(f.lastProfit > 0)) continue;
    const ideo = firmChoice(f.lastProfit, st.gov);
    const amt = f.lastProfit * 0.025;
    const sec = SECTOR_NAMES.indexOf(f.sector);
    if (ideo === st.gov) give(f.id, st.gov, amt, f.ceo, f.idx, sec);
    else { give(f.id, st.gov, amt * 0.7, f.ceo, f.idx, sec); give(f.id, ideo, amt * 0.3, f.ceo, f.idx, -1); }
  }
  const rich: number[] = [];
  for (let i = 0; i < P.n; i++) if (P.alive(i)) rich.push(i);
  rich.sort((a, b) => L.balS(P.slot[b], DEP) - L.balS(P.slot[a], DEP) || a - b);
  for (let k = 0; k < rich.length && k < 40; k++) {
    const i = rich[k];
    const bal = L.balS(P.slot[i], DEP);
    const spare = bal - s.wage * 500;
    if (spare <= 0) continue;
    let party = st.gov, score = -1e9;
    for (let p = 0; p < PARTIES.length; p++) {
      const sc = -PARTIES[p].tax * 4 - PARTIES[p].dividend + (p === st.gov ? 0.12 : 0);
      if (sc > score) { score = sc; party = p; }
    }
    give(P.id(i), party, spare * 0.004, i, P.employer[i], -1);
  }
  for (const party of PARTIES) {
    const cash = Math.floor(L.balance(party.actor, DEP));
    if (cash <= 0) continue;
    const media = s.firms.filter((f) => f.good === 'NEWS' || f.good === 'ENTERTAINMENT' || f.good === 'TELECOM');
    if (!media.length) continue;
    const each = Math.floor(cash / media.length);
    let left = cash;
    media.forEach((f, n) => {
      const a = n === media.length - 1 ? left : each;
      if (a > 0 && pay(w, party.actor, f.id, a, 'politics.campaign', cause[0])) left -= a;
    });
  }
  if (topAmt <= 0) return;
  const donor = topPerson >= 0 ? P.name(topPerson) : topWho;
  const ev = w.events.emit('politics.donation', `${donor} gives ${(topAmt / 100).toFixed(0)} to ${PARTIES[topParty].name}`, cause, topPerson >= 0 ? P.id(topPerson) : topWho);
  const reg = PARTIES[st.gov].regulation;
  const bar = s.wage * (260 - 140 * reg);
  const sector = topFirm >= 0 ? s.firms[topFirm]?.sector ?? '' : '';
  const easy = sector !== '' && sector === st.boost;
  if (topPerson >= 0 && topAmt >= (easy ? bar * 1.8 : bar)) recordBribe(w, topPerson, topFirm, topAmt, ev);
}

function recordBribe(w: World, person: number, firm: number, gain: number, event: number): void {
  const st = pol(w), year = Math.floor(w.day / DAYS_PER_YEAR);
  if (st.bribeYear !== year) { st.bribeYear = year; st.bribeN = 0; }
  if (st.bribeN >= 2) return;
  const law = w.state.law as LawSt | undefined;
  const P = econ(w).P;
  const text = `${P.name(person)} paid ${(gain / 100).toFixed(0)} to buy a favour, a bribe`;
  w.events.emit('politics.bribe', text, [event], P.id(person));
  st.bribeN++;
  if (!law?.offences || !law.seenKey) return;
  const key = 'bribe:' + person + ':' + year;
  if (law.seenKey.has(key)) return;
  law.seenKey.add(key);
  law.offences.push({
    id: law.nextId++, kind: 'fraud', day: w.day, person, firm, bank: '',
    gain: Math.round(gain), qty: 0, vol: 0, knowers: 6, factId: -1, factEvent: event,
    tradeEvent: event, event, solid: true, used: false,
  });
  law.yOff++;
}

function subsidiseFrom(w: World, saved: Float64Array): void {
  const st = pol(w), s = econ(w);
  let top = 0, sum = 0;
  for (let i = 0; i < saved.length; i++) { sum += saved[i]; if (saved[i] > saved[top]) top = i; }
  if (!(sum > 0) || saved[top] < sum * 0.22 || saved[top] < s.wage * 30) { st.boost = ''; return; }
  const sec = SECTOR_NAMES[top];
  st.boost = sec;
  const firms = s.firms.filter((f) => !f.closed && f.sector === sec);
  if (!firms.length) return;
  const pool = Math.round(Math.min(saved[top] * 0.08, Math.max(s.taxEma, s.wage) * 2));
  const each = Math.floor(pool / firms.length);
  if (each <= 0) return;
  const cause = causes(w, st, [])[0];
  let paid = 0;
  for (const f of firms) if (treasury(w, f.id, each, 'politics.subsidy', cause)) paid += each;
  if (paid > 0) w.events.emit('politics.subsidy', `${PARTIES[st.gov].name} subsidises ${sec.toLowerCase()} with ${(paid / 100).toFixed(0)} after its donations`, causes(w, st, []), GOV);
}

function bailout(w: World): void {
  const banks = (w.state.banking as { banks?: BankRow[] } | undefined)?.banks;
  if (!banks) return;
  const s = econ(w), st = pol(w);
  for (const bank of banks) {
    if (w.day - (st.bailed[bank.id] ?? -10000) < DAYS_PER_YEAR) continue;
    const equity = w.ledger.netWorth(bank.id);
    if (equity >= 0 && !bank.failed) continue;
    const cap = Math.round(Math.max(s.yGdpEma, s.wage) * 12);
    const amt = Math.min(cap, Math.max(s.wage * 400, Math.round(-Math.min(0, equity) + s.wage * 800)));
    if (amt <= 0) continue;
    const cause = causes(w, st, bank.runEv > 0 ? [bank.runEv] : []);
    if (!treasury(w, bank.id, amt, 'politics.bailout', cause[0])) continue;
    st.bailed[bank.id] = w.day;
    const why = bank.failed ? 'failed' : 'ran out of capital';
    w.events.emit('politics.bailout', `the government bails out ${bank.id} with ${(amt / 100).toFixed(0)} after it ${why}`, cause, GOV);
  }
}

function openGovernment(w: World, poll: Poll | null, changed: boolean): void {
  const st = pol(w), P = econ(w).P, party = PARTIES[st.gov];
  const E = w.events;
  const who = `${P.name(st.leader)} (finance ${P.name(st.finance)}, governor ${P.name(st.governor)}, regulator ${P.name(st.regulator)})`;
  const prior = st.govEv >= 0 ? [st.govEv] : [w.genesis];
  if (poll) {
    const turn = poll.eligible > 0 ? (poll.turned / poll.eligible) * 100 : 0;
    st.electEv = E.emit('politics.election', `${shares(poll)}; margin ${(st.margin * 100).toFixed(1)}%; turnout ${turn.toFixed(0)}%`, prior, P.id(st.leader));
    const year = Math.floor(w.day / DAYS_PER_YEAR) + 1;
    const line = `Y${year} ${shares(poll)}`;
    st.elections.push(line);
    st.lastVote = line;
  }
  const verb = changed ? 'forms the government' : 'stays in office';
  st.govEv = E.emit('politics.government', `${party.name} ${verb} under ${who}`, poll ? [st.electEv] : prior, P.id(st.leader));
  st.platformEv = E.emit('politics.platform',
    `${party.name}: income tax ${(party.tax * 100).toFixed(0)}%, profit tax ${(party.profit * 100).toFixed(0)}%, dividend tax ${(party.dividend * 100).toFixed(0)}%, benefits ${(party.benefit * 100).toFixed(0)}%, regulation ${(party.regulation * 100).toFixed(0)}%`,
    [st.govEv], P.id(st.leader));
  const dove = dovishOf(party, P, st.governor);
  st.dovish = dove;
  E.emit('politics.governor', `${P.name(st.governor)} is appointed governor, dovishness ${dove.toFixed(2)}, by ${party.name} (independence ${(party.independence * 100).toFixed(0)}%)`, [st.platformEv], P.id(st.governor));
}

function blank(n: number, gov: number): Pol {
  const partyOf = new Int8Array(Math.max(16, n));
  partyOf.fill(-1);
  return {
    gov, terms: 1, leader: -1, finance: -1, governor: -1, regulator: -1, dovish: 0.5,
    approval: 0.5, margin: 0, electEv: -1, govEv: -1, platformEv: -1, slump: false, slumpEv: -1,
    told: -1, bribeYear: -1, bribeN: 0, boost: '', bailed: {}, favor: new Float64Array(SECTOR_NAMES.length),
    partyOf, incSnap: new Float64Array(Math.max(16, n)), elections: [], lastVote: 'appointed',
  };
}

export const politics: Module = {
  id: 'politics',

  init(w) {
    const s = econ(w);
    let gov = 0, gap = Infinity;
    for (let p = 0; p < PARTIES.length; p++) {
      const d = Math.abs(PARTIES[p].tax - s.taxRate);
      if (d < gap) { gap = d; gov = p; }
    }
    for (const party of PARTIES) w.ledger.addActor(party.actor, 'party');
    const st = blank(s.P.capacity, gov);
    w.state.politics = st;
    fillOffices(w, true);
    adopt(w, true);
    s.taxRate = s.taxAim ?? s.taxRate;
    snapIncome(w);
    openGovernment(w, null, true);
  },

  dayClose(w) {
    if ((w.day + 1) % 30 !== 0) return;
    bailout(w);
  },

  monthEnd(w) {
    const st = pol(w), s = econ(w);
    grow(st, s.P.n);
    const before = st.leader + ':' + st.finance + ':' + st.governor + ':' + st.regulator;
    fillOffices(w, false);
    const after = st.leader + ':' + st.finance + ':' + st.governor + ':' + st.regulator;
    if (after !== before) {
      const P = s.P;
      w.events.emit('politics.office', `${P.name(st.leader)}'s ministry replaces a vacant seat`, causes(w, st, []), P.id(st.leader));
    }
    for (let i = 0; i < st.favor.length; i++) st.favor[i] *= 0.9;
    const poll = tally(w, isElection(w));
    if (isElection(w) && poll.turned > 0) {
      const next = winner(poll, st.gov);
      const changed = next !== st.gov;
      st.margin = marginOf(poll);
      st.gov = next;
      st.terms = changed ? 1 : st.terms + 1;
      if (changed) fillOffices(w, true);
      openGovernment(w, poll, changed);
      snapIncome(w);
    }
    st.approval = poll.turned > 0 ? poll.votes[st.gov] / poll.turned : st.approval;
    const u = s.unemployment;
    if (!st.slump && u > 0.12) {
      st.slump = true;
      st.slumpEv = w.events.emit('politics.stimulus', `${PARTIES[st.gov].name} answers unemployment ${(u * 100).toFixed(1)}% with a tax cut and higher benefits`, causes(w, st, []), s.P.id(st.leader));
    } else if (st.slump && u < 0.09) st.slump = false;
    adopt(w, false);
    donations(w);
    subsidiseFrom(w, st.favor);
  },

  stats(w) {
    const st = pol(w), s = econ(w);
    return {
      government: PARTIES[st.gov].name,
      approval_pct: +(st.approval * 100).toFixed(1),
      margin_pct: +(st.margin * 100).toFixed(1),
      tax_pct: +(s.taxRate * 100).toFixed(1),
      profit_pct: +((s.profitTax ?? 0.2) * 100).toFixed(1),
      dividend_pct: +((s.divRate ?? 0.35) * 100).toFixed(1),
      benefit_pct: +((s.benefitRate ?? 0.4) * 100).toFixed(1),
      dovish: +st.dovish.toFixed(2),
      elections: st.elections.length,
      lastVote: st.lastVote,
    };
  },
};
