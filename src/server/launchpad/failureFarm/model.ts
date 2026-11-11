import type { Curve } from "@/launchpad/rules";
import type { BookAccount } from "@/server/broker/book";

export type WalletKind = "PLAYER" | "NPC";
export interface FarmWallet { kind: WalletKind; cash: number; tokens: Record<string, number>; lastLaunchAtMs: number | null }
export type FarmVenue = { kind: "CURVE"; curve: Curve } | {
  kind: "BOOK"; book: BookAccount; listedPrice: number; graduatedHour: number; creatorAtGraduation: number; creatorSold: number;
};
export type Discovery = { kind: "LIVE" } | { kind: "DELISTED"; hour: number };
export type Launcher = { kind: "PLAYER" } | { kind: "NPC_ACTIVE" } | { kind: "NPC_ABANDONED"; hour: number };
export type Rug = { kind: "EARLY_EXIT" | "DAILY_DUMP"; hour: number };
export interface FarmCoin {
  ticker: string; name: string; creator: string; createdHour: number;
  venue: FarmVenue; discovery: Discovery; launcher: Launcher;
  mark: number; lastHourMark: number; hype: number; thinSince: number | null; rug: Rug | null;
  day: number; dayOpen: number; creatorDaySold: number;
  hourVolume: number; playerNet: [number, number][];
}
export type FarmReply = { kind: "LAUNCHED"; ticker: string } | { kind: "FILLED"; ticker: string; qty: number; cents: number; fee: number }
  | { kind: "REFUSED"; code: string };
export interface FarmReceipt { fingerprint: string; reply: FarmReply }
export interface FarmState {
  v: 1; seed: string; hour: number; initialCash: number; sink: number;
  wallets: Record<string, FarmWallet>; coins: Record<string, FarmCoin>; receipts: Record<string, FarmReceipt>;
}
export type FarmCommand = { kind: "LAUNCH"; wallet: string; key: string; ticker: string; name: string; fee: number; nowMs: number }
  | { kind: "TRADE"; wallet: string; key: string; ticker: string; side: "BUY" | "SELL"; amount: number };
/** A committed price path and public mentions/shock at one game-hour close. Curve marks are endogenous. */
export interface FarmObservation { mark?: number; mentions?: number; hypeShock?: number }
export interface FarmFrame { hour: number; coins: Record<string, FarmObservation> }
