'use client';

// The buy and sell ticket on the curve. The fill preview is the world's own quote (quoteBuy and quoteSell, the same math the
// world runs), so the figures match the fill. A fill the max slippage would refuse is refused here, before it is sent, in the
// three-part copy; the world refuses it again on the command. Every refusal shows inline, next to the ticket.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, NumberField } from '@/components/ui';
import { LP } from '@/world/launchpad/constants';
import { quoteBuy, quoteSell } from '@/world/launchpad/curve';
import type { LpPage } from '@/world/launchpad/view';
import { centsFromDollars, curveYOf, lpPrice, refusalCopy, refusalOf, tokens as fmtTokens, type RefusalCopy } from './copy';
import { Fact, RefusalBox } from './Shared';

type Side = 'buy' | 'sell';

interface Figures {
  receive: string;
  pay: string;
  avg: string;
  impact: string;
  fee: string;
  graduates: boolean;
}

interface Preview {
  /** the refusal the fill would get, found before it is sent (null when the fill goes through) */
  refusal: RefusalCopy | null;
  /** the fill's figures, when the fill goes through */
  figures: Figures | null;
}

/** A fraction as a percent with one decimal: the world's wording for a slippage refusal. */
const oneDp = (f: number) => `${(f * 100).toFixed(1)}%`;

