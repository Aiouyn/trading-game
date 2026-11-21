// Government bonds and a corporate credit curve. Bills and bonds are real claims of the treasury,
// auctioned when it needs cash and when debt matures, then traded on a price-time book. The short
// end is pinned by open-market operations. Longer yields are the average of expected future policy
// rates plus a term premium of about 0–1.5 points at ten years, higher when inflation is volatile.
// Corporate notes are claims on firms, a spread over the five-year: wider in a downturn and for a
// weaker rating, and written off when that firm defaults.
import { type Module, type World } from '../../kernel/index.ts';
import { noteLife, nextSessionText } from '../markets/index.ts';
import { isSeatPerson } from '../../kernel/seat.ts';
import { BANK, BOND, CB, DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { usd as moneyText } from '../player/gamedate.ts';

export const LOT = 16_000; // one bond, in cents of face. Par price is LOT. Coupons land on whole cents.
const RESV = 'resv';
const NATURAL_U = 0.07;
const TENORS = ['3m', '2y', '5y', '10y', '30y'] as const;
type Tenor = (typeof TENORS)[number];
type Side = 'buy' | 'sell';
type Src = 'fund' | 'bank' | 'person' | 'player';
const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B'] as const;
type Rating = (typeof RATINGS)[number];
const CORP_FACE = LOT * 4;
const CORP_LIFE = 1800;
const SPREAD0: Record<Rating, number> = { AAA: 0.004, AA: 0.0065, A: 0.01, BBB: 0.0155, BB: 0.031, B: 0.052 };
const SPREAD_B: Record<Rating, number> = { AAA: 0.4, AA: 0.55, A: 0.85, BBB: 1.4, BB: 2.2, B: 3 };
const RECOVERY: Record<Rating, number> = { AAA: 0.55, AA: 0.45, A: 0.4, BBB: 0.35, BB: 0.25, B: 0.15 };

interface Bond {
  id: string;
  tenor: Tenor;
  issueDay: number;
  matureDay: number;
  coupon: number;
  faceLeft: number;
  nextCoupon: number;
  last: number;
  prev: number;
  onRun: boolean;
  traded: boolean;
  issueEv: number;
}

interface Order {
  id: number;
  actor: string;
  instr: string;
  side: Side;
  qty: number;
  limit: number | null;
  seq: number;
  open: boolean;
  src: Src;
}

interface Bid {
  actor: string;
  qty: number;
  minYield: number;
  limit: number;
  people: boolean;
  bucket: number;
}

interface CorpBond {
  id: string;
  firm: string;
  firmIdx: number;
  rating: Rating;
  issueDay: number;
  matureDay: number;
  coupon: number;
  face: number;
  nextCoupon: number;
  last: number;
  dead: boolean;
  issueEv: number;
}

interface FundDef { id: string; mix: Record<Tenor, number> }

interface BankRow { id: string; depo: string; failed: boolean }

interface BondApi {
  fund(w: World, cents: number, cause: number): void;
  pay(w: World, to: string, cents: number, reason: string, cause: number): void;
  repay(w: World, spare: number, cause: number): void;
  coupons(w: World, cause: number): void;
}

interface BondState {
  api: BondApi;
  bonds: Bond[];
  funds: FundDef[];
  orders: Order[];
  nextId: number;
  seq: number;
  n: Record<Tenor, number>;
  y: Record<Tenor, number>;
  billGap: number;
  qeEase: number;
  raising: boolean;
  root: number;
  savers: Int32Array;
  saverMonth: number;
  saverAt: number;
  bank1Left: number;
  coverSum: number;
  coverN: number;
  lastCover: number;
  minSlope: number;
  markY10: number;
  haveMark: boolean;
  policyMark: number;
  yoyMark: number;
  debtMark: number;
  debtEv: number;
  stance: number;
  spread: Record<Rating, number>;
  corp: CorpBond[];
  corpCool: Int32Array;
  corpSeen: number;
  corpDefY: number;
  corpDefN: number;
  corpDefDays: number[];
  spreadMark: number;
  /** The central-bank decision whose curve has already been printed. */
  rateSeen?: number;
}

const FUNDS: FundDef[] = [
  { id: 'fund_bond_2y', mix: { '3m': 0.2, '2y': 0.45, '5y': 0.22, '10y': 0.13, '30y': 0 } },
  { id: 'fund_bond_10y', mix: { '3m': 0, '2y': 0.08, '5y': 0.18, '10y': 0.52, '30y': 0.22 } },
];

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): BondState => w.state.bonds as BondState;
const cashOf = (w: World, id: string): number => Math.floor(w.ledger.balance(id, DEP));
const isBank = (id: string): boolean => id.startsWith('bank_');

function yearsOf(t: Tenor): number {
  switch (t) {
    case '3m': return 0.25;
    case '2y': return 2;
    case '5y': return 5;
    case '10y': return 10;
    case '30y': return 30;
    default: { const n: never = t; return n; }
  }
}
function daysOf(t: Tenor): number {
  switch (t) {
    case '3m': return 90;
    case '2y': return 720;
    case '5y': return 1800;
    case '10y': return 3600;
    case '30y': return 10800;
    default: { const n: never = t; return n; }
  }
}
function easeOf(t: Tenor): number {
  switch (t) {
    case '3m': return 0;
    case '2y': return 0.15;
    case '5y': return 0.4;
    case '10y': return 0.75;
    case '30y': return 1;
    default: { const n: never = t; return n; }
  }
}

