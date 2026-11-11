import { isPlainJson } from "./json";
import { CCYS, type Ccy } from "../../../../packages/engine/core/types";
export type { Ccy };
export const CURRENCIES = CCYS;
export type Minor = number & { readonly __brand: "FxMinor" };
export type Rate = number & { readonly __brand: "FxQuotePerBaseMicros" };
export type WalletId = string & { readonly __brand: "FxWalletId" };
export type Units = number & { readonly __brand: "FxAssetUnits" };
export const SCALE = 1000000;
export const LEGS = { EUNFDL: { base: "EUN", quote: "FDL" }, FDLNKR: { base: "FDL", quote: "NKR" }, FDLPYN: { base: "FDL", quote: "PYN" }, FDLSRL: { base: "FDL", quote: "SRL" } } satisfies Record<string, { base: Ccy; quote: Ccy }>;
export type LegId = keyof typeof LEGS;
export type Cash = Record<Ccy, Minor>;
export type Marks = Record<LegId, Rate>;
export type Access = { kind: "ACTOR"; license: number; held: boolean } | { kind: "SYSTEM" };
export interface Wallet { id: WalletId; cash: Cash; units: Record<string, Units>; access: Access }
export interface Bank { id: string; inventory: WalletId; income: WalletId }
export interface Genesis { epoch: string; startTick: number; feeWallet: WalletId; wallets: Wallet[]; banks: Bank[] }
export type OfferSide = "SELL_BASE" | "BUY_BASE";
export interface Offer { id: string; account: WalletId; leg: LegId; side: OfferSide; rate: Rate; remaining: Minor; tick: number }
interface Envelope { id: string; account: WalletId }
export type Command = Envelope & (
  { kind: "OFFER"; leg: LegId; side: OfferSide; rate: Rate; amount: Minor }
  | { kind: "CANCEL"; offerId: string }
  | { kind: "CONVERT"; from: Ccy; to: Ccy; want: Minor; maxInput: Minor }
  | { kind: "BANK"; bank: string; from: Ccy; to: Ccy; spend: Minor; minOutput: Minor }
  | { kind: "AUTO"; from: Ccy; asset: string; qty: Units; estimate: Minor; maxInput: Minor }
);
export interface AssetAsk { asset: string; seller: WalletId; ccy: Ccy; unitPrice: Minor }
export interface Frame { epoch: string; tick: number; marks: Marks | null; controls: { ccy: Ccy; untilTick: number }[]; assets: AssetAsk[]; commands: Command[] }
export type RejectCode = "LICENSE" | "HELD" | "CLOSED" | "CONTROLS" | "FUNDS" | "NO_LIQUIDITY" | "LIMIT" | "NO_MARK" | "NO_BANK" | "NO_OFFER" | "FORBIDDEN" | "ASSET_UNAVAILABLE";
export type Rejected = { kind: "REJECTED"; reason: RejectCode };
export interface Converted { kind: "CONVERTED"; from: Ccy; to: Ccy; input: Minor; output: Minor; feeFdl: Minor; fills: number }
export type AutoFx = Converted | { kind: "NOT_NEEDED" };
export type Decision = Rejected | { kind: "POSTED" | "CANCELLED" }
  | Converted | { kind: "BANK_CONVERTED"; from: Ccy; to: Ccy; input: Minor; output: Minor; bankMargin: Minor }
  | { kind: "AUTO"; fx: AutoFx | Rejected; asset: { kind: "FILLED"; qty: Units; paid: Minor } | { kind: "CANCELLED"; reason: "FX_LEG_FAILED" | "ASSET_UNAVAILABLE" | "LIMIT" } };
