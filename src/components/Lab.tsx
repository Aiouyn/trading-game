'use client';

import { useState } from 'react';
import { DATA_SOURCES, MCS_TIERS, RESEARCH, mcsTier } from '@/content/research';
import { rankIndex } from '@/content/lifestyle';
import { compactMoney, money, pct } from '@/game/format';
import { CONFIG, useGame } from '@/game/store';
import { GPU_TIERS } from '@/world/core';
import { mcsFor } from '@/world/lab';
import type { Model, TradingBot } from '@/world/types';
import { BrassChip, Button, Card, CardHeader, Chip, Locked, NumberField, Progress, Select, Stat, Tabs, TextField, ticksLabel } from './ui';

export function LabView() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<'compute' | 'research' | 'train' | 'models' | 'bots'>('research');
  if (rankIndex(me.player.rankId) < 2) {
    return <Locked what="The AI Lab" need="Unlocks at Owner ($250k net worth). Train models that read the market, run trading bots and defend your empire." progress={me.rank.id === 'R1' ? me.rank.progress : 0} />;
  }
  const lab = me.lab;
  const tick = useGame.getState().frame?.tick ?? 0;
  return (
    <div className="flex flex-col gap-4" data-testid="lab-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-hero text-fg">AI Lab</h1>
            <p className="max-w-xl text-small text-fg-muted">Capability = Algorithm × Compute<sup>0.34</sup> × Data<sup>0.28</sup>. Research raises the algorithm, GPUs and cloud budget buy compute, data comes from brokers, scraping, synthesis and your own businesses.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            <Stat label="Algorithm" value={`×${(lab?.a ?? 1).toFixed(2)}`} />
            <Stat label="Own compute" value={`${(lab?.pflopPerDay ?? 0).toFixed(1)} PF-d/day`} />
            <Stat label="Data" value={`${Math.round(lab?.data ?? 0).toLocaleString('en-US')} DQU`} sub={lab && lab.dataSynth > 0 ? `${pct(lab.dataSynth)} synthetic` : undefined} />
            <Stat label="Spot compute" value={`$${(lab?.spotPrice ?? 1.2).toFixed(2)} / PF-day`} />
          </div>
        </div>
        {lab?.researching && (
          <div className="mt-4">
            <div className="flex justify-between text-caption"><span>Researching {RESEARCH.find((r) => r.id === lab.researching!.nodeId)?.name}</span><span className="num">{ticksLabel(lab.researching.doneTick - tick)}</span></div>
          </div>
        )}
        {lab?.training && (
          <div className="mt-3">
            <div className="flex justify-between text-caption"><span>Training “{lab.training.name}” · expected MCS {lab.training.expectedMcs.toFixed(0)} · fail odds {pct(lab.training.failOdds)}</span><span className="num">{ticksLabel(lab.training.doneTick - tick)}</span></div>
            <Progress value={(tick - lab.training.startTick) / Math.max(1, lab.training.doneTick - lab.training.startTick)} className="mt-1" />
          </div>
        )}
      </Card>
      <Tabs tabs={[{ id: 'research', label: 'Research' }, { id: 'compute', label: 'Compute & data' }, { id: 'train', label: 'Train' }, { id: 'models', label: 'Models', badge: lab?.models.length }, { id: 'bots', label: 'Bots & signals', badge: lab?.bots.length }]} value={tab} onChange={setTab} />
      {tab === 'research' && <Research />}
      {tab === 'compute' && <Compute />}
      {tab === 'train' && <Train />}
      {tab === 'models' && <Models />}
      {tab === 'bots' && <Bots />}
    </div>
  );
}

