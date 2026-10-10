'use client';

// The phone desktop (P2-135..P2-150, V:148-155): a status bar with the Quay mark and the clock, a home
// screen (net-worth widget, 4-column grid, fixed bottom row, edge bar), and full-screen apps with a back
// chevron. The Recent sheet opens from the mark (P2-155). Toasts drop from the status bar, one at a time
// (P2-095). The same OsRoot mounts this when the viewport is under 768 px, so the save and the game are
// the same as on the desktop. The phone never reads the window layout (P2-135).
import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { clockParts } from '@/game/clock';
import { compactMoney, money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { APPS, type AppId, type WinProps, SHELF_ORDER } from '@/shell/apps';
import { phoneCanOpen } from '@/shell/phone';
import type { Win } from '@/shell/wm';
import { AppBody } from './appViews';
import { Wallpaper } from './DesktopWallpaper';
import type { Rank } from './hardware';
import { RankHardware } from './RankHardware';
import { APP_GLYPH } from './appMap';
import { Glyph } from './glyphs';
import { OsToasts } from './OsToasts';
import { EventBannerStrip, EventPanel, useBannerOn } from './EventBanner';
import { PhoneRecents } from './PhoneRecents';
import { onPhonePop, phoneBack, phoneGoHome, phoneOpen, setRecentOpen, usePhone } from './phoneStore';
import { usePalette, useShell } from './shellStore';

/** The four pinned apps (V:151). Not editable. */
export const BOTTOM_ROW: readonly AppId[] = ['broker', 'portfolio', 'wire', 'messages'];

/** The window size an app body lays itself out by on the phone: the full screen under the bars. */
const APP_BAR_H = 44;
const EDGE_H = 40;

/** The status bar's clock: the day and the time, "D4 · 09:44" (V:148). */
export function shortClock(tick: number): string {
  const c = clockParts(tick, 720);
  return `D${c.day} · ${c.hhmm}`;
}

/** A tap or long press on the Quay mark is at least this long for Recent (P2-140). */
export const RECENT_HOLD_MS = 400;

/** Props for an app opened from the phone home. The Broker opens on the selected ticker. */
function homeProps(app: AppId): { ticker?: string } {
  return app === 'broker' ? { ticker: useGame.getState().selected } : {};
}

/** The phone desktop. The rank hardware (the R0 bezel, crack and sticker) is drawn here too (P2-193). */
export function PhoneDesk({ rank }: { rank: Rank }) {
  const palette = usePalette((s) => s.palette);
  const current = usePhone((s) => s.current);
  // The world event strip sits under the phone bar; the home and the apps move down under it.
  const bannerOn = useBannerOn();

  // Browser Back and Forward show the app their history entry names (P2-114).
  useEffect(() => {
    window.addEventListener('popstate', onPhonePop);
    return () => window.removeEventListener('popstate', onPhonePop);
  }, []);

  return (
    <div className={`os-desktop os-phone${bannerOn ? ' os-event-on' : ''}`} data-testid="os-phone" data-layout="phone" data-current={current ?? 'home'}>
      <Wallpaper slug={palette} idPrefix="phone" />
      <RankHardware rank={rank} />
      <div className="os-phone-hw-skyline" aria-hidden />
      <div className="os-phone-hw-horizon" aria-hidden />
      <PhoneStatus />
      <EventBannerStrip />
      {current === null && <PhoneHome />}
      <PhoneApps />
      <PhoneEdge />
      <RecentSheetGate />
      <EventPanel />
      <OsToasts focusMode={false} side="right" phone />
    </div>
  );
}

function RecentSheetGate() {
  const open = usePhone((s) => s.recentOpen);
  return open ? <PhoneRecents /> : null;
}

/** The status bar (44 px): the Quay mark (tap Home, hold Recent), the clock, and the market dot and net worth. */
function PhoneStatus() {
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const nw = useGame((s) => s.me?.netWorth.total ?? 0);
  const ready = useGame((s) => s.status === 'ready');
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const [pressing, setPressing] = useState(false);

  const release = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };

  return (
    <header className="os-phone-status" data-testid="os-phone-status">
      <button
        type="button"
        className={`os-phone-qm${pressing ? ' on' : ''}`}
        data-testid="phone-quay"
        aria-label={t('shell.phone.quay')}
        onPointerDown={() => {
          fired.current = false;
          setPressing(true);
          timer.current = window.setTimeout(() => {
            fired.current = true;
            setRecentOpen(true);
            navigator.vibrate?.(8);
          }, RECENT_HOLD_MS);
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onClick={() => {
          // A long press already opened Recent; its click does not also go home.
          if (fired.current) {
            fired.current = false;
            return;
          }
          phoneGoHome();
        }}
      >
        <Glyph name="quay" size={18} />
      </button>
      <span className="num text-caption text-fg" data-testid="phone-clock">{shortClock(tick)}</span>
      <span className="os-phone-r">
        <span className={`os-dot ${ready ? 'bg-gain' : 'bg-warn'}`} aria-hidden />
        <span className="num text-caption text-fg-muted">{compactMoney(nw)}</span>
      </span>
    </header>
  );
}

/** A tap on the edge bar is Home; a swipe up from it is Home too (V:154). */
function PhoneEdge() {
  const startY = useRef<number | null>(null);
  return (
    <button
      type="button"
      className="os-home-edge"
      data-testid="home-edge"
      aria-label={t('common.home')}
      onPointerDown={(e) => { startY.current = e.clientY; }}
      onPointerUp={(e) => {
        if (startY.current !== null && startY.current - e.clientY > 40) phoneGoHome();
        startY.current = null;
      }}
      onClick={() => phoneGoHome()}
    >
      <Glyph name="quay" size={30} />
    </button>
  );
}

/** The home screen: the net-worth widget, the app grid and the fixed bottom row (P2-141..P2-144). */
function PhoneHome() {
  const unlocked = useShell((s) => s.ctx.unlocked);
  const grid = SHELF_ORDER.filter((a) => {
    if (BOTTOM_ROW.includes(a) || !APPS[a].available) return false;
    if (APPS[a].hideWhenLocked && !unlocked(a)) return false;
    return true;
  });
  return (
    <section className="os-home" data-testid="home" aria-label={t('shell.phone.homeScreen')}>
      <PhoneWidget />
      <div className="os-home-grid" role="list" aria-label={t('shell.phone.appsGrid')}>
        {grid.map((a) => (
          <div role="listitem" key={a}>
            <PhoneAppTile app={a} />
          </div>
        ))}
      </div>
      <div className="os-home-row" data-testid="home-row" aria-label={t('shell.phone.bottomRow')}>
        {BOTTOM_ROW.map((a) => (
          <PhoneAppTile key={a} app={a} />
        ))}
      </div>
    </section>
  );
}

/** A home icon: the app glyph in a tile, a locked tag and a dot badge (never a number, P2-145). */
function PhoneAppTile({ app }: { app: AppId }) {
  const unlocked = useShell((s) => s.ctx.unlocked);
  const unread = useGame((s) => (s.me?.player.inboxUnread ?? 0) > 0 || s.chatUnread > 0);
  const verdict = phoneCanOpen(app, unlocked);
  const locked = verdict !== 'ok';
  const tag = APPS[app].minRank;
  const label = t(APPS[app].titleKey);
  return (
    <button
      type="button"
      className={`os-app${locked ? ' locked' : ''}`}
      data-testid={`home-app-${app}`}
      aria-label={locked ? `${label}: ${t('shell.phone.locked')}` : label}
      onClick={() => phoneOpen(app, homeProps(app))}
    >
      <span className="os-app-ic">
        <Glyph name={APP_GLYPH[app]} size={26} />
        {tag !== null && locked && <span className="os-app-tag">{tag}</span>}
        {app === 'messages' && unread && <span className="os-app-badge" aria-hidden />}
      </span>
      <span className="os-app-nm">{label}</span>
    </button>
  );
}

/** The net-worth widget (P2-141): net worth in serif with cents smaller, today, a sparkline, the rank bar. */
function PhoneWidget() {
  const me = useGame((s) => s.me);
  const samples = useGame((s) => s.nw?.samples);
  const nw = me?.netWorth.total ?? 0;
  const dayStart = me?.player.dayStart.netWorth ?? nw;
  const today = nw - dayStart;
  const todayPct = dayStart ? today / dayStart : 0;
  const abs = Math.abs(nw);
  const whole = Math.floor(abs).toLocaleString('en-US');
  const cents = (abs % 1).toFixed(2).slice(1);
  const r = me?.rank;
  const pct = Math.max(0, Math.min(100, (r?.progress ?? 0) * 100));
  return (
    <button
      type="button"
      className="os-widget text-left"
      data-testid="home-widget"
      aria-label={`${t('common.netWorth')} ${money(nw)}`}
      onClick={() => phoneOpen('portfolio', {})}
    >
      <span className="flex items-center gap-2">
        <span className="label text-fg-faint">{t('common.netWorth')}</span>
        {r && <span className="num ml-auto rounded-chip border border-brass/40 px-2 text-micro text-brass">{r.id} · {t(`rank.${r.id}`)}</span>}
      </span>
      <span className="os-widget-big block text-fg" data-testid="os-networth">
        {nw < 0 ? '−' : ''}${whole}<small>{cents}</small>
      </span>
      <span className="flex items-center justify-between gap-3">
        <span className={`num mt-1 text-small ${toneText[tone(today)]}`}>{signedMoney(today)} {signedPct(todayPct)}</span>
        <Sparkline values={samples ?? []} />
      </span>
      <span className="os-prog block">
        <span className="os-prog-bar" style={{ width: `${pct}%` }} />
      </span>
      {r?.next && (
        <span className="num mt-1 block text-caption text-fg-faint">
          {t('shell.phone.next', { rank: t(`rank.${r.next.id}`), nw: compactMoney(nw), threshold: compactMoney(r.next.threshold) })}
        </span>
      )}
    </button>
  );
}

/** A 92 x 22 sparkline of the last samples. A flat line until there are two. */
export function Sparkline({ values }: { values: readonly number[] }) {
  const v = values.slice(-60);
  const w = 92;
  const h = 22;
  let pts = `0,${h / 2} ${w},${h / 2}`;
  if (v.length >= 2) {
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const span = hi - lo || 1;
    pts = v
      .map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - lo) / span) * (h - 4)).toFixed(1)}`)
      .join(' ');
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 text-brass">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/**
 * The running apps. The top three keep their React state (drafts, scroll, view) and stay mounted but
 * hidden; deeper entries are not mounted (P2-137). Only the app on screen is shown.
 */
function PhoneApps() {
  const stack = usePhone((s) => s.stack);
  const current = usePhone((s) => s.current);
  const vp = useShell((s) => s.shell.vp);
  return (
    <>
      {stack.slice(0, 3).map((e) => (
        <PhoneScreen key={e.app} app={e.app} props={e.props} visible={e.app === current} vp={vp} />
      ))}
    </>
  );
}

function PhoneScreen({ app, props, visible, vp }: { app: AppId; props: WinProps; visible: boolean; vp: { w: number; h: number } }) {
  const title = t(APPS[app].titleKey);
  const win: Win = {
    id: app,
    app,
    ws: 0,
    rect: { x: 0, y: 0, w: vp.w, h: vp.h },
    slot: null,
    state: 'open',
    filled: true,
    props,
  };
  return (
    <section
      className="os-phone-app"
      data-testid={`phone-app-${app}`}
      data-app={app}
      aria-label={title}
      style={visible ? undefined : { display: 'none' }}
    >
      <header className="os-phone-bar">
        <button type="button" className="os-phone-back" data-testid="phone-back" aria-label={t('common.back')} onClick={() => phoneBack()}>
          <Glyph name="chev" size={20} mirror />
        </button>
        <span className="os-phone-title">{title}</span>
      </header>
      <AppBody win={win} size={{ w: vp.w, h: Math.max(0, vp.h - APP_BAR_H - EDGE_H) }} />
    </section>
  );
}

