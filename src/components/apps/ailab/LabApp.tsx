'use client';

// AI Lab (Velvet app 6, Owner and up): research, compute and data, training, models and bots. The tab
// bodies live in LabTabs.tsx. Every action is an existing lab.* command (src/world/lab.ts).
import { useState } from 'react';
import { RESEARCH } from '@/content/research';
import { pct, qty } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { AppLocked } from '@/components/apps/AppLocked';
import { Card, Progress, Stat, Tabs, ticksLabel } from '@/components/ui';
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
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-hero text-fg">{t('shell.app.ailab')}</h1>
            <p className="max-w-xl text-small text-fg-muted">{t('lab.intro')}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 @md:grid-cols-4">
            <Stat label={t('lab.stat.algorithm')} value={`×${(lab?.a ?? 1).toFixed(2)}`} />
            <Stat label={t('lab.stat.compute')} value={t('lab.stat.computeValue', { n: (lab?.pflopPerDay ?? 0).toFixed(1) })} />
            <Stat label={t('lab.stat.data')} value={t('lab.stat.dataValue', { n: qty(Math.round(lab?.data ?? 0)) })} sub={lab && lab.dataSynth > 0 ? t('lab.stat.synthetic', { pct: pct(lab.dataSynth) }) : undefined} />
            <Stat label={t('lab.stat.spot')} value={t('lab.stat.spotValue', { n: (lab?.spotPrice ?? 1.2).toFixed(2) })} />
          </div>
        </div>
        {lab?.researching && (
          <div className="mt-4">
            <div className="flex justify-between gap-2 text-caption"><span>{t('lab.researching', { name: RESEARCH.find((r) => r.id === lab.researching!.nodeId)?.name ?? lab.researching.nodeId })}</span><span className="num">{ticksLabel(lab.researching.doneTick - tick)}</span></div>
          </div>
        )}
        {lab?.training && (
          <div className="mt-3">
            <div className="flex justify-between gap-2 text-caption"><span>{t('lab.training', { name: lab.training.name, mcs: lab.training.expectedMcs.toFixed(0), odds: pct(lab.training.failOdds) })}</span><span className="num">{ticksLabel(lab.training.doneTick - tick)}</span></div>
            <Progress value={(tick - lab.training.startTick) / Math.max(1, lab.training.doneTick - lab.training.startTick)} className="mt-1" label={t('lab.training.progress')} />
          </div>
        )}
      </Card>
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
      {tab === 'models' && <Models />}
      {tab === 'bots' && <Bots />}
      <TournamentCard />
    </div>
  );
}
