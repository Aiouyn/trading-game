'use client';

// The AI Lab's five tab bodies: research, compute and data, train, models and bots.
import { useState } from 'react';
import { DATA_SOURCES, MCS_TIERS, RESEARCH, mcsTier } from '@/content/research';
import { rankIndex } from '@/content/lifestyle';
import { compactMoney, money, pct, qty } from '@/game/format';
import { useGame } from '@/game/store';
import { GPU_TIERS } from '@/world/core';
import { reserveCost, trainingPlan } from '@/world/lab';
import type { Model, TradingBot } from '@/world/types';
import { t } from '@/i18n';
import { unlockLine } from '../unlock';
import { BrassChip, Button, Card, CardHeader, Chip, EmptyNext, NumberField, Select, SpendReview, TextField, spendRows } from '@/components/ui';

const STRATEGIES: TradingBot['strategy'][] = ['momentum', 'meanrev', 'value', 'earnings', 'trend'];
const MODEL_KINDS: Model['kind'][] = ['trading', 'analyst', 'security'];

export function Research() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const done = new Set(me.lab?.research ?? []);
  const busy = !!me.lab?.researching;
  const eras = [...new Set(RESEARCH.map((r) => r.era))];
  return (
    <div className="flex flex-col gap-4">
      {eras.map((era) => (
        <div key={era}>
          <div className="label mb-2">{era}</div>
          <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
            {RESEARCH.filter((r) => r.era === era).map((r) => {
              const have = done.has(r.id);
              const ready = r.requires.every((x) => done.has(x));
              const current = me.lab?.researching?.nodeId === r.id;
              return (
                <Card key={r.id} className={`flex flex-col p-4 ${have ? 'border-brass/40' : ''}`} data-testid={`research-${r.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold">{t(`ai.name.${r.id}`)}</h3>
                    {have ? <BrassChip>{t('lab.done')}</BrassChip> : <Chip>×{r.aMult.toFixed(2)}</Chip>}
                  </div>
                  <p className="mt-1 flex-1 text-small text-fg-muted">{t(`ai.blurb.${r.id}`)}</p>
                  {r.unlocks && <p className="mt-1 text-caption text-brass">{t('lab.unlocks', { what: t(`ai.unlock.${r.id}`) })}</p>}
                  {!ready && !have && <p className="mt-1 text-caption text-fg-faint">{t('lab.needs', { names: r.requires.map((x) => t(`ai.name.${x}`)).join(', ') })}</p>}
                  {!have && (
                    <Button size="sm" className="mt-3" variant={ready && !busy ? 'brass' : 'outline'} disabled={!ready || busy || (me.account?.cash ?? 0) < r.cost}
                      onClick={() => act({ type: 'lab.research', nodeId: r.id }, { success: t('lab.research.started', { name: t(`ai.name.${r.id}`) }) })} testId={`start-${r.id}`}>
                      {current ? t('lab.inProgress') : t('lab.researchCost', { cost: compactMoney(r.cost), days: r.days })}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Compute() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [dq, setDq] = useState('1000');
  const [res, setRes] = useState({ perDay: '100', days: '10' });
  const lab = me.lab;
  const rIdx = rankIndex(me.player.rankId);
  return (
    <div className="grid gap-4 @3xl:grid-cols-2">
      <Card>
        <CardHeader title={t('lab.gpu.title')} sub={t('lab.gpu.sub')} />
        <ul>
          {GPU_TIERS.map((g) => {
            const have = lab?.gpus[g.id] ?? 0;
            const locked = rIdx < rankIndex(g.rank);
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3 text-small">
                <div className="min-w-0 flex-1"><div className="font-medium">{g.name}</div><div className="num text-caption text-fg-faint">{t('lab.gpu.spec', { price: money(g.price), pf: g.pflopPerDay, mwh: g.powerMwhPerDay })}</div></div>
                <span className="num w-10 text-right">{have}</span>
                <NumberField label={t('lab.gpu.qty')} value={qty[g.id] ?? '1'} onChange={(v) => setQty({ ...qty, [g.id]: v })} className="h-9 w-32" step={1} />
                {locked ? <span className="flex flex-col items-end gap-1"><Button size="sm" disabled>{t('common.locked')}</Button><span className="text-caption text-fg-faint" data-testid={`lab-gpu-unlock-${g.id}`}>{unlockLine(g.rank, me.player.netWorthPeak).text}</span></span> : (
                  <SpendReview size="sm" testId={`lab-gpu-buy-${g.id}`} label={t('lab.gpu.buy')} title={`${t('lab.gpu.buy')} · ${g.name}`} rows={spendRows(g.price * Math.max(1, Number(qty[g.id] ?? 1)), me.account?.cash ?? 0)} onConfirm={() => act({ type: 'lab.gpu', tier: g.id, qty: Number(qty[g.id] ?? 1) })} />
                )}
                {have > 0 && <Button size="sm" variant="ghost" onClick={() => act({ type: 'lab.gpu', tier: g.id, qty: -Number(qty[g.id] ?? 1) })}>{t('common.sell')}</Button>}
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h2 className="font-serif text-title">{t('lab.reserve.title')}</h2>
          <p className="mt-1 text-small text-fg-muted">{t('lab.reserve.sub')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField label={t('lab.reserve.perDay')} value={res.perDay} onChange={(v) => setRes({ ...res, perDay: v })} />
            <NumberField label={t('lab.reserve.days')} value={res.days} onChange={(v) => setRes({ ...res, days: v })} />
          </div>
          <SpendReview
            className="mt-2 w-full"
            testId="lab-reserve"
            label={t('lab.reserve.button', { cost: money(reserveCost(Number(res.perDay), Number(res.days), lab?.spotPrice ?? 1.2)) })}
            title={t('lab.reserve.title')}
            rows={spendRows(reserveCost(Number(res.perDay), Number(res.days), lab?.spotPrice ?? 1.2), me.account?.cash ?? 0)}
            onConfirm={() => act({ type: 'lab.reserve', perDay: Number(res.perDay), days: Number(res.days) }, { success: t('lab.reserve.done') })}
          />
          {lab?.reserved && <p className="mt-2 text-caption text-fg-faint">{t('lab.reserve.active', { n: lab.reserved.perDay })}</p>}
        </Card>
        <Card className="p-4">
          <h2 className="font-serif text-title">{t('lab.data.title')}</h2>
          <p className="mt-1 text-small text-fg-muted">{t('lab.data.sub')}</p>
          <NumberField className="mt-3" label={t('lab.data.qty')} value={dq} onChange={setDq} />
          <div className="mt-2 grid gap-2">
            {DATA_SOURCES.filter((s) => s.id !== 'partnership').map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink-3 p-2.5">
                <div className="min-w-0"><div className="text-small font-medium">{t(`src.name.${s.id}`)}</div><div className="text-caption text-fg-faint">{t(`src.blurb.${s.id}`)}</div></div>
                <SpendReview
                  size="sm"
                  testId={`lab-data-${s.id}`}
                  label={money(Number(dq) * (lab?.dataPrice ?? 0.05) * s.priceMult)}
                  title={t(`src.name.${s.id}`)}
                  rows={spendRows(Number(dq) * (lab?.dataPrice ?? 0.05) * s.priceMult, me.account?.cash ?? 0)}
                  onConfirm={() => act({ type: 'lab.data', source: s.id, qty: Number(dq) }, { success: t('lab.data.bought', { qty: dq }) })}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="font-serif text-title">{t('lab.researchers.title')}</h2>
          <p className="mt-1 text-small text-fg-muted">{t('lab.researchers.sub')}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="num text-title">{lab?.researchers ?? 0}</span>
            <SpendReview size="sm" testId="lab-hire" label={t('lab.researchers.hire')} title={t('lab.researchers.hire')} rows={[{ label: t('commit.amount'), value: '1' }]} onConfirm={() => act({ type: 'lab.hire', qty: 1 })} />
            <Button size="sm" variant="ghost" onClick={() => act({ type: 'lab.hire', qty: -1 })}>{t('lab.researchers.letGo')}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function Train() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [kind, setKind] = useState<Model['kind']>('trading');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('5000');
  const [careful, setCareful] = useState(true);
  const lab = me.lab;
  const b = Number(budget) || 0;
  const tick = useGame((s) => s.frame?.tick ?? 0);
  // The same plan startTraining runs (src/world/lab.ts), so the preview and the run cannot disagree.
  const plan = lab ? trainingPlan(lab, b, careful, lab.spotPrice, tick) : null;
  const days = plan?.days ?? 1;
  const pflop = plan?.pflop ?? 0;
  const dqu = plan?.dqu ?? 0;
  const expected = plan?.expectedMcs ?? 0;
  const fail = plan?.failOdds ?? 0.06;
  const tier = MCS_TIERS[mcsTier(expected)]!;
  return (
    <Card className="p-4" data-testid="train">
      <h2 className="font-serif text-title">{t('lab.train.title')}</h2>
      <div className="mt-3 grid gap-3 @md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Select label={t('lab.train.kind')} value={kind} onChange={setKind} options={MODEL_KINDS.map((k) => ({ value: k, label: t(`lab.train.kind.${k}`) }))} />
          <TextField value={name} onChange={setName} placeholder={t('lab.train.name')} maxLength={32} />
          <NumberField label={t('lab.train.budget')} value={budget} onChange={setBudget} suffix="$" />
          <label className="flex items-center gap-2 text-small text-fg-muted"><input type="checkbox" checked={careful} onChange={(e) => setCareful(e.target.checked)} /> {t('lab.train.careful')}</label>
        </div>
        <div className="rounded-md border border-ink-3 p-3 text-small">
          <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('lab.train.compute')}</span><span className="num">{t('lab.train.pf', { n: qty(Math.round(pflop)) })}</span></div>
          <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('lab.train.data')}</span><span className="num">{t('lab.train.dqu', { n: qty(Math.round(dqu)) })}</span></div>
          <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('lab.train.duration')}</span><span className="num">{t('lab.train.days', { x: days.toFixed(1) })}</span></div>
          <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('lab.train.failure')}</span><span className="num text-warn">{pct(fail)}</span></div>
          <div className="mt-2 flex justify-between gap-2 border-t border-ink-2 pt-2"><span className="font-semibold">{t('lab.train.expected')}</span><span className="num font-semibold text-brass-hi">{expected.toFixed(0)} · {tier.name}</span></div>
          {dqu < pflop * 0.5 && <p className="mt-2 text-caption text-warn">{t('lab.train.starved')}</p>}
        </div>
      </div>
      <Button variant="brass" className="mt-3 w-full" disabled={!!lab?.training} onClick={() => act({ type: 'lab.train', kind, name, budget: b, careful }, { success: t('lab.train.started') })} testId="start-training">
        {lab?.training ? t('lab.train.busy') : t('lab.train.start', { amount: money(b) })}
      </Button>
    </Card>
  );
}

export function Models({ onTrain }: { onTrain: () => void }) {
  const me = useGame((s) => s.me)!;
  const models = me.lab?.models ?? [];
  if (!models.length) {
    return <EmptyNext testId="lab-models-empty" title={t('lab.models.none')} body={t('lab.models.empty.body')} cta={<Button variant="brass" onClick={onTrain} testId="lab-to-train">{t('lab.models.empty.cta')}</Button>} />;
  }
  return (
    <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
      {models.map((m) => (
        <Card key={m.id} className="p-4" data-testid={`model-${m.id}`}>
          <div className="flex items-start justify-between gap-2"><h3 className="text-body font-semibold">{m.name}</h3><Chip>{t(`lab.kind.${m.kind}`)}</Chip></div>
          <div className="num mt-2 text-title text-brass-hi">{t('lab.mcs', { x: m.mcs.toFixed(0) })}</div>
          <p className="text-caption text-fg-faint">{MCS_TIERS[mcsTier(m.mcs)]!.name}{m.residue > 0 ? ` · ${t('lab.residue', { pct: pct(m.residue) })}` : ''}</p>
        </Card>
      ))}
    </div>
  );
}

export function Bots() {
  const me = useGame((s) => s.me)!;
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  const trading = (me.lab?.models ?? []).filter((m) => m.kind === 'trading');
  const [modelId, setModel] = useState(trading[0]?.id ?? '');
  const [strategy, setStrategy] = useState<TradingBot['strategy']>('momentum');
  const [assets, setAssets] = useState('HLCN, NRON, AVBK');
  const [alloc, setAlloc] = useState('20');
  const hasAnalyst = (me.lab?.models ?? []).some((m) => m.kind === 'analyst');
  return (
    <div className="grid gap-4 @3xl:grid-cols-2">
      <Card className="p-4">
        <h2 className="font-serif text-title">{t('lab.bot.title')}</h2>
        <p className="mt-1 text-small text-fg-muted">{t('lab.bot.sub')}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Select label={t('lab.bot.model')} value={modelId} onChange={setModel} options={trading.length ? trading.map((m) => ({ value: m.id, label: t('lab.bot.modelLine', { name: m.name, mcs: m.mcs.toFixed(0) }) })) : [{ value: '', label: t('lab.bot.needModel') }]} />
          <Select label={t('lab.bot.strategy')} value={strategy} onChange={setStrategy} options={STRATEGIES.map((s) => ({ value: s, label: t(`lab.strategy.${s}`) }))} />
          <TextField value={assets} onChange={setAssets} placeholder={t('lab.bot.tickers')} />
          <NumberField label={t('lab.bot.allocation')} value={alloc} onChange={setAlloc} suffix={t('lab.bot.allocSuffix')} />
          <Button variant="brass" disabled={!modelId} onClick={() => act({ type: 'lab.bot', modelId, strategy, assets: assets.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => config.assets.some((a) => a.id === s && a.listed !== false)), allocation: Number(alloc) / 100 }, { success: t('lab.bot.deployed') })}>{t('lab.bot.deploy')}</Button>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h2 className="font-serif text-title">{t('lab.signals.title')}</h2>
          <p className="mt-1 text-small text-fg-muted">{t('lab.signals.sub')}</p>
          <Button className="mt-3" disabled={!hasAnalyst} onClick={() => act({ type: 'lab.signal' })} testId="signal">{hasAnalyst ? t('lab.signals.run') : t('lab.signals.needModel')}</Button>
        </Card>
        <Card>
          <CardHeader title={t('lab.bots.title')} />
          {(me.lab?.bots ?? []).length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('lab.bots.none')}</p> : (
            <ul>
              {me.lab!.bots.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3 text-small">
                  <span className="font-medium">{t(`lab.strategyName.${b.strategy}`)}</span>
                  <span className="text-fg-faint">{b.assets.join(', ')}</span>
                  <span className="num text-fg-muted">{t('lab.bots.stats', { pct: pct(b.allocation), trades: b.trades })}</span>
                  <Button size="sm" className="ml-auto" onClick={() => act({ type: 'lab.botToggle', botId: b.id, active: !b.active })}>{b.active ? t('lab.bots.pause') : t('lab.bots.resume')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
