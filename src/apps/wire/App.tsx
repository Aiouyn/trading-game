// 17B Wire (UI card 1 · WIR-A): the news feed on the existing mock `news` channel. Card 9 (WIR-9): the item detail;
// the `filings` channel is subscribed only while a FILING item's detail is open (FilingSection mounts it).
"use client";
import { useCallback, useMemo } from "react";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { useChannel } from "@/shell/contracts/useChannel";
import { viewportOf } from "@/shell/wm";
import { Feed, type WireHost } from "./Feed";
import { FilingSummary } from "./FilingSummary";
import { useWireStrings, type WireStrings } from "./strings";
import "./wire.css";

function FilingSection({ filingId, t }: { filingId: string; t: WireStrings }) {
  const view = useChannel("filings");
  return <FilingSummary view={view} filingId={filingId} t={t} />;
}

export default function WireApp() {
  const view = useChannel("news");
  const t = useWireStrings();
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  // Stable across renders: Feed's phone push effect depends on it.
  const pushPhone = useCallback<WireHost["pushPhone"]>((sub) => store.getState().setPhoneSub(sub), [store]);
  const host = useMemo<WireHost>(() => ({
    phone,
    // The shell's open (as Launcher `tk:` items): opens or focuses Broker on the asset; a locked Broker stays shut.
    openAsset: (assetId) => store.getState().open("broker", assetId),
    filing: (filingId) => <FilingSection filingId={filingId} t={t} />,
    pushPhone,
  }), [phone, store, t, pushPhone]);
  return <Feed view={view} t={t} host={host} />;
}
