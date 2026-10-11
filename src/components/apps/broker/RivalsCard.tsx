'use client';

// The Rivals board (velvet-rivals-board.md, M12): the NPC funds by net worth, beside the player. Names and net worth only.
// Lives under the watchlist on the Broker (Market): a card that opens and shuts. A row opens its profile: name, mark, the
// flavour line, net worth, change since day one, the last quarter of net worth, and the days ahead or behind of the player.
// The rows carry what the engine's rivalsBoard gives and nothing about how a fund trades.
import { useState } from 'react';
import { money, signedPct, tone, toneText } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, Sparkline } from '@/components/ui';
import type { RivalRowView, RivalsBoardView } from '@/world/rivalsBoard';

/** The ampersand of the Hale & Ward mark (a constant, so the JSX has no string literal). */
const AMPERSAND = String.fromCharCode(38);

/** The monochrome mark of each fund, told apart by shape only (never a semantic colour). */
function Mark({ id }: { id: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ink-2" aria-hidden>
      {id === 'hale' && <span className="font-serif text-[20px] leading-none text-fg-muted">{AMPERSAND}</span>}
      {id === 'pinn' && (
        <svg width="28" height="28" viewBox="0 0 28 28" className="text-fg-muted">
          <circle cx="7" cy="20" r="2.2" fill="currentColor" />
          <circle cx="14" cy="14" r="2.2" fill="currentColor" />
          <circle cx="21" cy="8" r="2.2" fill="currentColor" />
        </svg>
      )}
      {id === 'vetch' && (
        <svg width="28" height="28" viewBox="0 0 28 28" className="text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M6 8 L11 21" />
          <path d="M17 12 L22 8" />
        </svg>
      )}
    </span>
  );
}

/** The flavour line: who the fund is, never how it trades. */
function flavour(id: string): string {
  return t(`rivals.flavour.${id}`);
}

/** Days the fund sat ahead of the player and behind, over the days both have a close (the last quarter). */
export function daysAheadBehind(chart: { day: number; equity: number }[], youDaily: { day: number; value: number }[]): { ahead: number; behind: number } {
  const you = new Map(youDaily.map((d) => [d.day, d.value]));
  let ahead = 0;
  let behind = 0;
  for (const c of chart) {
    const v = you.get(c.day);
    if (v === undefined) continue;
    if (c.equity > v) ahead++;
    else if (c.equity < v) behind++;
  }
  return { ahead, behind };
}

