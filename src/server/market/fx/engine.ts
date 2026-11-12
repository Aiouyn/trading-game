import { authorizeFxCommands, type FxActorOptions } from "./actor";
import { isPlainJson } from "./json";
import { CURRENCIES, LEGS, SCALE, bounded, canonical, cash, divUp, legIds, minor, pairQuotes, parseCommand, parseFrame, parseGenesis, units, type AutoFx, type Ccy, type Command, type Converted, type Decision, type Frame, type Minor, type Offer, type RejectCode, type State, type Transfer, type Wallet, type WalletId } from "./model";
class Rejection extends Error { constructor(readonly code: RejectCode) { super(code); } }
function reject(code: RejectCode): never { throw new Rejection(code); }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const wallet = (s: State, id: WalletId): Wallet => s.wallets.find((w) => w.id === id) ?? reject("FORBIDDEN");
const outputCcy = (o: Offer): Ccy => o.side === "SELL_BASE" ? LEGS[o.leg].base : LEGS[o.leg].quote;
const inputCcy = (o: Offer): Ccy => o.side === "SELL_BASE" ? LEGS[o.leg].quote : LEGS[o.leg].base;
const controlled = (f: Frame, c: Ccy) => f.controls.some((x) => x.ccy === c && f.tick < x.untilTick);
const open = (f: Frame) => Math.floor(f.tick / 720) % 7 < 5;
function permission(s: State, account: WalletId, market: boolean): void {
  const a = wallet(s, account).access;
  if (a.kind !== "ACTOR") reject("FORBIDDEN");
  if (a.held) reject("HELD");
  if (market && a.license < 2) reject("LICENSE");
}
function conversionGate(s: State, f: Frame, account: WalletId, from: Ccy, market: boolean): void {
  permission(s, account, market);
  if (!open(f)) reject("CLOSED");
  if (controlled(f, from)) reject("CONTROLS");
}
export function reserved(s: State, account: WalletId, c: Ccy): number {
  return s.offers.filter((o) => o.account === account && outputCcy(o) === c).reduce((n, o) => n + o.remaining, 0)
    + s.reservations.filter((r) => r.account === account && r.ccy === c).reduce((n, r) => n + r.minor, 0);
}
function available(s: State, account: WalletId, c: Ccy): number { return wallet(s, account).cash[c] - reserved(s, account, c); }
function move(s: State, from: WalletId, to: WalletId, ccy: Ccy, n: Minor, reason: Transfer["reason"]): void {
  if (n === 0) return;
  const a = wallet(s, from), b = wallet(s, to);
  a.cash[ccy] = minor(a.cash[ccy] - n); b.cash[ccy] = minor(b.cash[ccy] + n);
  s.transfers.push({ from, to, ccy, minor: n, reason });
}
export function createFx(raw: unknown): State {
  const g = parseGenesis(raw), totals = cash(), qty: Record<string, ReturnType<typeof units>> = {};
  for (const c of CURRENCIES) totals[c] = bounded(g.wallets.reduce((n, w) => n + BigInt(w.cash[c]), BigInt(0)));
  for (const w of g.wallets) for (const [id, q] of Object.entries(w.units)) qty[id] = units((qty[id] ?? 0) + q);
  return { v: 1, epoch: g.epoch, startTick: g.startTick, tick: g.startTick - 1, feeWallet: g.feeWallet, wallets: g.wallets, banks: g.banks, offers: [], receipts: [], transfers: [], reservations: [], genesisCash: totals, genesisUnits: qty, lastFrame: null };
}
export function assertFxConservation(s: State): void {
  for (const c of CURRENCIES) {
    const total = s.wallets.reduce((n, w) => n + BigInt(minor(w.cash[c])), BigInt(0));
    if (total !== BigInt(s.genesisCash[c])) throw new Error(`FX_CASH_CONSERVATION:${c}`);
    for (const w of s.wallets) if (reserved(s, w.id, c) > w.cash[c]) throw new Error("FX_UNFUNDED_HOLD");
  }
  const assets = new Set([...Object.keys(s.genesisUnits), ...s.wallets.flatMap((w) => Object.keys(w.units))]);
  for (const a of assets) if (s.wallets.reduce((n, w) => n + BigInt(units(w.units[a] ?? 0)), BigInt(0)) !== BigInt(s.genesisUnits[a] ?? 0)) throw new Error("FX_UNIT_CONSERVATION");
}
const fee = (fdl: number): Minor => bounded(BigInt(10) > divUp(BigInt(fdl) * BigInt(3), BigInt(100000)) ? BigInt(10) : divUp(BigInt(fdl) * BigInt(3), BigInt(100000)));
const grossForNet = (net: number): number => Math.max(net + 10, Number(divUp(BigInt(net) * BigInt(100000), BigInt(99997))));
interface FillPlan { offerId: string; account: WalletId; input: Minor; gross: Minor; fee: Minor }
interface LegPlan { from: Ccy; to: Ccy; fills: FillPlan[]; cost: Minor; net: Minor; takerFee: Minor }
/** Quote plans are obligations only: no fake bridge balance is inserted into any wallet. */
function planLeg(s: State, f: Frame, actor: WalletId, from: Ccy, to: Ccy, want: Minor): LegPlan {
  conversionGate(s, f, actor, from, true);
  if (from !== "FDL" && to !== "FDL") throw new Error("NOT_A_LEG");
  const rows = s.offers.filter((o) => inputCcy(o) === from && outputCcy(o) === to && o.account !== actor && !controlled(f, to))
    .sort((a, b) => (a.side === "SELL_BASE" ? a.rate - b.rate : b.rate - a.rate) || a.tick - b.tick || compare(a.id, b.id));
  const fills: FillPlan[] = [], free = new Map<WalletId, number>(); let remaining: number = want, cost = BigInt(0), takerFee = BigInt(0), net = BigInt(0);
  for (const o of rows) {
    const a = wallet(s, o.account).access;
    if (a.kind !== "ACTOR" || a.held || a.license < 2) continue;
    const gross = minor(Math.min(o.remaining, to === "FDL" ? grossForNet(remaining) : remaining));
    const input = bounded(divUp(BigInt(gross) * BigInt(o.side === "SELL_BASE" ? o.rate : SCALE), BigInt(o.side === "SELL_BASE" ? SCALE : o.rate)));
    const charge = fee(from === "FDL" ? input : gross), delivered = to === "FDL" ? gross - charge : gross;
    const oldFree = free.get(o.account) ?? available(s, o.account, "FDL"), nextFree = oldFree + (from === "FDL" ? input : 0) - charge;
    if (delivered <= 0 || nextFree < 0) continue;
    free.set(o.account, nextFree);
    fills.push({ offerId: o.id, account: o.account, input, gross, fee: charge });
    cost += BigInt(input) + (from === "FDL" ? BigInt(charge) : BigInt(0)); takerFee += BigInt(charge); net += BigInt(delivered); remaining -= delivered;
    if (remaining <= 0) return { from, to, fills, cost: bounded(cost), net: bounded(net), takerFee: bounded(takerFee) };
  }
  return reject("NO_LIQUIDITY");
}
function applyLeg(s: State, actor: WalletId, p: LegPlan): void {
  if (available(s, actor, p.from) < p.cost) reject("FUNDS");
  for (const fill of p.fills) {
    const o = s.offers.find((x) => x.id === fill.offerId);
    if (!o || o.remaining < fill.gross) throw new Error("STALE_INTERNAL_PLAN");
    o.remaining = minor(o.remaining - fill.gross);
    move(s, actor, fill.account, p.from, fill.input, "FX_SPOT");
    move(s, fill.account, actor, p.to, fill.gross, "FX_SPOT");
    move(s, actor, s.feeWallet, "FDL", fill.fee, "EXCHANGE_FEE");
    move(s, fill.account, s.feeWallet, "FDL", fill.fee, "EXCHANGE_FEE");
  }
  s.offers = s.offers.filter((o) => o.remaining > 0);
  assertFxConservation(s);
}
function convert(s: State, f: Frame, account: WalletId, from: Ccy, to: Ccy, want: Minor, maxInput: Minor): Converted {
  const before = wallet(s, account).cash[from], beforeTo = wallet(s, account).cash[to];
  const plans: LegPlan[] = [];
  if (from !== "FDL" && to !== "FDL") {
    const target = planLeg(s, f, account, "FDL", to, want);
    const source = planLeg(s, f, account, from, "FDL", target.cost);
    if (source.cost > maxInput) reject("LIMIT");
    applyLeg(s, account, source); plans.push(source);
    const actualTarget = planLeg(s, f, account, "FDL", to, want);
    if (actualTarget.cost > source.net) reject("NO_LIQUIDITY");
    applyLeg(s, account, actualTarget); plans.push(actualTarget);
  } else {
    const p = planLeg(s, f, account, from, to, want);
    if (p.cost > maxInput) reject("LIMIT"); applyLeg(s, account, p); plans.push(p);
  }
  return { kind: "CONVERTED", from, to, input: minor(before - wallet(s, account).cash[from]), output: minor(wallet(s, account).cash[to] - beforeTo), feeFdl: bounded(plans.reduce((n, p) => n + BigInt(p.takerFee), BigInt(0))), fills: plans.reduce((n, p) => n + p.fills.length, 0) };
}
function bankConvert(s: State, f: Frame, c: Extract<Command, { kind: "BANK" }>): Decision {
  conversionGate(s, f, c.account, c.from, false);
  const b = s.banks.find((b) => b.id === c.bank) ?? reject("NO_BANK");
  if (!f.marks) reject("NO_MARK");
  const r = ratioForBank(f.marks, c.from, c.to), gross = bounded(BigInt(c.spend) * r.n / r.d);
  const sellBase = CURRENCIES.indexOf(c.from) < CURRENCIES.indexOf(c.to);
  const net = bounded(sellBase ? BigInt(c.spend) * r.n * BigInt(9975) / (r.d * BigInt(10000)) : BigInt(c.spend) * r.n * BigInt(10000) / (r.d * BigInt(10025)));
  const margin = minor(gross - net);
  if (net < c.minOutput || net < 1) reject("LIMIT");
  if (available(s, c.account, c.from) < c.spend || available(s, b.inventory, c.to) < gross) reject("FUNDS");
  move(s, c.account, b.inventory, c.from, c.spend, "FX_SPOT");
  move(s, b.inventory, c.account, c.to, net, "FX_SPOT"); move(s, b.inventory, b.income, c.to, margin, "BNK_FX_MARGIN");
  return { kind: "BANK_CONVERTED", from: c.from, to: c.to, input: c.spend, output: net, bankMargin: margin };
}
import { ratio as ratioForBank } from "./model";
interface Pending { command: Extract<Command, { kind: "AUTO" }>; fx: AutoFx; ask: Frame["assets"][number]; budget: Minor }
function startAuto(s: State, f: Frame, c: Extract<Command, { kind: "AUTO" }>): Pending {
  permission(s, c.account, true);
  const ask = f.assets.find((a) => a.asset === c.asset) ?? reject("ASSET_UNAVAILABLE");
  const budget = bounded(divUp(BigInt(c.estimate) * BigInt(c.qty) * BigInt(1005), BigInt(1000)));
  const short = minor(Math.max(0, budget - available(s, c.account, ask.ccy)));
  let fx: AutoFx = { kind: "NOT_NEEDED" };
  if (short > 0) {
    if (c.from === ask.ccy) reject("FUNDS");
    fx = convert(s, f, c.account, c.from, ask.ccy, short, c.maxInput);
  }
  s.reservations.push({ id: c.id, account: c.account, ccy: ask.ccy, minor: budget });
  return { command: c, fx, ask, budget };
}
function finishAuto(s: State, p: Pending): Decision {
  const c = p.command, ask = p.ask, buyer = wallet(s, c.account), seller = wallet(s, ask.seller), cost = BigInt(ask.unitPrice) * BigInt(c.qty);
  s.reservations = s.reservations.filter((r) => r.id !== c.id);
  if (c.account === ask.seller || (seller.units[c.asset] ?? 0) < c.qty) return { kind: "AUTO", fx: p.fx, asset: { kind: "CANCELLED", reason: "ASSET_UNAVAILABLE" } };
  if (cost > BigInt(p.budget) || BigInt(available(s, c.account, ask.ccy)) < cost) return { kind: "AUTO", fx: p.fx, asset: { kind: "CANCELLED", reason: "LIMIT" } };
  const paid = bounded(cost);
  move(s, c.account, ask.seller, ask.ccy, paid, "ASSET_CASH");
  seller.units[c.asset] = units((seller.units[c.asset] ?? 0) - c.qty); buyer.units[c.asset] = units((buyer.units[c.asset] ?? 0) + c.qty);
  return { kind: "AUTO", fx: p.fx, asset: { kind: "FILLED", qty: c.qty, paid } };
}
function offerCommand(s: State, f: Frame, c: Extract<Command, { kind: "OFFER" | "CANCEL" }>): Decision {
  if (c.kind === "CANCEL") {
    const o = s.offers.find((o) => o.id === c.offerId) ?? reject("NO_OFFER");
    if (o.account !== c.account) reject("FORBIDDEN");
    s.offers = s.offers.filter((o) => o.id !== c.offerId); return { kind: "CANCELLED" };
  }
  permission(s, c.account, true);
  const gives = c.side === "SELL_BASE" ? LEGS[c.leg].base : LEGS[c.leg].quote;
  if (controlled(f, gives)) reject("CONTROLS");
  if (available(s, c.account, gives) < c.amount) reject("FUNDS");
  s.offers.push({ id: c.id, account: c.account, leg: c.leg, side: c.side, rate: c.rate, remaining: c.amount, tick: f.tick });
  return { kind: "POSTED" };
}
function receipt(s: State, c: Command, result: Decision): void { s.receipts.push({ id: c.id, account: c.account, fingerprint: canonical(c), tick: s.tick, result }); }
function commands(state: State, f: Frame, cmds: Command[]): State {
  let s = state;
  const pending: Pending[] = [], fresh: Command[] = [];
  for (const c of cmds) {
    const old = s.receipts.find((r) => r.id === c.id);
    if (old) { if (old.fingerprint !== canonical(c)) throw new Error("FX_IDEMPOTENCY_CONFLICT"); }
    else fresh.push(c);
  }
  const sorted = [...fresh].sort((a, b) => compare(a.id, b.id));
  for (const c of [...sorted.filter((c) => c.kind === "OFFER" || c.kind === "CANCEL"), ...sorted.filter((c) => c.kind !== "OFFER" && c.kind !== "CANCEL")]) {
    const next = structuredClone(s);
    try {
      if (c.kind === "AUTO") { const p = startAuto(next, f, c); pending.push(p); s = next; continue; }
      const result = c.kind === "CONVERT" ? convert(next, f, c.account, c.from, c.to, c.want, c.maxInput) : c.kind === "BANK" ? bankConvert(next, f, c) : offerCommand(next, f, c);
      s = next; receipt(s, c, result);
    } catch (e) {
      const code = e instanceof Rejection ? e.code : e instanceof RangeError && e.message === "FX_AMOUNT_RANGE" ? "LIMIT" : null;
      if (!code) throw e;
      receipt(s, c, c.kind === "AUTO" ? code === "ASSET_UNAVAILABLE" ? { kind: "AUTO", fx: { kind: "NOT_NEEDED" }, asset: { kind: "CANCELLED", reason: "ASSET_UNAVAILABLE" } } : { kind: "AUTO", fx: { kind: "REJECTED", reason: code }, asset: { kind: "CANCELLED", reason: "FX_LEG_FAILED" } } : { kind: "REJECTED", reason: code });
    }
  }
  for (const p of pending.sort((a, b) => compare(a.command.asset, b.command.asset) || compare(a.command.id, b.command.id))) receipt(s, p.command, finishAuto(s, p));
  if (s.reservations.length) throw new Error("FX_RESERVATION_LEAK");
  assertFxConservation(s); return s;
}
export function advanceFx(state: State, frames: readonly Frame[], options?: FxActorOptions): State {
  if (!isPlainJson(frames)) throw new Error("INVALID_FX_FRAME");
  const parsed = frames.map((raw) => parseFrame(raw));
  authorizeFxCommands(parsed.flatMap((f) => f.commands), options);
  let s = structuredClone(state);
  for (const f of parsed) {
    if (f.epoch !== s.epoch) throw new Error("FX_EPOCH_MISMATCH");
    if (f.tick === s.tick && s.lastFrame && canonical(f) === canonical(s.lastFrame)) continue;
    if (f.tick !== s.tick + 1) throw new Error(f.tick <= s.tick ? "FX_FRAME_CONFLICT" : "FX_TICK_GAP");
    if (f.assets.some((a) => !s.wallets.some((w) => w.id === a.seller))) throw new Error("FX_INVALID_ASSET_OWNER");
    s.tick = f.tick; s = commands(s, f, f.commands); s.lastFrame = f;
  }
  return s;
}
export function previewFx(s: State, raw: unknown, options?: FxActorOptions): Decision {
  if (!s.lastFrame) throw new Error("FX_OBSERVATION_REQUIRED");
  const c = parseCommand(raw);
  authorizeFxCommands([c], options);
  const next = commands(structuredClone(s), s.lastFrame, [c]);
  const r = next.receipts.find((r) => r.id === c.id); if (!r) throw new Error("FX_RECEIPT_MISSING"); return structuredClone(r.result);
}
export function publicFx(s: State) {
  const levels = new Map<string, { leg: Offer["leg"]; side: Offer["side"]; rate: Offer["rate"]; minor: number }>();
  for (const o of s.offers) { const key = `${o.leg}:${o.side}:${o.rate}`, old = levels.get(key); levels.set(key, { leg: o.leg, side: o.side, rate: o.rate, minor: (old?.minor ?? 0) + o.remaining }); }
  return { tick: s.tick, session: s.lastFrame && open(s.lastFrame) ? "OPEN" : "CLOSED", marks: s.lastFrame?.marks ? pairQuotes(s.lastFrame.marks) : null,
    displayedDepth: [...levels.values()].sort((a, b) => legIds().indexOf(a.leg) - legIds().indexOf(b.leg) || compare(a.side, b.side) || a.rate - b.rate) };
}
