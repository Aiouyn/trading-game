"use client";
// One NW source (Producer ruling 3, Studio fix b): the `me` channel's nw is THE net worth. Every frame copies it into
// the shell store, so the top bar / phone status bar (compact) and the Portfolio hero (full) print the same string.
// Until the first frame (or when the channel is denied / errors) the store keeps its START_NW boot value, which is the
// string the mock feed opens with (src/shell/contracts/fixtures/me.ts).
import { useEffect } from "react";
import { useChannel } from "@/shell/contracts/useChannel";
import { useShellStore } from "./ShellContext";

export function MeNwBridge() {
  const store = useShellStore();
  const nw = useChannel("me").body?.nw ?? null;
  useEffect(() => {
    if (nw === null) return;
    const c = store.getState().channels;
    if (c.me.nw !== nw) store.getState().setChannels({ ...c, me: { ...c.me, nw } });
  }, [nw, store]);
  return null;
}
