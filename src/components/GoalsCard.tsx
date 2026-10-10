'use client';

import { money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, Progress } from './ui';

/**
 * The goal ladder (Phase 3, section 4): an optional card, off by default. It shows only when the player has opted in
 * in Settings, and it is hidden entirely otherwise. Progress, done and the next rung all come from the server's view
 * (learn.ts goalsView), read from the same basis the checks use, so the bars never disagree with a done rung. A goal
 * pays nothing and gates no rule.
 *
 * `compact` is the phone's form: one strip under the home widget, showing the next goal. The desktop form is the full
 * ladder at the top of Portfolio.
 */
export function GoalsCard({ compact = false }: { compact?: boolean }) {
  const goals = useGame((s) => s.me?.trading.goals);
  if (!goals?.optIn) return null;

  const rungs = goals.rungs.map((r) => {
    let detail = '';
    if (r.target !== null && r.value !== null) {
      detail = r.unit === 'money' ? `${money(r.value)} / ${money(r.target)}` : `${r.value} / ${r.target}`;
    }
    return { id: r.id, done: r.done, progress: r.progress, detail };
  });
  const doneCount = rungs.filter((r) => r.done).length;
  const next = rungs.find((r) => r.id === goals.next) ?? null;

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