export interface Receipt { id: string; account: WalletId; fingerprint: string; tick: number; result: Decision }
export interface Transfer { from: WalletId; to: WalletId; ccy: Ccy; minor: Minor; reason: "FX_SPOT" | "EXCHANGE_FEE" | "BNK_FX_MARGIN" | "ASSET_CASH" }
export interface Reservation { id: string; account: WalletId; ccy: Ccy; minor: Minor }
export interface State { v: 1; epoch: string; startTick: number; tick: number; feeWallet: WalletId; wallets: Wallet[]; banks: Bank[]; offers: Offer[]; receipts: Receipt[]; transfers: Transfer[]; reservations: Reservation[]; genesisCash: Cash; genesisUnits: Record<string, Units>; lastFrame: Frame | null }
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
export const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9:_-]{1,80}$/.test(v) && !["__proto__", "constructor", "prototype"].includes(v);
export const isCcy = (v: unknown): v is Ccy => CURRENCIES.some((c) => c === v);
export const isLeg = (v: unknown): v is LegId => typeof v === "string" && Object.hasOwn(LEGS, v);
export const legIds = () => Object.keys(LEGS).filter(isLeg);
export const isMinor = (v: unknown): v is Minor => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isRate = (v: unknown): v is Rate => isMinor(v) && v > 0;
const isUnits = (v: unknown): v is Units => isMinor(v);
const isWalletId = (v: unknown): v is WalletId => id(v);
export function minor(v: unknown): Minor { if (!isMinor(v)) throw new Error("INVALID_MINOR"); return v; }
export function units(v: unknown): Units { if (!isUnits(v)) throw new Error("INVALID_UNITS"); return v; }
export function rate(v: unknown): Rate { if (!isRate(v)) throw new Error("INVALID_RATE"); return v; }
export function walletId(v: unknown): WalletId { if (!isWalletId(v)) throw new Error("INVALID_WALLET_ID"); return v; }
export function cash(value = 0): Cash { const n = minor(value); return { EUN: n, FDL: n, NKR: n, PYN: n, SRL: n }; }
const isCash = (v: unknown): v is Cash => object(v) && exact(v, [...CURRENCIES]) && CURRENCIES.every((c) => isMinor(v[c]));
const isAccess = (v: unknown): v is Access => object(v) && (v.kind === "SYSTEM" ? exact(v, ["kind"]) : v.kind === "ACTOR" && exact(v, ["kind", "license", "held"]) && isMinor(v.license) && v.license <= 4 && typeof v.held === "boolean");
const isUnitMap = (v: unknown): v is Record<string, Units> => object(v) && Object.entries(v).every(([k, n]) => id(k) && isUnits(n));
const isWallet = (v: unknown): v is Wallet => object(v) && exact(v, ["id", "cash", "units", "access"]) && isWalletId(v.id) && isCash(v.cash) && isUnitMap(v.units) && isAccess(v.access);
const isBank = (v: unknown): v is Bank => object(v) && exact(v, ["id", "inventory", "income"]) && id(v.id) && isWalletId(v.inventory) && isWalletId(v.income) && v.inventory !== v.income;
function linkedBanks(wallets: Wallet[], banks: Bank[]): boolean { return banks.every((b) => wallets.some((w) => w.id === b.inventory && w.access.kind === "SYSTEM") && wallets.some((w) => w.id === b.income && w.access.kind === "SYSTEM")); }
function isGenesis(v: unknown): v is Genesis {
  return object(v) && exact(v, ["epoch", "startTick", "feeWallet", "wallets", "banks"]) && id(v.epoch) && isMinor(v.startTick) && isWalletId(v.feeWallet)
    && Array.isArray(v.wallets) && v.wallets.every(isWallet) && new Set(v.wallets.map((w) => w.id)).size === v.wallets.length
    && v.wallets.some((w) => w.id === v.feeWallet && w.access.kind === "SYSTEM") && Array.isArray(v.banks) && v.banks.every(isBank)
    && new Set(v.banks.map((b) => b.id)).size === v.banks.length && linkedBanks(v.wallets, v.banks);
}
export function parseGenesis(v: unknown): Genesis { if (!isPlainJson(v) || !isGenesis(v)) throw new Error("INVALID_FX_GENESIS"); return structuredClone(v); }
function isCommand(v: unknown): v is Command {
  if (!object(v) || !id(v.id) || !isWalletId(v.account)) return false;
  const keys = ["id", "account", "kind"];
  switch (v.kind) {
    case "OFFER": return exact(v, [...keys, "leg", "side", "rate", "amount"]) && isLeg(v.leg) && (v.side === "SELL_BASE" || v.side === "BUY_BASE") && isRate(v.rate) && isMinor(v.amount) && v.amount > 0;
    case "CANCEL": return exact(v, [...keys, "offerId"]) && id(v.offerId);
    case "CONVERT": return exact(v, [...keys, "from", "to", "want", "maxInput"]) && isCcy(v.from) && isCcy(v.to) && v.from !== v.to && isMinor(v.want) && v.want > 0 && isMinor(v.maxInput);
    case "BANK": return exact(v, [...keys, "bank", "from", "to", "spend", "minOutput"]) && id(v.bank) && isCcy(v.from) && isCcy(v.to) && v.from !== v.to && isMinor(v.spend) && v.spend > 0 && isMinor(v.minOutput);
    case "AUTO": return exact(v, [...keys, "from", "asset", "qty", "estimate", "maxInput"]) && isCcy(v.from) && id(v.asset) && isUnits(v.qty) && v.qty > 0 && isMinor(v.estimate) && v.estimate > 0 && isMinor(v.maxInput);
    default: return false;
  }
}
export function parseCommand(v: unknown): Command { if (!isPlainJson(v) || !isCommand(v)) throw new Error("INVALID_FX_COMMAND"); return structuredClone(v); }
const isMarks = (v: unknown): v is Marks => object(v) && exact(v, legIds()) && legIds().every((k) => isRate(v[k]));
const isAsk = (v: unknown): v is AssetAsk => object(v) && exact(v, ["asset", "seller", "ccy", "unitPrice"]) && id(v.asset) && isWalletId(v.seller) && isCcy(v.ccy) && isMinor(v.unitPrice) && v.unitPrice > 0;
function isFrame(v: unknown): v is Frame {
  return object(v) && exact(v, ["epoch", "tick", "marks", "controls", "assets", "commands"]) && id(v.epoch) && isMinor(v.tick) && (v.marks === null || isMarks(v.marks))
    && Array.isArray(v.controls) && v.controls.every((c) => object(c) && exact(c, ["ccy", "untilTick"]) && isCcy(c.ccy) && isMinor(c.untilTick)) && new Set(v.controls.map((c) => c.ccy)).size === v.controls.length
    && Array.isArray(v.assets) && v.assets.every(isAsk) && new Set(v.assets.map((a) => a.asset)).size === v.assets.length
    && Array.isArray(v.commands) && v.commands.every(isCommand) && new Set(v.commands.map((c) => c.id)).size === v.commands.length;
}
export function parseFrame(v: unknown): Frame { if (!isPlainJson(v) || !isFrame(v)) throw new Error("INVALID_FX_FRAME"); return structuredClone(v); }
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (object(v)) return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",")}}`;
  const s = JSON.stringify(v); if (s === undefined) throw new Error("NON_JSON"); return s;
}
export function divUp(n: bigint, d: bigint): bigint { return (n + d - BigInt(1)) / d; }
export function bounded(n: bigint): Minor { if (n < BigInt(0) || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("FX_AMOUNT_RANGE"); return minor(Number(n)); }
export function ratio(m: Marks, from: Ccy, to: Ccy): { n: bigint; d: bigint } {
  const f = (c: Ccy) => { switch (c) {
    case "FDL": return { n: BigInt(1), d: BigInt(1) };
    case "EUN": return { n: BigInt(m.EUNFDL), d: BigInt(SCALE) };
    case "NKR": return { n: BigInt(SCALE), d: BigInt(m.FDLNKR) };
    case "PYN": return { n: BigInt(SCALE), d: BigInt(m.FDLPYN) };
    case "SRL": return { n: BigInt(SCALE), d: BigInt(m.FDLSRL) };
  } };
  const a = f(from), b = f(to); return { n: a.n * b.d, d: a.d * b.n };
}
export function pairQuotes(m: Marks) { return CURRENCIES.flatMap((base, i) => CURRENCIES.slice(i + 1).map((quote) => { const r = ratio(m, base, quote), mid = Number(r.n) / Number(r.d); return { pair: base + quote, mid, display: mid.toFixed(quote === "PYN" ? 2 : 4), isLeg: base === "FDL" || quote === "FDL" }; })); }
export function forwardRate(spot: number, baseZero: number, quoteZero: number, years: number, quote: Ccy, fear: number): number {
  if (![spot, baseZero, quoteZero, years, fear].every(Number.isFinite) || spot <= 0 || years < 0 || fear < 0 || fear > 1) throw new Error("INVALID_CIP_INPUT");
  const basis = quote === "FDL" ? -.004 * fear * fear : 0, value = spot * Math.exp((quoteZero - baseZero + basis) * years);
  if (!Number.isFinite(value) || value <= 0) throw new Error("CIP_RANGE"); return value;
}
export function anchoredLog(spotLog: number, fairLog: number, ticks: number): number {
  if (![spotLog, fairLog].every(Number.isFinite) || !isMinor(ticks)) throw new Error("INVALID_ANCHOR_INPUT");
  const weight = 2 ** (-ticks / (20 * 720)), value = weight * spotLog + (1 - weight) * fairLog;
  if (!Number.isFinite(value)) throw new Error("ANCHOR_RANGE"); return value;
}
