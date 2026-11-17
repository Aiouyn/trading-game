// Economic sanity audit. One seed at a time:
//   node sim/audit.ts
// runs 20 years at the default population for seeds 1..5 and prints, per year,
// p1 / p50 / p99 / max of the series a banker would check. Flags an observation
// more than 20 times that year's median, and any series whose median grows
// faster than nominal GDP for five years running.
import { DAYS_PER_YEAR, type World } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { BANK, DEP, type EconState, type Firm } from './modules/economy/index.ts';

const YEARS = 20;
const SEEDS = ['1', '2', '3', '4', '5'];
const HOME = 1;
const PERSON = 1;
const OUT = 20;

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};

interface Bag { v: number[]; worst: number; name: string }
interface Dist { n: number; p1: number; p50: number; p99: number; max: number }
interface Series { id: string; money: boolean; bag: Bag; med: number[]; flagged: boolean }

interface Stock { instr: string; issuer: string; last: number }
interface Mkt { stocks?: Stock[] }
interface Earn { snapRev?: Float64Array }
interface Bank { id: string; depo: string; failed: boolean }
interface Banks { banks?: Bank[] }
interface Prop {
  n: number; kind: Uint8Array; tenK: Uint8Array; ten: Int32Array;
  rent: Float64Array; marked: Float64Array;
}
interface Labour { prem?: Float64Array }

const econ = (w: World): EconState => w.state.economy as EconState;

function bag(): Bag { return { v: [], worst: -Infinity, name: '' }; }
function push(b: Bag, x: number, name = ''): void {
  if (!Number.isFinite(x)) return;
  b.v.push(x);
  if (x > b.worst) { b.worst = x; b.name = name; }
}

function distOf(xs: number[]): Dist {
  const s = xs.slice().sort((a, c) => a - c);
  const at = (p: number): number => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  if (!s.length) return { n: 0, p1: NaN, p50: NaN, p99: NaN, max: NaN };
  return { n: s.length, p1: at(0.01), p50: at(0.5), p99: at(0.99), max: s[s.length - 1] };
}

function money(cents: number): string {
  if (!Number.isFinite(cents)) return '-';
  const d = cents / 100, sign = d < 0 ? '-' : '', a = Math.abs(d);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
  return `${sign}$${a.toFixed(0)}`;
}
function num(x: number, isMoney: boolean): string {
  if (!Number.isFinite(x)) return '-';
  if (isMoney) return money(x);
  const a = Math.abs(x);
  return a >= 100 ? x.toFixed(1) : x.toFixed(3);
}

function series(): Series[] {
  const spec: [string, boolean][] = [
    ['firmProfit', true], ['firmRevenue', true], ['firmPayroll', true],
    ['sharePrice', true], ['pe', false], ['wage', true], ['rent', true],
    ['homePrice', true], ['hhWorth', true], ['bankCapital', false], ['gdpPerHead', true],
  ];
  return spec.map(([id, isMoney]) => ({ id, money: isMoney, bag: bag(), med: [], flagged: false }));
}

function firmById(s: EconState, id: string): Firm | undefined {
  for (const f of s.firms) if (f.id === id) return f;
  return undefined;
}

