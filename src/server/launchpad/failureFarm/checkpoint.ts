import { LP, listPriceMinor, tickerOk } from "@/launchpad/rules";
import { FAILURE_LAW, assertConservation } from "./engine";
import type { FarmCoin, FarmReceipt, FarmReply, FarmState, FarmVenue, FarmWallet } from "./model";

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();
const mapOf = <T>(v: unknown, check: (x: unknown) => x is T): v is Record<string, T> => obj(v) && Object.values(v).every(check);
const accountId = (s: string) => /^[a-z][a-z0-9_-]{0,63}$/.test(s) && s !== "constructor" && s !== "__proto__";
function wallet(v: unknown): v is FarmWallet {
  return obj(v) && keys(v, ["kind", "cash", "tokens", "lastLaunchAtMs"]) && (v.kind === "PLAYER" || v.kind === "NPC") && int(v.cash)
    && (v.lastLaunchAtMs === null || int(v.lastLaunchAtMs)) && mapOf(v.tokens, (n): n is number => int(n, 1));
}
function book(v: unknown): boolean {
  if (!obj(v) || !int(v.cash) || !int(v.tokens) || v.tokens > LP.SUPPLY || !keys(v, v.flow === undefined ? ["cash", "tokens"] : ["cash", "tokens", "flow"])) return false;
  if (v.flow === undefined) return true;
  const f = v.flow;
  if (!obj(f) || !keys(f, ["t", "buy", "sell", "mid", "tb", "ts", "m"]) || !int(f.t) || !int(f.mid, 1)
    || ![f.buy, f.sell, f.tb, f.ts].every((n) => int(n))) return false;
  const m = f.m;
  return obj(m) && keys(m, ["day", "inv", "qc", "pi", "ds", "dt", "d", "skew"]) && Object.values(m).every(finite)
    && int(m.day) && typeof m.d === "number" && m.d >= .2 && typeof m.ds === "number" && m.ds >= 0 && typeof m.dt === "number" && m.dt >= 0;
}
function venue(v: unknown): v is FarmVenue {
  if (!obj(v)) return false;
  if (v.kind === "CURVE") return keys(v, ["kind", "curve"]) && obj(v.curve) && keys(v.curve, ["x", "sold"]) && int(v.curve.x, LP.X0) && int(v.curve.sold) && v.curve.sold < LP.Y0 - LP.GRAD_Y
    && BigInt(v.curve.x) * BigInt(LP.Y0 - v.curve.sold) >= BigInt(LP.X0) * BigInt(LP.Y0);
  return v.kind === "BOOK" && keys(v, ["kind", "book", "listedPrice", "graduatedHour", "creatorAtGraduation", "creatorSold"])
    && book(v.book) && int(v.listedPrice, 1) && int(v.graduatedHour) && int(v.creatorAtGraduation) && v.creatorAtGraduation <= LP.SUPPLY && int(v.creatorSold);
}
function coin(v: unknown): v is FarmCoin {
  if (!obj(v) || !keys(v, ["ticker", "name", "creator", "createdHour", "venue", "discovery", "launcher", "mark", "lastHourMark", "hype", "thinSince", "rug", "day", "dayOpen", "creatorDaySold", "hourVolume", "playerNet"])) return false;
  if (typeof v.ticker !== "string" || !tickerOk(v.ticker) || typeof v.name !== "string" || typeof v.creator !== "string" || !accountId(v.creator) || !int(v.createdHour)
    || !venue(v.venue) || !int(v.mark, 1) || !int(v.lastHourMark, 1) || !finite(v.hype) || v.hype < 0 || v.hype > 1
    || !(v.thinSince === null || int(v.thinSince)) || !int(v.day) || !int(v.dayOpen, 1) || !int(v.creatorDaySold) || !int(v.hourVolume)) return false;
  const d = v.discovery, l = v.launcher, r = v.rug;
  if (!obj(d) || !((d.kind === "LIVE" && keys(d, ["kind"])) || (d.kind === "DELISTED" && keys(d, ["kind", "hour"]) && int(d.hour)))) return false;
  if (!obj(l) || !(((l.kind === "PLAYER" || l.kind === "NPC_ACTIVE") && keys(l, ["kind"])) || (l.kind === "NPC_ABANDONED" && keys(l, ["kind", "hour"]) && int(l.hour)))) return false;
  if (!(r === null || (obj(r) && keys(r, ["kind", "hour"]) && (r.kind === "EARLY_EXIT" || r.kind === "DAILY_DUMP") && int(r.hour)))) return false;
  return Array.isArray(v.playerNet) && v.playerNet.length <= 24 && v.playerNet.every((x) => Array.isArray(x) && x.length === 2 && int(x[0]) && typeof x[1] === "number" && Number.isSafeInteger(x[1]));
}
function reply(v: unknown): v is FarmReply {
  if (!obj(v)) return false;
  if (v.kind === "REFUSED") return keys(v, ["kind", "code"]) && typeof v.code === "string";
  if (v.kind === "LAUNCHED") return keys(v, ["kind", "ticker"]) && typeof v.ticker === "string" && tickerOk(v.ticker);
  return v.kind === "FILLED" && keys(v, ["kind", "ticker", "qty", "cents", "fee"]) && typeof v.ticker === "string" && tickerOk(v.ticker) && int(v.qty, 1) && int(v.cents) && int(v.fee);
}
function receipt(v: unknown): v is FarmReceipt { return obj(v) && keys(v, ["fingerprint", "reply"]) && typeof v.fingerprint === "string" && reply(v.reply); }
function shape(v: unknown): v is FarmState {
  return obj(v) && keys(v, ["v", "seed", "hour", "initialCash", "sink", "wallets", "coins", "receipts"]) && v.v === 1
    && typeof v.seed === "string" && v.seed.length > 0 && v.seed.length <= 128 && int(v.hour) && int(v.initialCash) && int(v.sink)
    && mapOf(v.wallets, wallet) && Object.keys(v.wallets).length > 0 && Object.keys(v.wallets).every(accountId) && mapOf(v.coins, coin) && mapOf(v.receipts, receipt);
}
/** Unknown JSON is narrowed once here. Corrupt or unknown-version saves are never repaired/reset. */
export function parseFarm(raw: unknown): FarmState {
  if (!shape(raw)) throw new Error("BAD_FARM_CHECKPOINT");
  for (const [ticker, c] of Object.entries(raw.coins)) {
    const owner = raw.wallets[c.creator];
    if (ticker !== c.ticker || !Object.hasOwn(raw.wallets, c.creator) || !owner || c.createdHour > raw.hour || c.day !== Math.floor(raw.hour / 24)
      || (c.thinSince !== null && (c.thinSince < c.createdHour || c.thinSince > raw.hour))
      || (c.discovery.kind === "DELISTED" && (c.discovery.hour > raw.hour || c.discovery.hour < c.createdHour))
      || (owner.kind === "PLAYER") !== (c.launcher.kind === "PLAYER")
      || (c.launcher.kind === "NPC_ABANDONED" && (c.launcher.hour > raw.hour || c.launcher.hour < c.createdHour))
      || (c.rug !== null && (c.rug.hour > raw.hour || c.rug.hour < c.createdHour))) throw new Error("BAD_FARM_TIMELINE");
    const cash = c.venue.kind === "CURVE" ? c.venue.curve.x - LP.X0 : c.venue.book.cash;
    if (c.discovery.kind === "LIVE" && ((cash < FAILURE_LAW.liquidityCents) !== (c.thinSince !== null)
      || (c.thinSince !== null && raw.hour - c.thinSince >= FAILURE_LAW.thinHours))) throw new Error("BAD_THIN_CLOCK");
    if (c.discovery.kind === "DELISTED" && (c.thinSince === null || c.discovery.hour - c.thinSince < FAILURE_LAW.thinHours)) throw new Error("BAD_DELISTING");
    if (c.venue.kind === "CURVE" && c.mark !== listPriceMinor(c.venue.curve)) throw new Error("BAD_CURVE_MARK");
    if (c.venue.kind === "BOOK" && (c.venue.graduatedHour < c.createdHour || c.venue.graduatedHour > raw.hour || (c.venue.book.flow?.t ?? 0) > raw.hour * 30)) throw new Error("BAD_BOOK_TIMELINE");
    let previous = -1;
    for (const [hour] of c.playerNet) { if (hour <= previous || hour > raw.hour || hour <= raw.hour - 24) throw new Error("BAD_FLOW_WINDOW"); previous = hour; }
  }
  for (const key of Object.keys(raw.receipts)) {
    const [wallet, id, extra] = key.split(":");
    if (!wallet || !id || extra !== undefined || !Object.hasOwn(raw.wallets, wallet) || !/^[A-Za-z0-9_-]{1,96}$/.test(id)) throw new Error("BAD_RECEIPT_KEY");
  }
  assertConservation(raw);
  return structuredClone(raw);
}
