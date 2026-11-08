import { AuthError } from "@/server/auth";
import { isTagline } from "@/launchpad/rules";
import type { LaunchInput, TradeInput } from "./service";

const int = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const bad = (m: string) => new AuthError("BAD_REQUEST", m, 400);

/** The reviewed launch: name, ticker, tagline id and the fee the player saw (the server refuses any other fee). */
export function launchInput(body: Record<string, unknown>): LaunchInput {
  const { name, ticker, tagline, fee } = body;
  if (typeof name !== "string" || name.length > 64) throw bad("Invalid name.");
  if (typeof ticker !== "string" || ticker.length > 8) throw bad("Invalid ticker.");
  if (!isTagline(tagline)) throw bad("Invalid tagline.");
  if (!int(fee)) throw bad("Invalid fee.");
  return { name, ticker, tagline, fee };
}

/** The reviewed trade: a buy spends `amount` cents and must get at least `min` tokens; a sale of `amount` tokens must pay
 *  at least `min` cents. `mode` is the market it was reviewed in (curve, or the locked pool after graduation). */
export function tradeInput(body: Record<string, unknown>): TradeInput {
  const { ticker, side, amount, min, mode } = body;
  if (typeof ticker !== "string" || !/^[A-Z]{3,5}$/.test(ticker)) throw bad("Invalid ticker.");
  if (side !== "buy" && side !== "sell") throw bad("side must be buy or sell.");
  if (!int(amount) || amount < 1 || !int(min)) throw bad("Invalid amount.");
  if (mode !== undefined && mode !== "curve" && mode !== "pool") throw bad("mode must be curve or pool.");
  return { ticker, side, amount, min, ...(mode !== undefined ? { mode } : {}) };
}
