'use client';

import { portfolio } from '@/engine';
import { GOAL_LADDER } from '@/content/learning';
import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, Progress } from './ui';

/**
 * The goal ladder (Phase 3, section 4): an optional card, off by default. It shows only when the player has opted in
 * in Settings, and it is hidden entirely otherwise. Each rung is checked on the server; this card only reads the
 * player's own record and portfolio to draw the bars. A goal pays nothing and gates no rule.
 *
 * `compact` is the phone's form: one strip under the home widget, showing the next goal. The desktop form is the full
 * ladder at the top of Portfolio.
 */
export function GoalsCard({ compact = false }: { compact?: boolean }) {
  const me = useGame((s) => s.me);
  const world = useGame((s) => s.world);
  const playerId = useGame((s) => s.playerId);
  const goals = me?.trading.goals;
  if (!me || !goals?.optIn || !world || !playerId) return null;

  const held = portfolio(world, playerId).positions.filter((p) => Math.abs(p.qty) > 1e-9).length;
  const nw = me.netWorth.total;
  const rungs = GOAL_LADDER.map((rung) => {
    const row = goals.rungs.find((r) => r.id === rung.id);
    const done = !!row?.done;
    let progress = done ? 1 : 0;
    let detail = '';
    if (rung.nw !== undefined) {
      progress = Math.min(1, Math.max(0, nw / rung.nw));
      detail = `${money(Math.min(nw, rung.nw))} / ${money(rung.nw)}`;
    } else if (rung.positions !== undefined) {
      progress = Math.min(1, held / rung.positions);
      detail = `${Math.min(held, rung.positions)} / ${rung.positions}`;
    }
    return { id: rung.id, done, progress, detail };
  });
  const doneCount = rungs.filter((r) => r.done).length;
  const next = rungs.find((r) => !r.done) ?? null;

  if (compact) {
    return (
      <section className="os-goals-strip" data-testid="goals-card" aria-label={t('goals.title')}>
        <div className="flex items-center justify-between gap-2 text-caption">
          <span className="label text-fg-faint">{t('goals.title')}</span>
          <span className="num text-fg-muted" data-testid="goals-count">{t('goals.count', { done: doneCount, total: rungs.length })}</span>
        </div>
        {next ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="truncate text-small text-fg" data-testid="goals-next">{t(`goal.name.${next.id}`)}</span>
            <Progress value={next.progress} label={t(`goal.name.${next.id}`)} />
          </div>
        ) : (
          <span className="mt-1 block text-small text-gain" data-testid="goals-next">{t('goals.alldone')}</span>
        )}
      </section>
    );
  }

  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="goals-card" aria-label={t('goals.title')}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-title text-fg">{t('goals.title')}</h2>
        <span className="text-caption text-fg-faint">{t('goals.sub')}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {rungs.map((r) => (
          <li
            key={r.id}
            className={`flex flex-col gap-1 ${!r.done && r.id === next?.id ? 'text-fg' : 'text-fg-muted'}`}
            data-testid={r.id}
            data-done={r.done ? 'true' : 'false'}
          >
            <div className="flex items-center justify-between gap-2 text-small">
              <span className="min-w-0 truncate">{t(`goal.name.${r.id}`)}</span>
              <span className={`shrink-0 text-caption ${r.done ? 'text-gain' : 'text-fg-faint'}`} data-testid={`${r.id}-status`}>
                {r.done ? t('goals.done') : r.detail || t('goals.open')}
              </span>
            </div>
            <Progress value={r.progress} tone={r.done ? 'gain' : 'brass'} label={t(`goal.name.${r.id}`)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