function sampleMonth(w: World, rows: Series[], wage: number, hist: number[][]): void {
  const s = econ(w), P = s.P;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const profit = byId.get('firmProfit')!, revB = byId.get('firmRevenue')!, payB = byId.get('firmPayroll')!;
  const pxB = byId.get('sharePrice')!, peB = byId.get('pe')!, wageB = byId.get('wage')!;
  const rentB = byId.get('rent')!, homeB = byId.get('homePrice')!, hhB = byId.get('hhWorth')!;
  const capB = byId.get('bankCapital')!;
  const earn = w.state.earnings as Earn | undefined;
  const snap = earn?.snapRev;
  const labour = (w.state.labour as Labour | undefined)?.prem;

  for (const f of s.firms) {
    if (f.closed) continue;
    const name = f.name;
    push(profit.bag, f.lastProfit, name);
    if (snap && f.idx < snap.length) push(revB.bag, snap[f.idx], name);
    let prem = 1;
    if (labour && f.idx < labour.length) prem = labour[f.idx];
    if (prem > 0) push(payB.bag, f.eff * wage * prem * 30, name);
    let h = hist[f.idx];
    if (!h) { h = []; hist[f.idx] = h; }
    h.push(f.lastProfit);
    if (h.length > 12) h.shift();
  }

  const mkt = w.state.markets as Mkt | undefined;
  const priceOf = new Map<string, number>();
  for (const st of mkt?.stocks ?? []) {
    priceOf.set(st.instr, st.last);
    const f = firmById(s, st.issuer);
    const name = f?.name ?? st.issuer;
    if (st.last > 0) push(pxB.bag, st.last, name);
    const h = f ? hist[f.idx] : undefined;
    if (!h?.length || !(st.last > 0)) continue;
    let ttm = 0;
    for (const p of h) ttm += p;
    ttm *= 12 / h.length;
    const sh = w.ledger.issued.get(st.instr) ?? 0;
    if (ttm > 0 && sh > 0) push(peB.bag, st.last / (ttm / sh), name);
  }
  const price = (instr: string): number => priceOf.get(instr) ?? 0;

  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i) || P.employer[i] < 0) continue;
    let prem = 1;
    const fi = P.employer[i];
    if (labour && fi < labour.length) prem = labour[fi];
    if (!(prem > 0)) continue;
    push(wageB.bag, P.skill[i] * wage * prem * 30);
  }

  const prop = w.state.property as Prop | undefined;
  if (prop) {
    for (let p = 0; p < prop.n; p++) {
      if (prop.kind[p] !== HOME) continue;
      if (prop.rent[p] > 0) push(rentB.bag, prop.rent[p]);
      if (prop.marked[p] > 0) push(homeB.bag, prop.marked[p]);
      if (prop.tenK[p] !== PERSON) continue;
      const i = prop.ten[p];
      if (i < 0 || i >= P.n || !P.alive(i)) continue;
      push(hhB.bag, w.ledger.netWorthSlot(P.slot[i], price));
    }
  }

  const banks = (w.state.banking as Banks | undefined)?.banks ?? [];
  for (const bank of banks) {
    if (bank.failed) continue;
    const equity = w.ledger.netWorth(bank.id);
    const depo = (w.ledger.issued.get(bank.depo) ?? 0) + (bank.id === BANK ? (w.ledger.issued.get(DEP) ?? 0) : 0);
    const assets = equity + depo;
    if (assets > 1) push(capB.bag, equity / assets, bank.id);
  }
}

function closeYear(w: World, year: number, rows: Series[], gdp0: number): number {
  const s = econ(w);
  const gdp = s.yGdp - gdp0;
  let people = 0;
  for (let i = 0; i < s.P.n; i++) if (s.P.alive(i)) people++;
  const perHead = people > 0 ? gdp / people : 0;
  push(rows.find((r) => r.id === 'gdpPerHead')!.bag, perHead, 'city'); // one figure for the year

  const reports = (w.state.earnings as { reports?: { name: string; profit: number; revenue: number; day: number }[] } | undefined)?.reports ?? [];
  let big: { name: string; profit: number; revenue: number } | undefined;
  for (const r of reports) {
    if (r.day < (year - 1) * 360 || r.day >= year * 360) continue;
    if (!big || r.profit > big.profit) big = r;
  }
  if (big) console.log(`  largest quarterly report: ${big.name} profit ${money(big.profit)} revenue ${money(big.revenue)}`);
  console.log(`\nseed ${w.seed} year ${year}  nominal GDP ${money(gdp)}  per head ${money(perHead)}  people ${people}`);
  console.log('series\tp1\tp50\tp99\tmax\tn\tworst');
  for (const r of rows) {
    const d = distOf(r.bag.v);
    r.med.push(d.p50);
    const worst = r.bag.name ? `${num(r.bag.worst, r.money)} ${r.bag.name}` : num(r.bag.worst, r.money);
    console.log(`${r.id}\t${num(d.p1, r.money)}\t${num(d.p50, r.money)}\t${num(d.p99, r.money)}\t${num(d.max, r.money)}\t${d.n}\t${worst}`);
    if (d.p50 > 0) {
      const line = d.p50 * OUT;
      let n = 0;
      for (const x of r.bag.v) if (x > line) n++;
      if (n > 0) {
        r.flagged = true;
        console.log(`FLAG outlier seed ${w.seed} year ${year} ${r.id}: ${n} above ${OUT}x median ${num(d.p50, r.money)} (line ${num(line, r.money)}), max ${num(d.max, r.money)}${r.bag.name ? ' ' + r.bag.name : ''}`);
      }
    }
    r.bag = bag();
  }
  for (const m of w.modules) m.stats?.(w);
  return s.yGdp;
}