function lotDown(n: number): number { return Math.floor(n / LOT) * LOT; }
function lotUp(n: number): number { return Math.max(LOT, Math.ceil(n / LOT) * LOT); }
function invoice(face: number, px: number): number { return Math.round(face / LOT * px); }
function roundEighth(y: number): number { return Math.max(0, Math.round(y * 800) / 800); }

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }
function yoyOf(s: EconState): number {
  const n = s.cpiHist.length;
  const prev = n ? s.cpiHist[Math.max(0, n - 13)] : s.cpi;
  return prev > 0 ? s.cpi / prev - 1 : 0;
}
function ann3Of(s: EconState): number {
  const n = s.cpiHist.length;
  if (n < 4) return yoyOf(s);
  const prev = s.cpiHist[n - 4];
  if (!(prev > 0)) return yoyOf(s);
  return clamp(Math.pow(s.cpi / prev, 4) - 1, -0.05, 0.3);
}
/** Annualised inflation volatility. A burst that has already passed still leaves a range. */
function inflVol(s: EconState): number {
  const h = s.cpiHist;
  const n = h.length;
  if (n < 8) return 0.008;
  const m = Math.min(24, n - 1);
  let sum = 0, sum2 = 0;
  for (let i = n - m; i < n; i++) {
    const g = h[i - 1] > 0 ? h[i] / h[i - 1] - 1 : 0;
    sum += g; sum2 += g * g;
  }
  const mean = sum / m;
  const sd = Math.sqrt(Math.max(0, sum2 / m - mean * mean)) * Math.sqrt(12);
  let lo = Infinity, hi = -Infinity;
  const k = Math.min(24, n);
  for (let i = n - k; i < n; i++) {
    const back = i >= 12 ? h[i - 12] : h[0];
    const y = back > 0 ? h[i] / back - 1 : 0;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return Math.max(sd, Math.max(0, hi - lo) * 0.45);
}
function debtLoad(w: World): number {
  const s = econ(w);
  if (w.day < 90 || s.yGdpEma < 1000) return 0.7;
  const debt = w.ledger.issued.get(BOND) ?? 0;
  return Math.min(2, Math.max(0.4, debt / (s.yGdpEma * 360) / 0.45));
}
/** Where the central bank wants the policy rate, given inflation and unemployment. */
function cbWant(infl: number, u: number, piStar: number): number {
  const uGap = NATURAL_U - u;
  const uCoef = uGap > 0.025 && infl < 0.045 ? 1.1 : 0.5;
  return clamp(0.02 + infl + 0.5 * (infl - piStar) + uCoef * uGap, 0, 0.16);
}
/** Rate the curve expects policy to settle at: the rule at anchored inflation, plus a memory of the stance. */
function longRun(yoy: number, piStar: number, stance: number): number {
  const infl = piStar + 0.45 * clamp(yoy - piStar, -0.03, 0.04);
  const steady = clamp(0.02 + infl + 0.5 * (infl - piStar), 0.01, 0.08);
  const remembered = stance > 0 ? stance : steady;
  return clamp(0.62 * steady + 0.38 * remembered, 0.008, 0.09);
}
function pathAvg(policy: number, oneYear: number, dest: number, T: number): number {
  const lam = 0.45;
  if (T <= 1) return (policy + policy + (oneYear - policy) * T) / 2;
  const avg1 = (policy + oneYear) / 2;
  const span = T - 1;
  const decay = (1 - Math.exp(-lam * span)) / (lam * span);
  return (avg1 + (dest + (oneYear - dest) * decay) * span) / T;
}
function termPremium(years: number, vol: number, load: number): number {
  const tp10 = clamp(0.0022 + 0.42 * vol, 0.0022, 0.015);
  return tp10 * Math.pow(years / 10, 0.55) + 0.0012 * Math.max(0, load - 1) * Math.min(1, years / 10);
}
function modelYield(w: World, tenor: Tenor): number {
  const s = econ(w), st = book(w);
  if (tenor === '3m') return Math.max(0, s.policyRate + st.billGap);
  const years = yearsOf(tenor);
  const policy = s.policyRate;
  const yoy = clamp(yoyOf(s), -0.02, 0.12);
  const ann3 = ann3Of(s);
  const piStar = s.inflTarget ?? 0.02;
  const u = s.unemployment;
  const near = cbWant(clamp((yoy + ann3) / 2, -0.02, 0.12), u, piStar);
  let oneYear = policy + 0.5 * (near - policy);
  const dest = longRun(yoy, piStar, st.stance);
  const real = policy - yoy;
  const restrictive = real > 0.012 && policy > dest + 0.006;
  const tight = u < 0.05;
  const cooling = ann3 + 0.003 < yoy;
  const rising = u > s.uEma + 0.003;
  // Cuts priced before the slump: a tight labour market, or inflation already rolling over, under a high real rate.
  if (restrictive && (tight || cooling || rising)) {
    const depth = Math.min(0.022, (real - 0.008) * 0.6 + (rising ? (u - s.uEma) * 2.5 : 0) + (tight ? 0.005 : 0));
    oneYear = Math.min(oneYear, Math.max(0, policy - depth));
  }
  if (u > 0.1 && policy + 0.01 < dest) oneYear = Math.max(oneYear, policy + Math.min(0.012, (dest - policy) * 0.3));
  oneYear = clamp(oneYear, 0, 0.14);
  const y = pathAvg(policy, oneYear, dest, years) + termPremium(years, inflVol(s), debtLoad(w)) - st.qeEase * easeOf(tenor);
  return Math.max(0, y);
}

/** Dirty price of one lot at `yld`: remaining coupons and principal. Accrued interest is inside that price, and the coupon date pays it out in cash. */
function pricePerLot(b: Pick<Bond, 'tenor' | 'coupon' | 'issueDay' | 'matureDay'>, yld: number, day: number): number {
  const left = b.matureDay - day;
  if (left <= 0) return LOT;
  const y = Math.max(-0.05, Math.min(0.4, yld));
  if (b.tenor === '3m') return Math.max(1, Math.round(LOT / (1 + Math.max(0, y) * left / 360)));
  const payC = LOT * b.coupon / 2;
  const df = (days: number): number => 1 / Math.pow(1 + y / 2, days / 180);
  let pv = LOT * df(left);
  for (let t = b.issueDay + 180; t <= b.matureDay; t += 180) if (t > day) pv += payC * df(t - day);
  return Math.max(1, Math.round(pv));
}
function yieldFromPrice(b: Bond, price: number, day: number): number {
  if (b.matureDay <= day) return 0;
  let y = Math.max(0.001, b.coupon || 0.03);
  for (let k = 0; k < 16; k++) {
    const p = pricePerLot(b, y, day);
    if (Math.abs(p - price) <= 1) return y;
    const dp = pricePerLot(b, y + 1e-4, day) - p;
    if (Math.abs(dp) < 1e-6) break;
    y = Math.max(-0.02, Math.min(0.4, y - (p - price) / (dp / 1e-4)));
  }
  return y;
}

function banksOf(w: World): BankRow[] {
  const b = w.state.banking as { banks?: BankRow[] } | undefined;
  return b?.banks ?? [];
}
function depositsOf(w: World, bank: BankRow): number {
  const L = w.ledger;
  return (L.issued.get(bank.depo) ?? 0) + (bank.id === BANK ? (L.issued.get(DEP) ?? 0) : 0);
}
function heldTenors(w: World, actor: string): Record<Tenor, number> {
  const h: Record<Tenor, number> = { '3m': 0, '2y': 0, '5y': 0, '10y': 0, '30y': 0 };
  const L = w.ledger;
  for (const b of book(w).bonds) {
    if (b.faceLeft <= 0) continue;
    const v = L.balance(actor, b.id);
    if (v > 0) h[b.tenor] += v;
  }
  return h;
}
function onRun(w: World, tenor: Tenor): Bond | undefined {
  const list = book(w).bonds;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].tenor === tenor && list[i].onRun && list[i].faceLeft > 0 && list[i].matureDay > w.day) return list[i];
  return undefined;
}
function appetite(cY: number, resil: number): number {
  const bold = Math.min(1, Math.max(0, (cY - 0.86) / 0.13));
  return 0.55 * bold + 0.45 * (resil / 100);
}
function hurdle(w: World, a: number, tenor: Tenor): number {
  const dep = Math.max(0, econ(w).policyRate - 0.01);
  return dep + 0.004 + (1 - a) * 0.012 + yearsOf(tenor) * 0.0008 * (1 - a);
}
function bucketOf(a: number): number { return a >= 0.75 ? 0 : a >= 0.5 ? 1 : a >= 0.25 ? 2 : 3; }

function policyCause(w: World): number {
  return w.events.last('macro.jobs') ?? w.events.last('cb.rate') ?? econ(w).rateEv;
}

function shadow(w: World, face: number, cause: number, repay: boolean): void {
  const L = w.ledger;
  if (face <= 0) return;
  if (!repay) { L.issue(BOND, GOV, face, 'gov.borrow', cause); return; }
  if (!L.redeem(BOND, GOV, face, 'gov.repay', cause)) throw new Error(`shadow short by ${face - L.balance(GOV, BOND)}`);
}

function mint(w: World, tenor: Tenor, coupon: number, cause: number): Bond {
  const st = book(w);
  st.n[tenor]++;
  const day = w.day;
  const b: Bond = {
    id: `bond:${tenor}:${String(st.n[tenor]).padStart(4, '0')}`,
    tenor, issueDay: day, matureDay: day + daysOf(tenor), coupon,
    faceLeft: 0, nextCoupon: tenor === '3m' ? -1 : day + 180,
    last: LOT, prev: LOT, onRun: true, traded: false, issueEv: cause,
  };
  for (const o of st.bonds) if (o.tenor === tenor) o.onRun = false;
  w.ledger.define({ id: b.id, kind: 'claim', issuer: GOV });
  st.bonds.push(b);
  b.last = pricePerLot(b, modelYield(w, tenor), day);
  b.prev = b.last;
  return b;
}
function thisMonth(w: World, tenor: Tenor): Bond | undefined {
  const start = Math.floor(w.day / 30) * 30;
  const b = onRun(w, tenor);
  if (b && b.issueDay >= start && b.matureDay > w.day + 15) return b;
  return undefined;
}

/** Give `buyer` `face` cents of a bond and take `payC` from them. bank_1 pays by creating deposits. */
function deliver(w: World, b: Bond, buyer: string, face: number, payC: number, cause: number): boolean {
  const L = w.ledger;
  if (face <= 0 || payC <= 0) return false;
  if (buyer === BANK) L.issue(DEP, GOV, payC, 'bond.auction', cause);
  else if (!pay(w, buyer, GOV, payC, 'bond.auction', cause)) return false;
  L.issue(b.id, buyer, face, 'bond.auction', cause);
  b.faceLeft += face;
  return true;
}

function mix(policy: number): Record<Tenor, number> {
  const hot = Math.min(1, Math.max(0, (policy - 0.03) / 0.05));
  return { '3m': 0.12 + 0.36 * hot, '2y': 0.16, '5y': 0.22, '10y': 0.32 - 0.22 * hot, '30y': 0.18 - 0.14 * hot };
}
function splitCash(total: number, policy: number): number[] {
  const wts = mix(policy);
  const left0 = Math.max(0, Math.round(total));
  if (left0 < LOT * 4) return TENORS.map((_, i) => (i === 0 ? left0 : 0));
  const out = TENORS.map((t) => Math.floor(left0 * wts[t]));
  out[0] += left0 - out.reduce((a, b) => a + b, 0);
  return out;
}

function rebuildSavers(w: World): void {
  const st = book(w), s = econ(w), P = s.P, L = w.ledger;
  if (st.saverMonth === w.month && st.savers.length) return;
  const ids: number[] = [];
  for (let i = 0; i < P.n; i++) {
    if (isSeatPerson(w, i)) continue;
    if ((P.flags[i] & 1) === 0 || w.day < P.fearUntil[i]) continue;
    const inc = P.incEma[i];
    if (!(inc > 0)) continue;
    if (L.balS(P.slot[i], DEP) - inc * 180 < LOT) continue;
    ids.push(i);
  }
  if (ids.length > 8000) {
    ids.sort((a, b) => L.balS(P.slot[b], DEP) - L.balS(P.slot[a], DEP));
    ids.length = 8000;
  }
  st.savers = Int32Array.from(ids);
  st.saverMonth = w.month;
}

