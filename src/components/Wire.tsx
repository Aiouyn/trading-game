'use client';

import { useState } from 'react';
import { earningsCalendar } from '@/engine';
import { consensusLabel } from '@/content/news';
import { clockLabel } from '@/game/clock';
import { assetDefOf, useGame } from '@/game/store';
import type { WireItem } from '@/world/types';
import { TONE_TEXT } from './Shell';
import { Card, CardHeader, Chip } from './ui';

const FILTERS: { id: string; label: string; kinds: WireItem['kind'][] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'markets', label: 'Markets', kinds: ['move', 'halt', 'reopen', 'liquidation'] },
  { id: 'earnings', label: 'Earnings', kinds: ['earnings', 'preview', 'rumor'] },
  { id: 'macro', label: 'Macro', kinds: ['macro', 'rates'] },
  { id: 'players', label: 'Players', kinds: ['biz', 'purchase', 'milestone', 'filing', 'alliance', 'chapter'] },
  { id: 'law', label: 'Courts & security', kinds: ['court', 'security'] },
];

export function WireView() {
  const wire = useGame((s) => s.wire);
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const [f, setF] = useState('all');
  const kinds = FILTERS.find((x) => x.id === f)!.kinds;
  const items = wire.filter((w) => !kinds || kinds.includes(w.kind));
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]" data-testid="wire-view">
      <Card>
        <CardHeader title="The Wire" sub="Every headline comes from something that really happened in the world." />
        <div className="flex gap-1 overflow-x-auto px-4 pb-3">
          {FILTERS.map((x) => (
            <button key={x.id} type="button" onClick={() => setF(x.id)} className={`shrink-0 rounded-chip border px-3 py-1 text-caption ${f === x.id ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}>{x.label}</button>
          ))}
        </div>
        <ul>
          {items.map((w) => (
            <li key={w.id} className="flex gap-3 border-t border-ink-2 px-4 py-2.5">
              <span className="num w-24 shrink-0 text-caption text-fg-faint">{clockLabel(w.tick, 720)}</span>
              <div className="min-w-0">
                <span className={`mr-2 text-caption font-semibold uppercase ${TONE_TEXT[w.tone]}`}>{w.tag}</span>
                {w.assetId ? (
                  <button type="button" className="text-left text-small text-fg hover:underline" onClick={() => { select(w.assetId!); setScreen('market'); }}>{w.text}</button>
                ) : <span className="text-small text-fg">{w.text}</span>}
              </div>
            </li>
          ))}
          {!items.length && <li className="px-4 py-8 text-center text-small text-fg-faint">Nothing yet.</li>}
        </ul>
      </Card>
      <Calendar />
    </div>
  );
}

export function Calendar() {
  const world = useGame((s) => s.world)!;
  const frame = useGame((s) => s.frame)!;
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const today = frame.tick <= 0 ? 0 : Math.floor((frame.tick - 1) / 720);
  const cal = earningsCalendar(world, 10);
  const r = frame.rates;
  return (
    <Card data-testid="calendar">
      <CardHeader title="Calendar" sub="What is scheduled. Position before it, not after." />
      {r && (
        <div className="px-4 pb-3 text-small">
          <div className="flex justify-between border-t border-ink-2 py-2"><span>Central bank decision</span><span className="num text-fg-muted">in {Math.max(0, r.nextMeeting - today)} days</span></div>
          <p className="text-caption text-fg-faint">Policy {(r.policy * 100).toFixed(2)}%. Markets expect {r.expectedMove === 0 ? 'a hold' : `${r.expectedMove > 0 ? 'a hike' : 'a cut'} of ${Math.abs(Math.round(r.expectedMove * 1e4))} bp`}. A surprise moves stocks and bonds.</p>
          <div className="flex justify-between border-t border-ink-2 py-2"><span>{r.releaseKind === 'cpi' ? 'Inflation (CPI)' : 'Jobs & growth'} release</span><span className="num text-fg-muted">in {Math.max(0, r.nextRelease - today)} days</span></div>
          <p className="text-caption text-fg-faint">2y {(r.y2 * 100).toFixed(2)}% · 10y {(r.y10 * 100).toFixed(2)}% · 30y {(r.y30 * 100).toFixed(2)}%{r.y2 > r.y10 ? ' · inverted curve: a classic recession warning' : ''}</p>
        </div>
      )}
      <div className="label px-4 pt-2">Earnings, next 10 days</div>
      <ul>
        {cal.map((e) => {
          const c = e.consensus !== null ? consensusLabel(e.consensus) : null;
          return (
            <li key={e.assetId}>
              <button type="button" onClick={() => { select(e.assetId); setScreen('market'); }} className="flex w-full items-center gap-3 border-t border-ink-2 px-4 py-2 text-left hover:bg-ink-2">
                <span className="num w-14 text-small font-semibold">{e.assetId}</span>
                <span className="min-w-0 flex-1 truncate text-caption text-fg-faint">{assetDefOf(e.assetId)?.name}</span>
                {c && <Chip className={c.lean === 'Beat' ? 'border-gain/40 text-gain' : c.lean === 'Miss' ? 'border-loss/40 text-loss' : ''}>{c.lean}{c.stars ? ` ${'★'.repeat(c.stars)}` : ''}</Chip>}
                {e.rumor !== null && <Chip className="border-warn/50 text-warn">whisper {e.rumor > 0 ? 'beat' : 'miss'}</Chip>}
                <span className="num w-16 text-right text-caption text-fg-muted">{e.daysAway === 0 ? 'today' : `${e.daysAway}d`}</span>
              </button>
            </li>
          );
        })}
        {!cal.length && <li className="px-4 py-4 text-small text-fg-faint">No reports scheduled.</li>}
      </ul>
    </Card>
  );
}
