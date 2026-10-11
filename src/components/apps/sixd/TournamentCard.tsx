'use client';

// The weekly AI tournament (6D.1, ROADMAP 2.4): enter your best trading model for the week, see the commitment, and read the
// last settled week's board. The seeds appear only with a settlement. A trade log is published only for a top-three entry
// that opted in when it entered (N8); the board shows how many logs were published, never their trades.
import { useState } from 'react';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, CardHeader, Chip } from '@/components/ui';
import { refusalVars, sixdRefusal, type SixdRefusal } from './copy';
import { TradeLogViewer } from './TradeLogViewer';

export function TournamentCard() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [publishLog, setPublishLog] = useState(false);
  const [refusal, setRefusal] = useState<SixdRefusal | null>(null);
  const tn = me.sixd?.tournament;
  if (!tn) return null;
  const enter = async () => {
    const r = await act({ type: 'tournament.enter', publishLog }, { silent: true });
    setRefusal(r.ok ? null : sixdRefusal(r.error ?? 'unknown', refusalVars(r.data)));
  };
  const latest = tn.latest;
  return (
    <Card data-testid="tournament-card">
      <CardHeader
        title={t('sixd.tn.title')}
        right={<Chip><span data-testid="tournament-week">{t('sixd.tn.week', { week: tn.entering.week })}</span></Chip>}
        sub={t('sixd.tn.intro')}
      />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="num grid grid-cols-2 gap-x-6 gap-y-1 text-caption text-fg-muted">
          <span>{t('sixd.tn.commit')}</span><span className="truncate text-right text-fg" data-testid="tournament-commit">{tn.entering.commitment.slice(0, 16)}</span>
          <span>{t('sixd.tn.entries')}</span><span className="text-right text-fg" data-testid="tournament-entries">{tn.entering.entries}</span>
          <span>{t('sixd.tn.mine')}</span>
          <span className="truncate text-right text-fg" data-testid="tournament-mine">{tn.entering.mine ? tn.entering.mine.slice(0, 16) : t('sixd.tn.notEntered')}</span>
        </div>
        {!tn.entering.mine && (
          <label className="flex items-center gap-2 text-caption text-fg-muted">
            <input type="checkbox" checked={publishLog} onChange={(e) => setPublishLog(e.target.checked)} data-testid="tournament-optin" />
            {t('sixd.tn.optLog')}
          </label>
        )}
        {refusal && (
          <div role="alert" className="rounded-chip border border-loss/40 p-3 text-caption" data-testid="tournament-refusal">
            <p className="font-semibold text-fg">{refusal.what}</p>
            <p className="text-fg-muted">{refusal.why}</p>
            <p className="text-fg-muted">{refusal.do}</p>
          </div>
        )}
        {!tn.entering.mine && (
          <div><Button variant="brass" onClick={enter} testId="tournament-enter">{t('sixd.tn.enter')}</Button></div>
        )}
        {latest ? (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-fg-faint">{t('sixd.tn.board', { week: latest.week })}</p>
            <div className="overflow-x-auto">
              <table className="num w-full text-caption" data-testid="tournament-board">
                <thead className="text-fg-faint">
                  <tr><th className="text-left">{t('sixd.tn.col.handle')}</th><th className="text-right">{t('sixd.tn.col.sharpe')}</th><th className="text-right">{t('sixd.tn.col.return')}</th><th className="text-right">{t('sixd.tn.col.status')}</th></tr>
                </thead>
                <tbody>
                  {latest.board.slice(0, 12).map((row) => (
                    <tr key={`${row.kind}-${row.handle}`} className={row.mine ? 'text-brass-hi' : 'text-fg'} data-testid="tournament-row">
                      <td className="truncate text-left">{row.handle}</td>
                      <td className="text-right">{row.sharpe.toFixed(2)}</td>
                      <td className="text-right">{(row.totalReturn * 100).toFixed(1)}%</td>
                      <td className="text-right">{row.qualified ? t('sixd.tn.qualified') : t('sixd.tn.disqualified')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-caption text-fg-faint" data-testid="tournament-seeds">{t('sixd.tn.seeds', { count: latest.seeds.length })}</p>
            <p className="text-caption text-fg-faint" data-testid="tournament-logs">{t('sixd.tn.logs', { count: latest.logCount })}</p>
            <TradeLogViewer logs={latest.logs} />
          </div>
        ) : (
          <p className="text-caption text-fg-faint" data-testid="tournament-none">{t('sixd.tn.none')}</p>
        )}
      </div>
    </Card>
  );
}
