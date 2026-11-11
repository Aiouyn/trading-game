import { LP, graduationOf, liquidationCents, listPriceMinor, nameOk, quote, tickerOk } from "@/launchpad/rules";
import { ASSETS } from "@/market/catalog";
import { listedDef } from "@/market/listings";
import { BOOK_LAW, baseDepthInputs, depthQuote, fillOnBook, ladderImpact, type BookFillResult } from "@/server/broker/book";
import { centsOf } from "@/market/valuation";
import { ADV_TOKENS, MEME_POOL_WEIGHTS, POOL_LAW } from "@/server/broker/pools";
import { hypeF, hypeStep } from "@/server/broker/pools";
import { CRYPTO_DAYS_PER_YEAR, Draws, HYPE, TICKS_PER_HOUR, memeParams } from "@/server/market/meme";
import { moderateName, normalizeName } from "@/server/launchpad/moderate";
import { parseFarmCommand, parseFarmFrames } from "./boundary";
import { isPlainJson } from "./json";
import type { FarmCoin, FarmCommand, FarmReply, FarmState, FarmWallet, WalletKind } from "./model";
export type { FarmState, FarmCommand, FarmFrame } from "./model";

export const FAILURE_LAW = { liquidityCents: 100_000, thinHours: 7 * 24, earlyExitHours: 24 * 24, rallyHype: .4, abandonHype: .15, npcSaleFraction: .2 } as const;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const integer = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min;
const own = <T>(r: Record<string, T>, key: string): T | undefined => Object.hasOwn(r, key) ? r[key] : undefined;
const held = (w: FarmWallet, c: FarmCoin) => own(w.tokens, c.ticker) ?? 0;
const realCash = (c: FarmCoin) => c.venue.kind === "CURVE" ? c.venue.curve.x - LP.X0 : c.venue.book.cash;
const refuse = (code: string): FarmReply => ({ kind: "REFUSED", code });
/** Pre-registered Rule A (docs/v1/units/meme-failure-farm.md): the band below the mark within which book bids count as
 *  liquidity, max(0.05, 3 sigma_d) "measured from the last price" (05:560 settlement/fix band; meme daily reference 05:255). */
export const liquidityBand = (ticker: string): number => Math.max(0.05, 3 * memeParams(ticker).vol / Math.sqrt(CRYPTO_DAYS_PER_YEAR));
/** 06:762 "pool liquidity". Curve: real reserve cash (falls with price, like a pool). Book: the cash a seller can receive
 *  within the band below the mark on the base ladder (same spread, skew, impact, depth and rounding as fillOnBook, used = 0),
 *  capped by book cash. Resting cash reachable only far below the price is not liquidity. Measurement only: moves nothing. */
export function liquidity(c: FarmCoin): number {
  if (c.venue.kind === "CURVE") return realCash(c);
  const book = c.venue.book, inp = baseDepthInputs(c.ticker), band = liquidityBand(c.ticker);
  const inv = book.flow?.m?.inv ?? 0, dq = depthQuote(c.mark, inp, inv, "SELL");
  const qmax = Math.floor(dq.d * inp.adv * Math.pow(Math.max(0, band - dq.s) / (BOOK_LAW.impactY * inp.sigmaDaily), 2));
  if (qmax < 1) return 0;
  const ref = Math.max(1, Math.round(c.mark * Math.exp(dq.skew - (book.flow?.m?.skew ?? 0))));
  const px = Math.floor(ref * Math.exp(-(dq.s + ladderImpact(qmax, inp, dq.d))));
  const dp = listedDef(c.ticker, c.name, c.venue.listedPrice).displayDecimals;
  return Math.min(book.cash, Math.max(0, centsOf(dp, px * qmax, false)));
}
/** Pre-registered Rule B: 05 §6.2 RETAIL (05:832) for memes, weight 3.0, rate 0.15 ADV/day, the base targets() form. */
export const RETAIL_LAW = { weight: MEME_POOL_WEIGHTS.retail, chase: POOL_LAW.retailChase, rate: POOL_LAW.rate.retail, adv: ADV_TOKENS } as const;
const setHeld = (w: FarmWallet, ticker: string, qty: number) => { if (qty > 0) w.tokens[ticker] = qty; else delete w.tokens[ticker]; };