function collectBids(w: World, tenor: Tenor, face: number, yModel: number, px: number): Bid[] {
  const st = book(w), s = econ(w), P = s.P, L = w.ledger;
  const bids: Bid[] = [];
  const depStock = L.issued.get(DEP) ?? 0;
  let publicCash = Math.max(LOT, Math.round(depStock * 0.01));
  // Bond funds: duration target, paid for out of the deposits they actually hold.
  for (const f of st.funds) {
    const h = heldTenors(w, f.id);
    let invested = 0;
    for (const t of TENORS) invested += h[t];
    const wealth = invested + cashOf(w, f.id);
    const want = lotDown(wealth * 0.9 * f.mix[tenor] - h[tenor]);
    const afford = lotDown(cashOf(w, f.id) * LOT / px);
    const qty = Math.min(face, want, afford, lotDown(publicCash * LOT / Math.max(1, px)));
    if (qty < LOT) continue;
    publicCash -= invoice(qty, px);
    const y = Math.max(0, yModel - 0.0005);
    bids.push({ actor: f.id, qty, minYield: y, limit: px + 2, people: false, bucket: -1 });
  }
  // Banks bid the gap in their liquidity buffer. Only bank_1 can create deposits, so the others are capped by cash.
  const hot = Math.min(1, Math.max(0, (s.policyRate - 0.03) / 0.05));
  for (const bank of banksOf(w)) {
    if (bank.failed) continue;
    const h = heldTenors(w, bank.id);
    const assets = Math.max(0, w.ledger.netWorth(bank.id) + depositsOf(w, bank));
    const billT = assets * (0.05 + 0.08 * hot);
    const bondT = assets * 0.08;
    let heldLong = 0;
    for (const t of TENORS) if (t !== '3m') heldLong += h[t];
    const gap = tenor === '3m' ? billT - h['3m'] : (bondT - heldLong) / 4;
    let qty = Math.min(face, lotDown(Math.max(0, gap)));
    if (bank.id !== BANK) qty = Math.min(qty, lotDown(cashOf(w, bank.id) * LOT / px));
    if (qty < LOT) continue;
    const y = Math.max(0, yModel - 0.0004);
    bids.push({ actor: bank.id, qty, minYield: y, limit: px + 1, people: false, bucket: -1 });
  }
  // Savers whose yield hurdle clears the model. Capped so one auction cannot drain the deposit stock.
  rebuildSavers(w);
  const bucketCash = [0, 0, 0, 0];
  const bucketA = [0, 0, 0, 0];
  const bucketN = [0, 0, 0, 0];
  for (let k = 0; k < st.savers.length; k++) {
    const i = st.savers[k];
    if ((P.flags[i] & 1) === 0) continue;
    const a = appetite(P.cY[i], P.resil[i]);
    const b = bucketOf(a);
    const surplus = L.balS(P.slot[i], DEP) - P.incEma[i] * 180;
    if (surplus < LOT) continue;
    bucketCash[b] += surplus;
    bucketA[b] += a;
    bucketN[b]++;
  }
  let peopleFace = lotDown(Math.min(face * 0.35, publicCash * LOT / px));
  for (let b = 0; b < 4 && peopleFace >= LOT; b++) {
    if (!bucketN[b]) continue;
    const a = bucketA[b] / bucketN[b];
    const y = hurdle(w, a, tenor);
    if (y > yModel + 0.001) continue;
    const qty = Math.min(peopleFace, lotDown(bucketCash[b] * 0.2));
    if (qty < LOT) continue;
    peopleFace -= qty;
    bids.push({ actor: '', qty, minYield: y, limit: pricePerLot(ghost(w, tenor, roundEighth(y)), y, w.day), people: true, bucket: b });
  }
  // Primary dealer: bank_1 takes whatever is left at the model yield, so the auction clears.
  bids.push({ actor: BANK, qty: face, minYield: yModel, limit: px, people: false, bucket: -1 });
  return bids;
}

function ghost(w: World, tenor: Tenor, coupon: number): Bond {
  const day = w.day;
  return {
    id: '', tenor, issueDay: day, matureDay: day + daysOf(tenor), coupon, faceLeft: 0,
    nextCoupon: -1, last: LOT, prev: LOT, onRun: false, traded: false, issueEv: 0,
  };
}

function fillPeople(w: World, b: Bond, bucket: number, face: number, px: number, cause: number): number {
  const st = book(w), P = econ(w).P, L = w.ledger;
  let left = face;
  const n = st.savers.length;
  if (!n) return 0;
  const start = st.saverAt % n;
  let seen = 0;
  for (let step = 0; step < n && left >= LOT && seen < 400; step++) {
    const i = st.savers[(start + step) % n];
    st.saverAt = (start + step + 1) % n;
    if (i === ((w.state.player as { who?: number } | undefined)?.who ?? -1)) continue;
    if ((P.flags[i] & 1) === 0) continue;
    if (bucketOf(appetite(P.cY[i], P.resil[i])) !== bucket) continue;
    seen++;
    const surplus = L.balS(P.slot[i], DEP) - P.incEma[i] * 180;
    let qty = Math.min(left, lotDown(surplus * 0.25));
    if (qty < LOT) continue;
    const cost = invoice(qty, px);
    if (L.balS(P.slot[i], DEP) < cost) qty = lotDown(L.balS(P.slot[i], DEP) * LOT / px);
    if (qty < LOT) continue;
    if (!deliver(w, b, P.id(i), qty, invoice(qty, px), cause)) continue;
    left -= qty;
  }
  return face - left;
}

function auction(w: World, tenor: Tenor, cashNeed: number, cause: number): number {
  if (cashNeed <= 0) return 0;
  const yModel = modelYield(w, tenor);
  const existing = thisMonth(w, tenor);
  const coupon = existing ? existing.coupon : roundEighth(yModel);
  const draft = existing ?? ghost(w, tenor, coupon);
  const px0 = pricePerLot(draft, yModel, w.day);
  const face = lotUp(cashNeed * LOT / px0);
  const bids = collectBids(w, tenor, face, yModel, px0);
  let offer = 0;
  for (const bid of bids) offer += bid.qty;
  bids.sort((a, b) => b.limit - a.limit || a.minYield - b.minYield);
  const winners: Bid[] = [];
  let cum = 0, clear = yModel;
  for (const bid of bids) {
    winners.push(bid);
    cum += bid.qty;
    clear = bid.minYield;
    if (cum >= face) break;
  }
  if (cum < face) throw new Error(`auction failed ${tenor}: covered ${cum} of ${face}`);
  const bond = existing ?? mint(w, tenor, roundEighth(clear), cause);
  const px = pricePerLot(bond, clear, w.day);
  const ev = w.events.emit('bond.auction', `${bond.id} ${(face / 1e8).toFixed(2)}M face, yield ${(clear * 100).toFixed(2)}%, cover ${(offer / face).toFixed(2)}`, [cause], GOV);
  if (!existing) bond.issueEv = ev;
  let left = face, filled = 0;
  for (const bid of winners) {
    if (left < LOT) break;
    const qty = lotDown(Math.min(bid.qty, left));
    if (qty < LOT) continue;
    let got = 0;
    if (bid.people) got = fillPeople(w, bond, bid.bucket, qty, px, ev);
    else if (deliver(w, bond, bid.actor, qty, invoice(qty, px), ev)) got = qty;
    left -= got;
    filled += got;
  }
  if (left >= LOT) {
    if (!deliver(w, bond, BANK, left, invoice(left, px), ev)) throw new Error(`backstop failed ${bond.id}`);
    filled += left;
  }
  shadow(w, filled, ev, false);
  const st = book(w);
  const cover = offer / face;
  st.coverSum += cover;
  st.coverN++;
  st.lastCover = cover;
  bond.last = px;
  bond.prev = px;
  return invoice(filled, px);
}

function monetise(w: World, cashNeed: number, cause: number): void {
  if (cashNeed <= 0) return;
  const y = modelYield(w, '3m');
  const existing = thisMonth(w, '3m');
  const bond = existing ?? mint(w, '3m', roundEighth(y), cause);
  const px = pricePerLot(bond, y, w.day);
  const face = lotUp(cashNeed * LOT / px);
  const ev = w.events.emit('bond.auction', `${bond.id} dealer takes ${(face / 1e8).toFixed(2)}M at ${(y * 100).toFixed(2)}%`, [cause], GOV);
  if (!deliver(w, bond, BANK, face, invoice(face, px), ev)) throw new Error('monetise failed');
  shadow(w, face, ev, false);
  book(w).lastCover = Math.max(book(w).lastCover, 1);
  book(w).coverSum += 1;
  book(w).coverN++;
}

function raise(w: World, gap: number, cause: number): void {
  const parts = splitCash(gap, econ(w).policyRate);
  for (let i = 0; i < TENORS.length; i++) if (parts[i] > 0) auction(w, TENORS[i], parts[i], cause);
}
/** Refinance maturing principal into whichever tenors are short of the debt-management mix. */
function raiseRoll(w: World, matureFace: number, cause: number): void {
  if (matureFace <= 0) return;
  const have: Record<Tenor, number> = { '3m': 0, '2y': 0, '5y': 0, '10y': 0, '30y': 0 };
  const mat: Record<Tenor, number> = { '3m': 0, '2y': 0, '5y': 0, '10y': 0, '30y': 0 };
  for (const b of book(w).bonds) {
    if (b.faceLeft <= 0) continue;
    have[b.tenor] += b.faceLeft;
    if (b.matureDay <= w.day) mat[b.tenor] += b.faceLeft;
  }
  const total = TENORS.reduce((s, t) => s + have[t], 0);
  const wts = mix(econ(w).policyRate);
  const gaps = TENORS.map((t) => Math.max(0, total * wts[t] - (have[t] - mat[t])));
  const gsum = gaps.reduce((a, b) => a + b, 0);
  const parts = gsum > 0 ? gaps.map((g) => Math.floor(matureFace * g / gsum)) : splitCash(matureFace, econ(w).policyRate);
  if (gsum > 0) parts[0] += matureFace - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < TENORS.length; i++) if (parts[i] > 0) auction(w, TENORS[i], parts[i], cause);
}

