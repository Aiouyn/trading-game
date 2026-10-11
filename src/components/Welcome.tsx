'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { useGame } from '@/game/store';
import { COUNTRIES } from '@/world/players';
import { Button, Select, TextField } from './ui';

/**
 * The cold open (DESIGN §6b step 1): a cracked phone lock screen, five thousand dollars and rent
 * due Friday. Start creates a guest account in the persistent world; "I've played before" signs
 * in with a handle and password.
 */
export function Welcome() {
  const t = useT();
  const register = useGame((s) => s.register);
  const login = useGame((s) => s.login);
  const [mode, setMode] = useState<'cold' | 'new' | 'login'>('cold');
  const [handle, setHandle] = useState('');
  const [country, setCountry] = useState(() => guessCountry());
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    setErr(null);
    const e = mode === 'login' ? await login(handle, pw) : await register(handle, country);
    setErr(e);
    setBusy(false);
  };

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10" data-testid="onboarding-coldopen">
      <Skyline />
      <div className="relative w-full max-w-sm animate-[fadein_420ms_ease-out]">
        <div className="relative overflow-hidden rounded-[28px] border border-ink-3 bg-ink-1 px-6 pt-10 pb-8 shadow-sheet">
          <svg className="pointer-events-none absolute top-0 right-0 h-28 w-40 opacity-50" viewBox="0 0 160 112" aria-hidden>
            <path d="M158 2 L120 30 L126 44 L92 70 L98 82 L60 110" fill="none" className="stroke-fg-disabled" strokeWidth="1" />
            <path d="M126 44 L146 52" fill="none" className="stroke-fg-disabled" strokeWidth="0.8" />
          </svg>
          <div className="num text-center text-caption text-fg-faint">{t('welcome.clock')}</div>
          <div className="mt-8 text-center label">{t('welcome.balance')}</div>
          <div className="text-center font-serif text-hero-lg text-fg">{t('welcome.amount')}<span className="text-[65%] text-fg-muted">{t('welcome.cents')}</span></div>
          <p className="mt-2 text-center text-small text-fg-muted">{t('welcome.rentDue')}</p>
          {mode === 'cold' && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <Button variant="brass" size="lg" className="w-full" onClick={() => setMode('new')} testId="onboarding-start">{t('welcome.start')}</Button>
              <button type="button" className="text-small text-fg-muted underline hover:text-fg" onClick={() => setMode('login')} data-testid="onboarding-skip">{t('welcome.played')}</button>
            </div>
          )}
          {mode !== 'cold' && (
            <form className="mt-8 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void go(); }}>
              <TextField value={handle} onChange={setHandle} placeholder={t('welcome.handlePlaceholder')} maxLength={18} autoFocus testId="handle" label={t('welcome.handle')} />
              {mode === 'new' ? (
                <Select label={t('welcome.country')} value={country} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} testId="country" />
              ) : (
                <TextField type="password" value={pw} onChange={setPw} placeholder={t('welcome.password')} testId="password" label={t('welcome.password')} />
              )}
              {err && <p className="text-caption text-warn" data-testid="auth-error">{err}</p>}
              <Button variant="brass" size="lg" type="submit" className="mt-2 w-full" busy={busy} testId="enter-world">{mode === 'new' ? t('welcome.enter') : t('welcome.signIn')}</Button>
              <button type="button" className="mt-1 text-caption text-fg-faint hover:text-fg-muted" onClick={() => { setMode(mode === 'new' ? 'login' : 'new'); setErr(null); }}>
                {mode === 'new' ? t('welcome.haveAccount') : t('welcome.newHere')}
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-caption text-fg-faint">{t('welcome.tagline')}</p>
      </div>
    </main>
  );
}

function guessCountry(): string {
  if (typeof navigator === 'undefined') return 'XX';
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  return COUNTRIES.some((c) => c.code === region) ? region : navigator.language.startsWith('fr') ? 'FR' : 'XX';
}

/** The Port Avalon skyline in ink-2 behind the phone. */
function Skyline() {
  const towers = [[0, 60], [40, 110], [70, 80], [100, 150], [135, 95], [165, 200], [200, 120], [235, 170], [270, 90], [300, 230], [340, 130], [375, 180], [410, 100], [445, 140], [480, 75], [510, 190], [550, 110], [585, 160], [620, 85], [655, 120]];
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-64 w-full" viewBox="0 0 700 260" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {towers.map(([x, h]) => <rect key={x} x={x} y={260 - h!} width={30} height={h} className="fill-ink-2" />)}
    </svg>
  );
}

export function Loading({ text }: { text?: string }) {
  const t = useT();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" data-testid="loading">
      <h1 className="font-serif text-hero text-fg">{text ?? t('loading.connecting')}</h1>
      <div className="h-1 w-48 overflow-hidden rounded-chip bg-ink-3"><div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] bg-brass" /></div>
      <p className="max-w-sm text-small text-fg-muted">{t('loading.slow')} <span className="num">{t('loading.command')}</span></p>
    </main>
  );
}
