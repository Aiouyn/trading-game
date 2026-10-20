// Shapes the shell reads from the server channels (17 §2.6). Money is a decimal string.
import type { Rank } from "./registry";

export type MarketPhase = "pre" | "open_auction" | "continuous" | "close_auction" | "after" | "weekend";

export interface ClockChannel { tick: number; gameDay: number; tickOfDay: number; phase: MarketPhase }
export interface RankChannel { rank: Rank; nextAt: string | null }
export interface MeChannel {
  nw: string;
  todayPct: string;
  license: string;              // LIC0..LIC4, live
  charters: string[];           // live
  flags: string[];              // server capability flags
  gameDay: number;              // character game day
  onboardingMin: number;        // minutes into the first session (18)
  guest: boolean;
  protectionEndsRealMs: number | null;
}
export interface Channels { clock: ClockChannel; rank: RankChannel; me: MeChannel }