function fund(w: World, cents: number, cause: number): void {
  const st = book(w);
  if (cents <= 0 || cashOf(w, GOV) >= cents) return;
  const gap = cents - cashOf(w, GOV);
  if (st.raising) { monetise(w, gap, cause); return; }
  st.raising = true;
  try {
    raise(w, gap, cause);
    const still = cents - cashOf(w, GOV);
    if (still > 0) monetise(w, still, cause);
  } finally { st.raising = false; }
}

function redeemFrom(w: World, b: Bond, take: number, cause: number, reason: string): number {
  const L = w.ledger;
  const rows = [...L.holdersS(b.id)].filter(([, v]) => v > 0);
  let left = Math.min(Math.floor(take), rows.reduce((s, [, v]) => s + v, 0), cashOf(w, GOV));
  if (left <= 0) return 0;
  let paid = 0;
  for (const [slot, v] of rows) {
    if (left <= 0) break;
    const a = Math.min(Math.floor(v), left);
    if (a <= 0) continue;
    const id = L.ids[slot];
    if (!pay(w, GOV, id, a, reason, cause)) break;
    if (!L.redeem(b.id, id, a, reason, cause)) throw new Error(`redeem ${b.id} from ${id}`);
    paid += a;
    left -= a;
  }
  if (paid > 0) {
    shadow(w, paid, cause, true);
    b.faceLeft = Math.max(0, Math.round(L.issued.get(b.id) ?? 0));
    if (b.faceLeft <= 0) b.onRun = false;
  }
  return paid;
}

function payDue(w: World, cause: number): void {
  const L = w.ledger, st = book(w);
  const due = st.bonds.filter((b) => b.faceLeft > 0 && (b.matureDay <= w.day || (b.nextCoupon >= 0 && b.nextCoupon <= w.day)));
  if (!due.length) return;
  let need = 0;
  const plan: { b: Bond; coupons: number; mature: boolean }[] = [];
  for (const b of due) {
    let coupons = 0, t = b.nextCoupon;
    while (t >= 0 && t <= w.day) { coupons++; t = t + 180 <= b.matureDay ? t + 180 : -1; }
    const mature = b.matureDay <= w.day;
    let coup = 0;
    if (coupons > 0) {
      for (const [, v] of L.holdersS(b.id)) if (v > 0) coup += Math.round(v * b.coupon / 2) * coupons;
    }
    need += coup + (mature ? Math.round(L.issued.get(b.id) ?? 0) : 0);
    plan.push({ b, coupons, mature });
  }
  const causes = plan.filter((p) => p.mature).map((p) => p.b.issueEv).slice(0, 4);
  const ev = w.events.emit('bond.service', `treasury pays ${(need / 1e8).toFixed(2)}M of coupons and maturities`, causes.length ? causes : [cause], GOV);
  // Roll the principal even when the treasury has the cash. Paying it off with
  // idle cash would retire the bill market; spare cash retires debt later, on purpose.
  let maturing = 0;
  for (const p of plan) if (p.mature) maturing += Math.round(L.issued.get(p.b.id) ?? 0);
  if (maturing > 0) raiseRoll(w, maturing, ev);
  fund(w, need, ev);
  for (const p of plan) {
    if (p.coupons > 0) {
      for (const [slot, v] of [...L.holdersS(p.b.id)]) {
        if (v <= 0) continue;
        const c = Math.round(v * p.b.coupon / 2) * p.coupons;
        if (c > 0 && !pay(w, GOV, L.ids[slot], c, 'gov.coupon', ev)) throw new Error(`coupon unpaid on ${p.b.id}`);
      }
      let t = p.b.nextCoupon;
      for (let k = 0; k < p.coupons; k++) t = t + 180 <= p.b.matureDay ? t + 180 : -1;
      p.b.nextCoupon = t;
    }
    if (p.mature) {
      const face = Math.round(L.issued.get(p.b.id) ?? 0);
      const got = redeemFrom(w, p.b, face, ev, 'bond.mature');
      if (got !== face) throw new Error(`${p.b.id} matured ${got} of ${face}`);
    }
  }
  // Maturity pays the central bank in deposits. Spend them on the new bill the same day
  // so the open-market book rolls instead of turning into idle cash.
  reinvestCb(w, ev);
}

function liveBills(w: World): Bond[] {
  return book(w).bonds.filter((b) => b.tenor === '3m' && b.faceLeft > 0 && b.matureDay > w.day);
}
function reinvestCb(w: World, cause: number): void {
  let cash = cashOf(w, CB);
  if (cash < LOT) return;
  for (const bill of liveBills(w)) {
    if (cash < LOT) break;
    const px = Math.max(1, bill.last || pricePerLot(bill, econ(w).policyRate, w.day));
    const holders = [...w.ledger.holdersS(bill.id)].sort((a, b) => {
      const ia = w.ledger.ids[a[0]], ib = w.ledger.ids[b[0]];
      return (ia === BANK ? 1 : 0) - (ib === BANK ? 1 : 0);
    });
    for (const [slot, v] of holders) {
      if (cash < px) break;
      const id = w.ledger.ids[slot];
      if (id === CB || id === GOV) continue;
      const held = lotDown(v);
      const qty = Math.min(held, lotDown(cash / px * LOT));
      if (qty < LOT) continue;
      if (!pay(w, CB, id, invoice(qty, px), 'cb.omo', cause)) continue;
      if (!w.ledger.move(bill.id, id, CB, qty, 'cb.omo', cause)) throw new Error('cb roll');
      cash = cashOf(w, CB);
    }
  }
}

function repay(w: World, spare: number, cause: number): void {
  let left = Math.min(Math.floor(spare), cashOf(w, GOV));
  // Bills stay outstanding so the open-market book has something to trade. Spare cash retires longer bonds.
  const list = book(w).bonds.filter((b) => b.faceLeft > 0 && b.tenor !== '3m').sort((a, b) => b.coupon - a.coupon || a.matureDay - b.matureDay);
  for (const b of list) {
    if (left < 1) break;
    left -= redeemFrom(w, b, left, cause, 'gov.repay');
  }
}

function heirsOf(w: World, i: number): number[] {
  const P = econ(w).P;
  const sp = P.spouse[i];
  if (sp >= 0 && P.alive(sp)) return [sp];
  return P.kids(i).filter((k) => P.alive(k));
}
function estates(w: World): void {
  if (w.day <= 0 || w.day % 360 !== 0) return;
  const L = w.ledger, P = econ(w).P, st = book(w);
  const ids = st.bonds.filter((b) => b.faceLeft > 0).map((b) => b.id).concat(st.funds.map((f) => 'eq:' + f.id));
  for (const instr of ids) {
    if (!L.instruments.has(instr)) continue;
    const bond = st.bonds.find((b) => b.id === instr);
    for (const [slot, v0] of [...L.holdersS(instr)]) {
      const v = Math.floor(v0);
      if (v <= 0) continue;
      const id = L.ids[slot];
      if (!id.startsWith('p_')) continue;
      const i = +id.slice(2);
      if (P.alive(i)) continue;
      const heirs = heirsOf(w, i);
      if (!heirs.length) {
        if (bond) {
          if (!L.redeem(instr, id, v, 'estate.escheat', st.root)) throw new Error('escheat redeem');
          shadow(w, v, st.root, true);
          bond.faceLeft = Math.max(0, Math.round(L.issued.get(instr) ?? 0));
        } else L.move(instr, id, GOV, v, 'estate.escheat', st.root);
        continue;
      }
      let left = v;
      heirs.forEach((h, k) => {
        const a = k === heirs.length - 1 ? left : Math.floor(v / heirs.length);
        if (a > 0) L.move(instr, id, P.id(h), a, 'estate.inherit', st.root);
        left -= a;
      });
    }
  }
}

function reserveGap(w: World): { need: number; have: number; deposits: number } {
  let need = 0, have = 0, deposits = 0;
  for (const bank of banksOf(w)) {
    if (bank.failed) continue;
    const dep = depositsOf(w, bank);
    deposits += dep;
    need += Math.round(dep * 0.02);
    have += Math.max(0, w.ledger.balance(bank.id, RESV));
  }
  return { need, have, deposits };
}
function setBillGap(w: World): void {
  const g = reserveGap(w);
  const scarcity = g.deposits > 0 ? (g.need - g.have) / g.deposits : 0;
  book(w).billGap = Math.max(-0.002, Math.min(0.004, scarcity * 0.5));
}

function cbBuy(w: World, seller: string, b: Bond, qty: number, payC: number, cause: number, reason: string): boolean {
  const L = w.ledger;
  if (qty < LOT || L.balance(seller, b.id) < qty) return false;
  if (isBank(seller)) L.issue(RESV, seller, payC, reason, cause);
  else { L.issue(RESV, BANK, payC, reason, cause); L.issue(DEP, seller, payC, reason, cause); }
  if (!L.move(b.id, seller, CB, qty, reason, cause)) throw new Error('cb buy');
  return true;
}
function cbSell(w: World, buyer: string, b: Bond, qty: number, payC: number, cause: number, reason: string): boolean {
  const L = w.ledger;
  if (qty < LOT || L.balance(CB, b.id) < qty) return false;
  if (isBank(buyer)) {
    if (L.balance(buyer, RESV) < payC || !L.redeem(RESV, buyer, payC, reason, cause)) return false;
  } else if (!pay(w, buyer, CB, payC, reason, cause)) return false;
  if (!L.move(b.id, CB, buyer, qty, reason, cause)) throw new Error('cb sell');
  return true;
}