/** A dead token takes no buys (the world refuses them), so its ticket is sell-only: the curve still pays sellers. */
export function Ticket({ page, held, locked, dead = false }: { page: LpPage; held: number; locked: number; dead?: boolean }) {
  const act = useGame((s) => s.act);
  const [side, setSide] = useState<Side>(dead ? 'sell' : 'buy');
  const [spend, setSpend] = useState('100');
  const [sell, setSell] = useState('');
  const [slipText, setSlipText] = useState(String(LP.MAX_SLIP * 100));
  const [sent, setSent] = useState<string | null>(null);
  // a refusal from the world is kept with the inputs it was sent with: an edit makes it stale, so it is no longer shown
  const [sentRefusal, setSentRefusal] = useState<{ key: string; copy: RefusalCopy } | null>(null);

  const ticker = page.ticker;
  const y = curveYOf(page.progress);
  const slip = Number(slipText) / 100;
  const slipValid = Number.isFinite(slip) && slip > 0 && slip <= 0.5;
  const available = Math.max(0, held - locked);
  const pre = side === 'buy'
    ? buyPreview(y, ticker, spend, slip, slipValid)
    : sellPreview(y, ticker, sell, slip, slipValid, held, locked, page.vesting.endDay);
  const inputsKey = [side, spend, sell, slipText].join('|');
  const refusal = pre.refusal ?? (sentRefusal && sentRefusal.key === inputsKey ? sentRefusal.copy : null);

  const submit = async () => {
    setSent(null);
    setSentRefusal(null);
    if (side === 'buy') {
      const cents = centsFromDollars(spend);
      if (cents === null || !slipValid) return;
      const r = await act({ type: 'lp.buy', ticker, spendCents: cents, maxSlip: slip }, { silent: true });
      if (r.ok) {
        const d = (r.data ?? {}) as { tokens?: number };
        setSent(t('lp.ticket.sent.buy', { tokens: fmtTokens(d.tokens ?? 0), ticker }));
        setSpend('100');
      } else setSentRefusal({ key: inputsKey, copy: refusalOf(r.data, r.error ? undefined : 'unknown') });
      return;
    }
    const n = Number(sell);
    if (!Number.isInteger(n) || n <= 0 || !slipValid) return;
    const r = await act({ type: 'lp.sell', ticker, tokens: n, maxSlip: slip }, { silent: true });
    if (r.ok) {
      const d = (r.data ?? {}) as { netCents?: number };
      setSent(t('lp.ticket.sent.sell', { tokens: fmtTokens(n), ticker, amount: money((d.netCents ?? 0) / 100) }));
      setSell('');
    } else setSentRefusal({ key: inputsKey, copy: refusalOf(r.data, r.error ? undefined : 'unknown') });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="lp-ticket">
      <div role="group" aria-label={t('lp.ticket.side')} className={`grid gap-2 ${dead ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {(dead ? (['sell'] as const) : (['buy', 'sell'] as const)).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            data-testid={`lp-ticket-${s}`}
            onClick={() => { setSide(s); setSent(null); setSentRefusal(null); }}
            className={`h-10 rounded-md border text-small font-medium ${side === s ? (s === 'buy' ? 'border-gain/60 bg-gain/10 text-fg' : 'border-loss/60 bg-loss/10 text-fg') : 'border-ink-3 text-fg-muted hover:text-fg'}`}
          >
            {t(s === 'buy' ? 'lp.ticket.buy' : 'lp.ticket.sell')}
          </button>
        ))}
      </div>

      {side === 'buy' && !dead ? (
        <NumberField value={spend} onChange={setSpend} label={t('lp.ticket.spend')} suffix="$" min={0} step={1} testId="lp-spend" />
      ) : (
        <div className="flex flex-col gap-2">
          <NumberField value={sell} onChange={setSell} label={t('lp.ticket.tokens')} suffix={t('lp.ticket.tokensSuffix')} min={0} step={1} testId="lp-sell-qty" />
          <div className="flex flex-wrap items-center gap-2">
            {[0.25, 0.5, 1].map((f) => (
              <Button key={f} size="sm" variant="quiet" testId={`lp-sell-${f * 100}`} onClick={() => setSell(String(Math.floor(available * f)))}>
                {f === 1 ? t('lp.ticket.max') : pct(f)}
              </Button>
            ))}
            <span className="text-caption text-fg-faint" data-testid="lp-available">
              {t('lp.ticket.available', { qty: fmtTokens(available), locked: fmtTokens(Math.min(locked, held)) })}
            </span>
          </div>
        </div>
      )}

      <NumberField value={slipText} onChange={setSlipText} label={t('lp.ticket.maxSlip')} suffix="%" min={0} step={0.1} testId="lp-slip" />

      {pre.figures && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-ink-2 p-3" data-testid="lp-preview">
          <Fact label={t('lp.ticket.receive')} value={pre.figures.receive} testId="lp-preview-receive" />
          <Fact label={t('lp.ticket.pay')} value={pre.figures.pay} testId="lp-preview-pay" />
          <Fact label={t('lp.ticket.avg')} value={pre.figures.avg} testId="lp-preview-avg" />
          <Fact label={t('lp.ticket.impact')} value={pre.figures.impact} testId="lp-preview-impact" />
          <Fact label={t('lp.ticket.fee')} value={pre.figures.fee} testId="lp-preview-fee" />
          {pre.figures.graduates && <p className="col-span-2 text-caption text-brass" data-testid="lp-preview-grad">{t('lp.ticket.graduates')}</p>}
        </div>
      )}

      {refusal && <RefusalBox copy={refusal} testId="lp-ticket-refusal" />}
      {sent && <p role="status" className="text-small text-gain" data-testid="lp-ticket-sent">{sent}</p>}

      <Button variant={side === 'buy' ? 'brass' : 'outline'} disabled={pre.figures === null} testId="lp-submit" onClick={submit}>
        {t(side === 'buy' ? 'lp.ticket.submit.buy' : 'lp.ticket.submit.sell', { ticker })}
      </Button>
      <p className="text-caption text-fg-faint">{t('lp.ticket.feeNote')}</p>
    </div>
  );
}

function buyPreview(y: number, ticker: string, spendText: string, slip: number, slipValid: boolean): Preview {
  if (!slipValid) return { refusal: refusalCopy('maxSlip'), figures: null };
  const cents = centsFromDollars(spendText);
  if (cents === null) return { refusal: refusalCopy('zero', { ticker }), figures: null };
  const q = quoteBuy(y, cents);
  if (!q.ok) return { refusal: refusalCopy(q.code, { ticker }), figures: null };
  if (q.slippage > slip) return { refusal: refusalCopy('slippage', { slip: oneDp(q.slippage), max: oneDp(slip) }), figures: null };
  return {
    refusal: null,
    figures: {
      receive: `${fmtTokens(q.tokens)}`, pay: money(q.spendCents / 100), avg: lpPrice(q.avgPrice),
      impact: pct(q.impact), fee: money(q.feeCents / 100), graduates: q.graduates,
    },
  };
}

function sellPreview(
  y: number, ticker: string, text: string, slip: number, slipValid: boolean, held: number, locked: number, endDay: number,
): Preview {
  if (!slipValid) return { refusal: refusalCopy('maxSlip'), figures: null };
  const n = Number(text);
  if (text.trim() === '' || !Number.isInteger(n) || n <= 0) return { refusal: refusalCopy('zero', { ticker }), figures: null };
  if (n > held) return { refusal: refusalCopy('holdings', { have: fmtTokens(held) }), figures: null };
  if (held - n < locked) return { refusal: refusalCopy('locked', { locked: fmtTokens(locked), day: endDay }), figures: null };
  const q = quoteSell(y, n);
  if (!q.ok) return { refusal: refusalCopy(q.code === 'tooLarge' ? 'tooLarge' : 'zero', { ticker }), figures: null };
  if (q.slippage > slip) return { refusal: refusalCopy('slippage', { slip: oneDp(q.slippage), max: oneDp(slip) }), figures: null };
  return {
    refusal: null,
    figures: {
      receive: money(q.netCents / 100), pay: t('lp.ticket.tokensOut', { n: fmtTokens(n) }), avg: lpPrice(q.avgPrice),
      impact: pct(q.impact), fee: money(q.feeCents / 100), graduates: false,
    },
  };
}
