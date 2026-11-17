// Three ways of playing a scenario. They act only through the player.
// Careful saves and spreads a book. Aggressive borrows and concentrates. Idle does nothing.
import type { World } from '../kernel/index.ts';
import type { Command, PlayerView } from '../modules/player/index.ts';
import { heldQty, live, stocks } from './lib.ts';

export const STYLES = ['careful', 'aggressive', 'idle'] as const;
export type Style = (typeof STYLES)[number];

interface Run {
  id?: string;
  outcome?: string;
  goal?: { kind?: string; firm?: string; sector?: string; cents?: number; count?: number; days?: number };
}

interface FirmRow {
  id: string;
  name: string;
  sector: string;
  listed: boolean;
  closed: boolean;
  lastProfit: number;
  workers: number;
  ceo: number;
}

const picked = new WeakMap<World, string>();
const openingBook = new WeakMap<World, { cap: number; cash: number }>();

function run(w: World): Run {
  return (w.state.scenario ?? {}) as Run;
}

function firms(w: World): FirmRow[] {
  const s = w.state.economy as { firms?: FirmRow[] } | undefined;
  return s?.firms ?? [];
}

function listed(v: PlayerView): { instr: string; px: number; id: string }[] {
  return stocks(v)
    .filter((s) => s.px >= 500)
    .map((s) => ({ instr: s.instr, px: s.px, id: s.instr.startsWith('eq:') ? s.instr.slice(3) : s.instr }));
}

/** Names around the middle of the price list. The cheapest names are the ones that fall over. */
function basket(v: PlayerView, n: number): { instr: string; px: number; id: string }[] {
  const all = listed(v).slice().sort((a, b) => a.px - b.px);
  if (all.length < 3) return all;
  const lo = Math.floor(all.length * 0.35);
  const hi = Math.max(lo + 1, Math.floor(all.length * 0.7));
  const mid = all.slice(lo, hi);
  const step = Math.max(1, Math.floor(mid.length / n));
  const out: { instr: string; px: number; id: string }[] = [];
  for (let i = 0; i < mid.length && out.length < n; i += step) out.push(mid[i]);
  return out;
}

function oneName(v: PlayerView, w: World): { instr: string; px: number; id: string } | undefined {
  const held = picked.get(w);
  const all = listed(v).slice().sort((a, b) => a.px - b.px);
  if (held) return all.find((s) => s.instr === held) ?? all[0];
  if (!all.length) return;
  const pick = all[Math.min(all.length - 1, Math.max(0, Math.floor(all.length * 0.32)))];
  picked.set(w, pick.instr);
  return pick;
}

function targetFirm(w: World, v: PlayerView): string {
  const g = run(w).goal;
  if (g?.firm && g.firm !== '*') return g.firm.startsWith('eq:') ? g.firm : g.firm.startsWith('frm_') ? g.firm : 'frm_' + g.firm;
  if (g?.kind === 'sector' && g.sector) {
    const hit = firms(w).filter((f) => !f.closed && f.listed && f.sector === g.sector);
    hit.sort((a, b) => a.workers - b.workers || (a.id < b.id ? -1 : 1));
    if (hit[0]) return hit[0].id;
  }
  const cheap = listed(v).slice().sort((a, b) => a.px - b.px)[0];
  return cheap?.id ?? '';
}

function stake(v: PlayerView, w: World, firmId: string): { have: number; out: number } {
  const instr = firmId.startsWith('eq:') ? firmId : 'eq:' + firmId;
  const have = Math.floor(heldQty(v, instr));
  const out = Math.floor(w.ledger.issued.get(instr) ?? 0);
  return { have, out };
}

function bidMultiple(w: World, careful: boolean): number {
  const rivals = run(w).rivals ?? 1;
  const hot = rivals >= 1.25;
  if (careful) return hot ? 1.44 : 1.1;
  return hot ? 1.43 : 1.08;
}

