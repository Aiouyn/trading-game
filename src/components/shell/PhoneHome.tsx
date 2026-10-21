"use client";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { goBack, usePhoneScreen } from "@/shell/back";
import { clockLabel } from "@/shell/mockChannels";
import { APP_IDS, APPS, GROUPS, RANK_NAMES, subPalette, type AppId } from "@/shell/registry";
import { nextRankTarget } from "@/shell/unlock";
import { LoadState } from "./LoadState";
import { MarketPhase } from "./MarketPhase";
import { Sparkline } from "./Sparkline";
import { APP_NAMES, GROUP_LABELS, S, SCREEN_NAMES } from "@/shell/strings";
import { AppBody } from "./AppBody";
import { Glyph } from "./Glyph";
import { HaltChip } from "./SystemOverlays";
import { MoneyText, PctText } from "./MoneyText";
import { useShell, useShellStore } from "./ShellContext";

const BOTTOM: AppId[] = ["broker", "portfolio", "wire", "messages"];
const LONG_PRESS_MS = 400;
/** Left-edge back swipe must start within this many px of the edge [P]. */
const EDGE_START = 20;

/** Phone app-bar title and back label (Studio T4 ruling 1): no breadcrumb, current screen only. */
export function appBarLabels(app: AppId, screen: string | null): { title: string; back: string } {
  if (screen) return { title: SCREEN_NAMES[screen] ?? screen, back: `${S.backTo} ${APP_NAMES[app]}` };
  return { title: APP_NAMES[app], back: `${S.backTo} ${S.home}` };
}

/**
 * Label fit (Studio T4 rulings, 07:46 + 08:04): wrap at spaces first, at most 2 lines; never break inside a word.
 * A word wider than the line first tightens letter-spacing (floor 0), then takes an ellipsis on its own line.
 * Anything truncated puts the full name in title + aria-label. Never shrinks the font, never hyphenates.
 */
function useFitLabel(name: string, off = false) {
  const ref = useRef<HTMLSpanElement>(null);
  const [trunc, setTrunc] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || off) return;
    const fit = () => {
      el.style.letterSpacing = "";
      const words = [...el.querySelectorAll<HTMLElement>(".w")];
      const wordOver = () => words.some((w) => w.scrollWidth > w.clientWidth + 0.5);
      let ls = parseFloat(getComputedStyle(el).letterSpacing) || 0;
      while (wordOver() && ls > 0) { ls = Math.max(0, ls - 0.25); el.style.letterSpacing = `${ls}px`; }
      const lines = new Set(words.map((w) => Math.round(w.offsetTop))).size;
      const t = wordOver() || lines > 2 || el.scrollHeight > el.clientHeight + 0.5;
      el.dataset.lines = String(Math.min(lines, 2));
      setTrunc(t);
    };
    // ResizeObserver fires once on observe, so this also runs the first fit.
    const ro = new ResizeObserver(fit); ro.observe(el.parentElement ?? el);
    const mo = new MutationObserver(fit); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-palette"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [name, off]);
  return { ref, trunc: off ? false : trunc };
}

/** Phone grid columns by text scale (Studio 08:20): 4 below 1.3, 3 from 1.3 to below 1.75, 2 at 1.75 and up. */
export const gridColsFor = (scale: number) => (scale >= 1.75 ? 2 : scale >= 1.3 ? 3 : 4);
function useTextScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const html = document.documentElement;
    const read = () => setScale(parseFloat(getComputedStyle(html).getPropertyValue("--text-scale")) || 1);
    read();
    const mo = new MutationObserver(read); mo.observe(html, { attributes: true, attributeFilter: ["style", "class", "data-text-scale"] });
    return () => mo.disconnect();
  }, []);
  return scale;
}
/** Studio 08:31: at text scale 1.5 and up the bottom row is an icon-only dock (no visible labels, never truncated). */
export const DOCK_ICON_ONLY_AT = 1.5;
const DOCK_TIP_MS = 500;
const DOCK_TIP_LINGER_MS = 1500;

