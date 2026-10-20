"use client";
import { useRef } from "react";
import { clockLabel } from "@/shell/mockChannels";
import { APP_IDS, APPS, GROUPS, RANK_NAMES, RANKS, subPalette, type AppId } from "@/shell/registry";
import { APP_NAMES, GROUP_LABELS, S } from "@/shell/strings";
import { AppBody } from "./AppBody";
import { Glyph } from "./Glyph";
import { MoneyText, PctText } from "./MoneyText";
import { useShell, useShellStore } from "./ShellContext";

const BOTTOM: AppId[] = ["broker", "portfolio", "wire", "messages"];
const LONG_PRESS_MS = 400;

function AppIcon({ app }: { app: AppId }) {
  const store = useShellStore();
  const vis = useShell((s) => s.vis[app]);
  const fresh = useShell((s) => s.fresh.has(app));
  const locked = vis === "locked";
  return (
    <button
      className={`phone-app${locked ? " locked" : ""}`}
      data-testid={`icon-${app}`}
      data-state={vis}
      title={locked ? APPS[app].lockHint : undefined}
      aria-disabled={locked}
      onClick={() => !locked && store.getState().open(app)}
    >
      <span className="icon"><Glyph name={app} size={24} />{fresh && <span className="fresh-dot" />}</span>
      <span className="icon-label">{APP_NAMES[app]}</span>
      {locked && <span className="lock-tag" aria-hidden="true">{APPS[app].lockLabel}</span>}
      {locked && <span className="sr-only">{`· ${APPS[app].lockHint}`}</span>}
    </button>
  );
}

function StatusBar() {
  const store = useShellStore();
  const clock = useShell((s) => s.channels.clock);
  const me = useShell((s) => s.channels.me);
  const timer = useRef<number | null>(null);
  const pullY = useRef<number | null>(null);
  const { day, hhmm } = clockLabel(clock);
  const down = () => { timer.current = window.setTimeout(() => { timer.current = null; store.getState().setRecent(true); }, LONG_PRESS_MS); };
  const up = () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; store.getState().phoneBack(); }
  };
  return (
    <header
      className="statusbar"
      data-testid="statusbar"
      // Pull down from the status bar opens the full-screen launcher (SH-04).
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pullY.current = e.clientY;
      }}
      onPointerUp={(e) => {
        if (pullY.current !== null && e.clientY - pullY.current > 40) store.getState().setLauncher(true);
        pullY.current = null;
      }}
    >
      <button className="quay-mark acc" data-testid="quay-mark" aria-label={S.home} onPointerDown={down} onPointerUp={up} onContextMenu={(e) => e.preventDefault()}>
        <Glyph name="quay" size={20} />
      </button>
      <span className="num clock">{`D${day} · ${hhmm}`}</span>
      <span className={`dot ${clock.phase === "continuous" ? "dot-gain" : "dot-faint"}`} aria-hidden="true" />
      <span className="sb-nw"><MoneyText value={me.nw} compact /></span>
    </header>
  );
}

export function PhoneHome() {
  const vis = useShell((s) => s.vis);
  const me = useShell((s) => s.channels.me);
  const rank = useShell((s) => s.channels.rank);
  const phoneApp = useShell((s) => s.phoneApp);
  const store = useShellStore();
  const ri = RANKS.indexOf(rank.rank);
  const next = ri < RANKS.length - 1 ? RANKS[ri + 1] : null;

  if (phoneApp) {
    return (
      <div className="phone" data-testid="phone">
        <StatusBar />
        <section className="phone-appview" role="dialog" aria-labelledby="phone-app-title" data-subpalette={subPalette(phoneApp.app)}>
          <div className="appbar">
            <button className="icon-btn" aria-label={S.back} onClick={() => store.getState().phoneBack()}><Glyph name="chevLeft" size={20} /></button>
            <h1 id="phone-app-title">{APP_NAMES[phoneApp.app]}</h1>
          </div>
          <div className="phone-appbody">
            <AppBody app={phoneApp.app} state={{ focused: true, collapsed: false, background: false }} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="phone" data-testid="phone">
      <StatusBar />
      <main className="phone-home">
        <section className="widget" data-testid="widget">
          <div className="widget-top"><span className="label">{S.netWorth}</span><span className="chip chip-acc">{`${rank.rank} · ${RANK_NAMES[rank.rank]}`}</span></div>
          <div className="hero-nw"><MoneyText value={me.nw} ctx="hero" /></div>
          <PctText value={me.todayPct} />
          {next && rank.nextAt && (
            <p className="num muted rank-next">{`${S.next}: ${RANK_NAMES[next]} · `}<MoneyText value={me.nw} compact />{" / "}<MoneyText value={rank.nextAt} compact /></p>
          )}
        </section>
        <div className="app-grid" data-testid="app-grid">
          {GROUPS.map((g) => {
            const apps = APP_IDS.filter((a) => APPS[a].group === g && vis[a] !== "hidden" && !BOTTOM.includes(a));
            if (apps.length === 0) return null;
            return (
              <section key={g} className="grid-group" data-testid={`group-${g}`}>
                <h2 className="label">{GROUP_LABELS[g]}</h2>
                <div className="grid4">{apps.map((a) => <AppIcon key={a} app={a} />)}</div>
              </section>
            );
          })}
        </div>
      </main>
      <nav className="bottom-row" data-testid="bottom-row" aria-label={S.shelf}>
        {BOTTOM.map((a) => <AppIcon key={a} app={a} />)}
      </nav>
    </div>
  );
}
