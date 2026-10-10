'use client';

import { useEffect, useRef, useState } from 'react';
import { LESSONS, type LessonDef } from '@/content/lessons';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import type { SandboxCommand, SandboxView } from '@/sandbox/sandbox';
import { Button, Card } from '@/components/ui';
import { PracticeBanner, PracticeDesk, readDesk, type DeskState } from './SandboxDesk';
import { lessonAsset, lessonHintKey, lessonPassed, type LessonAct } from './lessonCheck';
import { sandboxRpc, type OpenedSandbox } from './sandboxRpc';

/**
 * The Learn app's lessons: ten two-minute lessons (Phase 3, section 4). The list reads completion from the server record
 * (me.player.lessons); a lesson opens its own fixed practice market, runs its holding setup, and checks the learner's
 * work there. Completion is sent to the server with the lesson.complete command, never kept in the browser.
 */

export function LessonsView() {
  const me = useGame((s) => s.me);
  const done = new Set(me?.player.lessons ?? []);
  const [openId, setOpenId] = useState<string | null>(null);
  /** bumped to start the open lesson again from its setup (the lesson view remounts on each bump) */
  const [nonce, setNonce] = useState(0);
  const open = LESSONS.find((l) => l.id === openId);

  if (open) {
    return (
      <LessonDetail
        key={`${open.id}-${nonce}`}
        def={open}
        done={done.has(open.id)}
        onBack={() => setOpenId(null)}
        onRestart={() => setNonce((n) => n + 1)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="learn-lessons-title" data-testid="learn-lessons">
      <h2 id="learn-lessons-title" className="font-serif text-title text-fg">{t('learn.lessons')}</h2>
      <p className="text-caption text-fg-faint">{t('learn.lessons.hint')}</p>
      <p className="text-caption text-fg-muted" data-testid="learn-progress">{t('learn.lesson.progress', { n: done.size, total: LESSONS.length })}</p>
      <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1">
        {LESSONS.map((l) => {
          const isDone = done.has(l.id);
          return (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`learn-lesson-${l.id}`} data-done={isDone ? 'true' : 'false'}>
              <span className="min-w-0 text-small text-fg">{l.id}. {t(`learn.lesson.${l.id}.title`)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`text-caption ${isDone ? 'text-gain' : 'text-fg-faint'}`} data-testid={`learn-lesson-${l.id}-status`}>
                  {isDone ? t('learn.lesson.status.done') : t('learn.lesson.status.open')}
                </span>
                <Button size="sm" variant="outline" onClick={() => setOpenId(l.id)} testId={`learn-lesson-open-${l.id}`}>{t('learn.lesson.open')}</Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface LessonState {
  sb: OpenedSandbox;
  asset: string;
  startTick: number;
}

function LessonDetail({ def, done, onBack, onRestart }: { def: LessonDef; done: boolean; onBack: () => void; onRestart: () => void }) {
  const act = useGame((s) => s.act);
  const [lesson, setLesson] = useState<LessonState | null>(null);
  const [failed, setFailed] = useState(false);
  const [latest, setLatest] = useState<DeskState | null>(null);
  const [verdict, setVerdict] = useState<'none' | 'passed' | 'notyet'>('none');
  const acts = useRef<LessonAct[]>([]);

  // open the lesson's own practice market, then set up the holding (one unit, bought and filled, one game day)
  useEffect(() => {
    let live = true;
    let id: string | null = null;
    (async () => {
      try {
        const opened = await sandboxRpc.create({ kind: 'practice', id: `lesson-${def.id}` });
        id = opened.id;
        const stock = lessonAsset(await sandboxRpc.assets(opened.id));
        if (!stock) throw new Error('no stock');
        let view: SandboxView = await sandboxRpc.view(opened.id);
        if (def.holding) {
          // the setup is the lesson's, not the learner's: it is not logged as one of their orders
          const setup: SandboxCommand = { type: 'place', order: { assetId: stock, side: 'buy', type: 'market', qty: def.qty } };
          await sandboxRpc.act(opened.id, setup);
          await sandboxRpc.step(opened.id, view.ticksPerDay);
          view = await sandboxRpc.view(opened.id);
        }
        if (!live) {
          void sandboxRpc.close(opened.id);
          return;
        }
        setLesson({ sb: opened, asset: stock, startTick: view.tick });
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      if (id) void sandboxRpc.close(id);
    };
  }, [def]);

  /** Reads the sandbox fresh (so a step still settling is counted), then checks the learner's work. */
  async function check() {
    if (!lesson) return;
    let fresh: DeskState;
    try {
      fresh = await readDesk(lesson.sb.id);
    } catch {
      setVerdict('notyet');
      return;
    }
    setLatest(fresh);
    const passed = lessonPassed(def, {
      view: fresh.view,
      price: fresh.prices[lesson.asset] ?? null,
      elapsedTicks: fresh.view.tick - lesson.startTick,
      acts: acts.current,
    });
    if (!passed) {
      setVerdict('notyet');
      return;
    }
    setVerdict('passed');
    if (!done) void act({ type: 'lesson.complete', lessonId: def.id }, { silent: true });
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`learn-lesson-detail-${def.id}`}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} testId="learn-lesson-back">{t('learn.lesson.back')}</Button>
        <span className="text-caption text-fg-faint" data-testid="learn-lesson-state">{done ? t('learn.lesson.status.done') : t('learn.lesson.status.open')}</span>
      </div>
      <h2 className="font-serif text-title text-fg" data-testid="learn-lesson-title">{def.id}. {t(`learn.lesson.${def.id}.title`)}</h2>
      <p className="text-small text-fg" data-testid="learn-lesson-read">{t(`learn.lesson.${def.id}.read`)}</p>

      <Card className="flex flex-col gap-2 p-3" data-testid="learn-lesson-task-card">
        <span className="label text-fg-faint">{t('learn.lesson.task')}</span>
        <p className="text-small text-fg" data-testid="learn-lesson-task">{t(`learn.lesson.${def.id}.task`)}</p>
      </Card>

      {failed && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-loss" data-testid="learn-lesson-failed">{t('practice.error.generic')}</p>
          <Button variant="outline" size="sm" onClick={onRestart} testId="learn-lesson-retry">{t('learn.lesson.restart')}</Button>
        </div>
      )}
      {!failed && !lesson && <p className="text-small text-fg-faint" data-testid="learn-lesson-loading">{t('practice.loading')}</p>}

      {lesson && (
        <div className="practice-tint flex flex-col gap-3 rounded-lg p-3" data-testid="learn-lesson-desk-wrap">
          <PracticeBanner testId="learn-lesson-banner" />
          <PracticeDesk
            key={lesson.sb.id}
            sb={lesson.sb}
            prefix="lesson"
            assets={[{ id: lesson.asset, assetClass: 'stock' }]}
            defaultAsset={lesson.asset}
            types={def.types}
            defaultQty={def.qty}
            note={def.holding ? t('learn.lesson.setup', { asset: lesson.asset }) : undefined}
            onAct={(command, result) => {
              acts.current.push({ command, result });
            }}
            onState={setLatest}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="brass" onClick={check} disabled={!latest} testId="learn-lesson-check">{t('learn.lesson.check')}</Button>
            <Button variant="ghost" size="sm" onClick={onRestart} testId="learn-lesson-restart">{t('learn.lesson.restart')}</Button>
          </div>
          {verdict === 'passed' && (
            <p className="text-small text-gain" role="status" data-testid="learn-lesson-passed">
              {t('learn.lesson.passed')} {t(`learn.lesson.${def.id}.done`)}
            </p>
          )}
          {verdict === 'notyet' && (
            <p className="text-small text-warn" role="status" data-testid="learn-lesson-notyet">
              {t('learn.lesson.notyet')} {t(lessonHintKey(def))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
