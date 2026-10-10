'use client';

import { Flash } from './ui';

/** Serif net worth with the cents at 65% in fg-muted (DESIGN §3). Portfolio shows its total with it. */
export function NetWorth({ value, size = 'hero' }: { value: number; size?: 'hero' | 'hero-lg' }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs).toLocaleString('en-US');
  const cents = (abs % 1).toFixed(2).slice(1);
  return (
    <Flash value={Math.round(value)}>
      <span className={`font-serif ${size === 'hero' ? 'text-hero' : 'text-hero-lg'} text-fg`} data-testid="net-worth">
        {neg ? '−' : ''}${whole}<span className="text-[65%] text-fg-muted">{cents}</span>
      </span>
    </Flash>
  );
}
