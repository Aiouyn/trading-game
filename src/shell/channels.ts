// Shapes the shell reads from the server channels (17 §2.6). Money is a decimal string.
import type { Rank } from "./registry";

export type MarketPhase = "pre" | "open_auction" | "continuous" | "close_auction" | "after" | "weekend";

export interface ClockChannel { tick: number; gameDay: number; tickOfDay: number; phase: MarketPhase }
/** `rank` channel (17 §2.6). thresholds[i] is the NW needed for rank R(i+1) (R1..R5); R6 is not NW-only. */
export interface RankChannel { rank: Rank; thresholds: string[]; nextAt: string | null }
export interface MeChannel {
  nw: string;
  todayPct: string;
  todayChg: string;             // today's change, Money decimal string
  license: string;              // LIC0..LIC4, live
  charters: string[];           // live
  flags: string[];              // server capability flags, e.g. character.day3, alliance.invited (never derived here)
  onboardingMin: number;        // minutes into the first session (18)
  onboardingDone: boolean;      // finished or skipped (18)
  guest: boolean;
  protectionEndsRealMs: number | null;
}
/** Connection and world state for the §5 shell states (stubbed; owners 02/13/19). */
export interface SystemState { connection: "live" | "reconnecting"; halted: boolean; held: boolean }
export interface Channels { clock: ClockChannel; rank: RankChannel; me: MeChannel; system: SystemState }