export function cashTotal(s: FarmState): number {
  return s.sink + Object.values(s.wallets).reduce((n, w) => n + w.cash, 0) + Object.values(s.coins).reduce((n, c) => n + realCash(c), 0);
}
export function tokenTotal(s: FarmState, ticker: string): number {
  const c = own(s.coins, ticker);
  if (!c) throw new Error("UNKNOWN_COIN");
  return Object.values(s.wallets).reduce((n, w) => n + (own(w.tokens, ticker) ?? 0), 0)
    + (c.venue.kind === "CURVE" ? LP.SUPPLY - c.venue.curve.sold : c.venue.book.tokens);
}
export function assertConservation(s: FarmState): void {
  if (!integer(s.initialCash) || !integer(s.sink) || cashTotal(s) !== s.initialCash) throw new Error("CASH_CONSERVATION");
  for (const w of Object.values(s.wallets)) {
    if (!integer(w.cash) || Object.entries(w.tokens).some(([t, n]) => !own(s.coins, t) || !integer(n, 1))) throw new Error("BAD_WALLET");
  }
  for (const c of Object.values(s.coins)) {
    if (!integer(realCash(c)) || tokenTotal(s, c.ticker) !== LP.SUPPLY) throw new Error("TOKEN_CONSERVATION");
    if (c.venue.kind === "BOOK" && !integer(c.venue.book.tokens)) throw new Error("BAD_BOOK");
  }
}
export function createFarm(seed: string, wallets: readonly { id: string; kind: WalletKind; cash: number }[]): FarmState {
  if (typeof seed !== "string" || !isPlainJson(wallets) || !Array.isArray(wallets) || !seed || seed.length > 128 || wallets.length === 0) throw new Error("BAD_GENESIS");
  const accounts: Record<string, FarmWallet> = {};
  for (const w of wallets) {
    if (typeof w !== "object" || w === null || Object.keys(w).length !== 3 || !["id", "kind", "cash"].every((k) => Object.hasOwn(w, k)) || typeof w.id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(w.id) || w.id === "constructor" || w.id === "__proto__" || Object.hasOwn(accounts, w.id) || !integer(w.cash)
      || (w.kind !== "NPC" && w.kind !== "PLAYER" && w.kind !== "RETAIL")) throw new Error("BAD_GENESIS");
    accounts[w.id] = { kind: w.kind, cash: w.cash, tokens: {}, lastLaunchAtMs: null };
  }
  const s: FarmState = { v: 2, seed, hour: 0, initialCash: wallets.reduce((n, w) => n + w.cash, 0), sink: 0, wallets: accounts, coins: {}, receipts: {} };
  assertConservation(s);
  return s;
}
function thin(c: FarmCoin, hour: number): void {
  if (c.discovery.kind === "DELISTED") return;
  if (liquidity(c) >= FAILURE_LAW.liquidityCents) c.thinSince = null;
  else {
    c.thinSince ??= hour;
    if (hour - c.thinSince >= FAILURE_LAW.thinHours) c.discovery = { kind: "DELISTED", hour };
  }
}
function flagDump(c: FarmCoin, qty: number, hour: number): void {
  c.creatorDaySold += qty;
  if (c.venue.kind === "BOOK") {
    c.venue.creatorSold += qty;
    if (!c.rug && hour - c.venue.graduatedHour < FAILURE_LAW.earlyExitHours && c.venue.creatorAtGraduation > 0
      && c.venue.creatorSold * 2 >= c.venue.creatorAtGraduation) c.rug = { kind: "EARLY_EXIT", hour };
  }
  if (!c.rug && c.creatorDaySold >= .03 * LP.SUPPLY && c.mark <= .6 * c.dayOpen) c.rug = { kind: "DAILY_DUMP", hour };
}
function curveTrade(s: FarmState, c: FarmCoin, w: FarmWallet, wallet: string, side: "BUY" | "SELL", amount: number): FarmReply {
  if (c.venue.kind !== "CURVE") throw new Error("NOT_CURVE");
  const q = quote(c.venue.curve, side === "BUY" ? "buy" : "sell", amount);
  if (!q.ok) return refuse(q.why);
  if (side === "BUY" && q.cents > w.cash) return refuse("CASH");
  if (side === "SELL" && amount > held(w, c)) return refuse("HELD");
  if (side === "BUY" && wallet === c.creator && w.kind === "PLAYER" && held(w, c) + q.tokens > LP.CREATOR_CAP) return refuse("CREATOR_CAP");
  const creator = s.wallets[c.creator]!;
  w.cash += side === "BUY" ? -q.cents : q.cents;
  creator.cash += q.creatorFee;
  s.sink += q.fee - q.creatorFee;
  setHeld(w, c.ticker, held(w, c) + (side === "BUY" ? q.tokens : -q.tokens));
  c.venue = { kind: "CURVE", curve: q.after };
  c.mark = listPriceMinor(q.after);
  if (q.graduates) {
    const g = graduationOf(q.after);
    s.sink += g.fee;
    c.venue = { kind: "BOOK", book: g.book, listedPrice: c.mark, graduatedHour: s.hour, creatorAtGraduation: held(creator, c), creatorSold: 0 };
  }
  return { kind: "FILLED", ticker: c.ticker, qty: q.tokens, cents: q.cents, fee: q.fee };
}
function bookTrade(s: FarmState, c: FarmCoin, w: FarmWallet, side: "BUY" | "SELL", amount: number): FarmReply {
  if (c.venue.kind !== "BOOK") throw new Error("NOT_BOOK");
  if (side === "SELL" && amount > held(w, c)) return refuse("HELD");
  const a = listedDef(c.ticker, c.name, c.venue.listedPrice), tick = s.hour * TICKS_PER_HOUR;
  const fill = (qty: number) => fillOnBook(a, side, qty, c.mark, c.venue.kind === "BOOK" ? c.venue.book : { cash: 0, tokens: 0 }, tick);
  let result: BookFillResult | null = fill(amount);
  if (side === "BUY" && result && result.notional + result.fee > w.cash) {
    let lo = 0, hi = result.qty;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2), f = fill(mid);
      if (f && f.qty === mid && f.notional + f.fee <= w.cash) lo = mid; else hi = mid - 1;
    }
    result = lo > 0 ? fill(lo) : null;
  }
  if (!result) return refuse("NO_LIQUIDITY");
  if (side === "SELL" && w.cash + result.notional < result.fee) return refuse("FEE_CASH");
  w.cash += side === "BUY" ? -result.notional - result.fee : result.notional - result.fee;
  setHeld(w, c.ticker, held(w, c) + (side === "BUY" ? result.qty : -result.qty));
  c.venue.book = result.book;
  c.mark = Math.max(1, Math.round(c.mark * Math.exp(result.move)));
  return { kind: "FILLED", ticker: c.ticker, qty: result.qty, cents: result.notional, fee: result.fee };
}
function trade(s: FarmState, wallet: string, ticker: string, side: "BUY" | "SELL", amount: number): FarmReply {
  const w = own(s.wallets, wallet), c = own(s.coins, ticker);
  if (!w || !c) return refuse("UNKNOWN_ACCOUNT_OR_COIN");
  if (wallet === c.creator && c.launcher.kind === "NPC_ABANDONED") return refuse("ABANDONED");
  if (!integer(amount, 1) || (side !== "BUY" && side !== "SELL")) return refuse("BAD_AMOUNT");
  if (c.discovery.kind === "DELISTED" && side === "BUY") return refuse("DELISTED");
  const reply = c.venue.kind === "CURVE" ? curveTrade(s, c, w, wallet, side, amount) : bookTrade(s, c, w, side, amount);
  if (reply.kind !== "FILLED") return reply;
  c.hourVolume += reply.qty;
  if (w.kind === "PLAYER") {
    const net = side === "BUY" ? reply.cents : -reply.cents, prev = c.playerNet.at(-1);
    if (prev?.[0] === s.hour) prev[1] += net; else c.playerNet.push([s.hour, net]);
  }
  if (wallet === c.creator && side === "SELL") flagDump(c, reply.qty, s.hour);
  thin(c, s.hour);
  return reply;
}
/** One hourly RETAIL order (05:826 per-tick caps summed over the hour). Spot only: target >= 0, buys bounded by own cash
 *  and sells by own tokens inside trade(); refusals (e.g. delisted buys, no liquidity) are simply no trade. */