function omo(w: World): void {
  if (w.day < 30) return;
  setBillGap(w);
  const bills = liveBills(w);
  if (!bills.length) return;
  const g = reserveGap(w);
  const gap = g.need - g.have;
  if (Math.abs(gap) < LOT) { setBillGap(w); return; }
  const y = econ(w).policyRate;
  const cause = policyCause(w);
  const ev = w.events.emit('cb.omo', `open market ${gap > 0 ? 'buys' : 'sells'} bills so overnight stays at ${(y * 100).toFixed(2)}%`, [cause], CB);
  if (gap > 0) {
    let left = gap;
    for (const bill of bills) {
      const px = Math.max(1, pricePerLot(bill, y, w.day));
      for (const bank of banksOf(w)) {
        if (left < px) break;
        if (bank.failed) continue;
        const held = lotDown(w.ledger.balance(bank.id, bill.id));
        const qty = Math.min(held, lotDown(left / px * LOT));
        if (qty < LOT) continue;
        const payC = invoice(qty, px);
        if (!cbBuy(w, bank.id, bill, qty, payC, ev, 'cb.omo')) continue;
        left -= payC;
        bill.last = px;
        bill.traded = true;
      }
    }
  } else {
    let left = -gap;
    for (const bill of bills) {
      const px = Math.max(1, pricePerLot(bill, y, w.day));
      for (const bank of banksOf(w)) {
        if (left < px) break;
        if (bank.failed) continue;
        const res = w.ledger.balance(bank.id, RESV);
        const qty = Math.min(lotDown(w.ledger.balance(CB, bill.id)), lotDown(Math.min(left, res) / px * LOT));
        if (qty < LOT) continue;
        const payC = invoice(qty, px);
        if (!cbSell(w, bank.id, bill, qty, payC, ev, 'cb.omo')) continue;
        left -= payC;
        bill.last = px;
        bill.traded = true;
      }
    }
  }
  setBillGap(w);
}

function qe(w: World): void {
  const s = econ(w), st = book(w);
  const crisis = s.unemployment > 0.12 && s.policyRate <= 0.0075;
  if (!crisis) { st.qeEase = Math.max(0, st.qeEase - 0.0005); return; }
  st.qeEase = Math.min(0.004, st.qeEase + 0.0005);
  const causes: number[] = [];
  const jobs = w.events.last('macro.jobs'), rate = w.events.last('cb.rate');
  if (jobs !== undefined) causes.push(jobs);
  if (rate !== undefined && rate !== jobs) causes.push(rate);
  if (!causes.length) causes.push(s.macroEv);
  const ev = w.events.emit('cb.qe', `buys long bonds; unemployment ${(s.unemployment * 100).toFixed(1)}% and the policy rate is ${(s.policyRate * 100).toFixed(2)}%`, causes, CB);
  const budget = Math.max(LOT, Math.round((w.ledger.issued.get(BOND) ?? 0) * 0.004));
  for (const tenor of ['10y', '30y'] as const) {
    const b = onRun(w, tenor);
    if (!b) continue;
    const px = pricePerLot(b, Math.max(0, modelYield(w, tenor)), w.day);
    let left = Math.round(budget / 2);
    const sellers = [...w.ledger.holdersS(b.id)].filter(([slot, v]) => v >= LOT && w.ledger.ids[slot] !== CB);
    for (const [slot, v] of sellers) {
      if (left < px) break;
      const qty = Math.min(lotDown(v * 0.05), lotDown(left / px * LOT));
      if (qty < LOT) continue;
      const payC = invoice(qty, px);
      if (!cbBuy(w, w.ledger.ids[slot], b, qty, payC, ev, 'cb.qe')) continue;
      left -= payC;
      b.last = px;
      b.traded = true;
    }
  }
}

function place(w: World, actor: string, instr: string, side: Side, qty: number, limit: number | null, src: Src): number {
  const st = book(w);
  const o: Order = { id: st.nextId++, actor, instr, side, qty: lotDown(qty), limit, seq: st.seq++, open: true, src };
  if (o.qty >= LOT) st.orders.push(o);
  return o.id;
}
function cancelSrc(w: World, actor: string, instr: string, src: Src): void {
  for (const o of book(w).orders) if (o.open && o.actor === actor && o.instr === instr && o.src === src) o.open = false;
}
function noise(w: World, key: string, qty: number): number {
  if (qty < LOT) return 0;
  return Math.max(LOT, lotDown(qty * (0.85 + 0.3 * w.rng(key).next())));
}
function fillPrice(bid: Order, ask: Order, last: number): number {
  const rest = bid.seq < ask.seq ? bid : ask;
  const inc = rest === bid ? ask : bid;
  if (rest.limit !== null) return rest.limit;
  if (inc.limit !== null) return inc.limit;
  return last;
}

function quote(w: World, b: Bond, bankAssets: Map<string, number>): void {
  const st = book(w);
  const fair = pricePerLot(b, modelYield(w, b.tenor), w.day);
  for (const f of st.funds) {
    cancelSrc(w, f.id, b.id, 'fund');
    const h = heldTenors(w, f.id);
    let invested = 0;
    for (const t of TENORS) invested += h[t];
    const wealth = Math.max(1, invested + cashOf(w, f.id));
    const target = wealth * 0.9 * f.mix[b.tenor];
    const skew = Math.max(-1, Math.min(1, (h[b.tenor] - target) / Math.max(target, LOT)));
    const mid = Math.max(1, Math.round(fair * (1 - skew * 0.003)));
    const width = Math.max(1, Math.round(fair * 0.002));
    const size = noise(w, 'bond:' + f.id, Math.max(LOT * 2, lotDown(Math.min(Math.abs(h[b.tenor] - target), b.faceLeft * 0.01, cashOf(w, f.id) * 0.25))));
    if (size < LOT) continue;
    if (cashOf(w, f.id) >= mid - width) place(w, f.id, b.id, 'buy', Math.min(size, lotDown(cashOf(w, f.id) / (mid - width) * LOT)), mid - width, 'fund');
    if (h[b.tenor] >= LOT) place(w, f.id, b.id, 'sell', Math.min(size, lotDown(h[b.tenor])), mid + width, 'fund');
  }
  const hot = Math.min(1, Math.max(0, (econ(w).policyRate - 0.03) / 0.05));
  for (const bank of banksOf(w)) {
    if (bank.failed) continue;
    cancelSrc(w, bank.id, b.id, 'bank');
    const h = heldTenors(w, bank.id);
    let assets = bankAssets.get(bank.id);
    if (assets === undefined) {
      assets = Math.max(1, w.ledger.netWorth(bank.id) + depositsOf(w, bank));
      bankAssets.set(bank.id, assets);
    }
    const target = b.tenor === '3m' ? assets * (0.05 + 0.08 * hot) : assets * 0.08 / 4;
    const gap = target - h[b.tenor];
    const size = noise(w, 'bond:' + bank.id, Math.min(Math.abs(gap), b.faceLeft * 0.005, Math.max(LOT, (w.ledger.issued.get(DEP) ?? 0) * 0.0002)));
    if (size < LOT) continue;
    if (gap > 0 && (bank.id === BANK || cashOf(w, bank.id) >= fair)) place(w, bank.id, b.id, 'buy', bank.id === BANK ? size : Math.min(size, lotDown(cashOf(w, bank.id) / fair * LOT)), Math.round(fair * 0.998), 'bank');
    if (gap < 0 && h[b.tenor] >= LOT) place(w, bank.id, b.id, 'sell', Math.min(size, lotDown(h[b.tenor])), Math.round(fair * 1.002), 'bank');
  }
}