function chase(v: PlayerView, w: World, firmId: string, multiple: number, lever: boolean): Command[] {
  if (!firmId) return [];
  const instr = firmId.startsWith('eq:') ? firmId : 'eq:' + firmId;
  const px = v.prices.find((p) => p.instr === instr)?.px ?? 0;
  if (!(px > 0)) return [];
  const { have, out } = stake(v, w, firmId);
  const cmds: Command[] = [];
  if (lever && !v.loans.some((l) => l.kind === 'margin') && v.netWorth > 0) {
    cmds.push({ kind: 'cash', op: 'borrow', cents: Math.round(Math.min(8_000_000, Math.max(200_000, v.netWorth * 0.25))) });
  }
  const room = Math.max(0, v.cash - (lever ? 20_000 : 80_000));
  const pending = v.orders.filter((o) => o.instr === instr && o.side === 'buy').reduce((a, o) => a + o.qty, 0);
  const held = have + pending;
  const ceiling = out > 0 ? Math.floor(out * 0.18) : 0;
  const want = out > 0 ? Math.ceil(out * (lever ? 0.08 : 0.1)) : 0;
  const buy = Math.min(Math.max(0, Math.min(want, ceiling - held)), Math.floor(room / px));
  if (buy >= 1) cmds.push({ kind: 'order', side: 'buy', instr, qty: buy });
  const price = Math.max(1, Math.round(px * multiple));
  const cost = Math.max(0, out - have) * price;
  // Pay the bid in cash. A shortfall asks the bank to lend against a cause that is not a number.
  let book = openingBook.get(w);
  if (!book) {
    book = { cap: px * out, cash: v.cash };
    openingBook.set(w, book);
  }
  const fit = book.cap * multiple <= book.cash;
  if (fit && have >= 1 && cost > 0 && v.cash >= cost && have * 2 <= out && v.date.abs % 14 === 0) {
    cmds.push({ kind: 'bid', firm: firmId, cents: 0, multiple, paper: false });
  }
  return cmds;
}

function saveAndInvest(v: PlayerView): Command[] {
  const names = basket(v, 6);
  const keep = Math.max(50_000, Math.min(v.cash, Math.round(Math.max(v.netWorth, v.cash) * 0.12)));
  const free = Math.max(0, v.cash - keep);
  const invest = Math.floor(free * 0.35);
  const cmds: Command[] = [];
  let left = invest;
  if (names.length) {
    const per = Math.floor(invest / names.length);
    for (const s of names) {
      const qty = Math.floor(Math.min(left, per) / s.px);
      if (qty < 1) continue;
      const have = heldQty(v, s.instr);
      if (have * s.px > v.netWorth * 0.22 && v.netWorth > 0) continue;
      cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
      left -= qty * s.px;
    }
  }
  const park = free - (invest - left);
  if (park >= 5_000) cmds.push({ kind: 'cash', op: 'deposit', cents: park });
  return cmds;
}

function leverOne(v: PlayerView, w: World, stake = 0.4, park = 0.1, borrowCap = 3_000_000): Command[] {
  const s = oneName(v, w);
  if (!s) return [];
  const cmds: Command[] = [];
  if (borrowCap > 0 && !v.loans.some((l) => l.kind === 'margin') && v.netWorth > 0) {
    cmds.push({ kind: 'cash', op: 'borrow', cents: Math.round(Math.min(borrowCap, Math.max(150_000, v.netWorth * 0.35))) });
  }
  const issued = Math.floor(w.ledger.issued.get(s.instr) ?? 0);
  const held = heldQty(v, s.instr);
  const capQty = issued > 0 ? Math.max(0, Math.floor(issued * 0.008) - held) : 0;
  const budget = Math.min(Math.floor(Math.max(0, v.cash) * stake), capQty * s.px);
  const qty = Math.floor(budget / s.px);
  if (qty >= 1) cmds.push({ kind: 'order', side: 'buy', instr: s.instr, qty });
  const left = v.cash - (qty >= 1 ? qty * s.px : 0);
  if (left >= 30_000) cmds.push({ kind: 'cash', op: 'deposit', cents: Math.floor(left * park) });
  return cmds;
}

