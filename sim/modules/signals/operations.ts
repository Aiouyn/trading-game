// What each listed firm's own operations say today, as a small tilt on its fair value.
// A share is not priced on the sector name alone: an oil producer follows its margin over extraction cost and the
// futures curve, an airline its load factor and the fuel bill, an insurer its claims, a chip maker its orders and
// capacity, a shop its footfall and margin. The tilt is read from the firm's own books and the markets it sells into,
// smoothed, capped at 3%, and stored with the sentence that says why. Markets reads it; it never writes here.
import { type World } from '../../kernel/index.ts';
import { GOODS } from '../economy/content.ts';
import { type EconState, type Firm } from '../economy/index.ts';
import { futuresPrice } from '../commodities/index.ts';

interface OpStock { issuer: string; opTilt?: number; opRead?: string; opEma?: number[] }
const CAP = 0.03;
const A = 0.05;

function lift(st: OpStock, k: number, x: number): number {
  const e = st.opEma ?? (st.opEma = []);
  if (!(e[k] > 0)) e[k] = x;
  else e[k] += A * (x - e[k]);
  return e[k];
}
function pct(x: number): string { return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`; }

function insuranceLoss(w: World): number {
  return (w.state.insurance as { loss?: number } | undefined)?.loss ?? 0;
}

/** The sector's reading of one firm: a signed number and the words for it. */
function read(w: World, st: OpStock, f: Firm): { sig: number; why: string } {
  const good = f.good;
  const sold = Math.max(1, f.sold), made = Math.max(1, f.made);
  const mk = f.markup > 0 ? f.markup : 1.2;
  if (good === 'CRUDE_OIL' || good === 'NATURAL_GAS') {
    const px = futuresPrice(w, good, 0), far = futuresPrice(w, good, 3);
    if (px > 0 && far > 0 && f.unitCost > 0) {
      const margin = px / f.unitCost, slope = far / px;
      const dm = margin / lift(st, 0, margin) - 1, dc = slope - lift(st, 1, slope);
      return { sig: 0.3 * dm + 0.6 * dc, why: `${good === 'CRUDE_OIL' ? 'crude' : 'gas'} margin over extraction cost ${pct(dm)} against its 20-day norm, the curve ${dc >= 0 ? 'steeper' : 'flatter'} by ${(Math.abs(dc) * 100).toFixed(1)} points` };
    }
  }
  if (good === 'AIR_TRAVEL') {
    const load = sold / made, fuel = futuresPrice(w, 'CRUDE_OIL', 0);
    const dl = load / lift(st, 0, load) - 1;
    const df = fuel > 0 ? fuel / lift(st, 1, fuel) - 1 : 0;
    return { sig: 0.5 * dl - 0.25 * df, why: `load factor ${pct(dl)} against its 20-day norm, fuel ${pct(df)}` };
  }
  if (good === 'INSURANCE') {
    const loss = insuranceLoss(w), dl = loss - lift(st, 0, Math.max(0.05, loss));
    const eq = Math.max(1, w.ledger.netWorth(f.id)), de = eq / lift(st, 1, eq) - 1;
    return { sig: -0.1 * dl + 0.2 * de, why: `claims ${dl > 0 ? 'above' : 'below'} their norm by ${(Math.abs(dl) * 100).toFixed(1)} points of premiums, reserves ${pct(de)}` };
  }
  if (f.sector === 'TECHNOLOGY') {
    const orders = (f.sold + f.lost) / Math.max(1, f.soldEma), cap = f.made / Math.max(1, f.madeEma);
    const dor = orders / lift(st, 0, orders) - 1, dcap = cap / lift(st, 1, cap) - 1;
    return { sig: 0.45 * dor + 0.25 * dcap, why: `orders ${pct(dor)} and capacity in use ${pct(dcap)} against their norms` };
  }
  if (f.sector === 'RETAIL') {
    const dfoot = sold / lift(st, 0, sold) - 1, dmk = mk - lift(st, 1, mk);
    return { sig: 0.6 * dfoot + 1.2 * dmk, why: `footfall ${pct(dfoot)} against its norm, margin ${dmk >= 0 ? 'up' : 'down'} ${(Math.abs(dmk) * 100).toFixed(1)} points` };
  }
  const ds = sold / lift(st, 0, sold) - 1, dmk = mk - lift(st, 1, mk);
  return { sig: 0.35 * ds + 0.5 * dmk, why: `${GOODS[good]?.name ?? 'sales'} volume ${pct(ds)} against its norm, markup ${dmk >= 0 ? 'up' : 'down'} ${(Math.abs(dmk) * 100).toFixed(1)} points` };
}

/** Run once a day after the close; markets reads the result when it sets the next session's fair value. */
export function readOperations(w: World): void {
  const stocks = (w.state.markets as { stocks?: OpStock[] } | undefined)?.stocks;
  if (!stocks) return;
  const firms = (w.state.economy as EconState).firms;
  const byId = new Map<string, Firm>();
  for (const f of firms) byId.set(f.id, f);
  for (const st of stocks) {
    const f = byId.get(st.issuer);
    if (!f || f.closed) { st.opTilt = 0; continue; }
    const r = read(w, st, f);
    const sig = Number.isFinite(r.sig) ? r.sig : 0;
    const next = 0.6 * (st.opTilt ?? 0) + 0.4 * sig;
    st.opTilt = Math.max(-CAP, Math.min(CAP, next));
    st.opRead = r.why;
  }
}
