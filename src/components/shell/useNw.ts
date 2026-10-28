"use client";
// One NW source (Producer ruling 3, Studio fix b): the `me` channel's nw is THE net worth. The top bar, the phone status
// bar and home widget read it here; the Portfolio hero reads the same channel, so every view prints the same string in
// the same commit. Until the first frame (or when the channel is denied / errors) it falls back to the shell's boot
// value, START_NW, the string the mock feed opens with (src/shell/contracts/fixtures/me.ts). Nothing is copied into the
// shell store: a tick re-renders only the NW readers.
import { useChannel } from "@/shell/contracts/useChannel";
import { useShell } from "./ShellContext";

export function useNw(): string {
  const boot = useShell((s) => s.channels.me.nw);
  return useChannel("me").body?.nw ?? boot;
}
