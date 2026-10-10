'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ACHIEVEMENTS } from '@/content/progression';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { compactMoney, money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { api, getToken } from '@/net/client';
import { COUNTRIES } from '@/world/players';
import { LicenseLadder } from './Holdings';
import { BrassChip, Button, Card, CardHeader, Progress, Select, TextField } from './ui';

const TIER_CLS = { bronze: 'border-brass-lo/50 text-brass-lo', silver: 'border-fg-muted/50 text-fg-muted', gold: 'border-brass/60 text-brass-hi', legend: 'border-brass-hi text-brass-hi' } as const;

export function ProfileView() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const logout = useGame((s) => s.logout);
  const [bio, setBio] = useState(me.player.bio);
  const [country, setCountry] = useState(me.player.country);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const unlocked = ACHIEVEMENTS.filter((a) => me.player.achievements[a.id] !== undefined);
  const titles = [{ value: '', label: 'No title' }, ...unlocked.map((a) => ({ value: a.name, label: a.name }))];
  const rIdx = rankIndex(me.player.rankId);
  return (
    <div className="flex flex-col gap-4" data-testid="profile-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-hero">{me.player.handle}</h1>
            <div className="mt-1 flex flex-wrap gap-2"><BrassChip>{me.rank.id} · {me.rank.name}</BrassChip>{me.player.title && <BrassChip>{me.player.title}</BrassChip>}</div>
          </div>
          <div className="text-right text-small text-fg-muted">Peak net worth <span className="num text-fg">{compactMoney(me.player.netWorthPeak)}</span><br />Global position <span className="num text-fg">#{useGame.getState().pub?.boards.nwRank[me.player.id] ?? '—'}</span></div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="goals-card">
          <CardHeader title="This hour’s contracts" sub="Three goals each game day. Rewards scale with your net worth." />
          <ul>
            {me.contracts.map((c) => (
              <li key={c.id} className="border-t border-ink-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-small">
                  <span className={c.claimed ? 'text-fg-faint line-through' : ''}>{c.text}</span>
                  {c.done && !c.claimed ? <Button size="sm" variant="brass" onClick={() => act({ type: 'contract.claim', contractId: c.id }, { success: `+${money(c.reward)}` })} testId={`claim-${c.defId}`}>Claim {compactMoney(c.reward)}</Button>
                    : <span className="num text-caption text-fg-faint">{c.claimed ? 'claimed' : compactMoney(c.reward)}</span>}
                </div>
                {!c.done && <Progress value={c.target > 0 ? c.progress / c.target : c.progress > 0 ? 1 : 0} className="mt-2" />}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h3 className="font-serif text-title">Ranks</h3>
          <ul className="mt-2">
            {RANKS.map((r, i) => (
              <li key={r.id} className={`flex items-center justify-between border-t border-ink-2 py-2 text-small ${i <= rIdx ? 'text-fg' : 'text-fg-faint'}`}>
                <span>{r.id} · {r.name} <span className="text-caption text-fg-faint">({r.shell})</span></span>
                <span className="num">{r.threshold ? compactMoney(r.threshold) : 'start'}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-serif text-title">Licenses</h3>
          <div className="mt-2"><LicenseLadder /></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Achievements" sub={`${unlocked.length} of ${ACHIEVEMENTS.length}`} />
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const got = me.player.achievements[a.id] !== undefined;
            return (
              <div key={a.id} className={`rounded-md border p-3 ${got ? TIER_CLS[a.tier] : 'border-ink-3 text-fg-disabled'}`}>
                <div className="text-small font-semibold">{a.name}</div>
                <div className="text-caption text-fg-faint">{a.text}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-serif text-title">Profile</h3>
          <div className="mt-3 flex flex-col gap-2">
            <TextField value={bio} onChange={setBio} placeholder="Bio" maxLength={160} />
            <Select label="Country" value={country} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
            <Select label="Title" value={me.player.title} onChange={(t) => act({ type: 'profile', title: t })} options={titles} />
            <label className="flex items-center gap-2 text-small text-fg-muted"><input type="checkbox" checked={me.player.mostWantedOptIn} onChange={(e) => act({ type: 'profile', mostWantedOptIn: e.target.checked })} /> Show me on the Most Wanted board (cosmetic)</label>
            <Button onClick={() => act({ type: 'profile', bio, country }, { success: 'Profile saved' })}>Save</Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-small">
            <div><span className="label">Trades</span><div className="num">{me.player.stats.trades}</div></div>
            <div><span className="label">Win rate</span><div className="num">{me.player.stats.trades ? pct(me.player.stats.winningTrades / me.player.stats.trades) : '—'}</div></div>
            <div><span className="label">Business income</span><div className="num">{compactMoney(me.player.stats.bizIncome)}</div></div>
            <div><span className="label">Contracts done</span><div className="num">{me.player.stats.contractsDone}</div></div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-serif text-title">Account</h3>
          <p className="mt-1 text-small text-fg-muted">You play as a guest on this device. Set a password to sign in from another device with your handle.</p>
          <div className="mt-3 flex gap-2">
            <TextField type="password" value={pw} onChange={setPw} placeholder="New password (8+)" className="flex-1" />
            <Button onClick={async () => { const t = getToken(); if (!t) return; const r = await api.setPassword(t, pw); setPwMsg(r.ok ? 'Password set.' : r.error ?? 'Could not set it'); setPw(''); }}>Set</Button>
          </div>
          {pwMsg && <p className="mt-1 text-caption text-fg-muted">{pwMsg}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => act({ type: 'onboarding', step: 0, done: false, skipped: false }).then(() => useGame.setState({ screen: 'market' }))}>Replay intro tips</Button>
            <Link href="/credits" className="inline-flex h-10 items-center rounded-md px-4 text-small text-fg-muted hover:bg-ink-2">Credits</Link>
            <Button variant="danger" onClick={() => { if (window.confirm('Sign out on this device? Without a password you cannot sign back in.')) logout(); }}>Sign out</Button>
          </div>
          <p className="mt-4 text-caption text-fg-faint">Fictional markets, fictional companies, no real money. Nothing here is financial advice.</p>
        </Card>
      </div>
    </div>
  );
}
