'use client';

// The Portfolio stress test (6D.6): the book under the four world-event kinds at each kind's published typical move, by asset
// class. It is labelled illustrative and never shows the hidden schedule of any event.
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, CardHeader, Chip } from '@/components/ui';

export function StressPanel() {
  const me = useGame((s) => s.me)!;
  const s = me.sixd?.stress;
  if (!s) return null;
  return (
    <Card data-testid="stress-panel">
      <CardHeader
        title={t('sixd.stress.title')}
        right={<Chip><span data-testid="stress-illustrative">{t('sixd.stress.illustrative')}</span></Chip>}
        sub={t('sixd.stress.intro')}
      />
      <div className="flex flex-col gap-2 px-4 pb-4">
        {s.positions === 0 ? (
          <p className="text-caption text-fg-faint" data-testid="stress-empty">{t('sixd.stress.empty')}</p>
        ) : (
          <table className="num w-full text-caption" data-testid="stress-table">
            <thead className="text-fg-faint">
              <tr><th className="text-left">{t('sixd.stress.col.event')}</th><th className="text-right">{t('sixd.stress.col.change')}</th><th className="text-right">{t('sixd.stress.col.pct')}</th></tr>
            </thead>
            <tbody>
              {s.rows.map((row) => (
                <tr key={row.kind} data-testid={`stress-row-${row.kind}`} className="text-fg">
                  <td className="text-left">{t(`sixd.stress.kind.${row.kind}`)}</td>
                  <td className={`text-right ${row.delta < 0 ? 'text-loss' : 'text-gain'}`}>{money(row.delta)}</td>
                  <td className="text-right">{(row.pct * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-caption text-fg-faint">{t('sixd.stress.note')}</p>
      </div>
    </Card>
  );
}
