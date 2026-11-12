"use client";
import { useId, useRef, type KeyboardEvent } from "react";
import type { BrStrings } from "./strings-en";

export type BrokerView = "trade" | "about";

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
