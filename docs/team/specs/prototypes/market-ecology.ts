/**
 * Box prototype for the market ecology. Not the engine.
 *
 * Twelve assets, five years, daily. Shocks are iid (no GARCH). A shock never
 * touches the price on its own. The fast pool trades most of it the same day.
 * The slow pool keeps the rest and feeds it into the book over weeks, which is
 * where the 63-day momentum comes from. After a large day the book is thinner,
 * capped, so the next day's flow prints larger. That is the vol clustering.
 *
 * Run: npx tsx specs/prototypes/market-ecology.ts
 */
const ASSETS = 12
const DAYS = 252 * 5
const SEEDS = 40
const SLOW = 0.27 // share of a shock the slow pool holds back
const LEAK = 0.15 // fraction of what it holds that it trades each day
const THIN = 0.42 // how much a large day widens the next print
const NOISE = 0.0045
const FADE = 0.12 // market maker unwinds this much of yesterday's noise the next day
const SHOCK = 0.011

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(rng: () => number) {
  const u = Math.max(1e-12, rng()), v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function rank(x: number[]) {
  const r = new Array<number>(x.length)
  x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], j) => { r[i] = j })
  return r
}
function mean(x: number[]) { return x.reduce((a, b) => a + b, 0) / x.length }
function corr(a: number[], b: number[]) {
  const n = a.length, ma = mean(a), mb = mean(b)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2 }
  return da && db ? num / Math.sqrt(da * db) : 0
}
function spearman(a: number[], b: number[]) {
  const ra = rank(a), rb = rank(b)
  let dd = 0
  for (let i = 0; i < a.length; i++) dd += (ra[i]! - rb[i]!) ** 2
  return 1 - (6 * dd) / (a.length * (a.length * a.length - 1))
}

function run(seed: number) {
  const rng = mulberry(seed)
  const held = Array(ASSETS).fill(0), fade = Array(ASSETS).fill(0)
  const px = Array(ASSETS).fill(0)
  const hist: number[][] = Array.from({ length: ASSETS }, () => [0])
  const rets: number[][] = Array.from({ length: ASSETS }, () => [])
  for (let d = 0; d < DAYS; d++) {
    const mkt = gauss(rng)
    for (let i = 0; i < ASSETS; i++) {
      let shock = SHOCK * (0.5 * mkt + 0.5 * gauss(rng))
      if (rng() < 0.02) shock += (rng() < 0.5 ? 1 : -1) * 0.04
      held[i] += SLOW * shock
      const slowFlow = LEAK * held[i]!
      held[i] -= slowFlow
      const noise = NOISE * gauss(rng)
      const prev = rets[i]!.length ? Math.abs(rets[i]![rets[i]!.length - 1]!) : 0
      const scale = Math.min(1.7, 1 + THIN * Math.min(prev, 0.04) / SHOCK)
      const r = ((1 - SLOW) * shock + slowFlow + noise - FADE * fade[i]!) * scale
      fade[i] = noise
      px[i] += r
      hist[i]!.push(px[i]!)
      rets[i]!.push(r)
    }
  }
  let ac = 0, abs = 0, kurt = 0
  for (const r of rets) {
    ac += corr(r.slice(1), r.slice(0, -1))
    const a = r.map(Math.abs)
    abs += corr(a.slice(1), a.slice(0, -1))
    const m = mean(r), v = mean(r.map((x) => (x - m) ** 2))
    kurt += v ? mean(r.map((x) => (x - m) ** 4)) / (v * v) - 3 : 0
  }
  const ic63: number[] = [], ic1: number[] = []
  for (let d = 63; d + 21 < DAYS; d += 21) {
    ic63.push(spearman(hist.map((h) => h[d]! - h[d - 63]!), hist.map((h) => h[d + 21]! - h[d]!)))
  }
  for (let d = 1; d + 1 < DAYS; d += 21) {
    ic1.push(spearman(rets.map((r) => r[d - 1]!), rets.map((r) => r[d]!)))
  }
  return { ac: ac / ASSETS, abs: abs / ASSETS, kurt: kurt / ASSETS, ic: mean(ic63), ic1: mean(ic1) }
}

const rows = Array.from({ length: SEEDS }, (_, k) => run(9000 + k))
const m = (k: 'ac' | 'abs' | 'kurt' | 'ic' | 'ic1') => rows.reduce((a, r) => a + r[k], 0) / rows.length
console.log(JSON.stringify({
  seeds: SEEDS, assets: ASSETS, days: DAYS,
  dailyAc: +m('ac').toFixed(3),
  absAc: +m('abs').toFixed(3),
  excessKurtosis: +m('kurt').toFixed(2),
  rankIc63to21: +m('ic').toFixed(3),
  rankIc1d: +m('ic1').toFixed(3),
}, null, 2))
