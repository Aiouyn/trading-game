'use client';

import { moneyParts } from '@/game/format';
import { Flash } from './ui';

/** Serif net worth with the cents at 65% in fg-muted (DESIGN §3). Portfolio shows its total with it. */
export function NetWorth({ value, size = 'hero' }: { value: number; size?: 'hero' | 'hero-lg' }) {
  const { prefix, whole, cents, suffix } = moneyParts(value);
  return (
    <Flash value={Math.round(value)}>
      <span className={`font-serif ${size === 'hero' ? 'text-hero' : 'text-hero-lg'} text-fg`} data-testid="net-worth">
        {prefix}{whole}<span className="text-[65%] text-fg-muted">{cents}</span>{suffix}
      </span>
    </Flash>
  );
}
