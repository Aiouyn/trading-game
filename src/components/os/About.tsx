'use client';

import { t } from '@/i18n';
import { useGame } from '@/game/store';

// Settings > About (P2-119): the credits, moved from the old /credits page, and the intro replay.
// /credits redirects here (next.config.ts). The licence lines are translated keys, not raw English.
const CREDITS: { what: string; who: string; href: string; note: string }[] = [
  { what: 'shell.credits.charts', who: 'TradingView Lightweight Charts™', href: 'https://www.tradingview.com/', note: 'shell.credits.note.tv' },
  { what: 'shell.credits.display', who: 'Instrument Serif', href: 'https://fonts.google.com/specimen/Instrument+Serif', note: 'shell.credits.note.ofl' },
  { what: 'shell.credits.text', who: 'Inter', href: 'https://fonts.google.com/specimen/Inter', note: 'shell.credits.note.ofl' },
  { what: 'shell.credits.numbers', who: 'JetBrains Mono', href: 'https://fonts.google.com/specimen/JetBrains+Mono', note: 'shell.credits.note.ofl' },
];

export function About() {
  const replay = (): void => {
    void useGame.getState().act({ type: 'onboarding', step: 0, done: false, skipped: false });
  };
  return (
    <div className="os-body" data-testid="credits">
      <h2 className="font-serif text-title text-fg">{t('shell.credits')}</h2>
      <p className="text-small text-fg-muted">
        {t('shell.credits.body')}
      </p>
      <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1">
        {CREDITS.map((c) => (
          <li key={c.who} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-caption text-fg-faint">{t(c.what)}</span>
            <a href={c.href} target="_blank" rel="noreferrer" className="text-body text-fg underline decoration-ink-3 underline-offset-4 hover:decoration-brass">
              {c.who}
            </a>
            <span className="text-caption text-fg-muted">{t(c.note)}</span>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" className="os-tool" data-testid="about-replay" onClick={replay}>
          {t('shell.about.replay')}
        </button>
      </div>
    </div>
  );
}