function Research() {
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {RESEARCH.filter((r) => r.era === era).map((r) => {
              const have = done.has(r.id);
              const ready = r.requires.every((x) => done.has(x));
              const current = me.lab?.researching?.nodeId === r.id;
              return (
                <Card key={r.id} className={`flex flex-col p-4 ${have ? 'border-brass/40' : ''}`} data-testid={`research-${r.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold">{r.name}</h3>
                    {have ? <BrassChip>Done</BrassChip> : <Chip>×{r.aMult.toFixed(2)}</Chip>}
                  </div>
                  <p className="mt-1 flex-1 text-small text-fg-muted">{r.blurb}</p>
                  {r.unlocks && <p className="mt-1 text-caption text-brass">Unlocks: {r.unlocks}</p>}
                  {!ready && !have && <p className="mt-1 text-caption text-fg-faint">Needs {r.requires.map((x) => RESEARCH.find((y) => y.id === x)!.name).join(', ')}</p>}
                  {!have && (
                    <Button size="sm" className="mt-3" variant={ready && !busy ? 'brass' : 'outline'} disabled={!ready || busy || (me.account?.cash ?? 0) < r.cost}
                      onClick={() => act({ type: 'lab.research', nodeId: r.id }, { success: `Research started: ${r.name}` })} testId={`start-${r.id}`}>
                      {current ? 'In progress' : `${compactMoney(r.cost)} · ${r.days} days`}
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

function Compute() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [dq, setDq] = useState('1000');
  const [res, setRes] = useState({ perDay: '100', days: '10' });
  const lab = me.lab;
  const rIdx = rankIndex(me.player.rankId);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="GPUs" sub="Owned hardware: free compute every day, but it draws power (your own power plants cover it). Resells at 60%." />
        <ul>
          {GPU_TIERS.map((t) => {
            const have = lab?.gpus[t.id] ?? 0;
            const locked = rIdx < rankIndex(t.rank);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3 text-small">
                <div className="min-w-0 flex-1"><div className="font-medium">{t.name}</div><div className="num text-caption text-fg-faint">{money(t.price)} · {t.pflopPerDay} PF-d/day · {t.powerMwhPerDay} MWh/day</div></div>
                <span className="num w-10 text-right">{have}</span>
                <NumberField value={qty[t.id] ?? '1'} onChange={(v) => setQty({ ...qty, [t.id]: v })} className="h-9 w-20" step={1} />
                <Button size="sm" disabled={locked} onClick={() => act({ type: 'lab.gpu', tier: t.id, qty: Number(qty[t.id] ?? 1) })}>{locked ? 'Locked' : 'Buy'}</Button>
                {have > 0 && <Button size="sm" variant="ghost" onClick={() => act({ type: 'lab.gpu', tier: t.id, qty: -Number(qty[t.id] ?? 1) })}>Sell</Button>}
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h3 className="font-serif text-title">Reserved compute</h3>
          <p className="mt-1 text-small text-fg-muted">Prepay a block of cloud compute per day: $2.00 per PFLOP-day at the reference Compute price. Counts toward every run while it lasts.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField label="PF-d/day" value={res.perDay} onChange={(v) => setRes({ ...res, perDay: v })} />
            <NumberField label="Days" value={res.days} onChange={(v) => setRes({ ...res, days: v })} />
          </div>
          <Button className="mt-2 w-full" onClick={() => act({ type: 'lab.reserve', perDay: Number(res.perDay), days: Number(res.days) }, { success: 'Compute reserved' })}>
            Reserve · ~{money(Number(res.perDay) * Number(res.days) * 2 * ((lab?.spotPrice ?? 1.2) / 1.2))}
          </Button>
          {lab?.reserved && <p className="mt-2 text-caption text-fg-faint">Active: {lab.reserved.perDay} PF-d/day</p>}
        </Card>
        <Card className="p-4">
          <h3 className="font-serif text-title">Data</h3>
          <p className="mt-1 text-small text-fg-muted">Data decays 2% a day (freshness). Your businesses deliver partnership data daily; software, media and compute businesses deliver the most.</p>
          <NumberField className="mt-3" label="DQU" value={dq} onChange={setDq} />
          <div className="mt-2 grid gap-2">
            {DATA_SOURCES.filter((s) => s.id !== 'partnership').map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-ink-3 p-2.5">
                <div className="min-w-0"><div className="text-small font-medium">{s.name}</div><div className="text-caption text-fg-faint">{s.blurb}</div></div>
                <Button size="sm" onClick={() => act({ type: 'lab.data', source: s.id, qty: Number(dq) }, { success: `Bought ${dq} DQU` })}>{money(Number(dq) * (lab?.dataPrice ?? 0.05) * s.priceMult)}</Button>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-serif text-title">Researchers</h3>
          <p className="mt-1 text-small text-fg-muted">$1,500 a day each. Each one speeds research 5% and cuts training failure odds by a point.</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="num text-title">{lab?.researchers ?? 0}</span>
            <Button size="sm" onClick={() => act({ type: 'lab.hire', qty: 1 })}>Hire</Button>
            <Button size="sm" variant="ghost" onClick={() => act({ type: 'lab.hire', qty: -1 })}>Let go</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Train() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [kind, setKind] = useState<Model['kind']>('trading');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('5000');
  const [careful, setCareful] = useState(true);
  const lab = me.lab;
  const b = Number(budget) || 0;
  const spot = b / (lab?.spotPrice ?? 1.2);
  let days = 1 + 0.5 * Math.log10(1 + spot);
  if (careful) days *= 1.5;
  if (lab?.research.includes('distributed')) days *= 0.7;
  const reserved = lab?.reserved ? lab.reserved.perDay : 0;
  const pflop = spot + ((lab?.pflopPerDay ?? 0) + reserved) * days;
  const dqu = Math.min(lab?.data ?? 0, pflop * 1.5);
  const expected = lab ? mcsFor(lab, pflop, dqu, careful) : 0;
  const fail = Math.max(0.02, (careful ? 0.06 : 0.18) - 0.01 * (lab?.researchers ?? 0));
  const tier = MCS_TIERS[mcsTier(expected)]!;
  return (
    <Card className="p-4" data-testid="train">
      <h3 className="font-serif text-title">New training run</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Select label="Kind" value={kind} onChange={setKind} options={[
            { value: 'trading', label: 'Trading model (bots)' }, { value: 'analyst', label: 'Analyst model (signals, better notes)' }, { value: 'security', label: 'Security model (attack and defense)' },
          ]} />
          <TextField value={name} onChange={setName} placeholder="Model name" maxLength={32} />
          <NumberField label="Cloud budget" value={budget} onChange={setBudget} suffix="$" />
          <label className="flex items-center gap-2 text-small text-fg-muted"><input type="checkbox" checked={careful} onChange={(e) => setCareful(e.target.checked)} /> Careful run (50% longer, fails a third as often)</label>
        </div>
        <div className="rounded-md border border-ink-3 p-3 text-small">
          <div className="flex justify-between"><span className="text-fg-muted">Compute</span><span className="num">{Math.round(pflop).toLocaleString('en-US')} PF-days</span></div>
          <div className="flex justify-between"><span className="text-fg-muted">Data used</span><span className="num">{Math.round(dqu).toLocaleString('en-US')} DQU</span></div>
          <div className="flex justify-between"><span className="text-fg-muted">Duration</span><span className="num">{days.toFixed(1)} game days</span></div>
          <div className="flex justify-between"><span className="text-fg-muted">Failure odds</span><span className="num text-warn">{pct(fail)}</span></div>
          <div className="mt-2 flex justify-between border-t border-ink-2 pt-2"><span className="font-semibold">Expected MCS</span><span className="num font-semibold text-brass-hi">{expected.toFixed(0)} · {tier.name}</span></div>
          {dqu < pflop * 0.5 && <p className="mt-2 text-caption text-warn">Data-starved: buy data or the run underperforms (the best runs balance compute and data).</p>}
        </div>
      </div>
      <Button variant="brass" className="mt-3 w-full" disabled={!!lab?.training} onClick={() => act({ type: 'lab.train', kind, name, budget: b, careful }, { success: 'Training started' })} testId="start-training">
        {lab?.training ? 'A run is in progress' : `Start training · ${money(b)}`}
      </Button>
    </Card>
  );
}

function Models() {
  const me = useGame((s) => s.me)!;
  const models = me.lab?.models ?? [];
  if (!models.length) return <Card className="p-8 text-center font-serif text-title text-fg-muted">No models yet. Research, then train.</Card>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {models.map((m) => (
        <Card key={m.id} className="p-4" data-testid={`model-${m.id}`}>
          <div className="flex items-start justify-between"><h3 className="text-body font-semibold">{m.name}</h3><Chip>{m.kind}</Chip></div>
          <div className="num mt-2 text-title text-brass-hi">MCS {m.mcs.toFixed(0)}</div>
          <p className="text-caption text-fg-faint">{MCS_TIERS[mcsTier(m.mcs)]!.name}{m.residue > 0 ? ` · watermark residue ${pct(m.residue)} (traceable)` : ''}</p>
        </Card>
      ))}
    </div>
  );
}

function Bots() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const trading = (me.lab?.models ?? []).filter((m) => m.kind === 'trading');
  const [modelId, setModel] = useState(trading[0]?.id ?? '');
  const [strategy, setStrategy] = useState<TradingBot['strategy']>('momentum');
  const [assets, setAssets] = useState('HLCN, NRON, AVBK');
  const [alloc, setAlloc] = useState('20');
  const hasAnalyst = (me.lab?.models ?? []).some((m) => m.kind === 'analyst');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="font-serif text-title">Deploy a trading bot</h3>
        <p className="mt-1 text-small text-fg-muted">Bots trade with your money through the same order book as everyone. Better models see the market more clearly and act more often. Crowded strategies stop working.</p>
        <div className="mt-3 flex flex-col gap-2">
          <Select label="Model" value={modelId} onChange={setModel} options={trading.length ? trading.map((m) => ({ value: m.id, label: `${m.name} (MCS ${m.mcs.toFixed(0)})` })) : [{ value: '', label: 'Train a trading model first' }]} />
          <Select label="Strategy" value={strategy} onChange={setStrategy} options={[
            { value: 'momentum', label: 'Momentum: buy what is rising today' }, { value: 'meanrev', label: 'Mean reversion: fade big moves' },
            { value: 'value', label: 'Value: buy below fair value (needs trees)' }, { value: 'earnings', label: 'Earnings: trade the previews (needs sentiment)' },
            { value: 'trend', label: 'Trend: follow the moving average (needs RL)' },
          ]} />
          <TextField value={assets} onChange={setAssets} placeholder="Tickers, comma separated" />
          <NumberField label="Allocation" value={alloc} onChange={setAlloc} suffix="% of equity" />
          <Button variant="brass" disabled={!modelId} onClick={() => act({ type: 'lab.bot', modelId, strategy, assets: assets.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => CONFIG.assets.some((a) => a.id === s)), allocation: Number(alloc) / 100 }, { success: 'Bot deployed' })}>Deploy</Button>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h3 className="font-serif text-title">Analyst signals</h3>
          <p className="mt-1 text-small text-fg-muted">Your analyst model scans the market for the biggest gaps between price and fair value. One pack per game day, delivered to your inbox.</p>
          <Button className="mt-3" disabled={!hasAnalyst} onClick={() => act({ type: 'lab.signal' })} testId="signal">{hasAnalyst ? 'Run signal pack' : 'Train an analyst model first'}</Button>
        </Card>
        <Card>
          <CardHeader title="Your bots" />
          {(me.lab?.bots ?? []).length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">No bots running.</p> : (
            <ul>
              {me.lab!.bots.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3 text-small">
                  <span className="font-medium">{b.strategy}</span>
                  <span className="text-fg-faint">{b.assets.join(', ')}</span>
                  <span className="num text-fg-muted">{pct(b.allocation)} · {b.trades} trades</span>
                  <Button size="sm" className="ml-auto" onClick={() => act({ type: 'lab.botToggle', botId: b.id, active: !b.active })}>{b.active ? 'Pause' : 'Resume'}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
