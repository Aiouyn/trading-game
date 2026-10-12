'use client';

// The published trade logs (6D.6, N8): one seed of each top-three entry that opted in, published when the week settles. Each
// log opens to its fills, the first 200 rows. Nothing here exists before the settlement, and only a published log is listed.
import { useState } from 'react';
import { clockParts } from '@/game/clock';
import { hasKey, t } from '@/i18n';
import { TPD } from '@/world/core';
import type { TradeLogRecord } from '@/world/types';
import { dec } from '@/game/format';

export const TRADE_LOG_ROWS = 200;

export interface PublishedLog {
  handle: string;
  seed: string;
  trades: TradeLogRecord[];
}

export function TradeLogViewer({ logs }: { logs: PublishedLog[] }) {
  if (logs.length === 0) return <p className="text-caption text-fg-faint" data-testid="trade-logs-none">{t('sixd.tn.logs.none')}</p>;
  return (
    <section aria-labelledby="trade-logs-title" className="flex flex-col gap-2" data-testid="trade-logs">
      <h3 id="trade-logs-title" className="label">{t('sixd.tn.logs.title')}</h3>
      {logs.map((log, i) => <TradeLogRow key={`${log.handle}-${log.seed}`} log={log} index={i} />)}
    </section>
  );
}

function TradeLogRow({ log, index }: { log: PublishedLog; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-ink-3" data-testid={`trade-log-${index}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full items-center justify-between gap-2 px-3 py-2 text-left text-small"
        data-testid={`trade-log-toggle-${index}`}
      >
        <span className="min-w-0 truncate">{t('sixd.tn.logs.summary', { handle: log.handle, seed: log.seed.slice(0, 8), count: log.trades.length })}</span>
        <span aria-hidden className="text-fg-faint">{open ? '−' : '+'}</span>
      </button>
      {open && <TradeLogTable trades={log.trades} index={index} />}
    </div>
  );
}

/** The fills of one log, the first TRADE_LOG_ROWS of them, with a note of how many more the log holds. */
export function TradeLogTable({ trades, index }: { trades: TradeLogRecord[]; index: number }) {
  const shown = trades.slice(0, TRADE_LOG_ROWS);
  return (
    <div className="overflow-x-auto px-3 pb-3">
      <table className="num w-full text-caption" data-testid={`trade-log-table-${index}`}>
        <thead>
          <tr className="text-fg-faint">
            <th scope="col" className="text-left font-normal">{t('sixd.tn.logs.day')}</th>
            <th scope="col" className="text-left font-normal">{t('sixd.tn.logs.asset')}</th>
            <th scope="col" className="text-left font-normal">{t('sixd.tn.logs.side')}</th>
            <th scope="col" className="text-right font-normal">{t('sixd.tn.logs.qty')}</th>
            <th scope="col" className="text-right font-normal">{t('sixd.tn.logs.price')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((tr, k) => (
            <tr key={k} className="text-fg" data-testid="trade-log-row">
              <td>{clockParts(tr.tick, TPD).day}</td>
              <td>{tr.assetId}</td>
              <td>{hasKey(`sixd.tn.logs.side.${tr.side}`) ? t(`sixd.tn.logs.side.${tr.side}`) : tr.side}</td>
              <td className="text-right">{tr.qty}</td>
              <td className="text-right">{dec(tr.price, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length > TRADE_LOG_ROWS && (
        <p className="mt-2 text-caption text-fg-faint" data-testid={`trade-log-more-${index}`}>{t('sixd.tn.logs.more', { shown: TRADE_LOG_ROWS, count: trades.length })}</p>
      )}
    </div>
  );
}
