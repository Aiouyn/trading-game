import { isPlainJson } from "./json";
import type { FarmCommand, FarmFrame, FarmObservation } from "./model";

// Unknown caller input becomes a FarmCommand/FarmFrame only here, before any clone, fingerprint, receipt or save.
// isPlainJson inspects descriptors without running getters, toJSON or Proxy traps; the exact-key checks below then
// reject unknown fields, so accepted value == saved JSON == replay fingerprint input.
type Plain = Record<string, unknown>;
/** Size limits (pre-registered in docs/v1/units/meme-failure-farm.md). Lengths are UTF-16 code units. */
export const FARM_LIMITS = { inputString: 256, checkpointString: 4096, checkpointBytes: 16 * 1024 * 1024 } as const;
/** Every string value and object key in an already plain-JSON value is at most `max` units. */
export function stringsWithin(v: unknown, max: number): boolean {
  if (typeof v === "string") return v.length <= max;
  if (Array.isArray(v)) return v.every((x) => stringsWithin(x, max));
  if (typeof v === "object" && v !== null) return Object.entries(v).every(([k, x]) => k.length <= max && stringsWithin(x, max));
  return true;
}
const record = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);
const exactly = (v: Plain, expected: readonly string[]) => {
  const got = Object.keys(v);
  return got.length === expected.length && expected.every((k) => Object.hasOwn(v, k));
};
const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number";

const LAUNCH_KEYS = ["kind", "wallet", "key", "ticker", "name", "fee", "nowMs"] as const;
const TRADE_KEYS = ["kind", "wallet", "key", "ticker", "side", "amount"] as const;
const OBSERVATION_KEYS: readonly string[] = ["mark", "mentions", "hypeShock"];

/** Structural parse only. Economic validity (integers, fee, cooldown, cash) stays in the engine as persisted refusals. */
export function parseFarmCommand(raw: unknown): FarmCommand {
  if (!isPlainJson(raw) || !record(raw) || !stringsWithin(raw, FARM_LIMITS.inputString)) throw new Error("INVALID_FARM_COMMAND");
  const shared = str(raw.wallet) && str(raw.key) && str(raw.ticker);
  if (raw.kind === "LAUNCH" && exactly(raw, LAUNCH_KEYS) && shared && str(raw.name) && num(raw.fee) && num(raw.nowMs)) {
    return { kind: "LAUNCH", wallet: raw.wallet as string, key: raw.key as string, ticker: raw.ticker as string, name: raw.name, fee: raw.fee, nowMs: raw.nowMs };
  }
  if (raw.kind === "TRADE" && exactly(raw, TRADE_KEYS) && shared && (raw.side === "BUY" || raw.side === "SELL") && num(raw.amount)) {
    return { kind: "TRADE", wallet: raw.wallet as string, key: raw.key as string, ticker: raw.ticker as string, side: raw.side, amount: raw.amount };
  }
  throw new Error("INVALID_FARM_COMMAND");
}

function observation(v: unknown): FarmObservation {
  if (!record(v) || !Object.keys(v).every((k) => OBSERVATION_KEYS.includes(k))) throw new Error("INVALID_FARM_FRAME");
  const out: FarmObservation = {};
  for (const k of ["mark", "mentions", "hypeShock"] as const) {
    if (!Object.hasOwn(v, k)) continue;
    const value = v[k];
    if (!num(value)) throw new Error("INVALID_FARM_FRAME"); // includes a present-but-null required number
    out[k] = value;
  }
  return out;
}
/** Returns detached frames built only from validated own data properties. */
export function parseFarmFrames(raw: unknown): FarmFrame[] {
  if (!isPlainJson(raw) || !Array.isArray(raw) || !stringsWithin(raw, FARM_LIMITS.inputString)) throw new Error("INVALID_FARM_FRAME");
  return raw.map((f: unknown) => {
    if (!record(f) || !exactly(f, ["hour", "coins"]) || !num(f.hour) || !record(f.coins)) throw new Error("INVALID_FARM_FRAME");
    const coins: Record<string, FarmObservation> = {};
    for (const [ticker, obs] of Object.entries(f.coins)) Object.defineProperty(coins, ticker, { value: observation(obs), enumerable: true, writable: true, configurable: true });
    return { hour: f.hour, coins };
  });
}