function matchBond(w: World, b: Bond, mine: Order[]): void {
  const st = book(w);
  const bids = mine.filter((o) => o.open && o.side === 'buy' && o.qty >= LOT).sort((x, y) => (y.limit ?? 1e18) - (x.limit ?? 1e18) || x.seq - y.seq);
  const asks = mine.filter((o) => o.open && o.side === 'sell' && o.qty >= LOT).sort((x, y) => (x.limit ?? 0) - (y.limit ?? 0) || x.seq - y.seq);
  let bi = 0, ai = 0;
  const cause = econ(w).macroEv;
  for (let guard = 0; guard < 2000; guard++) {
    while (bi < bids.length && !bids[bi].open) bi++;
    while (ai < asks.length && !asks[ai].open) ai++;
    const bid = bids[bi], ask = asks[ai];
    if (!bid || !ask) break;
    if (bid.limit !== null && ask.limit !== null && bid.limit < ask.limit) break;
    if (bid.actor === ask.actor) { (bid.seq > ask.seq ? bid : ask).open = false; continue; }
    const px = Math.max(1, fillPrice(bid, ask, b.last));
    let qty = Math.min(bid.qty, ask.qty, Math.floor(cashOf(w, bid.actor) / px) * LOT, lotDown(w.ledger.balance(ask.actor, b.id)));
    if (bid.actor === BANK || ask.actor === BANK) qty = Math.min(qty, st.bank1Left);
    qty = lotDown(qty);
    if (qty < LOT) {
      if (Math.floor(cashOf(w, bid.actor) / px) < 1) bid.open = false;
      if (w.ledger.balance(ask.actor, b.id) < LOT) ask.open = false;
      if (bid.open && ask.open) { if (bid.actor === BANK || ask.actor === BANK) { if (bid.actor === BANK) bid.open = false; else ask.open = false; } else bid.open = false; }
      continue;
    }
    if (!pay(w, bid.actor, ask.actor, invoice(qty, px), 'bond.trade', cause)) { bid.open = false; continue; }
    if (!w.ledger.move(b.id, ask.actor, bid.actor, qty, 'bond.trade', cause)) throw new Error(`delivery ${b.id}`);
    bid.qty -= qty; ask.qty -= qty;
    if (bid.qty < LOT) bid.open = false;
    if (ask.qty < LOT) ask.open = false;
    if (bid.actor === BANK || ask.actor === BANK) st.bank1Left -= qty;
    b.last = px; b.traded = true;
  }
}
function session(w: World): void {
  const st = book(w);
  st.bank1Left = lotDown((w.ledger.issued.get(DEP) ?? 0) * 0.0003);
  if (st.orders.length > 240) st.orders = st.orders.filter((o) => o.open && o.src === 'player');
  for (const o of st.orders) if (o.src !== 'player') o.open = false;
  // A bank's face net worth does not move until a bond actually trades. Reuse it across the book.
  const bankAssets = new Map<string, number>();
  for (const b of st.bonds) {
    if (!b.onRun || b.faceLeft <= 0 || b.matureDay <= w.day) continue;
    b.traded = false;
    quote(w, b, bankAssets);
    const mine = st.orders.filter((o) => o.open && o.instr === b.id);
    if (mine.length) matchBond(w, b, mine);
    if (b.traded) bankAssets.clear();
    if (!b.traded) b.last = pricePerLot(b, modelYield(w, b.tenor), w.day);
    b.prev = b.last;
  }
  peopleOrders(w);
  for (const b of st.bonds) {
    if (!b.onRun || b.faceLeft <= 0) continue;
    const mine = st.orders.filter((o) => o.open && o.instr === b.id && o.src === 'person');
    if (mine.length) matchBond(w, b, st.orders.filter((o) => o.open && o.instr === b.id));
  }
  remember(w);
  markCorp(w);
}
function peopleOrders(w: World): void {
  const st = book(w), P = econ(w).P;
  const n = st.savers.length;
  if (!n) return;
  for (let k = 0; k < 8; k++) {
    const i = st.savers[st.saverAt % n];
    st.saverAt = (st.saverAt + 1) % n;
    if (i === ((w.state.player as { who?: number } | undefined)?.who ?? -1)) continue;
    if ((P.flags[i] & 1) === 0) continue;
    const a = appetite(P.cY[i], P.resil[i]);
    const tenor: Tenor = a > 0.72 ? '10y' : a > 0.55 ? '5y' : a > 0.38 ? '2y' : '3m';
    const b = onRun(w, tenor);
    if (!b) continue;
    const y = modelYield(w, tenor);
    if (y + 0.0002 < hurdle(w, a, tenor)) continue;
    const surplus = w.ledger.balS(P.slot[i], DEP) - P.incEma[i] * 180;
    const qty = Math.min(LOT * 4, lotDown(surplus * 0.05));
    if (qty < LOT) continue;
    cancelSrc(w, P.id(i), b.id, 'person');
    place(w, P.id(i), b.id, 'buy', qty, pricePerLot(b, hurdle(w, a, tenor), w.day), 'person');
  }
}

function remember(w: World): void {
  const st = book(w);
  for (const t of TENORS) {
    const b = onRun(w, t);
    st.y[t] = b ? yieldFromPrice(b, b.last, w.day) : modelYield(w, t);
    if (!Number.isFinite(st.y[t])) st.y[t] = modelYield(w, t);
  }
  const slope = st.y['10y'] - st.y['3m'];
  if (slope < st.minSlope) st.minSlope = slope;
}

function yieldEvent(w: World): void {
  const st = book(w), s = econ(w);
  remember(w);
  const now = st.y['10y'];
  const moved = st.haveMark && Math.abs(now - st.markY10) > 0.0025;
  const yoy = yoyOf(s);
  const debt = (w.ledger.issued.get(BOND) ?? 0) / Math.max(1, s.yGdpEma);
  if (st.haveMark && Math.abs(debt - st.debtMark) >= 1.5) {
    st.debtEv = w.events.emit('gov.debt', `public debt ${debt.toFixed(0)} days of GDP`, [s.macroEv], GOV);
  }
  if (moved) {
    const causes: number[] = [];
    const recent = (kind: string): number | undefined => {
      const id = w.events.last(kind);
      if (id === undefined) return;
      const e = w.events.get(id);
      return e && w.day - e.day <= 30 ? id : undefined;
    };
    if (Math.abs(s.policyRate - st.policyMark) >= 0.001) { const id = recent('cb.rate'); if (id !== undefined) causes.push(id); }
    if (Math.abs(yoy - st.yoyMark) >= 0.003) { const id = recent('macro.cpi'); if (id !== undefined) causes.push(id); }
    const tax = recent('gov.tax'); if (tax !== undefined) causes.push(tax);
    if (Math.abs(debt - st.debtMark) >= 1.5 && st.debtEv) causes.push(st.debtEv);
    if (!causes.length) {
      const id = w.events.last('macro.cpi') ?? w.events.last('cb.rate') ?? s.macroEv;
      causes.push(id);
    }
    w.events.emit('bond.yield', `10-year yield ${(st.markY10 * 100).toFixed(2)}% -> ${(now * 100).toFixed(2)}%`, causes, GOV);
  }
  st.markY10 = now;
  st.haveMark = true;
  st.policyMark = s.policyRate;
  st.yoyMark = yoy;
  st.debtMark = debt;
}

function reprice(w: World): void {
  for (const t of TENORS) {
    const b = onRun(w, t);
    if (!b) continue;
    b.last = pricePerLot(b, modelYield(w, t), w.day);
    b.prev = b.last;
  }
  remember(w);
}

/** The decision is in. The on-the-run prices move now; yesterday's close stays, so the day's candle shows it. */
function curveOnRate(w: World): void {
  const last = econ(w).cbLast;
  if (!last || last.day !== w.day) return;
  const st = book(w);
  if (st.rateSeen === last.ev) return;
  st.rateSeen = last.ev;
  const before = st.y['10y'];
  for (const t of TENORS) {
    const b = onRun(w, t);
    if (!b) continue;
    b.last = pricePerLot(b, modelYield(w, t), w.day);
  }
  remember(w);
  const now = st.y['10y'];
  if (st.haveMark && Math.abs(now - before) >= 0.0004) {
    w.events.emit('bond.yield', `10-year yield ${(before * 100).toFixed(2)}% -> ${(now * 100).toFixed(2)}%`, [last.ev], GOV);
  }
  st.markY10 = now;
  st.haveMark = true;
  st.policyMark = econ(w).policyRate;
}

function seedFunds(w: World): void {
  const s = econ(w), st = book(w), L = w.ledger;
  const investors = s.investors;
  if (!investors.length) return;
  const base = investors.map((h) => cashOf(w, h.id));
  const slice = [0.08, 0.07];
  const shares = 1_000_000;
  for (let fi = 0; fi < st.funds.length; fi++) {
    const f = st.funds[fi];
    L.addActor(f.id, 'fund');
    L.define({ id: 'eq:' + f.id, kind: 'share', issuer: f.id });
    let leftSh = shares;
    for (let i = 0; i < investors.length; i++) {
      const sh = i === investors.length - 1 ? leftSh : Math.round(shares / investors.length);
      leftSh -= sh;
      const cents = Math.floor(base[i] * slice[fi]);
      if (cents > 0 && !pay(w, investors[i].id, f.id, cents, 'genesis.equity', w.genesis)) throw new Error(`fund capital ${f.id}`);
      if (sh > 0) L.issue('eq:' + f.id, investors[i].id, sh, 'genesis.equity', w.genesis);
    }
    const budget = Math.min(cashOf(w, f.id) * 0.75, (L.issued.get(DEP) ?? 0) * 0.005);
    let left = lotDown(budget);
    for (const t of TENORS) {
      const b = onRun(w, t);
      if (!b || left < LOT) continue;
      const want = lotDown(budget * f.mix[t]);
      const qty = Math.min(want, left, lotDown(L.balance(BANK, b.id)));
      if (qty < LOT) continue;
      const px = b.last;
      const cost = invoice(qty, px);
      if (!pay(w, f.id, BANK, cost, 'bond.trade', w.genesis)) continue;
      if (!L.move(b.id, BANK, f.id, qty, 'bond.trade', w.genesis)) throw new Error('seed move');
      left -= qty;
    }
  }
}

function openBooks(w: World): void {
  const L = w.ledger, st = book(w), s = econ(w);
  const face0 = Math.round(L.balance(BANK, BOND));
  const moved = lotDown(face0);
  const wts = mix(s.policyRate);
  let leftFace = moved;
  const parts = TENORS.map((t, i) => {
    if (i === TENORS.length - 1) return leftFace;
    const n = lotDown(moved * wts[t]);
    leftFace -= n;
    return n;
  });
  for (let i = 0; i < TENORS.length; i++) {
    if (parts[i] < LOT) continue;
    const tenor = TENORS[i];
    const y = modelYield(w, tenor);
    const b = mint(w, tenor, roundEighth(y), w.genesis);
    L.issue(b.id, BANK, parts[i], 'genesis', w.genesis);
    b.faceLeft = parts[i];
    b.last = pricePerLot(b, y, 0);
    b.prev = b.last;
  }
  if (moved > 0) {
    if (!L.redeem(BOND, BANK, moved, 'genesis', w.genesis)) throw new Error('genesis redeem');
    L.issue(BOND, GOV, moved, 'genesis', w.genesis);
  }
  const real = st.bonds.reduce((n, b) => n + (L.issued.get(b.id) ?? 0), 0);
  if (Math.abs(real - L.balance(GOV, BOND)) > 1) throw new Error(`opening shadow ${L.balance(GOV, BOND)} != ${real}`);
}