export function RivalsCard() {
  const board = useGame((s) => s.me?.rivals ?? null);
  const handle = useGame((s) => s.me?.player.handle ?? '');
  const youDaily = useGame((s) => s.nw?.daily ?? null);
  const [open, setOpen] = useState(true);
  const [profile, setProfile] = useState<string | null>(null);
  if (!board) return null;
  return (
    <Card className="mt-4 p-4" data-testid="rivals-board">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-title">{t('rivals.title')}</h2>
          <div className="label">{t('rivals.live')}</div>
        </div>
        <button
          type="button" className="rounded-sm px-2 py-1 text-caption text-fg-muted hover:text-fg" aria-expanded={open}
          data-testid="rivals-toggle" onClick={() => setOpen((o) => !o)}
        >
          {open ? t('rivals.hide') : t('rivals.show')}
        </button>
      </div>
      {open && (
        <ul className="mt-3">
          {mergedRows(board).map((row) => (
            row.kind === 'you' ? (
              <li key="you" className="flex items-center gap-3 border-l-2 border-brass py-2 pl-3" data-testid="you-row">
                <span className="num w-5 text-caption text-fg-faint">{board.you.rank}</span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-ink-2 font-serif text-brass" aria-hidden>{(handle[0] ?? '?').toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate">{t('rivals.you')}</span>
                <span className="num">{money(board.you.netWorth)}</span>
                <span className={`num w-16 text-right text-caption ${toneText[tone(board.you.sinceStart)]}`}>{signedPct(board.you.sinceStart)}</span>
              </li>
            ) : (
              <li key={row.r.id} className="border-t border-ink-2 py-2">
                <button
                  type="button" className="flex w-full items-center gap-3 text-left" data-testid={`rival-row-${row.r.id}`}
                  onClick={() => setProfile(row.r.id)} aria-label={t('rivals.open', { name: row.r.name })}
                >
                  <span className="num w-5 text-caption text-fg-faint">{row.r.rank}</span>
                  <Mark id={row.r.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.r.name}</span>
                    {board.nextUp?.id === row.r.id && (
                      <span className="mt-0.5 inline-block rounded-sm bg-ink-2 px-1.5 py-0.5 text-caption text-brass" data-testid="rival-next-up">
                        {t('rivals.nextUp', { gap: money(board.nextUp.gap) })}
                      </span>
                    )}
                  </span>
                  <Sparkline data={row.r.spark} width={56} height={20} className="text-fg-muted" />
                  <span className="flex flex-col items-end">
                    <span className="num">{money(row.r.equity)}</span>
                    <span className={`num text-caption ${toneText[tone(row.r.sinceStart)]}`}>{signedPct(row.r.sinceStart)}</span>
                  </span>
                </button>
              </li>
            )
          ))}
        </ul>
      )}
      {open && board.rows.length === 0 && <p className="text-small text-fg-faint">{t('rivals.none')}</p>}
      {profile && <RivalProfile board={board} id={profile} youDaily={youDaily ?? []} onClose={() => setProfile(null)} />}
    </Card>
  );
}

type Merged = { kind: 'rival'; r: RivalRowView } | { kind: 'you' };

/** The rivals and the player in one list, highest net worth first. The player's row sits where its rank puts it. */
function mergedRows(board: RivalsBoardView): Merged[] {
  const out: Merged[] = [];
  let placed = false;
  for (const r of board.rows) {
    if (!placed && board.you.netWorth >= r.equity) {
      out.push({ kind: 'you' });
      placed = true;
    }
    out.push({ kind: 'rival', r });
  }
  if (!placed) out.push({ kind: 'you' });
  return out;
}

function RivalProfile({ board, id, youDaily, onClose }: { board: RivalsBoardView; id: string; youDaily: { day: number; value: number }[]; onClose: () => void }) {
  const row = board.rows.find((r) => r.id === id);
  const chart = board.chart[id] ?? [];
  if (!row) return null;
  const { ahead, behind } = daysAheadBehind(chart, youDaily);
  return (
    <section className="mt-4 border-t border-ink-2 pt-4" data-testid="rival-profile" aria-label={row.name}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Mark id={row.id} />
          <div>
            <div className="font-serif text-title">{row.name}</div>
            <div className="text-small text-fg-muted">{flavour(row.id)}</div>
          </div>
        </div>
        <button type="button" className="rounded-sm px-2 py-1 text-caption text-fg-muted hover:text-fg" onClick={onClose}>{t('common.close')}</button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-small">
        <dt className="text-fg-muted">{t('rivals.profile.netWorth')}</dt>
        <dd className="num text-right">{money(row.equity)}</dd>
        <dt className="text-fg-muted">{t('rivals.profile.since')}</dt>
        <dd className={`num text-right ${toneText[tone(row.sinceStart)]}`}>{signedPct(row.sinceStart)}</dd>
        <dt className="text-fg-muted">{t('rivals.profile.days')}</dt>
        <dd className="num text-right" data-testid="rival-days">{t('rivals.profile.daysValue', { ahead, behind })}</dd>
      </dl>
      <div className="label mt-3">{t('rivals.profile.chart')}</div>
      <div className="mt-1">
        <Sparkline data={chart.map((c) => c.equity)} width={280} height={56} className="text-fg-muted" />
      </div>
    </section>
  );
}
