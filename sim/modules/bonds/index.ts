// Government bonds. Bills and bonds are real claims of the treasury, auctioned when it needs cash
// and when debt matures, then traded on a price-time book. Yields are the prices of those claims:
// the short end is pinned by open-market operations, the long end by the expected policy path
// (today's rate pulled toward the Taylor target) plus a term premium that rises with debt.
import { type Module, type World } from '../../kernel/index.ts';
import { BANK, BOND, CB, DEP, GOV, pay, type EconState } from '../economy/index.ts';

const LOT = 16_000; // one bond, in cents of face. Par price is LOT. Coupons land on whole cents.
const RESV = 'resv';
const LAM = 0.2; // policy expectations converge slowly, so long yields stay near the current rate
const TP = 0.0018; // term premium: about 180bp on a 10-year at a normal debt load
const NATURAL_U = 0.07;
const TENORS = ['3m', '2y', '10y', '30y'] as const;
type Tenor = (typeof TENORS)[number];
type Side = 'buy' | 'sell';
type Src = 'fund' | 'bank' | 'person' | 'player';

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
}

const FUNDS: FundDef[] = [
  { id: 'fund_bond_2y', mix: { '3m': 0.25, '2y': 0.6, '10y': 0.15, '30y': 0 } },
  { id: 'fund_bond_10y', mix: { '3m': 0, '2y': 0.15, '10y': 0.65, '30y': 0.2 } },
];

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): BondState => w.state.bonds as BondState;
const cashOf = (w: World, id: string): number => Math.floor(w.ledger.balance(id, DEP));
const isBank = (id: string): boolean => id.startsWith('bank_');

function yearsOf(t: Tenor): number {
  switch (t) {
    case '3m': return 0.25;
    case '2y': return 2;
    case '10y': return 10;
    case '30y': return 30;
    default: { const n: never = t; return n; }
  }
}
function daysOf(t: Tenor): number {
  switch (t) {
    case '3m': return 90;
    case '2y': return 720;
    case '10y': return 3600;
    case '30y': return 10800;
    default: { const n: never = t; return n; }
  }
}
function easeOf(t: Tenor): number {
  switch (t) {
    case '3m': return 0;
    case '2y': return 0.2;
    case '10y': return 0.75;
    case '30y': return 1;
    default: { const n: never = t; return n; }
  }
}

function lotDown(n: number): number { return Math.floor(n / LOT) * LOT; }
function lotUp(n: number): number { return Math.max(LOT, Math.ceil(n / LOT) * LOT); }
function invoice(face: number, px: number): number { return Math.round(face / LOT * px); }
function roundEighth(y: number): number { return Math.max(0, Math.round(y * 800) / 800); }

function yoyOf(s: EconState): number {
  const n = s.cpiHist.length;
  const prev = n ? s.cpiHist[Math.max(0, n - 13)] : s.cpi;
  return prev > 0 ? s.cpi / prev - 1 : 0;
}
function taylor(s: EconState): number {
  const yoy = yoyOf(s);
  const raw = 0.02 + yoy + 0.5 * (yoy - 0.02) + 0.5 * (NATURAL_U - s.unemployment);
  return Math.max(0, Math.min(0.2, raw));
}
function debtLoad(w: World): number {
  const s = econ(w);
  if (w.day < 90 || s.yGdpEma < 1000) return 0.7;
  const debt = w.ledger.issued.get(BOND) ?? 0;
  return Math.min(2, Math.max(0.4, debt / (s.yGdpEma * 360) / 0.45));
}
function modelYield(w: World, tenor: Tenor): number {
  const s = econ(w), st = book(w);
  if (tenor === '3m') return Math.max(0, s.policyRate + st.billGap);
  const target = taylor(s), years = yearsOf(tenor);
  const pull = (1 - Math.exp(-LAM * years)) / (LAM * years);
  const expected = target + (s.policyRate - target) * pull;
  const load = debtLoad(w);
  const premium = TP * years * load + 0.0025 * Math.max(0, load - 1);
  return Math.max(0, expected + premium - st.qeEase * easeOf(tenor));
}

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
  const h: Record<Tenor, number> = { '3m': 0, '2y': 0, '10y': 0, '30y': 0 };
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
  return { '3m': 0.15 + 0.45 * hot, '2y': 0.25, '10y': 0.40 - 0.30 * hot, '30y': 0.20 - 0.15 * hot };
}
function splitCash(total: number, policy: number): number[] {
  const wts = mix(policy);
  const left0 = Math.max(0, Math.round(total));
  if (left0 < LOT * 4) return [left0, 0, 0, 0];
  const out = TENORS.map((t) => Math.floor(left0 * wts[t]));
  out[0] += left0 - out.reduce((a, b) => a + b, 0);
  return out;
}