function growthFlags(seed: string, rows: Series[], gdpMed: number[]): void {
  const gdp = rows.find((r) => r.id === 'gdpPerHead')!;
  // Nominal GDP, not per head: reconstruct from per-head only if we stored it.
  // The caller passes the nominal level alongside. gdpMed here is nominal GDP.
  for (const r of rows) {
    let run = 0, from = 0;
    const rates: string[] = [];
    for (let y = 1; y < r.med.length; y++) {
      const a = r.med[y - 1], b = r.med[y], g0 = gdpMed[y - 1], g1 = gdpMed[y];
      const faster = a > 0 && b > 0 && g0 > 0 && g1 > 0 && (b / a - 1) > (g1 / g0 - 1);
      if (faster) {
        if (run === 0) from = y;
        run++;
        rates.push(`${(b / a - 1) * 100 | 0}%`);
        if (run >= 5) {
          r.flagged = true;
          const gy = gdpMed.slice(from, y + 1).map((g, i) => {
            const p = gdpMed[from - 1 + i];
            return p > 0 ? `${(g / p - 1) * 100 | 0}%` : '?';
          });
          console.log(`FLAG growth seed ${seed} ${r.id} years ${from + 1}-${y + 1}: median ${rates.slice(-5).join(', ')} vs nominal GDP ${gy.slice(-5).join(', ')}`);
        }
      } else {
        run = 0;
        rates.length = 0;
      }
    }
    void gdp;
  }
}

function runSeed(seed: string, years: number): { flags: number } {
  const t0 = Date.now();
  const w = openWorld(seed, new Set());
  const rows = series();
  const hist: number[][] = [];
  const gdpLevel: number[] = [0];
  let gdpMark = 0;
  let flagsBefore = 0;
  const seen = new Set<string>();
  const note = (): void => {
    // flags print as they happen; count lines is done by the caller from stdout
  };
  void note; void flagsBefore; void seen;
  for (let y = 0; y < years; y++) {
    for (let d = 0; d < DAYS_PER_YEAR; d++) {
      const wage = econ(w).wage;
      w.step();
      if (w.day % 30 === 0) sampleMonth(w, rows, wage, hist);
    }
    const gdp = econ(w).yGdp - gdpMark;
    gdpLevel.push(gdp);
    gdpMark = closeYear(w, y + 1, rows, gdpMark);
    // closeYear returns the post-stats yGdp, which economy zeros. Keep the mark at 0 after a reset.
    gdpMark = econ(w).yGdp;
  }
  // growthFlags compared medians to nominal GDP levels stored in gdpLevel[1..years]
  const nominal = gdpLevel.slice(1);
  // Patch: growthFlags reads a parallel array. Pass nominal by stashing it on a dummy.
  growthAgainst(seed, rows, nominal);
  console.log(`seed ${seed} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { flags: 0 };
}

function growthAgainst(seed: string, rows: Series[], gdp: number[]): void {
  for (const r of rows) {
    let run = 0;
    let rateBuf: number[] = [];
    let gdpBuf: number[] = [];
    for (let y = 1; y < r.med.length && y < gdp.length; y++) {
      const a = r.med[y - 1], b = r.med[y], g0 = gdp[y - 1], g1 = gdp[y];
      if (a > 0 && b > 0 && g0 > 0 && g1 > 0 && b / a - 1 > g1 / g0 - 1) {
        run++;
        rateBuf.push(b / a - 1);
        gdpBuf.push(g1 / g0 - 1);
        if (run >= 5) {
          const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
          console.log(`FLAG growth seed ${seed} ${r.id} years ${y - 3}-${y + 1}: median ${rateBuf.slice(-5).map(pct).join(', ')} vs nominal GDP ${gdpBuf.slice(-5).map(pct).join(', ')}`);
        }
      } else {
        run = 0;
        rateBuf = [];
        gdpBuf = [];
      }
    }
  }
}

function main(): void {
  const years = +arg('years', String(YEARS));
  const seeds = arg('seeds', SEEDS.join(',')).split(',').filter(Boolean);
  console.log(`audit ${years} years, seeds ${seeds.join(' ')}, population ${process.env.SIM_POP ?? 20000}`);
  const t0 = Date.now();
  for (const seed of seeds) runSeed(seed, years);
  console.log(`audit cost ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
