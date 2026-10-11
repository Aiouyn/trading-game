'use client';

// Security (Velvet app 10): your connections, defense and anomalies, and (Operator and up) operations
// against rivals. Calm by default: red appears only when your defense flags an entry, and Lockdown is the
// only loud control. Every action shows its cost before you confirm (bible 03, 04 section 10.5).
import { useState } from 'react';
import { compactMoney, money, pct } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import type { SessionStrength } from '@/world/types';
import { deepScanCost, disconnectCost, scanCooldownLeft } from '@/world/cyber';
import { HONEYPOT_COST, type HoneypotKind } from '@/world/honeypots';
import { t } from '@/i18n';
import { isAppUnlocked } from '@/shell/ctx';
import { openApp } from '@/components/os/shellStore';
import { AppLocked } from '@/components/apps/AppLocked';
import { Button, Card, CardHeader, Chip, ConfirmButton, NumberField, Progress, Select, Stat, Tabs, ticksLabel } from '@/components/ui';

const STRENGTHS: SessionStrength[] = ['whisper', 'tap', 'siphon'];
const HONEYPOT_KINDS: HoneypotKind[] = ['basic', 'advanced', 'frontier'];
const DEFENSE_SCAN_DAYS = [0, 24, 12, 6, 4, 2];
const EXPECTED_LOAD = [0.06, 0.12, 0.25, 0.5, 1, 2];

type Tab = 'connections' | 'ops';