function firmQuality(w: World, f: Firm): number {
  if (f.closed || f.workers <= 0) return 0;
  const s = econ(w);
  const scale = Math.max(1, f.eff * s.wage * 30);
  const owed = w.ledger.issued.get('loan:' + f.id) ?? 0;
  const leverage = owed / (owed + scale * 10);
  const profit = f.lastProfit / scale;
  const bad = Math.min(1, f.badMonths / 6);
  const size = Math.min(1, f.workers / 60);
  return clamp(0.58 + Math.min(0.22, Math.max(-0.4, profit * 0.7)) - leverage * 0.32 - bad * 0.28 + size * 0.08, 0, 1);
}
function ratingOf(q: number): Rating {
  if (q >= 0.8) return 'AAA';
  if (q >= 0.7) return 'AA';
  if (q >= 0.6) return 'A';
  if (q >= 0.48) return 'BBB';
  if (q >= 0.36) return 'BB';
  return 'B';
}
function creditStress(w: World): number {
  const s = econ(w), st = book(w);
  const slack = Math.max(0, (s.unemployment - NATURAL_U) / 0.05);
  const rising = Math.max(0, (s.unemployment - s.uEma) / 0.01);
  const cut = w.day - 360;
  let recent = 0;
  for (const d of st.corpDefDays) if (d > cut) recent++;
  return Math.min(1.8, slack + 0.35 * Math.min(1.5, rising) + Math.min(1, recent / Math.max(1, s.firms.length) / 0.04));
}
function quoteSpreads(w: World): Record<Rating, number> {
  const stress = creditStress(w);
  const out = {} as Record<Rating, number>;
  for (const r of RATINGS) out[r] = SPREAD0[r] * (1 + SPREAD_B[r] * stress);
  return out;
}
function gov5(w: World): number {
  const y = book(w).y['5y'];
  return y > 0 ? y : modelYield(w, '5y');
}
function corpYld(w: World, rating: Rating): number {
  return Math.max(0, gov5(w) + (book(w).spread[rating] ?? SPREAD0[rating]));
}
function growCool(st: BondState, n: number): void {
  if (st.corpCool.length >= n) return;
  const next = new Int32Array(Math.max(n, st.corpCool.length * 2, 16));
  next.set(st.corpCool);
  st.corpCool = next;
}
function corpPrice(c: CorpBond, yld: number, day: number): number {
  return pricePerLot({ tenor: '5y', coupon: c.coupon, issueDay: c.issueDay, matureDay: c.matureDay }, yld, day);
}
function defaultCorp(w: World, c: CorpBond, cause: number, recovery: number): void {
  if (c.dead) return;
  const L = w.ledger, st = book(w);
  const face = Math.round(L.issued.get(c.id) ?? 0);
  const f = econ(w).firms[c.firmIdx];
  let rec = 0;
  if (face > 0 && f && !f.closed && recovery > 0) {
    const keep = Math.round(Math.max(0, f.eff * econ(w).wage * 20));
    rec = Math.min(Math.round(face * recovery), Math.max(0, cashOf(w, f.id) - keep));
  }
  const ev = w.events.emit('bond.default', `${f?.name ?? c.firm} bond defaults; holders recover ${(face > 0 ? rec / face * 100 : 0).toFixed(0)}%`, [cause], c.firm);
  if (rec > 0 && f) {
    const holders = [...L.holdersS(c.id)].filter(([, v]) => v > 0);
    const held = holders.reduce((s, [, v]) => s + v, 0);
    let left = rec;
    for (let i = 0; i < holders.length && left > 0; i++) {
      const share = i === holders.length - 1 ? left : Math.min(left, Math.round(rec * holders[i][1] / Math.max(1, held)));
      if (share <= 0) continue;
      if (!pay(w, f.id, L.ids[holders[i][0]], share, 'bond.recover', ev)) break;
      left -= share;
    }
  }
  for (const [slot, v] of [...L.holdersS(c.id)]) {
    const a = Math.floor(v);
    if (a <= 0) continue;
    if (!L.redeem(c.id, L.ids[slot], a, 'bond.default', ev)) throw new Error(`corp default ${c.id}`);
  }
  c.dead = true;
  c.face = 0;
  c.last = 0;
  st.corpDefY++;
  st.corpDefN++;
  st.corpDefDays.push(w.day);
  if (f) { growCool(st, f.idx + 1); st.corpCool[f.idx] = w.day + 720; }
}
function noteDefaults(w: World): void {
  const st = book(w), s = econ(w);
  const lastDef = w.events.last('firm.default') ?? 0;
  const lastFail = w.events.last('firm.failed') ?? 0;
  if (Math.max(lastDef, lastFail) > st.corpSeen) {
    const evs = w.events.recent(['firm.default', 'firm.failed'], 80);
    let seen = st.corpSeen;
    for (const e of evs) {
      if (e.id <= st.corpSeen) continue;
      if (e.id > seen) seen = e.id;
      if (!e.actor) continue;
      const c = st.corp.find((x) => !x.dead && x.firm === e.actor);
      if (c) defaultCorp(w, c, e.id, RECOVERY[c.rating]);
    }
    st.corpSeen = Math.max(st.corpSeen, seen);
  }
  for (const c of st.corp) {
    if (c.dead) continue;
    const f = s.firms[c.firmIdx];
    if (f && !f.closed) continue;
    defaultCorp(w, c, f?.profitEv ?? c.issueEv, RECOVERY[c.rating] * 0.5);
  }
}
function issueCorp(w: World, f: Firm, cause: number): void {
  const st = book(w);
  if (f.closed || f.workers <= 0) return;
  if (st.corp.some((c) => c.firm === f.id && !c.dead)) return;
  if (f.idx < st.corpCool.length && st.corpCool[f.idx] > w.day) return;
  const id = 'cbond:' + f.id;
  if ((w.ledger.issued.get(id) ?? 0) > 0) return;
  const rating = ratingOf(firmQuality(w, f));
  const y = corpYld(w, rating);
  const coupon = roundEighth(Math.max(0.005, y));
  if (!w.ledger.instruments.has(id)) w.ledger.define({ id, kind: 'claim', issuer: f.id });
  const draft: Pick<Bond, 'tenor' | 'coupon' | 'issueDay' | 'matureDay'> = { tenor: '5y', coupon, issueDay: w.day, matureDay: w.day + CORP_LIFE };
  const px = pricePerLot(draft, y, w.day);
  const payC = invoice(CORP_FACE, px);
  const causes = [cause];
  if (f.profitEv !== undefined && f.profitEv !== cause) causes.push(f.profitEv);
  const ev = w.events.emit('bond.issue', `${f.name} issues ${moneyText(CORP_FACE)} of ${rating} notes at ${(y * 100).toFixed(2)}%`, causes, f.id);
  if (!pay(w, BANK, f.id, payC, 'bond.issue', ev)) return;
  w.ledger.issue(id, BANK, CORP_FACE, 'bond.issue', ev);
  st.corp.push({
    id, firm: f.id, firmIdx: f.idx, rating, issueDay: w.day, matureDay: w.day + CORP_LIFE,
    coupon, face: CORP_FACE, nextCoupon: w.day + 180, last: px, dead: false, issueEv: ev,
  });
}
function serviceCorp(w: World): void {
  const L = w.ledger, s = econ(w);
  for (const c of book(w).corp) {
    if (c.dead) continue;
    const f = s.firms[c.firmIdx];
    if (!f || f.closed) { defaultCorp(w, c, s.macroEv, 0); continue; }
    const dueCoupon = c.nextCoupon >= 0 && c.nextCoupon <= w.day;
    const mature = c.matureDay <= w.day;
    if (!dueCoupon && !mature) continue;
    const cause = f.profitEv ?? c.issueEv;
    if (dueCoupon) {
      let coupons = 0, t = c.nextCoupon;
      while (t >= 0 && t <= w.day) { coupons++; t = t + 180 <= c.matureDay ? t + 180 : -1; }
      const rows = [...L.holdersS(c.id)].filter(([, v]) => v > 0);
      let need = 0;
      for (const [, v] of rows) need += Math.round(v * c.coupon / 2) * coupons;
      if (need > 0 && cashOf(w, f.id) < need) { defaultCorp(w, c, cause, RECOVERY[c.rating]); continue; }
      let paid = true;
      for (const [slot, v] of rows) {
        const payC = Math.round(v * c.coupon / 2) * coupons;
        if (payC > 0 && !pay(w, f.id, L.ids[slot], payC, 'bond.coupon', cause)) { paid = false; break; }
      }
      if (!paid) { defaultCorp(w, c, cause, RECOVERY[c.rating]); continue; }
      c.nextCoupon = t;
    }
    if (c.dead || !mature) continue;
    const face = Math.round(L.issued.get(c.id) ?? 0);
    if (face <= 0) { c.dead = true; continue; }
    if (cashOf(w, f.id) < face) { defaultCorp(w, c, cause, RECOVERY[c.rating]); continue; }
    const rows = [...L.holdersS(c.id)].filter(([, v]) => v > 0);
    let ok = true;
    for (const [slot, v] of rows) {
      const a = Math.floor(v);
      if (a <= 0) continue;
      if (!pay(w, f.id, L.ids[slot], a, 'bond.mature', cause) || !L.redeem(c.id, L.ids[slot], a, 'bond.mature', cause)) { ok = false; break; }
    }
    if (!ok) { defaultCorp(w, c, cause, RECOVERY[c.rating]); continue; }
    c.dead = true;
    c.face = 0;
  }
}
function markCorp(w: World): void {
  for (const c of book(w).corp) {
    if (c.dead) continue;
    const f = econ(w).firms[c.firmIdx];
    if (f && !f.closed) c.rating = ratingOf(firmQuality(w, f));
    c.last = corpPrice(c, corpYld(w, c.rating), w.day);
  }
}
function creditMonth(w: World): void {
  const st = book(w), s = econ(w);
  noteDefaults(w);
  const prev = st.spread.BBB;
  st.spread = quoteSpreads(w);
  const cut = w.day - 360;
  if (st.corpDefDays.length > 12) st.corpDefDays = st.corpDefDays.filter((d) => d > cut);
  if (st.spreadMark > 0 && Math.abs(st.spread.BBB - prev) > 0.0025) {
    const causes: number[] = [];
    const jobs = w.events.last('macro.jobs');
    const def = w.events.last('firm.default') ?? w.events.last('firm.failed');
    if (jobs !== undefined) causes.push(jobs);
    if (def !== undefined && def !== jobs) causes.push(def);
    if (!causes.length) causes.push(s.macroEv);
    w.events.emit('bond.spread', `BBB spread ${(prev * 10000).toFixed(0)}bp -> ${(st.spread.BBB * 10000).toFixed(0)}bp`, causes, GOV);
  }
  st.spreadMark = st.spread.BBB;
  growCool(st, s.firms.length);
  for (const f of s.firms) if (!f.closed && f.workers > 0) issueCorp(w, f, s.macroEv);
  markCorp(w);
}

