import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENGINE_FR } from './engineFr';

// The French table for the engine's sentences (UX stage 6, item 6). Each key must be a sentence the world still sends, so a
// reworded refusal cannot silently fall back to English; each value must be French text, not the English again.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('engine French table', () => {
  // a sentence the world or the engine sends (the order reasons come from src/engine/trading.ts)
  const world = ['../world', '../engine'].flatMap((d) => sources(fileURLToPath(new URL(d, import.meta.url)))).map((f) => readFileSync(f, 'utf8')).join('\n');

  it('every key is a sentence the world still sends', () => {
    const stale = Object.keys(ENGINE_FR).filter((k) => !world.includes(k));
    expect(stale).toEqual([]);
  });

  it('every value is French, not the English again', () => {
    for (const [en, fr] of Object.entries(ENGINE_FR)) {
      expect(fr.length, en).toBeGreaterThan(0);
      expect(fr, en).not.toBe(en);
    }
  });
});
