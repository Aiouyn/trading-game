'use client';

// The phone's Recent sheet (P2-155..P2-169, V:163-175): a plain list of the running apps, most recent first.
// No thumbnails and no card stack (V:166). Each row has one live line. The live lines subscribe to the
// store only while the sheet is open (C-22), because this component mounts with the sheet and unmounts with
// it. A tap switches app; a swipe left past 72 px reveals Close, which keeps the app's state (P2-163). Nothing
// here sends an order, and a Broker's unsent ticket stays as the draft it is (P2-161).
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { knownSeries, useGame } from '@/game/store';
import { clockParts } from '@/game/clock';
import { money, price, signedPct } from '@/game/format';
import { APPS, type AppId } from '@/shell/apps';
import { seriesInfo } from '@/components/apps/broker/seriesInfo';
import { APP_GLYPH } from './appMap';
import { Glyph } from './glyphs';
import { useDrafts } from './drafts';
import type { PhoneEntry } from '@/shell/phone';
import { phoneCloseApp, phoneGoHome, phoneOpen, setRecentOpen, usePhone } from './phoneStore';

/** The swipe distance that reveals Close (V:170). */
const REVEAL_PX = 72;

/** Live subscriptions the sheet holds right now: 1 while it is open, 0 when closed (C-22). Read by the e2e hooks only. */
let liveSubscriptions = 0;

export function recentLiveSubscriptions(): number {
  return liveSubscriptions;
}

/** What the live lines read, copied out of the stores when one of them moves. */
interface LiveFacts {
  tick: number;
  me: unknown;
  world: unknown;
  wire: unknown;
  drafts: unknown;
}

function readLive(): LiveFacts {
  const g = useGame.getState();
  return { tick: g.frame?.tick ?? 0, me: g.me, world: g.world, wire: g.wire, drafts: useDrafts.getState().tickers };
}

/**
 * One store subscription for the whole sheet. It is made when the sheet mounts (it mounts only while the sheet
 * is open) and released when it unmounts, so the market, the Wire and the drafts reach the sheet only while it
 * is on screen (P2-159, C-22). The sheet re-renders only when a value a live line reads has changed.
 */
function useLiveFacts(): LiveFacts {
  const [facts, setFacts] = useState<LiveFacts>(readLive);
  useEffect(() => {
    liveSubscriptions += 1;
    const sync = (): void => setFacts(readLive());
    const offGame = useGame.subscribe((s, prev) => {
      if (s.frame?.tick !== prev.frame?.tick || s.me !== prev.me || s.world !== prev.world || s.wire !== prev.wire) sync();
    });
    const offDrafts = useDrafts.subscribe((s, prev) => {
      if (s.tickers !== prev.tickers) sync();
    });
    // A change made between the first render and this subscription is caught here.
    sync();
    return () => {
      offGame();
      offDrafts();
      liveSubscriptions -= 1;
    };
  }, []);
  return facts;
}

export function PhoneRecents() {
  const stack = usePhone((s) => s.stack);
  const current = usePhone((s) => s.current);
  const closedOnce = usePhone((s) => s.closedOnce);
  // The sheet re-renders as the live facts move; the rows read the stores for their own lines.
  useLiveFacts();
  const close = (): void => setRecentOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRecentOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="os-scrim" aria-label={t('shell.recent.close')} data-testid="recents-scrim" onClick={close} />
      <section role="dialog" aria-modal="true" aria-label={t('shell.recent.label')} className="os-sheet" data-testid="phone-recents">
        <div className="os-grab" aria-hidden />
        <div className="os-sh-top">
          <span className="label text-fg-muted">{t('shell.recent.label')}</span>
          {!closedOnce && <span className="os-sh-hint">{t('shell.recent.swipe')}</span>}
        </div>
        {stack.length === 0 && <p className="os-empty">{t('shell.recent.empty')}</p>}
        {stack.map((e, i) => (
          <RecentRow key={e.app} entry={e} current={e.app === current} last={i === stack.length - 1} />
        ))}
        <button type="button" className="os-home-btn" data-testid="recents-home" onClick={() => { close(); phoneGoHome(); }}>
          <Glyph name="quay" size={18} />
          {t('common.home')}
        </button>
      </section>
    </>
  );
}

