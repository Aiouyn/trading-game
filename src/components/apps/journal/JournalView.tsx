'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { JOURNAL } from '@/content/learning';
import { money, assetPrice, qty as qtyText, signedMoney, signedPct, toneText, tone } from '@/game/format';
import { useGame, assetDefOf } from '@/game/store';
import { t, tm } from '@/i18n';
import { Button, Card, Segmented, Td, Th } from '@/components/ui';
import type { JournalDetail } from '@/world/journal';
import { EXPLAIN_ROWS, type RoundTrip } from '@/engine';
import { Waterfall, type WaterfallRow } from '../analyst/Waterfall';
import { Replay } from './Replay';

/**
 * The journal (velvet-trade-journal-replay.md): the closed round trips, newest first. A row shows the trade, its realized P&L
 * and the one line from the engine's explanation; with an analyst, a thin bar split by part size. A tap opens the detail:
 * the replay, the sentence, and (with an analyst) the waterfall, Senior's headlines and flow by pool. Nothing here is a
 * number the screen adds up: the rows and totals come from the server, already in the screen order (EXPLAIN_ROWS, then fees).
 */

const EVEN_BELOW = 1;
/** the waterfall's rows the screen can label (the server's order: the engine's explanation rows, then fees) */
const WHY_ROW_ORDER: readonly string[] = [...EXPLAIN_ROWS, 'fees'];

/** A cache key for one trade's detail: it changes when the closed days or the analyst change (the line and the parts depend on them). */
function detailKey(id: string, version: string): string {
  return `${id}|${version}`;
}

type SideFilter = 'all' | 'long' | 'short';
type ResultFilter = 'all' | 'win' | 'loss';

