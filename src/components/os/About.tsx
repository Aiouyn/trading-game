'use client';

import { t } from '@/i18n';

// Settings > About (P2-119): the credits, moved from the old /credits page. /credits redirects here.
const CREDITS: { what: string; who: string; href: string; note: string }[] = [
  {
    what: 'Charts',
    who: 'TradingView Lightweight Charts™',
    href: 'https://www.tradingview.com/',
    note: 'Copyright © 2025 TradingView, Inc. Apache License 2.0. Charts by TradingView.',
  },
  { what: 'Display type', who: 'Instrument Serif', href: 'https://fonts.google.com/specimen/Instrument+Serif', note: 'SIL Open Font License 1.1.' },
  { what: 'Text type', who: 'Inter', href: 'https://fonts.google.com/specimen/Inter', note: 'SIL Open Font License 1.1.' },
  { what: 'Numbers', who: 'JetBrains Mono', href: 'https://fonts.google.com/specimen/JetBrains+Mono', note: 'SIL Open Font License 1.1.' },
];

export function About() {
  return (
    <div className="os-body" data-testid="credits">
      <h2 className="font-serif text-title text-fg">{t('shell.credits')}</h2>
      <p className="text-small text-fg-muted">
        {t('shell.credits.body')}
      </p>
      <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1">
        {CREDITS.map((c) => (
          <li key={c.who} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-caption text-fg-faint">{c.what}</span>
            <a href={c.href} target="_blank" rel="noreferrer" className="text-body text-fg underline decoration-ink-3 underline-offset-4 hover:decoration-brass">
              {c.who}
            </a>
            <span className="text-caption text-fg-muted">{c.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
