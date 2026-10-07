'use client';

import { useState } from 'react';
import { rankIndex } from '@/content/lifestyle';
import { compactMoney, money, pct } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import type { SessionStrength } from '@/world/types';
import { Button, Card, CardHeader, Chip, ConfirmButton, Locked, NumberField, Progress, Select, Stat, Tabs } from './ui';

const STRENGTH_INFO: Record<SessionStrength, { label: string; text: string }> = {
  whisper: { label: 'Whisper', text: 'Easier to plant, slow to copy, hard to spot.' },
  tap: { label: 'Tap', text: 'Balanced.' },
  siphon: { label: 'Siphon', text: 'Hard to plant, copies fast, leaves loud clues.' },
};

/**
 * Security Ops (bible 03, 04 §10.5). Calm by default: every row in the Connections panel uses the
 * same fields, red appears only when your defense AI flags an entry, and Lockdown is the only loud
 * control. Every action shows its cost before you confirm.
 */
export function SecurityView() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<'connections' | 'ops'>('connections');
  const unlocked = rankIndex(me.player.rankId) >= 3;
  const hasEntries = me.security.entries.length > 0;
  if (!unlocked && !hasEntries) {
    return <Locked what="Security Ops" need="Unlocks at Operator ($5M). Watch your connections, run scans, and, if you dare, run operations against rivals. Crime has an expected value; courts collect." progress={0} />;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="security-view">
      <Tabs tabs={[{ id: 'connections', label: 'Connections' }, { id: 'ops', label: 'Operations', badge: me.security.liveSessions.length }]} value={tab} onChange={setTab} />
      {tab === 'connections' ? <Connections /> : unlocked ? <Operations /> : <Locked what="Operations" need="Unlock at Operator ($5M)." />}
    </div>
  );
}

