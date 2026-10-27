import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonEncode } from '../src';
import { runDriver } from './driver';

describe('AC-ID-LON-PREFIX (E-72 (2); E-26 / T07A-01 loan → lon)', () => {
  it('a driver run emits loan ids only as lon_<tick>_<i>, and no ln_ id anywhere in the entry log, accounts or snapshot', () => {
    const w = runDriver(42, 720 * 2);
    const all = [canonEncode(w.entryLog()), canonEncode(w.accounts()), w.snapshot()].join('\n');
    expect(all.match(/lon_\d+_\d+/g)?.length ?? 0).toBeGreaterThan(0);
    expect(all.match(/(?<![A-Za-z0-9])ln_/g)).toBeNull();
    expect(all.match(/(?<![A-Za-z0-9])loan_/g)).toBeNull();
  });
  it('driver.ts has no entity-id literal with a rejected prefix (AC-10A-01-2 list + ln_); the no-noncompliant-entity-prefix rule itself is T10A-01, not built', () => {
    const src = readFileSync(fileURLToPath(new URL('./driver.ts', import.meta.url)), 'utf8');
    expect(src.match(/[`'"](city|dist|unit|loan|uq|ln)_/g)).toBeNull();
    expect(src).toContain('`lon_${w.tick}_${i}`');
  });
});
