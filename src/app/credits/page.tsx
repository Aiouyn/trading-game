import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Credits \u00b7 Trading Game' };

const CREDITS: { what: string; who: string; href: string; note: string }[] = [
  {
    what: 'Charts',
    who: 'TradingView Lightweight Charts\u2122',
    href: 'https://www.tradingview.com/',
    note: 'Copyright \u00a9 2025 TradingView, Inc. Apache License 2.0. Charts by TradingView.',
  },
  { what: 'Display type', who: 'Instrument Serif', href: 'https://fonts.google.com/specimen/Instrument+Serif', note: 'SIL Open Font License 1.1.' },
  { what: 'Text type', who: 'Inter', href: 'https://fonts.google.com/specimen/Inter', note: 'SIL Open Font License 1.1.' },
  { what: 'Numbers', who: 'JetBrains Mono', href: 'https://fonts.google.com/specimen/JetBrains+Mono', note: 'SIL Open Font License 1.1.' },
];

export default function Credits() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10" data-testid="credits">
      <Link href="/" className="text-small text-fg-muted hover:text-fg">{'\u2190'} Back to the market</Link>
      <h1 className="font-serif text-hero text-fg">Credits</h1>
      <p className="text-small text-fg-muted">
        A simulated finance and trading game. Every market, company and price is fictional, and no real money is involved.
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
    </main>
  );
}