export function JournalView({ onHire }: { onHire: () => void }) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const tpd = useGame((s) => s.config.ticksPerDay);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  // the details are cached by trade and version (state, so a resolved fetch re-renders the list)
  const [details, setDetails] = useState<Record<string, JournalDetail>>({});
  const seen = useRef(new Set<string>());
  // a failed detail is asked for again after a second, up to five times (a dropped request would otherwise wait for the next trade)
  const [retry, setRetry] = useState(0);
  const tries = useRef(new Map<string, number>());

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
        else {
          const n = (tries.current.get(key) ?? 0) + 1;
          tries.current.set(key, n);
          if (n <= 5) {
            seen.current.delete(key);
            setTimeout(() => setRetry((x) => x + 1), 1000);
          }
        }
      });
    }
  }, [trips, version, act, retry]);

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

  // the rows the filters keep (the listed round trips are the newest JOURNAL.listRows)
  const shown = trips.filter((tr) => (sideFilter === 'all' || tr.side === sideFilter)
    && (resultFilter === 'all' || (resultFilter === 'win' ? tr.realizedPnl >= EVEN_BELOW : tr.realizedPnl <= -EVEN_BELOW)));
  const net = shown.reduce((sum, tr) => sum + tr.realizedPnl, 0);
  const wins = shown.filter((tr) => tr.realizedPnl >= EVEN_BELOW).length;

  return (
    <section className="flex flex-col gap-3" data-testid="journal">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="label">{t('journal.title')}</p>
          <p className="text-caption text-fg-faint" data-testid="journal-summary">
            {t('journal.summary', { count: shown.length, pnl: signedMoney(net), wins })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented<SideFilter> label={t('journal.filter.side')} size="sm" value={sideFilter} onChange={setSideFilter}
            options={[
              { value: 'all', label: t('journal.filter.all'), testId: 'journal-side-all' },
              { value: 'long', label: t('journal.side.long'), testId: 'journal-side-long' },
              { value: 'short', label: t('journal.side.short'), testId: 'journal-side-short' },
            ]} />
          <Segmented<ResultFilter> label={t('journal.filter.result')} size="sm" value={resultFilter} onChange={setResultFilter}
            options={[
              { value: 'all', label: t('journal.filter.all'), testId: 'journal-result-all' },
              { value: 'win', label: t('journal.filter.win'), testId: 'journal-result-win' },
              { value: 'loss', label: t('journal.filter.loss'), testId: 'journal-result-loss' },
            ]} />
        </div>
      </header>
      {trips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-3 p-4" data-testid="journal-empty">
          <p className="text-small text-fg">{t('journal.empty')}</p>
          <p className="mt-1 text-caption text-fg-faint">{t('journal.emptyHow')}</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-small text-fg-muted" data-testid="journal-nomatch">{t('journal.nomatch')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-3 bg-ink-1">
          <table className="w-full text-small" data-testid="journal-table">
            <thead>
              <tr>
                <Th>{t('journal.col.asset')}</Th>
                <Th>{t('journal.col.side')}</Th>
                <Th right>{t('journal.col.qty')}</Th>
                <Th right>{t('journal.col.entry')}</Th>
                <Th right>{t('journal.col.exit')}</Th>
                <Th right>{t('journal.col.move')}</Th>
                <Th right>{t('journal.col.pnl')}</Th>
                <Th right>{t('journal.col.fees')}</Th>
                <Th right>{t('journal.col.held')}</Th>
                <Th>{t('journal.col.notes')}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((trip) => (
                <JournalRowLine key={trip.id} trip={trip} tpd={tpd} onOpen={() => setOpenId(trip.id)} />
              ))}
            </tbody>
          </table>
        </div>
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

/** One round trip as a log row: entry, exit, size, the price move, P&L after fees, fees, hold time and how it closed. */
function JournalRowLine({ trip, tpd, onOpen }: { trip: RoundTrip; tpd: number; onOpen: () => void }) {
  const even = Math.abs(trip.realizedPnl) < EVEN_BELOW;
  const side = trip.side === 'long' ? t('journal.side.long') : t('journal.side.short');
  const move = trip.avgEntry > 0 ? trip.avgExit / trip.avgEntry - 1 : 0;
  return (
    <tr className="border-t border-ink-2 hover:bg-ink-2" data-testid={`journal-row-${trip.id}`} onClick={onOpen}>
      <Td>
        <button type="button" onClick={onOpen} className="font-semibold text-fg hover:underline" data-testid={`journal-open-${trip.id}`}>{trip.assetId}</button>
      </Td>
      <Td className="text-fg-muted">{side}</Td>
      <Td right num>{qtyText(trip.qty)}</Td>
      <Td right num>{assetPrice(assetDefOf(trip.assetId) ?? { assetClass: 'stock' }, trip.avgEntry)}</Td>
      <Td right num>{assetPrice(assetDefOf(trip.assetId) ?? { assetClass: 'stock' }, trip.avgExit)}</Td>
      <Td right num className={toneText[tone(move)]}>{signedPct(move)}</Td>
      <Td right num className={even ? 'text-fg-muted' : toneText[tone(trip.realizedPnl)]}>
        <span data-testid={`journal-pnl-${trip.id}`}>{even ? t('journal.even') : signedMoney(trip.realizedPnl)}</span>
      </Td>
      <Td right num className="text-fg-muted">{money(trip.feesPaid)}</Td>
      <Td right num className="text-fg-muted">{t('journal.held', { count: heldDays(trip, tpd) })}</Td>
      <Td className="text-fg-muted">{t('journal.closedBy', { reason: t(`journal.reason.${trip.closeReason}`) })}</Td>
    </tr>
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
    ? detail.rows.filter((r) => WHY_ROW_ORDER.includes(r.row)).map((r) => ({
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
          {/* the waterfall is in dollars, so GX is given as its percent move over the same days (the desk's line) */}
          {detail.gx !== null && <p className="num text-small text-fg-muted" data-testid="journal-gx">{t('desk.gx', { pct: signedPct(detail.gx) })}</p>}
          <Waterfall
            rows={waterfall}
            total={detail.total ?? trip.realizedPnl}
            totalLabel={t('why.total')}
            format={signedMoney}
            testId="why-waterfall"
            note={waterfall.some((r) => r.key === 'market') ? t('why.market.note') : undefined}
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
                  <span className="text-fg">{tm(h.msg, h.text)}</span>
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
