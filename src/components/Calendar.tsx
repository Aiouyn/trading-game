'use client';

import { earningsCalendar } from '@/engine';
import { t } from '@/i18n';
import { consensusLabel } from '@/content/news';
import { useGame } from '@/game/store';
import { openFromShell } from './os/openApp';
import { headlineText, kindLabel } from './os/eventText';
import { Chip } from './ui';
import { dec } from '@/game/format';

/** A shared empty list, so a selector that has no calendar returns the same value each time. */
const NO_ITEMS: never[] = [];

/** One agenda row: a dated item, its kind (bank, earnings, index...) and its sentence. */
interface AgendaRow {
  key: string;
  day: number;
  kind: string;
  text: string;
  assetId?: string;
}

/** The expectation in the policy line: a hold, or a hike or cut of so many basis points. */
function expectText(expectedMove: number): string {
  if (expectedMove === 0) return t('calendar.expect.hold');
  const bp = String(Math.abs(Math.round(expectedMove * 1e4)));
  return t(expectedMove > 0 ? 'calendar.expect.hike' : 'calendar.expect.cut', { bp });
}

/** The day heading: today, tomorrow, or how many days away. */
function whenText(offset: number): string {
  if (offset <= 0) return t('calendar.day.today');
  if (offset === 1) return t('calendar.day.tomorrow');
  return t('calendar.in', { n: offset });
}

/**
 * The Calendar, its own app (velvet-desktop-os.md; velvet-world-events.md section 1): what is scheduled, as an agenda. The
 * dated items of the next two game days come from the player's calendar; earnings further out come from the earnings
 * calendar. Items are grouped by game day, earliest first, each with its kind.
 */
export function CalendarView() {
  const world = useGame((s) => s.world);
  const frame = useGame((s) => s.frame);
  const next = useGame((s) => s.me?.trading.calendar) ?? NO_ITEMS;
  if (!world || !frame) return null;
  const tpd = world.config.ticksPerDay;
  const today = frame.tick <= 0 ? 0 : Math.floor((frame.tick - 1) / tpd);
  const cal = earningsCalendar(world, 10);
  const byAsset = new Map(cal.map((e) => [e.assetId, e]));
  const r = frame.rates;
  const ev = frame.worldEvent;

  const rows: AgendaRow[] = next.map((c, i) => ({ key: `n-${i}`, day: c.day, kind: c.kind, text: t(c.msg.key, c.msg.vars), assetId: c.assetId }));
  // earnings beyond the two days the calendar lists
  for (const e of cal) {
    const day = today + e.daysAway;
    if (rows.some((x) => x.kind === 'earnings' && x.assetId === e.assetId && x.day === day)) continue;
    rows.push({ key: `e-${e.assetId}-${day}`, day, kind: 'earnings', text: t('work.cal.earnings', { asset: e.assetId }), assetId: e.assetId });
  }
  rows.sort((a, b) => a.day - b.day || a.kind.localeCompare(b.kind) || (a.assetId ?? '').localeCompare(b.assetId ?? ''));
  const days = new Map<number, AgendaRow[]>();
  for (const x of rows) {
    if (x.day < today) continue;
    days.set(x.day, [...(days.get(x.day) ?? []), x]);
  }

  return (
    <div className="os-body flex flex-col gap-3" data-testid="calendar-view">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-caption text-fg-faint">{t('calendar.sub')}</p>
        <p className="num text-caption text-fg-faint" data-testid="calendar-busy">{t('calendar.busy', { n: next.length })}</p>
      </div>
      {r && (
        <p className="num text-caption text-fg-muted" data-testid="calendar-macro">
          {t('calendar.policy', { rate: dec(r.policy * 100, 2), expect: expectText(r.expectedMove) })}
          {' · '}
          {t('calendar.curve', { y2: dec(r.y2 * 100, 2), y10: dec(r.y10 * 100, 2), y30: dec(r.y30 * 100, 2) })}
          {r.y2 > r.y10 ? ` · ${t('calendar.inverted')}` : ''}
        </p>
      )}
      {/* only a crisis week is announced on the calendar: a major's kind and headline stay hidden until its onset (no-reveal) */}
      {ev && ev.phase === 'announced' && ev.kind === 'crisis' && (
        <p className="border-l-2 border-warn bg-ink-2 px-3 py-2 text-small text-fg" data-testid="calendar-world">
          <span className="mr-2 text-caption uppercase text-warn">{kindLabel(ev.kind)}</span>
          {headlineText(ev)}
        </p>
      )}

      {days.size === 0 && <p className="py-3 text-small text-fg-faint" data-testid="calendar-empty">{t('calendar.agenda.empty')}</p>}
      <div data-testid="calendar-next" className="flex flex-col gap-3">
      {[...days.entries()].map(([day, items]) => (
        <section key={day} className="border-t border-ink-2 pt-2" data-testid={`calendar-day-${day - today}`}>
          <header className="flex items-baseline justify-between gap-3">
            <span className="label">{whenText(day - today)}</span>
            <span className="num text-caption text-fg-faint">{t('calendar.day.number', { n: day + 1 })}</span>
          </header>
          <ul>
            {items.map((x, i) => {
              const earnings = x.kind === 'earnings' && x.assetId ? byAsset.get(x.assetId) : undefined;
              const c = earnings && earnings.consensus !== null ? consensusLabel(earnings.consensus) : null;
              const lean = c ? t(`calendar.lean.${c.lean.toLowerCase()}`) : null;
              const body = (
                <>
                  <span className="w-20 shrink-0 text-micro uppercase text-fg-faint">{t(`calendar.kind.${x.kind}`)}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{x.text}</span>
                  {c && lean && (
                    <Chip className={c.lean === 'Beat' ? 'border-gain/40 text-gain' : c.lean === 'Miss' ? 'border-loss/40 text-loss' : ''}>
                      {lean}{c.stars ? ` ${'★'.repeat(c.stars)}` : ''}
                    </Chip>
                  )}
                  {earnings?.rumor !== null && earnings?.rumor !== undefined && (
                    <Chip className="border-warn/50 text-warn">{t(earnings.rumor > 0 ? 'calendar.whisper.beat' : 'calendar.whisper.miss')}</Chip>
                  )}
                </>
              );
              return (
                <li key={x.key} className="border-t border-ink-2/60 first:border-t-0" data-testid={`calendar-item-${i}`}>
                  {x.kind === 'earnings' && x.assetId ? (
                    <button
                      type="button"
                      data-testid={`calendar-earnings-${x.assetId}`}
                      onClick={() => openFromShell('broker', { ticker: x.assetId })}
                      className="flex w-full items-center gap-3 py-2 text-left text-small hover:bg-ink-2"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 py-2 text-small">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}
