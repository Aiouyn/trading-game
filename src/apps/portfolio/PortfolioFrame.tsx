"use client";
// Portfolio frame (UI card 2, 17B PF-A). Desktop: "Overview · Positions" tab row (segment per Studio #38).
// Phone: Overview is the root ("Portfolio" app bar); Positions is a pushed screen, back label "Back to Portfolio" (SR T4).
// Positions renders ComingLater until card 3.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ComingLater } from "@/components/shell/ComingLater";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { Overview } from "./Overview";
import { STACK_SCALE, pfStrings } from "./strings";
import "./portfolio.css";

export type PfTab = "overview" | "positions";
const TABS: readonly PfTab[] = ["overview", "positions"];
/** #38: the segment stacks at text scale >= 1.5 (two short labels cannot overflow the 520 px minimum window at 1.0-1.4). */
export { STACK_SCALE };

export function PortfolioFrame() {
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const locale = useShell((s) => s.prefs.locale);
  const stacked = useShell((s) => s.prefs.textScale >= STACK_SCALE);
  const t = pfStrings(locale);
  const [tab, setTab] = useState<PfTab>("overview");
  const tabRefs = useRef<Record<PfTab, HTMLButtonElement | null>>({ overview: null, positions: null });

  useEffect(() => {
    if (!phone) return;
    store.getState().setPhoneSub(tab === "positions" ? { title: t.positions, backLabel: t.backToPortfolio, onBack: () => setTab("overview") } : null);
  }, [phone, tab, store, t]);
  useEffect(() => () => store.getState().setPhoneSub(null), [store]);

  if (phone) {
    return (
      <div className="pf pf-phone-root" data-testid="portfolio" data-tab={tab}>
        {tab === "positions" ? <ComingLater app="portfolio" /> : (
          <>
            <Overview phone />
            <nav className="pf-phone-nav" aria-label={t.views}>
              {/* Studio Q1: a real nav row (44 px, whole row tappable, chevron right) that pushes Positions. */}
              <button type="button" className="pf-nav-item" data-testid="pf-open-positions" onClick={() => setTab("positions")}>
                <span className="pf-nav-label">{t.positions}</span>
                <svg className="pf-nav-chevron" data-testid="pf-nav-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
                  <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </nav>
          </>
        )}
      </div>
    );
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };
  return (
    <div className="pf" data-testid="portfolio" data-tab={tab}>
      <div className={`pf-seg${stacked ? " stacked" : ""}`} role="tablist" aria-label={t.views} data-testid="pf-tabs" onKeyDown={onKey}>
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" id={`pf-tab-${id}`} aria-controls={`pf-panel-${id}`} aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1} data-testid={`pf-tab-${id}`} ref={(el) => { tabRefs.current[id] = el; }} onClick={() => setTab(id)}>
            {id === "overview" ? t.overview : t.positions}
          </button>
        ))}
      </div>
      <div className="pf-panel" role="tabpanel" id={`pf-panel-${tab}`} aria-labelledby={`pf-tab-${tab}`}>
        {tab === "overview" ? <Overview phone={false} /> : <ComingLater app="portfolio" />}
      </div>
    </div>
  );
}
