'use client';

// Settings > Profile and Settings > Account (Velvet 12, P2-208). The contracts, ranks, licenses,
// achievements, public profile and stats moved here from the old full-page Profile screen, and the
// account card (guest sign-in, password, sign out) moved with them, so nothing is lost (Phase 2 step 3).
import { useState } from 'react';
import { ACHIEVEMENTS } from '@/content/progression';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { compactMoney, money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { api, getToken } from '@/net/client';
import { COUNTRIES } from '@/world/players';
import { LicenseLadder } from './Holdings';
import { BrassChip, Button, Card, CardHeader, Progress, Select, TextField } from './ui';

const TIER_CLS = { bronze: 'border-brass-lo/50 text-brass-lo', silver: 'border-fg-muted/50 text-fg-muted', gold: 'border-brass/60 text-brass-hi', legend: 'border-brass-hi text-brass-hi' } as const;

export function ProfileView() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [bio, setBio] = useState(me.player.bio);
  const [country, setCountry] = useState(me.player.country);
  const unlocked = ACHIEVEMENTS.filter((a) => me.player.achievements[a.id] !== undefined);
  const titles = [{ value: '', label: t('profile.noTitle') }, ...unlocked.map((a) => ({ value: a.name, label: a.name }))];
  const rIdx = rankIndex(me.player.rankId);
  return (
    <div className="flex flex-col gap-4" data-testid="profile-view">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-title">{me.player.handle}</h2>
            <div className="mt-1 flex flex-wrap gap-2"><BrassChip>{me.rank.id} · {me.rank.name}</BrassChip>{me.player.title && <BrassChip>{me.player.title}</BrassChip>}</div>
          </div>
          <div className="text-right text-small text-fg-muted">
            {t('profile.peak')} <span className="num text-fg">{compactMoney(me.player.netWorthPeak)}</span>
            <br />
            {t('profile.position')} <span className="num text-fg">#{useGame.getState().pub?.boards.nwRank[me.player.id] ?? '—'}</span>
          </div>
        </div>
      </Card>

      <Card data-testid="goals-card">
        <CardHeader title={t('profile.contracts')} sub={t('profile.contracts.sub')} />
        <ul>
          {me.contracts.map((c) => (
            <li key={c.id} className="border-t border-ink-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-small">
                <span className={c.claimed ? 'text-fg-faint line-through' : ''}>{c.text}</span>
                {c.done && !c.claimed
                  ? <Button size="sm" variant="brass" onClick={() => act({ type: 'contract.claim', contractId: c.id }, { success: `+${money(c.reward)}` })} testId={`claim-${c.defId}`}>{t('profile.claim', { amount: compactMoney(c.reward) })}</Button>
                  : <span className="num text-caption text-fg-faint">{c.claimed ? t('profile.claimed') : compactMoney(c.reward)}</span>}
              </div>
              {!c.done && <Progress value={c.target > 0 ? c.progress / c.target : c.progress > 0 ? 1 : 0} className="mt-2" />}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="font-serif text-title">{t('profile.ranks')}</h3>
        <ul className="mt-2">
          {RANKS.map((r, i) => (
            <li key={r.id} className={`flex items-center justify-between border-t border-ink-2 py-2 text-small ${i <= rIdx ? 'text-fg' : 'text-fg-faint'}`}>
              <span>{r.id} · {r.name} <span className="text-caption text-fg-faint">({r.shell})</span></span>
              <span className="num">{r.threshold ? compactMoney(r.threshold) : t('profile.start')}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 font-serif text-title">{t('profile.licenses')}</h3>
        <div className="mt-2"><LicenseLadder /></div>
      </Card>

      <Card>
        <CardHeader title={t('profile.achievements')} sub={t('profile.achievements.count', { got: unlocked.length, total: ACHIEVEMENTS.length })} />
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
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

      <Card className="p-4">
        <h3 className="font-serif text-title">{t('profile.card')}</h3>
        <div className="mt-3 flex flex-col gap-2">
          <TextField value={bio} onChange={setBio} placeholder={t('profile.bio')} maxLength={160} />
          <Select label={t('profile.country')} value={country} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
          <Select label={t('profile.titleField')} value={me.player.title} onChange={(ti) => act({ type: 'profile', title: ti })} options={titles} />
          <label className="flex items-center gap-2 text-small text-fg-muted">
            <input type="checkbox" checked={me.player.mostWantedOptIn} onChange={(e) => act({ type: 'profile', mostWantedOptIn: e.target.checked })} />
            {t('profile.mostWanted')}
          </label>
          <Button onClick={() => act({ type: 'profile', bio, country }, { success: t('profile.saved') })}>{t('common.save')}</Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-small">
          <div><span className="label">{t('profile.stats.trades')}</span><div className="num">{me.player.stats.trades}</div></div>
          <div><span className="label">{t('profile.stats.winRate')}</span><div className="num">{me.player.stats.trades ? pct(me.player.stats.winningTrades / me.player.stats.trades) : '—'}</div></div>
          <div><span className="label">{t('profile.stats.bizIncome')}</span><div className="num">{compactMoney(me.player.stats.bizIncome)}</div></div>
          <div><span className="label">{t('profile.stats.contracts')}</span><div className="num">{me.player.stats.contractsDone}</div></div>
        </div>
      </Card>
    </div>
  );
}

/** Settings > Account: the guest sign-in, the password that makes it portable, sign out. The intro replay lives in About. */
export function AccountView() {
  const logout = useGame((s) => s.logout);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const setPassword = async () => {
    const tok = getToken();
    if (!tok) return;
    const r = await api.setPassword(tok, pw);
    setPwMsg(r.ok ? t('profile.password.done') : (r.error ?? t('profile.password.fail')));
    setPw('');
  };
  const jumpToCredits = () => {
    document.getElementById('settings-about')?.scrollIntoView({ block: 'start' });
  };
  return (
    <Card className="p-4" data-testid="settings-account">
      <h3 className="font-serif text-title">{t('settings.account')}</h3>
      <p className="mt-1 text-small text-fg-muted">{t('profile.account.hint')}</p>
      <div className="mt-3 flex gap-2">
        <TextField type="password" value={pw} onChange={setPw} placeholder={t('profile.password.placeholder')} className="flex-1" />
        <Button onClick={setPassword}>{t('profile.password.set')}</Button>
      </div>
      {pwMsg && <p className="mt-1 text-caption text-fg-muted">{pwMsg}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={jumpToCredits}>{t('settings.aboutJump')}</Button>
        <Button
          variant="danger"
          onClick={() => { if (window.confirm(t('profile.signout.confirm'))) logout(); }}
        >
          {t('profile.signout')}
        </Button>
      </div>
      <p className="mt-4 text-caption text-fg-faint">{t('profile.disclaimer')}</p>
    </Card>
  );
}