/** Security is one app: below its rank (APPS.security.minRank) the whole window is the lock screen. */
export function SecurityApp() {
  const me = useGame((s) => s.me)!;
  const [tab, setTab] = useState<Tab>('connections');
  if (!isAppUnlocked('security', me.player.rankId)) {
    return <AppLocked app="security" copy={(rank, amount) => t('security.locked.need', { rank, amount })} />;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="security-view">
      <Tabs<Tab> tabs={[{ id: 'connections', label: t('security.tab.connections') }, { id: 'ops', label: t('security.tab.ops'), badge: me.security.liveSessions.length }]} value={tab} onChange={setTab} />
      {tab === 'connections' ? <Connections /> : <Operations />}
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
  const expected = EXPECTED_LOAD[sec.tier] ?? 0.1;
  const scanLeft = scanCooldownLeft(sec.lastScanTick, tick);
  const lockdownActive = sec.lockdownUntil > tick;
  return (
    <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)] [&>*]:min-w-0">
      <Card data-testid="connections-panel">
        <CardHeader title={t('security.conn.title')} sub={t('security.conn.sub')} right={
          <label className="flex items-center gap-2 text-caption text-fg-muted"><input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} /> {t('security.conn.untagged')}</label>
        } />
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr>
                <th className="label px-3 py-2 text-left">{t('security.col.kind')}</th>
                <th className="label px-3 py-2 text-left">{t('security.col.endpoint')}</th>
                <th className="label px-3 py-2 text-right">{t('security.col.firstSeen')}</th>
                <th className="label px-3 py-2 text-right">{t('security.col.handshake')}</th>
                <th className="label px-3 py-2 text-right">{t('security.col.load')}</th>
                <th className="label px-3 py-2 text-left">{t('security.col.status')}</th>
                <th className="px-3 py-2"><span className="sr-only">{t('security.col.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={`border-t border-ink-2 ${e.flagged ? 'bg-signal/[0.06]' : ''}`} data-testid={`entry-${e.id}`}>
                  <td className="px-3 py-2 text-fg-muted">{e.kind}</td>
                  <td className="num px-3 py-2">{e.codename}</td>
                  <td className="num px-3 py-2 text-right text-fg-faint">{clockLabel(e.firstSeenTick, 720)}</td>
                  <td className="num px-3 py-2 text-right text-fg-faint">{clockLabel(e.lastHandshakeTick, 720).split(' · ')[0]}</td>
                  <td className="num px-3 py-2 text-right">{pct(e.load)}</td>
                  <td className="px-3 py-2">
                    {e.flagged ? <Chip className="border-signal/60 text-signal">{t('security.flagged')}</Chip> : e.tag ? <Chip className={e.tag === 'trusted' ? 'border-gain/40 text-gain' : 'border-warn/50 text-warn'}>{t(`security.tag.${e.tag}`)}</Chip> : <span className="text-caption text-fg-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" className="mr-2 text-caption text-fg-muted hover:text-fg" onClick={() => act({ type: 'sec.tag', entryId: e.id, tag: e.tag === 'trusted' ? null : 'trusted' })}>{t('security.trust')}</button>
                    <button type="button" className="mr-2 text-caption text-fg-muted hover:text-fg" onClick={() => act({ type: 'sec.tag', entryId: e.id, tag: e.tag === 'watch' ? null : 'watch' })}>{t('security.watch')}</button>
                    <ConfirmButton confirm={e.flagged ? t('security.cutFree') : t('security.cutFor', { amount: compactMoney(disconnectCost(e.flagged, me.netWorth.total)) })} onConfirm={() => act({ type: 'sec.disconnect', entryId: e.id })} testId={`cut-${e.id}`}>{t('security.disconnect')}</ConfirmButton>
                  </td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-fg-faint">{t('security.conn.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <h2 className="font-serif text-title">{t('security.defense.title')}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Stat label={t('security.defense.tier')} value={`T${sec.tier}`} sub={sec.tier ? t('security.defense.autoScan', { days: DEFENSE_SCAN_DAYS[sec.tier] ?? 0 }) : t('security.defense.noScan')} />
            <Stat label={t('security.defense.points')} value={Math.round(sec.dp)} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-caption"><span className="text-fg-muted">{t('security.defense.throughput')}</span><span className="num">{t('security.defense.throughputValue', { load: pct(load), normal: pct(expected) })}</span></div>
            <Progress value={load / Math.max(expected * 2, 0.01)} tone={load > expected * 1.3 ? 'warn' : 'steel'} className="mt-1" label={t('security.defense.throughput')} />
          </div>
          <div className="mt-3 rounded-md border border-ink-3 p-3" data-testid="honeypot">
            <div className="text-small font-semibold">{t('security.honeypot.title')}</div>
            <p className="mt-1 text-caption text-fg-faint" data-testid="honeypot-state">{sec.honeypot ? t('security.honeypot.placed', { kind: t(`security.honeypot.kind.${sec.honeypot.kind}`) }) : t('security.honeypot.none')}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 @md:grid-cols-3">
              {HONEYPOT_KINDS.map((k) => (
                <ConfirmButton key={k} size="sm" confirm={t('security.honeypot.confirm', { kind: t(`security.honeypot.kind.${k}`), amount: money(HONEYPOT_COST[k]) })} onConfirm={() => act({ type: 'sec.honeypot', kind: k }, { success: t('security.honeypot.done') })} testId={`honeypot-${k}`}>
                  {t('security.honeypot.button', { kind: t(`security.honeypot.kind.${k}`), amount: money(HONEYPOT_COST[k]) })}
                </ConfirmButton>
              ))}
            </div>
            <p className="mt-1 text-caption text-fg-faint">{t('security.honeypot.hint')}</p>
          </div>
          <NumberField className="mt-3" label={t('security.defense.budget')} value={budget} onChange={setBudget} suffix="$" testId="sec-budget" />
          <Button size="sm" className="mt-2 w-full" onClick={() => act({ type: 'sec.budget', budget: Number(budget) }, { success: t('security.budget.set') })}>{t('security.budget.button')}</Button>
          <p className="mt-1 text-caption text-fg-faint">{t('security.defense.hint')}</p>
          {/* The engine refuses a second deep scan inside the cooldown, so the button says when it opens again. */}
          <Button className="mt-3 w-full" disabled={scanLeft > 0} onClick={() => act({ type: 'sec.scan' }, { success: t('security.scan.done') })} testId="deep-scan">
            {scanLeft > 0 ? t('security.scan.cooling', { time: ticksLabel(scanLeft) }) : t('security.scan.button', { amount: money(deepScanCost(me.netWorth.total)) })}
          </Button>
          <ConfirmButton variant="danger" size="md" confirm={t('security.lockdown.confirm')} onConfirm={() => act({ type: 'sec.lockdown' })} disabled={lockdownActive} testId="lockdown">
            {lockdownActive ? t('security.lockdown.active') : t('security.lockdown.button')}
          </ConfirmButton>
          <p className="mt-1 text-caption text-fg-faint">{t('security.lockdown.hint')}</p>
        </Card>
        <Card className="p-4" data-testid="anomaly-feed">
          <h2 className="font-serif text-title">{t('security.anomalies.title')}</h2>
          <p className="mt-1 text-caption text-fg-faint">{t('security.anomalies.sub')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {sec.clues.slice().reverse().slice(0, 12).map((c) => (
              <li key={c.id} className="rounded-md border border-steel/30 bg-steel/[0.05] px-3 py-2 text-small">
                <span className="text-steel">{c.kind}</span>
                {c.entryId && <span className="num text-fg-muted"> · {sec.entries.find((e) => e.id === c.entryId)?.codename ?? t('security.unknownEndpoint')}</span>}
                <span className="num float-right text-caption text-fg-faint">{clockLabel(c.tick, 720).split(' · ')[0]}</span>
              </li>
            ))}
            {!sec.clues.length && <li className="text-small text-fg-faint">{t('security.anomalies.none')}</li>}
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
  const models = (me.lab?.models ?? []).filter((m) => m.kind === 'security');
  const targets = directory.filter((d) => d.id !== me.player.id).sort((a, b) => b.netWorth - a.netWorth);
  // The directory and the model list can arrive after mount, so the selection is derived: the player's pick
  // when it is still on the list, else the first entry. Nothing is left pointing at an empty value.
  const [pickVictim, setVictim] = useState<string | null>(null);
  const [pickModel, setModel] = useState<string | null>(null);
  const victim = pickVictim && targets.some((x) => x.id === pickVictim) ? pickVictim : (targets[0]?.id ?? '');
  const modelId = pickModel && models.some((m) => m.id === pickModel) ? pickModel : (models[0]?.id ?? '');
  const [strength, setStrength] = useState<SessionStrength>('tap');
  // the canary add-on (+20%): it may flag a honeypot in the target and steer the op away from it (M29)
  const [canary, setCanary] = useState(false);
  // rival funds are targets too (M28): their id travels as fund:<id>
  const funds = (me.rivals?.rows ?? []).map((r) => ({ value: `fund:${r.id}`, label: t('security.ops.fund', { name: r.name }) }));
  const handle = (id: string) => directory.find((d) => d.id === id)?.handle ?? id;
  return (
    <div className="grid gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-4">
        <h2 className="font-serif text-title">{t('security.ops.new')}</h2>
        <p className="mt-1 text-small text-fg-muted">{t('security.ops.intro')}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Select label={t('security.ops.target')} value={victim} onChange={(v) => setVictim(v)} options={[...targets.map((x) => ({ value: x.id, label: x.npc ? t('security.ops.targetNpc', { handle: x.handle, amount: compactMoney(x.netWorth) }) : t('security.ops.target.line', { handle: x.handle, amount: compactMoney(x.netWorth) }) })), ...funds]} />
          <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
            {STRENGTHS.map((s) => (
              <button key={s} type="button" aria-pressed={strength === s} onClick={() => setStrength(s)} className={`rounded-md border p-2 text-left ${strength === s ? 'border-brass/60 bg-ink-2' : 'border-ink-3'}`}>
                <div className="text-small font-semibold">{t(`security.strength.${s}.label`)}</div>
                <div className="text-caption text-fg-faint">{t(`security.strength.${s}.text`)}</div>
              </button>
            ))}
          </div>
          <Select label={t('security.ops.model')} value={modelId} onChange={(v) => setModel(v)} options={models.length ? models.map((m) => ({ value: m.id, label: t('security.ops.modelLine', { name: m.name, mcs: m.mcs.toFixed(0) }) })) : [{ value: '', label: t('security.ops.noModel') }]} />
          <button type="button" aria-pressed={canary} data-testid="canary" onClick={() => setCanary(!canary)} className={`rounded-md border p-2 text-left text-small ${canary ? 'border-brass/60 bg-ink-2' : 'border-ink-3'}`}>
            <div className="font-semibold">{t('security.ops.canary')}</div>
            <div className="text-caption text-fg-faint">{t('security.ops.canary.text')}</div>
          </button>
          <ConfirmButton variant="brass" size="md" confirm={t('security.ops.launch.confirm')} disabled={!modelId || !victim} onConfirm={() => (victim.startsWith('fund:') ? act({ type: 'sec.fund', fundId: victim.slice(5), strength, modelId, canary }) : act({ type: 'sec.plant', victimId: victim, strength, modelId, canary }))} testId="plant">{t('security.ops.launch')}</ConfirmButton>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title={t('security.ops.live')} />
          {me.security.liveSessions.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('security.ops.none')}</p> : (
            <ul>
              {me.security.liveSessions.map((s) => (
                <li key={s.entryId} className="border-t border-ink-2 px-4 py-3 text-small">
                  <div className="flex justify-between gap-2"><span>{handle(s.victimId)} · {t(`security.strength.${s.strength as SessionStrength}.label`)}</span><span className="num">{t('security.ops.copied', { pct: pct(s.progress) })}</span></div>
                  <Progress value={s.progress / 0.85} className="mt-1.5" label={t('security.ops.live')} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t('security.evidence.title')} sub={t('security.evidence.sub')} />
          {me.security.evidence.length === 0 ? <p className="px-4 pb-6 text-small text-fg-faint">{t('security.ops.none')}</p> : (
            <ul>
              {me.security.evidence.map((e) => (
                <li key={e.against} className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-2 px-4 py-3 text-small">
                  <span>{directory.find((d) => d.id === e.against)?.handle ?? t('security.unknown')}</span>
                  <span className="num">{t('security.evidence.points', { n: Math.round(e.points) })}</span>
                  <Button size="sm" onClick={() => openApp('legal', {}, { focus: true })}>{t('security.evidence.court')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t('security.recent.title')} />
          <ul>
            {me.security.myOps.slice(0, 10).map((o) => (
              <li key={o.id} className="flex justify-between gap-2 border-t border-ink-2 px-4 py-2 text-small">
                <span>{handle(o.victimId)} · {t(`security.strength.${o.strength as SessionStrength}.label`)}</span>
                <span className={o.result === 'planted' ? 'text-gain' : 'text-loss'}>{t(`security.result.${o.result}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
