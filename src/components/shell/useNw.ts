"use client";
// One NW source (Producer ruling 3, Studio fix b): the `me` channel's nw is THE net worth. The top bar, the phone status
// bar and home widget read it here; the Portfolio hero reads the same channel, so every view prints the same string in
// the same commit. Until the first frame (or when the channel is denied / errors) it falls back to the shell's boot
// value, START_NW, the string the mock feed opens with (src/shell/contracts/fixtures/me.ts). Views never read NW from the
// store: a tick re-renders only the NW readers. The store keeps liveNw for unlock rules only (LiveNwUnlock below).
import { createElement, useEffect } from "react";
import { isSignedIn } from "@/shell/authChrome";
import { useAuthSession } from "@/shell/authSession";
import { useChannel } from "@/shell/contracts/useChannel";
import { S } from "@/shell/strings";
import { useShell, useShellStore } from "./ShellContext";

export function useNw(): string {
  const boot = useShell((s) => s.channels.me.nw);
  return useChannel("me").body?.nw ?? boot;
}

/** What the visible NW chips print (M1-08). Signed-in, the boot value is the sign-in cash with holdings left out, so
 *  until `me` (server ledger at server marks) has a body it is not shown as a net worth: the chip says loading, or
 *  unavailable after a failed read; the next snap brings the real value. Guest keeps the boot fallback (its demo feed
 *  opens with that value). Unlock rules keep useNw. */
export type NwReading = { readonly state: "live"; readonly nw: string } | { readonly state: "loading" | "unavailable"; readonly nw: null };
/** Label for a signed-in NW chip with no valuation (M1-08). */
export const nwStateLabel = (state: NwReading["state"]) => (state === "loading" ? S.nwLoading : S.nwUnavailable);
export function useNwReading(): NwReading {
  const boot = useShell((s) => s.channels.me.nw);
  const signedIn = isSignedIn(useAuthSession());
  const me = useChannel("me");
  if (me.body) return { state: "live", nw: me.body.nw };
  if (!signedIn) return { state: "live", nw: boot };
  return me.state === "loading" ? { state: "loading", nw: null } : { state: "unavailable", nw: null };
}

/** Unlock rules on NW (17 §3.2.4, AI Lab at $100k) read the same live NW (QA #67 d): mounted once in QuayShell,
 *  it hands each new me.nw to the store, which re-evaluates visibility. Renders nothing. It opens the me channel only
 *  once booted, as the top bar did before it: opening a channel starts the feed's timers, and the shell clock must stay
 *  the page's first 5 s timer (17A T3-01). Before boot the unlock rules run on the boot NW, which is the feed's first value. */
export function LiveNwUnlock() {
  return useShell((s) => s.booted) ? createElement(LiveNwSync) : null;
}
function LiveNwSync(): null {
  const store = useShellStore();
  const nw = useNw();
  useEffect(() => { store.getState().setLiveNw(nw); }, [store, nw]);
  return null;
}
