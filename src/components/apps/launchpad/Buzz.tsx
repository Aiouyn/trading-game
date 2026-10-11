'use client';

// The buzz items (lead-launchpad.md L6): a Quay billboard and a Wire promo, bought by any player for a token. They are public
// (shown as Sponsored) and they are sinks; at most three a token per game day. A refusal shows inline, in three parts.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button } from '@/components/ui';
import { LP } from '@/world/launchpad/constants';
import { refusalOf, type RefusalCopy } from './copy';
import { RefusalBox } from './Shared';

export function BuzzButtons({ ticker, promosToday, testPrefix = 'lp-buzz' }: { ticker: string; promosToday: number; testPrefix?: string }) {
  const act = useGame((s) => s.act);
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const buy = async (kind: 'board' | 'wire') => {
    setRefusal(null);
    setSent(null);
    const r = await act({ type: 'lp.buzz', ticker, kind }, { silent: true });
    if (r.ok) setSent(t('lp.buzz.sent', { ticker, item: t(kind === 'board' ? 'lp.buzz.board' : 'lp.buzz.wire') }));
    else setRefusal(refusalOf(r.data, r.error ? undefined : 'unknown'));
  };
  return (
    <div className="flex flex-col gap-2" data-testid={`${testPrefix}-${ticker}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" testId={`${testPrefix}-board`} onClick={() => buy('board')}>
          {t('lp.buzz.boardBuy', { cost: money(LP.BOARD_COST) })}
        </Button>
        <Button size="sm" variant="outline" testId={`${testPrefix}-wire`} onClick={() => buy('wire')}>
          {t('lp.buzz.wireBuy', { cost: money(LP.WIRE_PROMO_COST) })}
        </Button>
        <span className="text-caption text-fg-faint" data-testid={`${testPrefix}-count`}>
          {t('lp.buzz.today', { n: promosToday, max: LP.BUZZ_MAX_PER_DAY })}
        </span>
      </div>
      {sent && <p role="status" className="text-caption text-gain">{sent}</p>}
      {refusal && <RefusalBox copy={refusal} testId={`${testPrefix}-refusal`} />}
    </div>
  );
}