function Connections() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  const [budget, setBudget] = useState(String(me.security.budget));
  const [onlyUntagged, setOnlyUntagged] = useState(false);
  const sec = me.security;
  const entries = sec.entries.filter((e) => !onlyUntagged || !e.tag).sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.kind.localeCompare(b.kind));
  const load = sec.entries.reduce((s, e) => s + e.load, 0);
  const expected = [0.06, 0.12, 0.25, 0.5, 1, 2][sec.tier] ?? 0.1;
  const cutCost = Math.min(250_000, 1000 + 0.0002 * me.netWorth.total);
  const lockdownActive = sec.lockdownUntil > tick;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
      <Card data-testid="connections-panel">
        <CardHeader title="Connections" sub="Everything talking to your systems: data feeds, broker links, partners. Hostile sessions hide among them." right={
          <label className="flex items-center gap-2 text-caption text-fg-muted"><input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} /> Untagged only</label>
        } />
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead><tr><th className="label px-3 py-2 text-left">Kind</th><th className="label px-3 py-2 text-left">Endpoint</th><th className="label px-3 py-2 text-right">First seen</th><th className="label px-3 py-2 text-right">Last handshake</th><th className="label px-3 py-2 text-right">Load</th><th className="label px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={`border-t border-ink-2 ${e.flagged ? 'bg-signal/[0.06]' : ''}`} data-testid={`entry-${e.id}`}>
                  <td className="px-3 py-2 text-fg-muted">{e.kind}</td>
                  <td className="num px-3 py-2">{e.codename}</td>
                  <td className="num px-3 py-2 text-right text-fg-faint">{clockLabel(e.firstSeenTick, 720)}</td>
                  <td className="num px-3 py-2 text-right text-fg-faint">{clockLabel(e.lastHandshakeTick, 720).split(' · ')[0]}</td>
                  <td className="num px-3 py-2 text-right">{pct(e.load)}</td>
                  <td className="px-3 py-2">
                    {e.flagged ? <Chip className="border-signal/60 text-signal">Flagged</Chip> : e.tag ? <Chip className={e.tag === 'trusted' ? 'border-gain/40 text-gain' : 'border-warn/50 text-warn'}>{e.tag}</Chip> : <span className="text-caption text-fg-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" className="mr-2 text-caption text-fg-muted hover:text-fg" onClick={() => act({ type: 'sec.tag', entryId: e.id, tag: e.tag === 'trusted' ? null : 'trusted' })}>Trust</button>
                    <button type="button" className="mr-2 text-caption text-fg-muted hover:text-fg" onClick={() => act({ type: 'sec.tag', entryId: e.id, tag: e.tag === 'watch' ? null : 'watch' })}>Watch</button>
                    <ConfirmButton confirm={e.flagged ? 'Cut (free)' : `Cut · ${compactMoney(cutCost)}`} onConfirm={() => act({ type: 'sec.disconnect', entryId: e.id })} testId={`cut-${e.id}`}>Disconnect</ConfirmButton>
                  </td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-fg-faint">No connections.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h3 className="font-serif text-title">Defense</h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="Defense tier" value={`T${sec.tier}`} sub={sec.tier ? `auto-scan every ${[0, 24, 12, 6, 4, 2][sec.tier]} days` : 'no auto-scan'} />
            <Stat label="Defense points" value={Math.round(sec.dp)} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-caption"><span className="text-fg-muted">Throughput used</span><span className="num">{pct(load)} (normal ≈ {pct(expected)})</span></div>
            <Progress value={load / Math.max(expected * 2, 0.01)} tone={load > expected * 1.3 ? 'warn' : 'steel'} className="mt-1" label="Throughput" />
          </div>
          <NumberField className="mt-3" label="Budget / day" value={budget} onChange={setBudget} suffix="$" />
          <Button size="sm" className="mt-2 w-full" onClick={() => act({ type: 'sec.budget', budget: Number(budget) }, { success: 'Security budget set' })}>Set budget</Button>
          <p className="mt-1 text-caption text-fg-faint">Spending adds defense with diminishing returns: 40·√(budget/10k). $10k/day also unlocks T1 auto-scans.</p>
          <Button className="mt-3 w-full" onClick={() => act({ type: 'sec.scan' }, { success: 'Deep scan complete' })} testId="deep-scan">Deep scan · {money(5000 + 0.0001 * me.netWorth.total)}</Button>
          <ConfirmButton variant="danger" size="md" confirm="Cut everything" onConfirm={() => act({ type: 'sec.lockdown' })} disabled={lockdownActive} testId="lockdown">
            {lockdownActive ? 'Lockdown active' : 'Lockdown'}
          </ConfirmButton>
          <p className="mt-1 text-caption text-fg-faint">Lockdown cuts every connection, pauses your AIs for 2 days and costs $500 per legit reconnect; then 12 days of shield.</p>
        </Card>
        <Card className="p-4" data-testid="anomaly-feed">
          <h3 className="font-serif text-title">Anomalies</h3>
          <p className="mt-1 text-caption text-fg-faint">Some are clues, most are noise. The same endpoint named again and again is the tell.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {sec.clues.slice().reverse().slice(0, 12).map((c) => (
              <li key={c.id} className="rounded-md border border-steel/30 bg-steel/[0.05] px-3 py-2 text-small">
                <span className="text-steel">{c.kind}</span>
                {c.entryId && <span className="num text-fg-muted"> · {sec.entries.find((e) => e.id === c.entryId)?.codename ?? 'unknown endpoint'}</span>}
                <span className="num float-right text-caption text-fg-faint">{clockLabel(c.tick, 720).split(' · ')[0]}</span>
              </li>
            ))}
            {!sec.clues.length && <li className="text-small text-fg-faint">Nothing unusual.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Operations() {
  const me = useGame((s) => s.me)!;
  const directory = useGame((s) => s.directory);
  const act = useGame((s) => s.act);
  const setScreen = useGame((s) => s.setScreen);
  const models = (me.lab?.models ?? []).filter((m) => m.kind === 'security');
  const targets = directory.filter((d) => d.id !== me.player.id).sort((a, b) => b.netWorth - a.netWorth);
  const [victim, setVictim] = useState(targets[0]?.id ?? '');
  const [strength, setStrength] = useState<SessionStrength>('tap');
  const [modelId, setModel] = useState(models[0]?.id ?? '');
  return (
    <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-4">
        <h3 className="font-serif text-title">New operation</h3>
        <p className="mt-1 text-small text-fg-muted">Plant a hidden session on a rival’s systems. While it stays connected it slowly copies their best model (never more than 85%). It can be found, and found sessions become evidence in court. New players, rookies and shielded accounts are off limits; hitting someone far smaller costs five times more.</p>
        <div className="mt-3 flex flex-col gap-2">
          <Select label="Target" value={victim} onChange={setVictim} options={targets.map((t) => ({ value: t.id, label: `${t.handle} · ${compactMoney(t.netWorth)}${t.npc ? ' · NPC' : ''}` }))} />
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(STRENGTH_INFO) as SessionStrength[]).map((s) => (
              <button key={s} type="button" onClick={() => setStrength(s)} className={`rounded-md border p-2 text-left ${strength === s ? 'border-brass/60 bg-ink-2' : 'border-ink-3'}`}>
                <div className="text-small font-semibold">{STRENGTH_INFO[s].label}</div>
                <div className="text-caption text-fg-faint">{STRENGTH_INFO[s].text}</div>
              </button>
            ))}
          </div>
          <Select label="Security model" value={modelId} onChange={setModel} options={models.length ? models.map((m) => ({ value: m.id, label: `${m.name} (attack ${m.mcs.toFixed(0)})` })) : [{ value: '', label: 'Train a security model first' }]} />
          <ConfirmButton variant="brass" size="md" confirm="Launch" disabled={!modelId || !victim} onConfirm={() => act({ type: 'sec.plant', victimId: victim, strength, modelId })} testId="plant">Launch operation</ConfirmButton>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Live sessions" />
          {me.security.liveSessions.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">None.</p> : (
            <ul>
              {me.security.liveSessions.map((s) => (
                <li key={s.entryId} className="border-t border-ink-2 px-4 py-3 text-small">
                  <div className="flex justify-between"><span>{directory.find((d) => d.id === s.victimId)?.handle ?? s.victimId} · {STRENGTH_INFO[s.strength as SessionStrength].label}</span><span className="num">{pct(s.progress)} copied</span></div>
                  <Progress value={s.progress / 0.85} className="mt-1.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Evidence you hold" sub="Points from sessions you cut and attempts you blocked. File in court above 20 points; 40 clears the civil bar." />
          {me.security.evidence.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">None.</p> : (
            <ul>
              {me.security.evidence.map((e) => (
                <li key={e.against} className="flex items-center justify-between border-t border-ink-2 px-4 py-3 text-small">
                  <span>{directory.find((d) => d.id === e.against)?.handle ?? 'Unknown'}</span>
                  <span className="num">{Math.round(e.points)} pts</span>
                  <Button size="sm" onClick={() => setScreen('court')}>Go to court</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent operations" />
          <ul>
            {me.security.myOps.slice(0, 10).map((o) => (
              <li key={o.id} className="flex justify-between border-t border-ink-2 px-4 py-2 text-small">
                <span>{directory.find((d) => d.id === o.victimId)?.handle} · {o.strength}</span>
                <span className={o.result === 'planted' ? 'text-gain' : 'text-loss'}>{o.result}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