function steer(v: PlayerView, careful: boolean): Command[] {
  const post = v.companies.find((c) => c.role === 'chief executive');
  if (!post) return [];
  const cmds: Command[] = [];
  if (careful) {
    cmds.push({ kind: 'ceo', firm: post.id, op: 'dividend', value: 0 });
    if (post.profit < 0 && post.workers > 4) cmds.push({ kind: 'ceo', firm: post.id, op: 'hires', value: Math.max(4, post.workers - Math.max(1, Math.round(post.workers * 0.08))) });
    else if (v.date.abs % 28 === 0) cmds.push({ kind: 'ceo', firm: post.id, op: 'price', auto: true });
  } else {
    cmds.push({ kind: 'ceo', firm: post.id, op: 'dividend', value: 0.25 });
    if (post.workers > 8 && post.profit < 0) cmds.push({ kind: 'ceo', firm: post.id, op: 'hires', value: Math.max(4, Math.round(post.workers * 0.92)) });
    if (post.price > 0 && v.date.abs % 28 === 0) cmds.push({ kind: 'ceo', firm: post.id, op: 'price', value: Math.round(post.price * 1.03) });
  }
  return cmds;
}

function develop(v: PlayerView, careful: boolean): Command[] {
  const mine = v.homes.filter((h) => h.mine);
  const listedHomes = v.homes.filter((h) => !h.mine).slice().sort((a, b) => a.price - b.price);
  const cmds: Command[] = [];
  const cap = careful ? 2 : 3;
  if (mine.length < cap && listedHomes.length) {
    const h = listedHomes[0];
    // The third roof needs a cash reserve. Dear listings are left alone; cheap ones get bought on credit.
    const buffer = careful ? 150_000 : mine.length >= 2 ? Math.round(h.price * 0.5) : 20_000;
    if (v.cash + (mine.length === 0 ? h.price * 0.8 : 0) > h.price + buffer || v.cash > h.price * (mine.length === 0 ? 0.35 : 1) + buffer) {
      cmds.push({ kind: 'homebid', id: h.id, cents: 0 });
    }
  }
  for (const h of mine) {
    if (h.live) cmds.push({ kind: 'move', id: mine.find((o) => o.id !== h.id)?.id ?? h.id });
    if (!h.live && h.vacant && h.rent > 0) cmds.push({ kind: 'let', id: h.id, cents: Math.max(1, Math.round(h.rent)) });
    const draw = careful ? Math.round(h.price * 0.55) : 0;
    if (mine.length === 1 || !careful) cmds.push({ kind: 'mortgage', id: h.id, cents: draw });
  }
  return cmds;
}

export function commands(style: string, v: PlayerView, w: World): Command[] {
  if (style === 'idle' || !live(v)) return [];
  const sc = run(w);
  if (sc.outcome) return [];
  const kind = sc.goal?.kind ?? 'worth';
  const id = sc.id ?? '';
  const careful = style === 'careful';
  if (kind === 'none') return [];
  if (kind === 'crash') return careful ? saveAndInvest(v).filter((c) => c.kind === 'cash') : leverOne(v, w);
  if (kind === 'office' || kind === 'dynasty') return [];
  if (kind === 'firm' || kind === 'sector' || id === 'activist') return chase(v, w, targetFirm(w, v), bidMultiple(w, careful), !careful);
  if (kind === 'turn' || id === 'struggling-ceo' || id === 'heir-debts') {
    const led = steer(v, id === 'struggling-ceo' ? true : careful);
    return led.concat(careful ? saveAndInvest(v) : leverOne(v, w));
  }
  if (kind === 'homes' || id === 'property-developer') {
    const homes = develop(v, careful);
    return homes.length ? homes : careful ? saveAndInvest(v) : [];
  }
  if (id === 'hedge-fund') return careful ? saveAndInvest(v) : leverOne(v, w, 0.16, 0.55, 0);
  return careful ? saveAndInvest(v) : leverOne(v, w);
}