function rebuildSavers(w: World): void {
  const st = book(w), s = econ(w), P = s.P, L = w.ledger;
  if (st.saverMonth === w.month && st.savers.length) return;
  const ids: number[] = [];
  for (let i = 0; i < P.n; i++) {
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
    const gap = tenor === '3m' ? billT - h['3m'] : (bondT - (h['2y'] + h['10y'] + h['30y'])) / 3;
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
  const have: Record<Tenor, number> = { '3m': 0, '2y': 0, '10y': 0, '30y': 0 };
  const mat: Record<Tenor, number> = { '3m': 0, '2y': 0, '10y': 0, '30y': 0 };
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

function quote(w: World, b: Bond): void {
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
    const assets = Math.max(1, w.ledger.netWorth(bank.id) + depositsOf(w, bank));
    const target = b.tenor === '3m' ? assets * (0.05 + 0.08 * hot) : assets * 0.08 / 3;
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
  for (const b of st.bonds) {
    if (!b.onRun || b.faceLeft <= 0 || b.matureDay <= w.day) continue;
    b.traded = false;
    quote(w, b);
    const mine = st.orders.filter((o) => o.open && o.instr === b.id);
    if (mine.length) matchBond(w, b, mine);
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
}
function peopleOrders(w: World): void {
  const st = book(w), P = econ(w).P;
  const n = st.savers.length;
  if (!n) return;
  for (let k = 0; k < 8; k++) {
    const i = st.savers[st.saverAt % n];
    st.saverAt = (st.saverAt + 1) % n;
    if ((P.flags[i] & 1) === 0) continue;
    const a = appetite(P.cY[i], P.resil[i]);
    const tenor: Tenor = a > 0.66 ? '10y' : a > 0.4 ? '2y' : '3m';
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

export function submitBondOrder(w: World, actor: string, instr: string, side: Side, qty: number, limit?: number): number {
  if (!w.ledger.actors.has(actor)) throw new Error(`unknown actor ${actor}`);
  const b = book(w).bonds.find((x) => x.id === instr);
  if (!b || b.faceLeft <= 0) throw new Error(`not listed ${instr}`);
  if (side !== 'buy' && side !== 'sell') throw new Error('side must be buy or sell');
  if (!Number.isSafeInteger(qty) || qty < LOT) throw new Error('qty must be a whole number of bonds');
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new Error('limit must be a positive price in cents');
  return place(w, actor, instr, side, qty, limit ?? null, 'player');
}

export const bonds: Module = {
  id: 'bonds',

  init(w) {
    const st: BondState = {
      api: undefined as unknown as BondApi,
      bonds: [], funds: FUNDS, orders: [], nextId: 1, seq: 1,
      n: { '3m': 0, '2y': 0, '10y': 0, '30y': 0 },
      y: { '3m': 0.03, '2y': 0.032, '10y': 0.038, '30y': 0.044 },
      billGap: 0, qeEase: 0, raising: false, root: 0,
      savers: new Int32Array(0), saverMonth: -1, saverAt: 0, bank1Left: 0,
      coverSum: 0, coverN: 0, lastCover: 1, minSlope: Infinity,
      markY10: 0, haveMark: false, policyMark: 0, yoyMark: 0, debtMark: 0, debtEv: 0,
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
    st.root = w.events.emit('bond.open', 'treasury bills and bonds open: 3-month, 2-year, 10-year and 30-year', [w.genesis], GOV);
    reprice(w);
    const bad = w.ledger.check();
    if (bad.length) throw new Error(`bonds open: ${bad.slice(0, 5).join('; ')}`);
  },

  tick(w, t) {
    if (t !== 0) return;
    omo(w);
    reinvestCb(w, policyCause(w));
    session(w);
  },

  dayClose(w) {
    estates(w);
    payDue(w, econ(w).rateEv);
  },

  monthEnd(w) {
    reinvestCb(w, policyCause(w));
    qe(w);
    reprice(w);
    yieldEvent(w);
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
      y10y_pct: +(st.y['10y'] * 100).toFixed(2),
      minSlope_bp: +((slope) * 10000).toFixed(0),
      debtBank_M: m(split.bank),
      debtFund_M: m(split.fund),
      debtPpl_M: m(split.person),
      debtCb_M: m(split.cb),
      cover: +cover.toFixed(2),
    };
    st.coverSum = 0; st.coverN = 0; st.minSlope = Infinity;
    return out;
  },
};
