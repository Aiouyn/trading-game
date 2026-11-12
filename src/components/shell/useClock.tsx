"use client";
// Signed-in clock follows the adopted server quote tick (QuayShell ServerClock). Until that tick exists,
// the boot channel is DEFAULT_TICK (Day 39 · 11:20) and must not be printed as a live time — the same
// rule useNwReading applies to the boot net worth (M1-08). Guest keeps the demo clock.
import { isSignedIn } from "@/shell/authChrome";
import { useAuthSession } from "@/shell/authSession";
import { useChannel } from "@/shell/contracts/useChannel";
import type { ClockChannel } from "@/shell/channels";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { clockStrings, S } from "@/shell/strings";
import { useShell } from "./ShellContext";

export type ClockReading =
  | { readonly state: "live"; readonly tick: number; readonly clock: ClockChannel }
  | { readonly state: "loading" | "unavailable"; readonly tick: null; readonly clock: null };

export const clockStateLabel = (state: ClockReading["state"]) =>
  (state === "loading" ? S.clockLoading : state === "unavailable" ? S.clockUnavailable : "");

export function useClockReading(): ClockReading {
  const boot = useShell((s) => s.channels.clock);
  const auth = useAuthSession();
  const ticker = useChannel("ticker:wl_default");
  const me = useChannel("me");
  // Session not known yet: the shell still holds the guest clock (DEFAULT_TICK), which may not be this player's.
  // useNwReading already special-cases auth loading; a muted dash here is the same rule.
  if (auth.status === "loading") return { state: "loading", tick: null, clock: null };
  if (!isSignedIn(auth)) return { state: "live", tick: boot.tick, clock: boot };
  if (ticker.tick !== null) {
    if (boot.tick === ticker.tick) return { state: "live", tick: boot.tick, clock: boot };
    return { state: "live", tick: ticker.tick, clock: clockAt(ticker.tick) };
  }
  // quotesFailed() fails `me` when no snapshot has been adopted; the ticker channel itself stays
  // loading (no snap). Use that existing me error as the unavailable signal, not an invented time.
  if (me.state === "error" || me.state === "denied") return { state: "unavailable", tick: null, clock: null };
  return { state: "loading", tick: null, clock: null };
}

/** Desktop strip uses the "Day N · HH:mm" form; the phone status bar uses "DN · HH:mm". */
export function ClockText({ variant }: { variant: "strip" | "phone" }) {
  const reading = useClockReading();
  const locale = useShell((s) => s.prefs.locale);
  if (reading.state !== "live") {
    const label = clockStateLabel(reading.state);
    // Phone status bar is tight: a muted dash plus an accessible name, like the phone NW chip.
    if (variant === "phone") {
      return (
        <span className="num clock" data-testid="clock" data-clock-state={reading.state}>
          <span className="num muted" role="img" aria-label={label}>{S.nwUnknown}</span>
        </span>
      );
    }
    return (
      <span className="num clock" data-testid="clock" data-clock-state={reading.state}>
        <span className="num muted" aria-hidden="true">{S.nwUnknown}</span>
        <span className="muted">{` · ${label}`}</span>
      </span>
    );
  }
  const { day, hhmm } = clockLabel(reading.clock);
  const text = clockStrings(locale)[variant](day, hhmm);
  return (
    <span className="num clock" data-testid="clock" data-clock-state="live" data-tick={reading.tick}>{text}</span>
  );
}