/** Long-press pill with the full name, in the approved MoneyText pill style (T1 ruling 5): 8 px above, clamped. */
function useDockTip(name: string) {
  const host = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppress = useRef(false);
  const clear = (t: typeof timer) => { if (t.current) { clearTimeout(t.current); t.current = null; } };
  useLayoutEffect(() => {
    if (!open || !host.current || !tip.current) { setPos(null); return; }
    const a = host.current.getBoundingClientRect(), t = tip.current.getBoundingClientRect();
    const left = Math.min(Math.max(4, a.left + a.width / 2 - t.width / 2), window.innerWidth - t.width - 4);
    setPos({ left, top: Math.max(4, a.top - 8 - t.height) });
  }, [open, name]);
  useEffect(() => () => { clear(timer); clear(linger); }, []);
  const handlers = {
    onPointerDown: () => {
      if (open) { setOpen(false); clear(linger); suppress.current = true; return; } // next tap closes
      suppress.current = false;
      clear(timer);
      timer.current = setTimeout(() => { setOpen(true); suppress.current = true; }, DOCK_TIP_MS);
    },
    onPointerUp: () => { clear(timer); if (open) { clear(linger); linger.current = setTimeout(() => setOpen(false), DOCK_TIP_LINGER_MS); } },
    onPointerCancel: () => clear(timer),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
  const node = open ? (
    <span ref={tip} className="money-tip dock-tip" data-testid="dock-tip" aria-hidden="true"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}>{name}</span>
  ) : null;
  /** True when this click ended a long-press (or closed the tip); the app must not open. */
  const consumeClick = () => { const s = suppress.current; suppress.current = false; return s; };
  return { host, handlers, node, consumeClick };
}

/** Each word is its own unbreakable box, so wrapping only ever happens at spaces. */
const Words = ({ text }: { text: string }) => <>{text.split(" ").map((w, i) => <span key={i}>{i > 0 && " "}<span className="w">{w}</span></span>)}</>;

function AppIcon({ app, dock = false }: { app: AppId; dock?: boolean }) {
  const store = useShellStore();
  const tip = useDockTip(APP_NAMES[app]);
  const { ref: labelRef, trunc } = useFitLabel(APP_NAMES[app], dock);
  const vis = useShell((s) => s.vis[app]);
  const fresh = useShell((s) => s.fresh.has(app));
  const locked = vis === "locked";
  return (
    <button
      className={`phone-app${locked ? " locked" : ""}`}
      data-testid={`icon-${app}`}
      data-state={vis}
      ref={dock ? tip.host : undefined}
      {...(dock ? tip.handlers : {})}
      data-dock={dock ? "1" : undefined}
      title={dock ? undefined : trunc ? (locked ? `${APP_NAMES[app]} · ${APPS[app].lockHint}` : APP_NAMES[app]) : locked ? APPS[app].lockHint : undefined}
      aria-label={dock || trunc ? (locked ? `${APP_NAMES[app]} · ${APPS[app].lockHint}` : APP_NAMES[app]) : undefined}
      data-trunc={trunc ? "1" : undefined}
      aria-disabled={locked}
      onClick={() => { if (dock && tip.consumeClick()) return; if (!locked) store.getState().open(app); }}
    >
      <span className="icon">
        <Glyph name={app} size={24} />
        {fresh && <span className="fresh-dot" />}
        {locked && <span className="lock-tag" aria-hidden="true">{APPS[app].lockLabel}</span>}
      </span>
      {/* Dock (scale ≥ 1.5): no visible label at all, so it can never be truncated; the name is in aria-label. */}
      {!dock && <span className="icon-label" ref={labelRef}><Words text={APP_NAMES[app]} /></span>}
      {dock && tip.node}
      {locked && <span className="sr-only">{`· ${APPS[app].lockHint}`}</span>}
    </button>
  );
}

function StatusBar() {
  const store = useShellStore();
  const clock = useShell((s) => s.channels.clock);
  const halted = useShell((s) => s.channels.system.halted);
  const reconnecting = useShell((s) => s.channels.system.connection === "reconnecting");
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
      <button className="quay-mark fg" data-testid="quay-mark" aria-label={S.home} onPointerDown={down} onPointerUp={up} onContextMenu={(e) => e.preventDefault()}>
        <Glyph name="quay" size={20} />
      </button>
      <span className="num clock">{`D${day} · ${hhmm}`}</span>
      <MarketPhase phase={clock.phase} city={S.cityName} halted={halted} reconnecting={reconnecting} variant="dot" />
      <HaltChip halted={halted} />
      <span className="sb-nw"><MoneyText value={me.nw} compact /></span>
    </header>
  );
}

