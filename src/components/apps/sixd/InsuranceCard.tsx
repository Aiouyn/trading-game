'use client';

// The one-switch insurance (6D.4): a single toggle in Security. Switching on is refused during a breach or the 24 hours after
// one, and with nothing insured; the refusal says why, in three parts.
import { useState } from 'react';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, CardHeader, Chip } from '@/components/ui';
import { refusalVars, sixdRefusal, type SixdRefusal } from './copy';

export function InsuranceCard() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [refusal, setRefusal] = useState<SixdRefusal | null>(null);
  const v = me.sixd?.insurance;
  if (!v) return null;
  const blocked = !v.on && v.block !== null;
  const blockCopy = v.block && !v.on ? sixdRefusal(v.block.code, { ...(v.block.hours !== undefined ? { hours: v.block.hours } : {}) }) : null;
  const toggle = async () => {
    const r = await act({ type: 'insurance.set', on: !v.on }, { silent: true });
    setRefusal(r.ok ? null : sixdRefusal(r.error ?? 'unknown', refusalVars(r.data)));
  };
  return (
    <Card data-testid="insurance-card">
      <CardHeader
        title={t('sixd.ins.title')}
        right={<Chip className={v.on ? 'border-brass/50 text-brass-hi' : ''}><span data-testid="insurance-state">{v.on ? t('sixd.ins.on') : t('sixd.ins.off')}</span></Chip>}
        sub={t('sixd.ins.intro')}
      />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="num grid grid-cols-2 gap-x-6 gap-y-1 text-caption text-fg-muted">
          <span>{t('sixd.ins.insured')}</span><span className="text-right text-fg" data-testid="insurance-insured">{money(v.insuredValue)}</span>
          <span>{t('sixd.ins.premium', { rate: (v.premiumRate * 100).toFixed(1) })}</span><span className="text-right text-fg">{money(v.insuredValue * v.premiumRate)}</span>
          <span>{t('sixd.ins.paidOut')}</span><span className="text-right text-fg" data-testid="insurance-paid">{money(v.paidOut)}</span>
        </div>
        {blockCopy && (
          <p className="text-caption text-fg-muted" data-testid="insurance-block">{blockCopy.what} {blockCopy.do}</p>
        )}
        {refusal && (
          <div role="alert" className="rounded-chip border border-loss/40 p-3 text-caption" data-testid="insurance-refusal">
            <p className="font-semibold text-fg">{refusal.what}</p>
            <p className="text-fg-muted">{refusal.why}</p>
            <p className="text-fg-muted">{refusal.do}</p>
          </div>
        )}
        <div>
          <Button variant={v.on ? 'outline' : 'brass'} disabled={blocked} onClick={toggle} testId="insurance-toggle">
            {v.on ? t('sixd.ins.turnOff') : t('sixd.ins.turnOn')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
