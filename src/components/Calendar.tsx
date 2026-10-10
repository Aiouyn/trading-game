'use client';

import { earningsCalendar } from '@/engine';
import { t } from '@/i18n';
import { consensusLabel } from '@/content/news';
import { assetDefOf, useGame } from '@/game/store';
import type { WireItem } from '@/world/types';
import { openFromShell } from './os/openApp';
import { Chip } from './ui';

/** A shared empty list, so a selector that has no calendar returns the same value each time. */
const NO_ITEMS: never[] = [];

/** Index reviews still ahead: the announced items whose effective day is today or later, earliest first. */
function upcomingReviews(wire: readonly WireItem[], today: number): WireItem[] {
  const seen = new Set<string>();
  const out: WireItem[] = [];
  for (const w of wire) {
    if (w.ev?.type !== 'index' || w.ev.phase !== 'announced' || (w.ev.day ?? -1) < today) continue;
    if (seen.has(w.ev.id)) continue;
    seen.add(w.ev.id);
    out.push(w);
  }
  return out.sort((a, b) => (a.ev?.day ?? 0) - (b.ev?.day ?? 0));
}

/** The Calendar, its own app (velvet-desktop-os.md; velvet-world-events.md section 1): what is scheduled. */
export function CalendarView() {
  const world = useGame((s) => s.world);
  const frame = useGame((s) => s.frame);
  const wire = useGame((s) => s.wire);
  const next = useGame((s) => s.me?.trading.calendar) ?? NO_ITEMS;
  if (!world || !frame) return null;
  const tpd = world.config.ticksPerDay;
  const today = frame.tick <= 0 ? 0 : Math.floor((frame.tick - 1) / tpd);
  const cal = earningsCalendar(world, 10);
  const reviews = upcomingReviews(wire, today);
  const r = frame.rates;
  const ev = frame.worldEvent;
  return (
    <div className="os-body" data-testid="calendar-view">
      <p className="text-caption text-fg-faint">{t('calendar.sub')}</p>

      <div className="label pt-3">{t('calendar.section.next')}</div>
      <p className="text-caption text-fg-faint" data-testid="calendar-busy">{t('calendar.busy', { n: next.length })}</p>
      <ul data-testid="calendar-next">
        {next.map((c, i) => (
          <li key={`${c.day}-${c.kind}-${c.assetId ?? ''}-${i}`} className="flex items-baseline justify-between gap-3 border-t border-ink-2 py-2 text-small" data-testid={`calendar-item-${i}`}>
            <span className="min-w-0 text-fg">{t(c.msg.key, c.msg.vars)}</span>
            <span className="num shrink-0 text-caption text-fg-muted">{c.offset === 0 ? t('calendar.day.today') : t('calendar.day.tomorrow')}</span>
          </li>
        ))}
      </ul>

      <div className="label pt-3">{t('calendar.section.macro')}</div>
      {r && (
        <div className="text-small">
          <div className="flex justify-between border-t border-ink-2 py-2" data-testid="calendar-bank">
            <span>{t('calendar.bank')}</span>
            <span className="num text-fg-muted">{t('calendar.in', { n: Math.max(0, r.nextMeeting - today) })}</span>
          </div>
          <p className="text-caption text-fg-faint">
            {t('calendar.policy', { rate: (r.policy * 100).toFixed(2), expect: expectText(r.expectedMove) })}
          </p>
          <div className="flex justify-between border-t border-ink-2 py-2" data-testid="calendar-release">
            <span>{r.releaseKind === 'cpi' ? t('calendar.release.cpi') : t('calendar.release.jobs')}</span>
            <span className="num text-fg-muted">{t('calendar.in', { n: Math.max(0, r.nextRelease - today) })}</span>
          </div>
          <p className="text-caption text-fg-faint">
            {t('calendar.curve', { y2: (r.y2 * 100).toFixed(2), y10: (r.y10 * 100).toFixed(2), y30: (r.y30 * 100).toFixed(2) })}
            {r.y2 > r.y10 ? ` · ${t('calendar.inverted')}` : ''}
          </p>
        </div>
      )}

      {ev && ev.phase === 'announced' && (
        <>
          <div className="label pt-3">{t('calendar.section.world')}</div>
          <p className="border-t border-ink-2 py-2 text-small text-fg" data-testid="calendar-world">
            <span className="mr-2 text-caption uppercase text-warn">{t(`event.kind.${ev.kind}`)}</span>
            {ev.headline}
          </p>
        </>
      )}

      <div className="label pt-3">{t('calendar.section.index')}</div>
      <ul>
        {reviews.map((w) => {
          const e = w.ev!;
          const name = world.config.indices.find((x) => x.id === e.indexId)?.name ?? e.indexId ?? '';
          const days = (e.day ?? today) - today;
          const names = (ids: string[] | undefined) => (ids ?? []).map((id) => assetDefOf(id)?.name ?? id).join(', ');
          return (
            <li key={w.id} className="border-t border-ink-2 py-2" data-testid="calendar-index">
              <div className="flex justify-between text-small">
                <span>{t('calendar.index.review', { index: name })}</span>
                <span className="num text-fg-muted">{days <= 0 ? t('calendar.today') : t('calendar.in', { n: days })}</span>
              </div>
              {e.adds?.length ? <p className="text-caption text-fg-faint">{t('calendar.index.joins', { names: names(e.adds) })}</p> : null}
              {e.removes?.length ? <p className="text-caption text-fg-faint">{t('calendar.index.leaves', { names: names(e.removes) })}</p> : null}
            </li>
          );
        })}
        {!reviews.length && <li className="py-2 text-small text-fg-faint">{t('calendar.index.none')}</li>}
      </ul>

      <div className="label pt-3">{t('calendar.section.earnings', { n: 10 })}</div>
      <ul>
        {cal.map((e) => {
          const c = e.consensus !== null ? consensusLabel(e.consensus) : null;
          const lean = c ? t(`calendar.lean.${c.lean.toLowerCase()}`) : null;
          return (
            <li key={e.assetId}>
              <button
                type="button"
                data-testid={`calendar-earnings-${e.assetId}`}
                onClick={() => openFromShell('broker', { ticker: e.assetId })}
                className="flex w-full items-center gap-3 border-t border-ink-2 py-2 text-left hover:bg-ink-2"
              >
                <span className="num w-14 text-small font-semibold">{e.assetId}</span>
                <span className="min-w-0 flex-1 truncate text-caption text-fg-faint">{assetDefOf(e.assetId)?.name}</span>
                {c && lean && (
                  <Chip className={c.lean === 'Beat' ? 'border-gain/40 text-gain' : c.lean === 'Miss' ? 'border-loss/40 text-loss' : ''}>
                    {lean}{c.stars ? ` ${'★'.repeat(c.stars)}` : ''}
                  </Chip>
                )}
                {e.rumor !== null && (
                  <Chip className="border-warn/50 text-warn">{t(e.rumor > 0 ? 'calendar.whisper.beat' : 'calendar.whisper.miss')}</Chip>
                )}
                <span className="num w-16 text-right text-caption text-fg-muted">
                  {e.daysAway === 0 ? t('calendar.today') : t('calendar.days.short', { n: e.daysAway })}
                </span>
              </button>
            </li>
          );
        })}
        {!cal.length && <li className="py-3 text-small text-fg-faint">{t('calendar.earnings.none')}</li>}
      </ul>
    </div>
  );
}

/** The policy line's expectation: a hold, or a hike or cut of so many basis points. */
function expectText(expectedMove: number): string {
  if (expectedMove === 0) return t('calendar.expect.hold');
  const bp = String(Math.abs(Math.round(expectedMove * 1e4)));
  return t(expectedMove > 0 ? 'calendar.expect.hike' : 'calendar.expect.cut', { bp });
}
