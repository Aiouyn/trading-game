'use client';

// The world event banner (velvet-world-events.md sections 3 and 5) and its panel. One 34 px strip under the
// status strip on the desktop, and under the phone bar on the phone. It shows only what the frame gives: the
// kind dot, the elapsed day, the GX move since the event began and today's GX move. It never shows an end or
// a remaining time. Tapping it opens the panel: the headline, what came before, and the event's share of each
// held asset's move today. One game day after the end, the aftermath line replaces it.
import { useEffect } from 'react';
import { create } from 'zustand';
import { t } from '@/i18n';
import { signedPct } from '@/game/format';
import { useGame } from '@/game/store';
import type { WireEvent } from '@/world/types';
import type { WorldEventFrame } from '@/world/view';
import { selectEventBanner } from './eventSelect';

/** Whether the event panel is open. Shared, so the strip, the phone and Escape close it the same way. */
export const useEventPanel = create<{ open: boolean }>(() => ({ open: false }));

const KIND_DOT: Record<WorldEventFrame['kind'], string> = {
  crash: 'bg-loss', bubble: 'bg-gain', crisis: 'bg-warn', flash: 'bg-info',
};

/** The banner now, read from the store. A boolean selector, so the shell re-syncs only when the strip appears or goes. */
export function useBannerOn(): boolean {
  return useGame((s) => selectEventBanner(s.frame?.worldEvent ?? null, s.wire, s.frame?.tick ?? 0, s.world?.config.ticksPerDay ?? 720) !== null);
}

/** The aftermath line: "Crash ended · lasted 18 days · GX −31.00%", from the Wire's end story and its facts. */
export function aftermathText(e: WireEvent): string {
  const kind = t(`event.kind.${e.kind ?? 'crash'}`);
  const lasted = e.kind !== 'flash' && e.lastedDays !== undefined ? t('event.lasted', { count: e.lastedDays, days: e.lastedDays }) : '';
  const gx = e.gxMove !== undefined ? t('event.gxEnd', { move: signedPct(e.gxMove) }) : '';
  return t('event.aftermath', { kind, lasted, gx });
}

/** The strip. Renders nothing when no event is live and no aftermath is due. */
export function EventBannerStrip() {
  const frame = useGame((s) => s.frame);
  const wire = useGame((s) => s.wire);
  const tpd = useGame((s) => s.world?.config.ticksPerDay ?? 720);
  // The panel belongs to one event: when that event ends, or the next one starts, the panel closes, so it never opens by itself.
  const eventId = frame?.worldEvent?.id ?? null;
  useEffect(() => {
    useEventPanel.setState({ open: false });
  }, [eventId]);
  const banner = selectEventBanner(frame?.worldEvent ?? null, wire, frame?.tick ?? 0, tpd);
  if (banner === null) return null;
  if (banner.kind === 'aftermath') {
    return (
      <div className="os-event os-event-after" data-testid="event-banner" data-state="aftermath" role="status" aria-live="polite">
        <span className="os-event-text">{aftermathText(banner.item.ev!)}</span>
      </div>
    );
  }
  const ev = banner.ev;
  const kind = t(`event.kind.${ev.kind}`);
  const label = ev.phase === 'live'
    ? t('event.label', { kind, day: ev.elapsedDays + 1 })
    : t('event.label.announced', { kind });
  return (
    <button
      type="button"
      className="os-event"
      data-testid="event-banner"
      data-state={ev.phase}
      data-kind={ev.kind}
      aria-label={t('event.open', { label })}
      onClick={() => useEventPanel.setState({ open: true })}
    >
      <span className={`os-event-dot ${KIND_DOT[ev.kind]}`} aria-hidden />
      <span className="os-event-label">{label}</span>
      {ev.gxSince !== null && <span className="num os-event-move">{t('event.gxSince', { move: signedPct(ev.gxSince) })}</span>}
      {ev.gxToday !== null && <span className="num os-event-move">{t('event.today', { move: signedPct(ev.gxToday) })}</span>}
    </button>
  );
}

/** The event panel: the headline, the precursors and the event's share of each held asset's move today. */
export function EventPanel() {
  const open = useEventPanel((s) => s.open);
  const frame = useGame((s) => s.frame);
  const wire = useGame((s) => s.wire);
  const world = useGame((s) => s.world);
  const positions = useGame((s) => s.me?.account?.positions);
  const ev = frame?.worldEvent ?? null;
  if (!open || ev === null || world === null) return null;
  const close = () => useEventPanel.setState({ open: false });
  const before = wire.filter((w) => w.ev?.type === 'world' && w.ev.id === ev.id && w.ev.phase === 'announced').slice().reverse();
  const held = Object.entries(positions ?? {}).filter(([, p]) => p.qty !== 0).map(([id]) => id);
  return (
    <section className="os-event-panel" role="dialog" aria-labelledby="event-panel-title" data-testid="event-panel" data-kind={ev.kind}>
      <header className="os-event-panel-head">
        <span className="label">{t('event.panel.kind', { kind: t(`event.kind.${ev.kind}`) })}</span>
        <button type="button" className="os-event-close" data-testid="event-close" onClick={close}>{t('common.close')}</button>
      </header>
      <h2 id="event-panel-title" className="os-event-headline" data-testid="event-headline">{ev.headline}</h2>
      {before.length > 0 && (
        <>
          <div className="label pt-3">{t('event.panel.before')}</div>
          <ul className="text-small text-fg-muted">
            {before.map((w) => <li key={w.id} className="border-t border-ink-2 py-1.5">{w.text}</li>)}
          </ul>
        </>
      )}
      <div className="label pt-3">{t('event.panel.share')}</div>
      <ul>
        {held.map((id) => {
          const i = world.config.assets.findIndex((a) => a.id === id);
          const st = world.assets[i];
          const move = st ? Math.exp(st.lnP - st.lnOpen) - 1 : 0;
          const share = Math.exp(ev.todayShare[id] ?? 0) - 1;
          const touched = ev.todayShare[id] !== undefined;
          return (
            <li key={id} className="flex flex-wrap gap-x-2 border-t border-ink-2 py-2 text-small" data-testid={`event-share-${id}`}>
              {touched
                ? <span className="num">{t('event.share', { share: signedPct(share), ticker: id, move: signedPct(move) })}</span>
                : <span className="text-fg-muted">{t('event.share.none', { ticker: id })}</span>}
            </li>
          );
        })}
      </ul>
      {held.length === 0 && <p className="pt-2 text-small text-fg-faint">{t('event.panel.noHoldings')}</p>}
    </section>
  );
}