function retailStep(s: FarmState, id: string, c: FarmCoin, r1d: number | null): void {
  const z = new Draws(`farm:${s.seed}:${c.ticker}:retail:${id}:${s.hour}`).normal();
  const sd = memeParams(c.ticker).vol / Math.sqrt(CRYPTO_DAYS_PER_YEAR);
  const signal = z + RETAIL_LAW.chase * Math.tanh(r1d === null ? 0 : r1d / sd); // attention, dip and belief terms are 0 here
  const target = Math.floor(Math.max(0, RETAIL_LAW.weight * Math.tanh(signal)) * RETAIL_LAW.adv);
  const cap = Math.floor(RETAIL_LAW.weight * RETAIL_LAW.rate / 24 * RETAIL_LAW.adv);
  const order = Math.max(-cap, Math.min(cap, target - held(s.wallets[id]!, c)));
  if (order >= 1) trade(s, id, c.ticker, "BUY", order);
  else if (order <= -1) trade(s, id, c.ticker, "SELL", -order);
}
function launch(s: FarmState, cmd: Extract<FarmCommand, { kind: "LAUNCH" }>): FarmReply {
  const w = own(s.wallets, cmd.wallet);
  if (!w) return refuse("UNKNOWN_ACCOUNT");
  if (!tickerOk(cmd.ticker) || !nameOk(cmd.name)) return refuse("BAD_NAME");
  if (own(s.coins, cmd.ticker)) return refuse("TICKER_TAKEN");
  const reserved = new Set(ASSETS.flatMap((a) => [a.ticker, a.name]).map((n) => normalizeName(n).joined));
  const ticker = moderateName(cmd.ticker, reserved), name = moderateName(cmd.name, reserved);
  if (!ticker.ok) return refuse(ticker.reason === "taken" ? "TICKER_TAKEN" : "BAD_NAME");
  if (!name.ok) return refuse(name.reason === "taken" ? "NAME_TAKEN" : "BAD_NAME");
  if (!integer(cmd.nowMs) || cmd.fee !== LP.LAUNCH_FEE) return refuse("BAD_LAUNCH");
  if (w.lastLaunchAtMs !== null && cmd.nowMs < w.lastLaunchAtMs + LP.COOLDOWN_MS) return refuse("COOLDOWN");
  if (Object.values(s.coins).filter((c) => c.creator === cmd.wallet && c.venue.kind === "CURVE" && c.discovery.kind === "LIVE").length >= LP.MAX_LIVE) return refuse("MAX_LIVE");
  if (w.kind === "RETAIL") return refuse("BAD_LAUNCH"); // a trader pool never launches
  if (w.cash < LP.LAUNCH_FEE) return refuse("CASH");
  w.cash -= LP.LAUNCH_FEE; s.sink += LP.LAUNCH_FEE; w.lastLaunchAtMs = cmd.nowMs;
  const curve = { x: LP.X0, sold: 0 }, mark = listPriceMinor(curve);
  s.coins[cmd.ticker] = { ticker: cmd.ticker, name: cmd.name, creator: cmd.wallet, createdHour: s.hour,
    venue: { kind: "CURVE", curve }, discovery: { kind: "LIVE" }, launcher: { kind: w.kind === "NPC" ? "NPC_ACTIVE" : "PLAYER" },
    mark, lastHourMark: mark, hype: HYPE.h0, thinSince: s.hour, rug: null, day: Math.floor(s.hour / 24), dayOpen: mark, creatorDaySold: 0, hourVolume: 0, playerNet: [], closes: [] };
  return { kind: "LAUNCHED", ticker: cmd.ticker };
}
function fingerprintOf(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) => part !== null && typeof part === "object" && !Array.isArray(part)
    ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : part);
}
function sameRequest(saved: string, fingerprint: string): boolean {
  // V1 checkpoints already contain unsorted JSON; replay must not rewrite their receipts.
  try { return fingerprintOf(JSON.parse(saved)) === fingerprint; }
  catch { return false; }
}
/** Pure command boundary. Receipts are scoped to a wallet, persisted, and include refusals. */
export function commandFarm(prior: FarmState, input: unknown): { state: FarmState; reply: FarmReply } {
  const cmd = parseFarmCommand(input); // throws INVALID_FARM_COMMAND before any receipt or fingerprint
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(cmd.key) || !own(prior.wallets, cmd.wallet)) return { state: prior, reply: refuse("BAD_REQUEST") };
  const receiptKey = `${cmd.wallet}:${cmd.key}`, fingerprint = fingerprintOf(cmd), receipt = own(prior.receipts, receiptKey);
  if (receipt) return { state: prior, reply: sameRequest(receipt.fingerprint, fingerprint) ? structuredClone(receipt.reply) : refuse("IDEMPOTENCY_CONFLICT") };
  const state = structuredClone(prior);
  const reply = cmd.kind === "LAUNCH" ? launch(state, cmd) : trade(state, cmd.wallet, cmd.ticker, cmd.side, cmd.amount);
  state.receipts[receiptKey] = { fingerprint, reply };
  assertConservation(state);
  return { state, reply: structuredClone(reply) };
}
/** Replays every supplied game-hour close in order. Gaps are rejected, never held constant or silently skipped. */
export function advanceFarm(prior: FarmState, input: unknown): FarmState {
  const frames = parseFarmFrames(input); // throws INVALID_FARM_FRAME before any state change
  if (!frames.length) return prior;
  const s = structuredClone(prior);
  for (const frame of frames) {
    if (!integer(frame.hour, 1) || frame.hour !== s.hour + 1) throw new Error("NON_CONSECUTIVE_FRAME");
    for (const [ticker, obs] of Object.entries(frame.coins)) {
      if (!own(s.coins, ticker) || (obs.mark !== undefined && s.coins[ticker]?.venue.kind === "CURVE") || (obs.mark !== undefined && !integer(obs.mark, 1))
        || (obs.mentions !== undefined && (!Number.isFinite(obs.mentions) || obs.mentions < 0 || obs.mentions > 1))
        || (obs.hypeShock !== undefined && !Number.isFinite(obs.hypeShock))) throw new Error("BAD_OBSERVATION");
    }
    s.hour = frame.hour;
    const retailIds = Object.keys(s.wallets).filter((id) => s.wallets[id]!.kind === "RETAIL").sort();
    for (const c of Object.values(s.coins)) {
      const obs = own(frame.coins, c.ticker) ?? {}, previousMark = c.lastHourMark;
      if (c.day !== Math.floor(s.hour / 24)) { c.day = Math.floor(s.hour / 24); c.dayOpen = c.mark; c.creatorDaySold = 0; }
      if (c.venue.kind === "BOOK" && obs.mark !== undefined) c.mark = obs.mark;
      c.playerNet = c.playerNet.filter(([hour]) => hour > s.hour - 24);
      const circulating = c.venue.kind === "CURVE" ? c.venue.curve.sold : LP.SUPPLY - c.venue.book.tokens;
      const cap = Math.round(circulating * c.mark / 1e6);
      c.hype = clamp(hypeStep(c.hype, obs.mentions ?? 0, hypeF(c.playerNet.reduce((n, [, v]) => n + v, 0), cap)) + (obs.hypeShock ?? 0));
      // An NPC action, not a random token failure: the only random decision is low-hype abandonment (06:761).
      if (c.discovery.kind === "LIVE" && c.launcher.kind === "NPC_ACTIVE") {
        if (c.hype < FAILURE_LAW.abandonHype && new Draws(`farm:${s.seed}:${c.ticker}:abandon:${s.hour}`).chance(.5)) c.launcher = { kind: "NPC_ABANDONED", hour: s.hour };
        else if (c.hype > FAILURE_LAW.rallyHype && c.mark > previousMark) {
          const volume = c.hourVolume;
          const qty = Math.min(held(s.wallets[c.creator]!, c), Math.floor(volume * FAILURE_LAW.npcSaleFraction));
          if (qty > 0) trade(s, c.creator, c.ticker, "SELL", qty);
        }
      }
      if (!c.rug && c.creatorDaySold >= .03 * LP.SUPPLY && c.mark <= .6 * c.dayOpen) c.rug = { kind: "DAILY_DUMP", hour: s.hour };
      c.hourVolume = 0;
      // Rule B: the RETAIL pools see this hour's public close and its 24-hour return, then trade through the real book.
      const r1d = c.closes.length === 24 ? Math.log(c.mark / c.closes[0]!) : null;
      c.closes = [...c.closes, c.mark].slice(-24);
      if (c.venue.kind === "BOOK") for (const id of retailIds) retailStep(s, id, c, r1d);
      c.lastHourMark = c.mark;
      thin(c, s.hour);
    }
    assertConservation(s);
  }
  return s;
}
/** Discovery never leaks holder/creator account ids; delisted tokens remain in private wallets. */
export function publicCoins(s: FarmState) {
  return Object.values(s.coins).filter((c) => c.discovery.kind === "LIVE").map((c) => ({ ticker: c.ticker, name: c.name, mark: c.mark,
    hype: c.hype, launcher: structuredClone(c.launcher), rug: structuredClone(c.rug), venue: c.venue.kind, liquidityCents: liquidity(c) }));
}
export function walletValue(s: FarmState, wallet: string, ticker: string): number {
  const c = own(s.coins, ticker), w = own(s.wallets, wallet);
  if (!c || !w || c.discovery.kind === "DELISTED") return 0;
  return c.venue.kind === "CURVE" ? liquidationCents(c.venue.curve, held(w, c)) : Math.round(held(w, c) * c.mark / 1e6);
}
