"use client";
// UI card 10 (BRK-D): the Broker window's About view (Overview | News) and the Trade | About switch. A view inside the
// Broker, not a window: Trade and About share the frame's asset and draft, so Trade is just switching back.
// Both switches are one tab list (Studio #38 look: the .br-seg segment): arrows move focus, Enter / Space select.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import type { Position, TickerRow } from "@/shell/contracts/channels";
import { AssetNews } from "./AssetNews";
import { AssetOverview } from "./AssetOverview";
import type { BrStrings } from "./strings";
import "./assetPage.css";

export type BrokerView = "trade" | "about";
type AboutTab = "overview" | "news";

interface Tab<K extends string> { key: K; label: string; panelId: string }

/** A tab list on the segment look. Roving tabindex: the selected tab is the one Tab stop. Only one panel is rendered,
 *  so only the selected tab carries aria-controls (an unselected tab would point at a missing id). */
function Tabs<K extends string>({ label, tabs, value, onSelect, testId, idOf }: {
  label: string; tabs: readonly Tab<K>[]; value: K; onSelect: (k: K) => void; testId: string; idOf: (k: K) => string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const btns = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const at = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? (at + 1) % btns.length
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (at - 1 + btns.length) % btns.length
      : e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    btns[next]!.focus();
  };
  return (
    <div ref={list} className="br-seg ap-tabs" role="tablist" aria-label={label} data-testid={testId} onKeyDown={onKey}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" role="tab" id={idOf(tab.key)} aria-selected={tab.key === value}
          aria-controls={tab.key === value ? tab.panelId : undefined} tabIndex={tab.key === value ? 0 : -1}
          data-testid={`${testId}-${tab.key}`} onClick={() => onSelect(tab.key)}>{tab.label}</button>
      ))}
    </div>
  );
}

/** Trade | About, under the header. `ids` are the two views' element ids (aria-controls). */
export function ViewSwitch({ t, view, onView, ids }: { t: BrStrings; view: BrokerView; onView: (v: BrokerView) => void; ids: Record<BrokerView, string> }) {
  const base = useId();
  const tabs: readonly Tab<BrokerView>[] = [
    { key: "trade", label: t.viewTrade, panelId: ids.trade },
    { key: "about", label: t.viewAbout, panelId: ids.about },
  ];
  return <Tabs label={t.viewAria} tabs={tabs} value={view} onSelect={onView} testId="br-view" idOf={(k) => `${base}-${k}`} />;
}

export interface AboutProps {
  t: BrStrings;
  locale: string;
  id: string;
  assetId: string;
  row: TickerRow | undefined;
  position: Position | undefined;
  /** Phone: About is a pushed screen titled with the ticker; its Back returns to Trade. */
  phone: boolean;
  onTrade: () => void;
}

/** The About panel: an h2 that takes focus on entry, the Overview | News tabs and the selected tab's panel. */
export function AssetPage({ t, locale, id, assetId, row, position, phone, onTrade }: AboutProps) {
  const [tab, setTab] = useState<AboutTab>("overview");
  const heading = useRef<HTMLHeadingElement>(null);
  const base = useId();
  const store = useShellStore();
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!phone) return;
    store.getState().setPhoneSub({ title: assetId, backLabel: t.backToTrade, onBack: onTrade });
    return () => store.getState().setPhoneSub(null);
  }, [phone, store, assetId, t.backToTrade, onTrade]);
  const tabId = (k: AboutTab) => `${base}-tab-${k}`;
  const panelId = (k: AboutTab) => `${base}-panel-${k}`;
  const tabs: readonly Tab<AboutTab>[] = [
    { key: "overview", label: t.tabOverview, panelId: panelId("overview") },
    { key: "news", label: t.tabNews, panelId: panelId("news") },
  ];
  return (
    <section className="ap" id={id} aria-labelledby={`${base}-h`} data-testid="br-about">
      <h2 ref={heading} id={`${base}-h`} className="ap-title label" tabIndex={-1} data-testid="br-about-title">{t.viewAbout}</h2>
      <Tabs label={t.tabsAria} tabs={tabs} value={tab} onSelect={setTab} testId="br-about-tabs" idOf={tabId} />
      <div className="ap-panel" role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} data-testid="br-about-panel" data-tab={tab}>
        {tab === "overview"
          ? <AssetOverview t={t} locale={locale} assetId={assetId} row={row} position={position} />
          : <AssetNews t={t} assetId={assetId} />}
      </div>
    </section>
  );
}
