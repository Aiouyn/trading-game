'use client';

// AI Lab (Velvet app 6, Owner and up): research, compute and data, training, models and bots. The tab
// bodies live in LabTabs.tsx. Every action is an existing lab.* command (src/world/lab.ts).
import { useState } from 'react';

import { pct, qty } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { AppLocked } from '@/components/apps/AppLocked';
import { Card, Progress, StatStrip, Tabs, ticksLabel } from '@/components/ui';
import { Bots, Compute, Models, Research, Train } from './LabTabs';
import { TournamentCard } from '@/components/apps/sixd/TournamentCard';

type Tab = 'research' | 'compute' | 'train' | 'models' | 'bots';

export function LabApp() {
  const me = useGame((s) => s.me)!;
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const [tab, setTab] = useState<Tab>('research');
  if (!isAppUnlocked('ailab', me.player.rankId)) {
    return <AppLocked app="ailab" copy={(rank, amount) => t('lab.locked.need', { rank, amount })} />;
  }
  const lab = me.lab;
  return (
    <div className="flex flex-col gap-4" data-testid="lab-view">
      <StatStrip
        testId="lab-stats"
        // The header leads with what the lab does; the formula sits in its own disclosure, and each unit has a tooltip.
        intro={(
          <>
            <span>{t('lab.intro')}</span>
            <details className="mt-1" data-testid="lab-score">
              <summary className="cursor-pointer text-fg-muted hover:text-fg">{t('lab.score.title')}</summary>
              <p className="num mt-1 text-fg-faint">{t('lab.score.formula')}</p>
            </details>
          </>
        )}
        items={[
          { label: <span title={t('lab.stat.algorithmTip')}>{t('lab.stat.algorithm')}</span>, value: `×${(lab?.a ?? 1).toFixed(2)}` },
          { label: <span title={t('lab.stat.computeTip')}>{t('lab.stat.compute')}</span>, value: t('lab.stat.computeValue', { n: (lab?.pflopPerDay ?? 0).toFixed(1) }) },
          { label: <span title={t('lab.stat.dataTip')}>{t('lab.stat.data')}</span>, value: t('lab.stat.dataValue', { n: qty(Math.round(lab?.data ?? 0)) }), sub: lab && lab.dataSynth > 0 ? t('lab.stat.synthetic', { pct: pct(lab.dataSynth) }) : undefined },
          { label: <span title={t('lab.stat.spotTip')}>{t('lab.stat.spot')}</span>, value: t('lab.stat.spotValue', { n: (lab?.spotPrice ?? 1.2).toFixed(2) }) },
        ]}
      />
      {/* the progress card is drawn only while a run or a study is under way: an empty card read as a gap (UX stage 6, item 10) */}
      {(lab?.researching || lab?.training) && (
      <Card className="p-4">
        {lab?.researching && (
          <div className="mt-4">
            <div className="flex justify-between gap-2 text-caption"><span>{t('lab.researching', { name: t(`ai.name.${lab.researching!.nodeId}`) })}</span><span className="num">{ticksLabel(lab.researching.doneTick - tick)}</span></div>
          </div>
        )}
        {lab?.training && (
          <div className="mt-3">
            <div className="flex justify-between gap-2 text-caption"><span>{t('lab.training', { name: lab.training.name, mcs: lab.training.expectedMcs.toFixed(0), odds: pct(lab.training.failOdds) })}</span><span className="num">{ticksLabel(lab.training.doneTick - tick)}</span></div>
            <Progress value={(tick - lab.training.startTick) / Math.max(1, lab.training.doneTick - lab.training.startTick)} className="mt-1" label={t('lab.training.progress')} />
          </div>
        )}
      </Card>
      )}
      <Stepper steps={[
        { id: 'research', label: t('lab.tab.research'), done: (lab?.a ?? 1) > 1 },
        { id: 'compute', label: t('lab.tab.compute'), done: (lab?.pflopPerDay ?? 0) > 0 || (lab?.data ?? 0) > 0 },
        { id: 'train', label: t('lab.tab.train'), done: (lab?.models.length ?? 0) > 0 },
        { id: 'bots', label: t('lab.tab.bots'), done: (lab?.bots.length ?? 0) > 0 },
      ]} onPick={setTab} />
      <Tabs<Tab>
        tabs={[
          { id: 'research', label: t('lab.tab.research') },
          { id: 'compute', label: t('lab.tab.compute') },
          { id: 'train', label: t('lab.tab.train') },
          { id: 'models', label: t('lab.tab.models'), badge: lab?.models.length },
          { id: 'bots', label: t('lab.tab.bots'), badge: lab?.bots.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'research' && <Research />}
      {tab === 'compute' && <Compute />}
      {tab === 'train' && <Train />}
      {tab === 'models' && <Models onTrain={() => setTab('train')} />}
      {tab === 'bots' && <Bots onTrain={() => setTab('train')} />}
      <TournamentCard />
    </div>
  );
}

/** The AI Lab as a stepper (Stage 4): four steps in order, each marked done once it has something in it, and one line on what is next. */
function Stepper({ steps, onPick }: { steps: { id: Tab; label: string; done: boolean }[]; onPick: (tab: Tab) => void }) {
  const next = steps.find((s) => !s.done);
  return (
    <div className="flex flex-col gap-2" data-testid="lab-stepper">
      <ol className="flex flex-wrap gap-2" aria-label={t('lab.step.label')}>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} data-testid={`lab-step-${s.id}`} data-done={s.done ? 'true' : 'false'}
              className={`flex items-center gap-2 rounded-chip border px-3 py-1 text-caption ${s.done ? 'border-gain/50 text-gain' : next?.id === s.id ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}>
              <span className="num">{i + 1}</span>
              <span>{s.label}</span>
              {s.done && <span className="text-fg-faint">{t('lab.step.done')}</span>}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-caption text-fg-muted" data-testid="lab-step-next">{next ? t('lab.step.next', { step: next.label }) : t('lab.step.all')}</p>
    </div>
  );
}
