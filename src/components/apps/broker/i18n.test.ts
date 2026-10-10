import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';

// Every key the Broker app and the holdings it shares name in source must exist in both dictionaries, so a
// missing French string shows up here and not as a raw key on screen (Phase 2 step 3, every string through t()).
const here = dirname(fileURLToPath(import.meta.url));
const sources = [
  ...readdirSync(here).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts')).map((f) => join(here, f)),
  join(here, '..', '..', 'Holdings.tsx'),
];

const KEY = /['"`]((?:broker|holdings)\.[A-Za-z0-9_.]+)['"`]/g;

function keysInSource(): Set<string> {
  const out = new Set<string>();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(KEY)) out.add(m[1]!);
  }
  return out;
}

// Keys built at run time from a value (t(`broker.pool.${k}`) and friends): every value the code can build.
const BUILT = [
  ...['market', 'limit', 'stop', 'stop_limit', 'trailing'].map((x) => `broker.help.${x}`),
  ...['sma20', 'sma50', 'ema12', 'bb', 'vwap', 'rsi'].map((x) => `broker.ind.${x}`),
  ...['value', 'trend', 'retail', 'pension'].map((x) => `broker.pool.${x}`),
  ...['A+', 'A', 'B', 'C', 'D', 'F'].map((x) => `broker.verdict.${x}`),
  ...['early', 'mid', 'late', 'done'].map((x) => `broker.band.${x}`),
];

describe('Broker strings', () => {
  it('every key named in the Broker source exists in English and French', () => {
    const keys = [...keysInSource(), ...BUILT];
    expect(keys.length).toBeGreaterThan(100);
    const missingEn = keys.filter((k) => !(k in (en as Record<string, string>)));
    const missingFr = keys.filter((k) => !(k in (fr as Record<string, string>)));
    expect(missingEn).toEqual([]);
    expect(missingFr).toEqual([]);
  });

  it('keeps the Broker keys to the broker. and holdings. namespaces', () => {
    for (const k of Object.keys(en)) {
      if (k.startsWith('broker.') || k.startsWith('holdings.')) expect(fr).toHaveProperty([k]);
    }
  });
});
