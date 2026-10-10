'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { JOURNAL } from '@/content/learning';
import { signedMoney, toneText, tone } from '@/game/format';
import { useGame } from '@/game/store';
import { t, tm } from '@/i18n';
import { Button, Card } from '@/components/ui';
import type { JournalDetail, JournalRow } from '@/world/journal';
import type { RoundTrip } from '@/engine';
import { Waterfall, type WaterfallRow } from '../analyst/Waterfall';
import { Replay } from './Replay';

/**
 * The journal (velvet-trade-journal-replay.md): the closed round trips, newest first. A row shows the trade, its realized P&L
 * and the one line from the engine's explanation; with an analyst, a thin bar split by part size. A tap opens the detail:
 * the replay, the sentence, and (with an analyst) the waterfall, Senior's headlines and flow by pool. Nothing here is a
 * number the screen adds up: the rows and totals come from the server.
 */

const EVEN_BELOW = 1;
const WHY_ROW_ORDER = ['market', 'sector', 'news', 'event', 'company', 'flow', 'players', 'you', 'fees'] as const;

/** A cache key for one trade's detail: it changes when the closed days or the analyst change (the line and the parts depend on them). */
function detailKey(id: string, version: string): string {
  return `${id}|${version}`;
}

export function JournalView({ onHire }: { onHire: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const tpd = useGame((s) => s.config.ticksPerDay);
  const [openId, setOpenId] = useState<string | null>(null);
  // the details are cached by trade and version (state, so a resolved fetch re-renders the list)
  const [details, setDetails] = useState<Record<string, JournalDetail>>({});
  const seen = useRef(new Set<string>());

  const trips = useMemo(() => me.trading.trips.slice().reverse().slice(0, JOURNAL.listRows), [me.trading.trips]);
  const version = `${me.trading.desk.lastClosed ?? 'none'}|${me.player.analyst?.tier ?? 'none'}`;

  // fetch the visible rows' details (the sentence and, with an analyst, the parts); a new closed day or analyst refetches them
  useEffect(() => {
    for (const trip of trips) {
      const key = detailKey(trip.id, version);
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      void act({ type: 'journal.detail', tripId: trip.id }, { silent: true }).then((r) => {
        if (r.ok && r.data) setDetails((prev) => ({ ...prev, [key]: r.data as JournalDetail }));
        else seen.current.delete(key);
      });
    }
  }, [trips, version, act]);

  if (openId !== null) {
    const trip = me.trading.trips.find((x) => x.id === openId);
    const detail = details[detailKey(openId, version)];
    return (
      <div className="flex flex-col gap-4" data-testid="journal-detail-view">
        <Button size="sm" variant="ghost" onClick={() => setOpenId(null)} testId="journal-back">{t('journal.back')}</Button>
        {trip && <TradeDetail trip={trip} detail={detail} tpd={tpd} onHire={onHire} />}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3" data-testid="journal">
      <header className="flex flex-col gap-0.5">
        <h2 className="font-serif text-title text-fg">{t('journal.title')}</h2>
        <p className="text-small text-fg-faint">{t('journal.sub')}</p>
      </header>
      {trips.length === 0 ? (
        <p className="text-small text-fg-muted" data-testid="journal-empty">{t('journal.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-2 overflow-hidden rounded-lg border border-ink-3 bg-ink-1">
          {trips.map((trip) => (
            <li key={trip.id}>
              <JournalRowButton trip={trip} detail={details[detailKey(trip.id, version)]} tpd={tpd} onOpen={() => setOpenId(trip.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function heldDays(trip: RoundTrip, tpd: number): number {
  return Math.max(0, Math.floor((trip.closeTick - 1) / tpd) - Math.floor((trip.openTick - 1) / tpd));
}

function dayOf(tick: number, tpd: number): number {
  return Math.floor((tick - 1) / tpd);
}

function JournalRowButton({ trip, detail, tpd, onOpen }: { trip: RoundTrip; detail: JournalDetail | undefined; tpd: number; onOpen: () => void }) {
  const even = Math.abs(trip.realizedPnl) < EVEN_BELOW;
  const side = trip.side === 'long' ? t('journal.side.long') : t('journal.side.short');
  const held = t('journal.held', { count: heldDays(trip, tpd) });
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-ink-2" data-testid={`journal-row-${trip.id}`}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2 truncate">
          <span className="font-semibold text-fg">{trip.assetId}</span>
          <span className="truncate text-small text-fg-muted">{side} · {held}</span>
        </span>
        <span className={`num shrink-0 text-small ${even ? 'text-fg-muted' : toneText[tone(trip.realizedPnl)]}`}>
          {even ? t('journal.even') : signedMoney(trip.realizedPnl)}
        </span>
      </span>
      {detail && (
        <span className="truncate text-small text-fg-muted" data-testid="explain-line">{tm(detail.line)}</span>
      )}
      {detail?.rows && detail.rows.length > 0 && <AttributionBar rows={detail.rows} />}
    </button>
  );
}

/** A 4 px bar split by part size: gain parts at 70% gain, loss parts at 70% loss, fees faint. Widths only; no labels. */
function AttributionBar({ rows }: { rows: JournalRow[] }) {
  const sizes = rows.map((r) => Math.abs(r.value));
  const all = sizes.reduce((s, x) => s + x, 0);
  if (all === 0) return null;
  return (
    <span className="flex h-1 w-full overflow-hidden rounded-chip" aria-hidden data-testid="attribution-bar">
      {rows.map((r, i) => (
        <span
          key={r.row}
          className={r.row === 'fees' ? 'bg-fg-faint' : r.value >= 0 ? 'bg-gain/70' : 'bg-loss/70'}
          style={{ width: `${(sizes[i]! / all) * 100}%` }}
        />
      ))}
    </span>
  );
}

function TradeDetail({ trip, detail, tpd, onHire }: { trip: RoundTrip; detail: JournalDetail | undefined; tpd: number; onHire: () => void }) {
  const even = Math.abs(trip.realizedPnl) < EVEN_BELOW;
  const openDay = dayOf(trip.openTick, tpd);
  const closeDay = dayOf(trip.closeTick, tpd);
  const side = trip.side === 'long' ? t('journal.side.long') : t('journal.side.short');
  const held = t('journal.held', { count: closeDay - openDay });
  const bought = t('journal.bought', { day: openDay });
  const closedBy = t('journal.closedBy', { reason: `@journal.reason.${trip.closeReason}` });
  const sold = t('journal.sold', { day: closeDay });
  const waterfall: WaterfallRow[] = detail?.rows
    ? detail.rows.filter((r) => WHY_ROW_ORDER.includes(r.row as (typeof WHY_ROW_ORDER)[number])).map((r) => ({
      key: r.row, label: t(`why.${r.row}`), value: r.value,
    }))
    : [];
  return (
    <div className="flex flex-col gap-4" data-testid="journal-detail">
      <header className="flex flex-col gap-1">
        <span className="text-small text-fg-muted">{trip.assetId} · {side} · {held}</span>
        <span className="text-caption text-fg-faint">{bought} · {sold}</span>
        <span className="text-caption text-fg-faint" data-testid="journal-closed-by">{closedBy}</span>
        <span className={`num font-serif text-title ${even ? 'text-fg-muted' : toneText[tone(trip.realizedPnl)]}`} data-testid="journal-realized">
          {even ? t('journal.even') : signedMoney(trip.realizedPnl)}
        </span>
      </header>
      {detail?.replay ? (
        <Replay replay={detail.replay} pins={detail.headlines ?? []} />
      ) : (
        <p className="text-small text-fg-faint">{t('journal.replay.none')}</p>
      )}
      {detail && (
        <p className="font-serif text-title text-fg" data-testid="explain-line">{tm(detail.line)}</p>
      )}
      {detail?.analyst && detail.rows ? (
        <Card className="flex flex-col gap-3 p-4">
          <h3 className="font-serif text-title text-fg">{t('journal.why')}</h3>
          <Waterfall
            rows={waterfall}
            total={detail.total ?? trip.realizedPnl}
            totalLabel={t('why.total')}
            format={signedMoney}
            testId="why-waterfall"
          />
          {detail.analyst === 'senior' && detail.flow && (
            <div className="flex flex-col gap-1" data-testid="why-flow">
              <span className="text-caption text-fg-faint">{t('journal.flow')}</span>
              {detail.flow.map((f) => (
                <div key={f.pool} className="flex items-baseline justify-between gap-3 text-small" data-testid={`why-flow-${f.pool}`}>
                  <span className="text-fg-muted">{t(`desk.pool.${f.pool}`)}</span>
                  <span className={`num ${f.value >= 0 ? 'text-gain' : 'text-loss'}`}>{signedMoney(f.value)}</span>
                </div>
              ))}
            </div>
          )}
          {detail.analyst === 'senior' && detail.headlines && (
            <ul className="flex flex-col gap-1">
              <span className="text-caption text-fg-faint">{t('journal.headlines')}</span>
              {detail.headlines.map((h, i) => (
                <li key={`${h.day}-${i}`} className="flex gap-3 text-small" data-testid="why-news-item">
                  <span className="num shrink-0 text-fg-faint">{t('desk.day', { day: h.day })}</span>
                  <span className="text-fg">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Button variant="outline" size="md" className="w-full justify-between" onClick={onHire} testId="analyst-row">
          <span>{t('journal.hire')}</span>
        </Button>
      )}
    </div>
  );
}