export function PhoneHome() {
  const vis = useShell((s) => s.vis);
  const me = useShell((s) => s.channels.me);
  const rank = useShell((s) => s.channels.rank);
  const phoneApp = useShell((s) => s.phoneApp);
  const screen = usePhoneScreen();
  const store = useShellStore();
  const next = nextRankTarget(rank);
  const scale = useTextScale();
  const cols = gridColsFor(scale);
  const dock = scale >= DOCK_ICON_ONLY_AT;
  const bar = phoneApp ? appBarLabels(phoneApp.app, screen) : null;
  const progress = next ? Math.min(1, Math.max(0, Number(me.nw) / Number(next.at))) : 1;
  const edge = useRef<{ x: number; y: number } | null>(null);
  // Edge gestures (17 §3.2.3): swipe up on the edge bar = Home; swipe from the left edge = back.
  const gestures = {
    onPointerDown: (e: RPointerEvent) => { edge.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e: RPointerEvent) => {
      const g = edge.current;
      edge.current = null;
      if (g && g.x <= EDGE_START && e.clientX - g.x > 60) goBack();
    },
  };
  const edgeBar = (
    <div
      className="edge-bar"
      data-testid="edge-bar"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); edge.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => { const g = edge.current; edge.current = null; if (g && g.y - e.clientY > 30) store.getState().phoneBack(); }}
    >
      <span className="fg" data-testid="edge-mark"><Glyph name="quay" size={30} /></span>
    </div>
  );

  if (phoneApp) {
    return (
      <div className="phone" data-testid="phone" {...gestures}>
        <StatusBar />
        <LoadState variant="banner" />
        <section className="phone-appview" data-testid="phone-appview" data-app={phoneApp.app} data-screen={screen ?? ""} role="dialog" aria-labelledby="phone-app-title" data-subpalette={subPalette(phoneApp.app)}>
          <div className="appbar">
            <button className="icon-btn" aria-label={bar!.back} data-testid="app-back" onClick={goBack}><Glyph name="chevLeft" size={20} /></button>
            <h1 id="phone-app-title" data-testid="app-title">{bar!.title}</h1>
          </div>
          <div className="phone-appbody">
            <AppBody app={phoneApp.app} state={{ focused: true, collapsed: false, background: false }} />
          </div>
        </section>
        {edgeBar}
      </div>
    );
  }

  return (
    <div className="phone" data-testid="phone" {...gestures}>
      <StatusBar />
      <LoadState variant="banner" />
      <main className="phone-home">
        <section className="widget" data-testid="widget">
          <div className="widget-top"><span className="label">{S.netWorth}</span><span className="chip chip-acc">{`${rank.rank} · ${RANK_NAMES[rank.rank]}`}</span></div>
          <div className="hero-nw" data-testid="hero-nw"><MoneyText value={me.nw} ctx="hero" /></div>
          <div className="widget-row">
            <span className="today" data-testid="today"><MoneyText value={me.todayChg} signed />{" "}<PctText value={me.todayPct} /></span>
            <Sparkline />
          </div>
          {next && (
            <>
              <div className="rank-bar" data-testid="rank-bar" role="progressbar" aria-label={`${S.next}: ${RANK_NAMES[next.rank]}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="num muted rank-next" data-testid="rank-next">{`${S.next}: ${RANK_NAMES[next.rank]} · `}<MoneyText value={me.nw} compact />{" / "}<MoneyText value={next.at} compact /></p>
            </>
          )}
        </section>
        <div className="app-grid" data-testid="app-grid">
          {GROUPS.map((g) => {
            const apps = APP_IDS.filter((a) => APPS[a].group === g && vis[a] !== "hidden" && !BOTTOM.includes(a));
            if (apps.length === 0) return null;
            return (
              <section key={g} className="grid-group" data-testid={`group-${g}`}>
                <h2 className="label">{GROUP_LABELS[g]}</h2>
                <div className="grid4" data-cols={cols} data-testid={`grid-${g}`}>{apps.map((a) => <AppIcon key={a} app={a} />)}</div>
              </section>
            );
          })}
        </div>
      </main>
      <nav className="bottom-row" data-testid="bottom-row" data-dock={dock ? "1" : undefined} aria-label={S.shelf}>
        {BOTTOM.map((a) => <AppIcon key={a} app={a} dock={dock} />)}
      </nav>
      {edgeBar}
    </div>
  );
}
