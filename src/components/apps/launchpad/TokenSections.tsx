'use client';

// The token page's public sections (R-10-6, Phase 10): the trades table (an anonymous trader id, the creator marked, buy or sell, the
// dollars, the token amount, the price, the time), the holder distribution (the top 20 by tokens, anonymous ids, the curve, the dev, the
// NPC cohort and the viewer marked), and the replies thread (players post up to 140 characters through the moderator; NPC replies from
// the text layer's templates under fictional handles). No handle of a player is ever shown here, except the creator's own name on the
// page header.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, TextField, ticksLabel } from '@/components/ui';
import { LP } from '@/world/launchpad/constants';
import { moderateText } from '@/world/launchpad/moderate';
import type { LpHolder, LpPage, LpTape } from '@/world/launchpad/view';
import { lpPrice, refusalOf, refusalCopy, replyRefusalCode, tokens as fmtTokens, type RefusalCopy } from './copy';
import { RefusalBox, Section } from './Shared';

/** The public trades table, newest first. A line with no anonymous id is NPC flow, shown as retail flow. */
export function TradesTable({ tape, tick }: { tape: LpTape[]; tick: number }) {
  if (tape.length === 0) return <p className="text-small text-fg-muted" data-testid="lp-tape-empty">{t('lp.page.tapeEmpty')}</p>;
  return (
    <div data-testid="lp-tape">
      <table className="w-full border-collapse text-small" data-testid="lp-tape-rows">
        <thead>
          <tr className="border-b border-ink-2 text-left text-caption text-fg-faint">
            <th className="py-1.5 pr-3 font-normal">{t('lp.trades.time')}</th>
            <th className="hidden py-1.5 pr-3 font-normal @md:table-cell">{t('lp.trades.trader')}</th>
            <th className="py-1.5 pr-3 font-normal">{t('lp.trades.side')}</th>
            <th className="py-1.5 pr-3 text-right font-normal">{t('lp.trades.usd')}</th>
            <th className="hidden py-1.5 pr-3 text-right font-normal @md:table-cell">{t('lp.trades.tokens')}</th>
            <th className="hidden py-1.5 text-right font-normal @md:table-cell">{t('lp.trades.price')}</th>
          </tr>
        </thead>
        <tbody>
          {[...tape].reverse().map((r, i) => (
            <tr key={`${r.tick}-${i}`} className="border-b border-ink-2 last:border-0" data-testid="lp-tape-row">
              <td className="whitespace-nowrap py-1.5 pr-3 text-fg-muted">{tick - r.tick > 0 ? t('lp.tape.ago', { when: ticksLabel(tick - r.tick) }) : t('lp.tape.now')}</td>
              <td className="hidden whitespace-nowrap py-1.5 pr-3 @md:table-cell">
                {r.anon ? (
                  <span className="num text-fg-muted">{r.anon}</span>
                ) : (
                  <span className="text-caption text-fg-faint">{t('lp.tape.flow')}</span>
                )}
                {r.creator && (
                  <span className="ml-2 rounded-chip border border-steel/50 px-1.5 py-px text-micro uppercase tracking-wide text-steel" data-testid="lp-tape-creator">
                    {t('lp.tape.creator')}
                  </span>
                )}
              </td>
              <td className={`whitespace-nowrap py-1.5 pr-3 ${r.side === 'buy' ? 'text-gain' : 'text-loss'}`}>{t(r.side === 'buy' ? 'lp.side.buy' : 'lp.side.sell')}</td>
              <td className="num whitespace-nowrap py-1.5 pr-3 text-right text-fg" data-testid="lp-tape-usd">{money(r.usd)}</td>
              <td className="num hidden whitespace-nowrap py-1.5 pr-3 text-right text-fg-muted @md:table-cell">{fmtTokens(r.qty)}</td>
              <td className="num hidden whitespace-nowrap py-1.5 text-right text-fg-muted @md:table-cell">{lpPrice(r.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The holder distribution: the top rows, each with its anonymous id, its role and its share of the supply. */
export function HolderList({ holders }: { holders: LpHolder[] }) {
  if (holders.length === 0) return <p className="text-small text-fg-muted" data-testid="lp-holders-empty">{t('lp.holders.none')}</p>;
  const most = Math.max(...holders.map((h) => h.share), Number.MIN_VALUE);
  return (
    <ol className="flex flex-col divide-y divide-ink-2" data-testid="lp-holder-rows">
      {holders.map((h, i) => (
        <li key={`${h.anon}-${i}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 py-1.5 text-small" data-testid="lp-holder-row" data-role={h.role}>
          <span className="num text-caption text-fg-faint">{i + 1}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="num text-fg-muted">{h.anon}</span>
            {h.role !== 'holder' && (
              <span className={`rounded-chip border px-1.5 py-px text-micro uppercase tracking-wide ${h.role === 'curve' ? 'border-brass/50 text-brass' : h.role === 'dev' ? 'border-steel/50 text-steel' : h.role === 'npc' ? 'border-fg-faint/50 text-fg-faint' : 'border-gain/50 text-gain'}`} data-testid={`lp-holder-role-${h.role}`}>
                {t(`lp.holders.role.${h.role}`)}
              </span>
            )}
            <span className="relative hidden h-1.5 w-24 overflow-hidden rounded bg-ink-2 @md:block" aria-hidden>
              <span className="absolute inset-y-0 left-0 bg-brass/60" style={{ width: `${Math.max(2, (h.share / most) * 100)}%` }} />
            </span>
          </span>
          <span className="text-right">
            <span className="num block whitespace-nowrap text-fg">{pct(h.share)}</span>
            <span className="num block whitespace-nowrap text-caption text-fg-faint">{fmtTokens(h.qty)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The replies thread: the newest last, then the form (one reply a real minute, 140 characters, moderated before it is sent). */
export function Replies({ page, tick, onPosted }: { page: LpPage; tick: number; onPosted: () => void }) {
  const act = useGame((s) => s.act);
  const [text, setText] = useState('');
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState(false);
  const mod = text.trim() === '' ? null : moderateText(text, LP.REPLY_MAX);
  const local = mod && !mod.ok ? refusalCopy(replyRefusalCode(mod.reason), { max: LP.REPLY_MAX }) : null;
  const post = async () => {
    setRefusal(null);
    setSent(false);
    const r = await act({ type: 'lp.reply', ticker: page.ticker, text: text.trim() }, { silent: true });
    if (r.ok) {
      setText('');
      setSent(true);
      onPosted();
    } else setRefusal(refusalOf(r.data, r.error ? undefined : 'unknown'));
  };
  return (
    <Section title={t('lp.page.replies', { n: page.replies })} testId="lp-replies-section">
      {page.thread.length === 0 ? (
        <p className="text-small text-fg-muted" data-testid="lp-replies-empty">{t('lp.replies.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="lp-replies">
          {[...page.thread].reverse().map((r, i) => (
            <li key={`${r.tick}-${i}`} className="rounded-md border border-ink-2 p-2.5" data-testid="lp-reply" data-role={r.role}>
              <div className="flex flex-wrap items-center gap-2 text-caption text-fg-faint">
                <span className={r.role === 'npc' ? 'text-fg-muted' : 'num text-fg-muted'} data-testid="lp-reply-who">{r.who}</span>
                {r.role === 'creator' && (
                  <span className="rounded-chip border border-steel/50 px-1.5 py-px text-micro uppercase tracking-wide text-steel" data-testid="lp-reply-creator">{t('lp.replies.creator')}</span>
                )}
                <span>{tick - r.tick > 0 ? t('lp.tape.ago', { when: ticksLabel(tick - r.tick) }) : t('lp.tape.now')}</span>
              </div>
              <p className="mt-1 break-words text-small text-fg" data-testid="lp-reply-text">
                {r.role === 'npc' && r.key ? t(r.key, r.vars ?? {}) : r.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <TextField value={text} onChange={(v) => { setText(v); setRefusal(null); setSent(false); }} placeholder={t('lp.replies.placeholder')} label={t('lp.replies.label')} maxLength={LP.REPLY_MAX} testId="lp-reply-input" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption text-fg-faint" data-testid="lp-reply-count">{t('lp.replies.count', { n: [...text].length, max: LP.REPLY_MAX })}</span>
          <Button size="sm" variant="brass" disabled={text.trim() === '' || local !== null} testId="lp-reply-post" onClick={post}>{t('lp.replies.post')}</Button>
        </div>
        {local && <RefusalBox copy={local} testId="lp-reply-local" />}
        {refusal && <RefusalBox copy={refusal} testId="lp-reply-refusal" />}
        {sent && <p role="status" className="text-caption text-gain" data-testid="lp-reply-sent">{t('lp.replies.sent')}</p>}
      </div>
    </Section>
  );
}
