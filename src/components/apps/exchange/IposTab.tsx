'use client';

// IPO books open today. The price, float and share counts are what the market sees. The viewer's own subscription is theirs
// alone: the book's other orders are never listed here. A blocked account sees the reason in three parts, not a greyed button.
import { useState } from 'react';
import { pct, price, qty } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, NumberField } from '@/components/ui';
import type { IpoRow } from '@/world/exchange/view';
import { Fact, PublicChip, RefusalBox, Section } from './Shared';
import { type RefusalCopy, refusalCopy, rejectVars, sectorKey } from './copy';

export function IposTab({ ipos }: { ipos: IpoRow[] }) {
  if (ipos.length === 0) {
    return (
      <Card className="p-6" data-testid="exchange-ipos-empty">
        <p className="text-center text-fg-muted">{t('exchange.empty.ipos')}</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="exchange-ipos">
      <p className="text-small text-fg-muted">{t('exchange.ipo.intro')}</p>
      {ipos.map((row) => <IpoCard key={row.companyId} row={row} />)}
    </div>
  );
}

function IpoCard({ row }: { row: IpoRow }) {
  const act = useGame((s) => s.act);
  const [shares, setShares] = useState('');
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const blocked: RefusalCopy | null = row.blocked
    ? refusalCopy('company.refusal', row.blocked.code, rejectVars(row.blocked))
    : null;
  const n = Number(shares);
  const valid = Number.isInteger(n) && n > 0;
  // The cap is per buyer (5% of the float). The book would only cut an over-cap order, so the form refuses it first.
  const over = valid && n > row.roomShares;
  const overCap: RefusalCopy = {
    what: t('exchange.ipo.overCap.what'),
    why: t('exchange.ipo.overCap.why', { cap: qty(row.capShares), mine: qty(row.myShares) }),
    do: t('exchange.ipo.overCap.do', { room: qty(row.roomShares) }),
  };

  const subscribe = async () => {
    setRefusal(null);
    setSent(null);
    const r = await act({ type: 'company.ipoOrder', companyId: row.companyId, shares: n }, { silent: true });
    if (r.ok) {
      setShares('');
      setSent(t('exchange.ipo.sent', { shares: qty(n), name: row.name }));
    } else {
      setRefusal(refusalCopy('company.refusal', r.error ?? '', rejectVars(r.data)));
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid={`exchange-ipo-${row.companyId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-serif text-title text-fg" data-testid={`exchange-ipo-name-${row.companyId}`}>{row.name}</h2>
          <p className="mt-1 text-caption text-fg-muted">{t(sectorKey(row.sector))}</p>
        </div>
        <PublicChip />
      </div>

      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
        <Fact label={t('exchange.ipo.price')} value={price(row.price)} testId={`exchange-ipo-price-${row.companyId}`} />
        <Fact label={t('exchange.ipo.float')} value={pct(row.floatPct)} />
        <Fact label={t('exchange.ipo.shares')} value={qty(row.ipoShares)} />
        <Fact label={t('exchange.ipo.cap')} value={qty(row.capShares)} testId={`exchange-ipo-cap-${row.companyId}`} />
        <Fact label={t('exchange.ipo.listDay')} value={row.listDay} testId={`exchange-ipo-listday-${row.companyId}`} />
        <Fact label={t('exchange.ipo.mine')} value={qty(row.myShares)} testId={`exchange-ipo-mine-${row.companyId}`} />
        <Fact label={t('exchange.ipo.room')} value={qty(row.roomShares)} testId={`exchange-ipo-room-${row.companyId}`} />
      </div>

      <Section title={t('exchange.ipo.subscribe')} testId={`exchange-ipo-form-${row.companyId}`}>
        {blocked ? (
          <RefusalBox copy={blocked} testId={`exchange-ipo-blocked-${row.companyId}`} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <NumberField
              label={t('exchange.ipo.amount')}
              value={shares}
              onChange={setShares}
              min={1}
              step={1}
              className="w-44"
              testId={`exchange-ipo-shares-${row.companyId}`}
            />
            <Button variant="brass" disabled={!valid || over} onClick={subscribe} testId={`exchange-ipo-subscribe-${row.companyId}`}>
              {t('exchange.ipo.subscribe')}
            </Button>
          </div>
        )}
        {!blocked && over && <RefusalBox copy={overCap} testId={`exchange-ipo-overcap-${row.companyId}`} />}
        {refusal && <RefusalBox copy={refusal} testId={`exchange-ipo-refusal-${row.companyId}`} />}
        {sent && <p className="text-small text-gain" data-testid={`exchange-ipo-sent-${row.companyId}`}>{sent}</p>}
      </Section>
    </Card>
  );
}