/** Shape from the 10-year minus the 3-month, in basis points. The same word in the paper, the wire and the screen. */
export function curveShape(y: Record<string, number> | undefined): { shape: 'upward' | 'inverted' | 'flat'; slopeBp: number; note: string } {
  const y3 = y?.['3m'] ?? 0;
  const y10 = y?.['10y'] ?? 0;
  const slopeBp = Math.round((y10 - y3) * 10000);
  const shape = slopeBp > 20 ? 'upward' : slopeBp < -20 ? 'inverted' : 'flat';
  const y2 = y?.['2y'] ?? y3;
  const y30 = y?.['30y'] ?? y10;
  const note = y3 > y2 + 0.002 && y30 > y10 + 0.002 ? 'inverted at the front, rising at the long end' : shape;
  return { shape, slopeBp, note };
}

export function submitBondOrder(w: World, actor: string, instr: string, side: Side, qty: number, limit?: number): number {
  if (!w.ledger.actors.has(actor)) throw new Error(`unknown actor ${actor}`);
  const b = book(w).bonds.find((x) => x.id === instr);
  if (!b || b.faceLeft <= 0) throw new Error(`not listed ${instr}`);
  if (side !== 'buy' && side !== 'sell') throw new Error('side must be buy or sell');
  if (!Number.isSafeInteger(qty) || qty < LOT) throw new Error('qty must be a whole number of bonds');
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new Error('limit must be a positive price in cents');
  const id = place(w, actor, instr, side, qty, limit ?? null, 'player');
  const next = nextSessionText(w);
  noteLife(w, {
    id, book: 'bonds', instr, side, qty, status: 'queued', type: limit ? 'limit' : 'market',
    reserved: 0, limit: limit ?? null, next, reason: '', fills: [], rejectedQty: 0, fee: 0,
  });
  return id;
}

export const bonds: Module = {
  id: 'bonds',

  init(w) {
    const st: BondState = {
      api: undefined as unknown as BondApi,
      bonds: [], funds: FUNDS, orders: [], nextId: 1, seq: 1,
      n: { '3m': 0, '2y': 0, '5y': 0, '10y': 0, '30y': 0 },
      y: { '3m': 0.03, '2y': 0.031, '5y': 0.033, '10y': 0.036, '30y': 0.04 },
      billGap: 0, qeEase: 0, raising: false, root: 0,
      savers: new Int32Array(0), saverMonth: -1, saverAt: 0, bank1Left: 0,
      coverSum: 0, coverN: 0, lastCover: 1, minSlope: Infinity,
      markY10: 0, haveMark: false, policyMark: 0, yoyMark: 0, debtMark: 0, debtEv: 0,
      stance: 0.03,
      spread: { AAA: 0.004, AA: 0.0065, A: 0.01, BBB: 0.0155, BB: 0.031, B: 0.052 },
      corp: [], corpCool: new Int32Array(0), corpSeen: 0, corpDefY: 0, corpDefN: 0, corpDefDays: [], spreadMark: 0,
    };
    st.api = {
      fund(world, cents, cause) { fund(world, cents, cause); },
      pay(world, to, cents, reason, cause) {
        const a = Math.round(cents);
        if (a <= 0) return;
        fund(world, a, cause);
        if (!pay(world, GOV, to, a, reason, cause)) throw new Error(`gov cannot pay ${reason}`);
      },
      repay(world, spare, cause) { repay(world, spare, cause); },
      coupons(world, cause) { payDue(world, cause); },
    };
    w.state.bonds = st;
    w.ledger.define({ id: RESV, kind: 'claim', issuer: CB });
    openBooks(w);
    seedFunds(w);
    rebuildSavers(w);
    st.root = w.events.emit('bond.open', 'treasury bills and bonds open: 3-month, 2-year, 5-year, 10-year and 30-year', [w.genesis], GOV);
    reprice(w);
    st.spread = quoteSpreads(w);
    for (const f of econ(w).firms) issueCorp(w, f, st.root);
    markCorp(w);
    w.events.emit('bond.credit', 'corporate notes open, a spread over the five-year by rating', [st.root], GOV);
    const bad = w.ledger.check();
    if (bad.length) throw new Error(`bonds open: ${bad.slice(0, 5).join('; ')}`);
  },

  tick(w, t) {
    curveOnRate(w);
    if (t !== 0) return;
    omo(w);
    reinvestCb(w, policyCause(w));
    session(w);
  },

  dayClose(w) {
    estates(w);
    payDue(w, econ(w).rateEv);
    noteDefaults(w);
    serviceCorp(w);
  },

  monthEnd(w) {
    reinvestCb(w, policyCause(w));
    qe(w);
    const st = book(w), pol = econ(w).policyRate;
    st.stance = st.stance <= 0 ? pol : st.stance * 0.985 + pol * 0.015;
    reprice(w);
    yieldEvent(w);
    creditMonth(w);
  },

  stats(w) {
    const st = book(w), L = w.ledger;
    const split = { bank: 0, fund: 0, person: 0, cb: 0 };
    for (const b of st.bonds) {
      if ((L.issued.get(b.id) ?? 0) <= 0) continue;
      for (const [slot, amt] of L.holdersS(b.id)) {
        if (amt <= 0) continue;
        const id = L.ids[slot];
        if (id.startsWith('bank_')) split.bank += amt;
        else if (id.startsWith('fund_')) split.fund += amt;
        else if (id.startsWith('p_')) split.person += amt;
        else if (id === CB) split.cb += amt;
      }
    }
    const m = (c: number): number => +(c / 1e8).toFixed(2);
    const cover = st.coverN ? st.coverSum / st.coverN : st.lastCover;
    const slope = st.minSlope === Infinity ? st.y['10y'] - st.y['3m'] : st.minSlope;
    const out = {
      y3m_pct: +(st.y['3m'] * 100).toFixed(2),
      y2y_pct: +(st.y['2y'] * 100).toFixed(2),
      y5y_pct: +(st.y['5y'] * 100).toFixed(2),
      y10y_pct: +(st.y['10y'] * 100).toFixed(2),
      y30y_pct: +(st.y['30y'] * 100).toFixed(2),
      sprAAA_bp: +((st.spread.AAA ?? 0) * 10000).toFixed(0),
      sprAA_bp: +((st.spread.AA ?? 0) * 10000).toFixed(0),
      sprA_bp: +((st.spread.A ?? 0) * 10000).toFixed(0),
      sprBBB_bp: +((st.spread.BBB ?? 0) * 10000).toFixed(0),
      sprBB_bp: +((st.spread.BB ?? 0) * 10000).toFixed(0),
      sprB_bp: +((st.spread.B ?? 0) * 10000).toFixed(0),
      corpDef: st.corpDefY,
      minSlope_bp: +((slope) * 10000).toFixed(0),
      debtBank_M: m(split.bank),
      debtFund_M: m(split.fund),
      debtPpl_M: m(split.person),
      debtCb_M: m(split.cb),
      cover: +cover.toFixed(2),
    };
    st.coverSum = 0; st.coverN = 0; st.minSlope = Infinity; st.corpDefY = 0;
    return out;
  },
};