function RecentRow({ entry, current, last }: { entry: PhoneEntry; current: boolean; last: boolean }) {
  const app = entry.app;
  const label = t(APPS[app].titleKey);
  const [dx, setDx] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  // The live offset is read from a ref on release: pointer moves can land after the last render.
  const offset = useRef(0);
  // A drag that moved the row must not also count as a tap on it.
  const suppressTap = useRef(false);

  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = { x: e.clientX, w: e.currentTarget.clientWidth };
    suppressTap.current = false;
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientX - d.x;
    if (Math.abs(delta) > 6) suppressTap.current = true;
    const base = swiped ? -REVEAL_PX : 0;
    const v = Math.max(-d.w, Math.min(0, base + delta));
    offset.current = v;
    setDx(v);
  };
  const up = (): void => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const total = offset.current;
    offset.current = 0;
    setDx(0);
    if (-total > d.w * 0.5) {
      phoneCloseApp(app);
      return;
    }
    setSwiped(-total >= REVEAL_PX);
  };

  return (
    <div className={`os-rw-wrap${last ? ' last' : ''}`}>
      <div
        className={`os-rw${swiped ? ' swiped' : ''}`}
        style={dx !== 0 ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <button
          type="button"
          className="os-rw-tap"
          data-testid={`recents-row-${app}`}
          aria-label={label}
          onClick={() => {
            if (suppressTap.current) {
              suppressTap.current = false;
              return;
            }
            // A tap on a revealed row hides Close and does not switch app.
            if (swiped) {
              setSwiped(false);
              return;
            }
            phoneOpen(app, entry.props);
          }}
        >
          <span className="os-rt">
            <Glyph name={APP_GLYPH[app]} size={20} />
            {app === 'broker' && <DraftDot ticker={entry.props.ticker ?? useGame.getState().selected} />}
          </span>
          <span className="os-rx">
            <span className="os-rn block">{label}</span>
            <span className="os-rl block">{liveLine(entry)}</span>
          </span>
          <span className="os-rtime">{current ? t('shell.recent.now') : timeLabel(entry.tick)}</span>
        </button>
      </div>
      <button type="button" className="os-rw-close" data-testid={`recents-close-${app}`} onClick={() => phoneCloseApp(app)}>
        {t('shell.recent.close')}
      </button>
    </div>
  );
}

/** A Broker with an unsent ticket gets a dot on its row (P2-160). */
function DraftDot({ ticker }: { ticker: string }) {
  const draft = useDrafts((s) => !!s.tickers[ticker]);
  return draft ? <span className="os-adot" data-testid="recents-draft-broker" aria-label={t('shell.recent.draft')} /> : null;
}

/** The one live line per app (P2-159). Other apps show one fact about themselves. */
function liveLine(entry: PhoneEntry): string {
  return LIVE[entry.app]?.(entry) ?? t('shell.recent.none');
}

const LIVE: Partial<Record<AppId, (e: PhoneEntry) => string>> = {
  broker: (e) => brokerLine(e.props.ticker ?? useGame.getState().selected),
  portfolio: () => portfolioLine(),
  wire: () => wireLine(),
  messages: () => messagesLine(),
  businesses: () => businessesLine(),
};

function brokerLine(ticker: string): string {
  const st = useGame.getState();
  if (st.world === null || !knownSeries(st.config, ticker)) return ticker;
  const p = seriesInfo(st.world, ticker, st.me?.rank.id ?? 'R0').price;
  const draft = !!useDrafts.getState().tickers[ticker];
  return draft
    ? t('shell.recent.broker', { ticker, price: price(p) })
    : t('shell.recent.brokerQuiet', { ticker, price: price(p) });
}

function portfolioLine(): string {
  const me = useGame.getState().me;
  const nw = me?.netWorth.total ?? 0;
  const dayStart = me?.player.dayStart.netWorth ?? nw;
  const pct = dayStart ? (nw - dayStart) / dayStart : 0;
  return `${money(nw)} · ${signedPct(pct)}`;
}

function wireLine(): string {
  const st = useGame.getState();
  const seen = usePhone.getState().wireSeen;
  const n = st.wire.filter((w) => w.tick > seen).length;
  return t('shell.recent.wire', { n, time: clockParts(seen, 720).hhmm });
}

function messagesLine(): string {
  return t('shell.recent.messages', { n: useGame.getState().me?.player.inboxUnread ?? 0 });
}

function businessesLine(): string {
  return t('shell.recent.businesses', { n: useGame.getState().me?.businesses.length ?? 0 });
}

/** A clock time for today, "D37" for an older day (V:166). */
function timeLabel(tick: number): string {
  const now = clockParts(useGame.getState().frame?.tick ?? 0, 720);
  const then = clockParts(tick, 720);
  return then.day === now.day ? then.hhmm : `D${then.day}`;
}
