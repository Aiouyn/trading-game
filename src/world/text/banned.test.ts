import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { bannedIn, BANNED_WORDS } from './banned';
import { templateTextProvider, renderMsg } from './template';
import type { Msg } from '@/i18n';
import { createGame, stepGame } from '../game';
import type { GameState } from '../types';

/** A value for every {slot} in a sentence, so each template renders to a full sentence. */
function sample(s: string): Msg['vars'] {
  const vars: Record<string, string> = {};
  for (const m of s.matchAll(/\{(\w+)\}/g)) vars[m[1]!] = 'SAMPLE';
  return vars;
}

/** The player-facing world text families: the daily close, work, goals, the journal and the Research Desk. */
const WORLD_PREFIXES = ['dayclose.', 'work.', 'goal.', 'journal.', 'desk.', 'why.', 'analyst.'];

describe('banned words in the world text', () => {
  it('flags whole words only, in any case', () => {
    expect(bannedIn('You should buy now.')).toEqual(expect.arrayContaining(['should', 'buy']));
    expect(bannedIn('Next day, the Signal rose.')).toEqual(expect.arrayContaining(['next', 'signal']));
    expect(bannedIn('Great day for the market.')).toEqual(['great day']);
    expect(bannedIn('The buyers and the sellers traded.')).toEqual([]);
    expect(bannedIn('You should have sold.')).toEqual(expect.arrayContaining(['you should have']));
    expect(BANNED_WORDS.length).toBeGreaterThan(10);
  });

  it('every world template (daily close, work, goals) is clean in English and French', () => {
    const keys = Object.keys(en).filter((k) => WORLD_PREFIXES.some((p) => k.startsWith(p)));
    expect(keys.filter((k) => k.startsWith('dayclose.')).length).toBeGreaterThan(15);
    expect(keys.filter((k) => k.startsWith('work.')).length).toBeGreaterThan(15);
    expect(keys.filter((k) => k.startsWith('desk.')).length).toBeGreaterThan(20);
    expect(keys.filter((k) => k.startsWith('journal.')).length).toBeGreaterThan(20);
    for (const k of keys) {
      for (const locale of ['en', 'fr'] as const) {
        const dict: Record<string, string> = locale === 'en' ? (en as Record<string, string>) : (fr as Record<string, string>);
        const text = renderMsg({ key: k, vars: sample(dict[k]!) }, locale);
        expect(bannedIn(text), `${locale} ${k}: ${text}`).toEqual([]);
      }
    }
  });

  it('the provider output for a full card is clean in both languages', () => {
    const card = {
      day: 4, nwOpen: 5000, nwClose: 5100, nwChange: 100, nwChangePct: 0.02,
      best: { assetId: 'HLCN', pct: 0.03, usd: 60 }, worst: { assetId: 'ORBT', pct: -0.01, usd: -10 },
      gx: { pct: 0.004 }, sectors: { best: { sector: 'tech', pct: 0.01 }, worst: { sector: 'energy', pct: -0.02 } },
      stories: [{ assetId: 'WHEA', headline: 'Wheat climbs', band: 'early' as const }, { assetId: 'MOON', headline: 'Moon rallies', band: 'late' as const }],
      ghosts: { player: 5100, basket: 5050, random: 5000, momentum: 5200, beaten: 2, percentile: 67 },
      event: { phase: 'ended' as const, headline: 'Crash ended', lastedDays: 3 },
    };
    const lines = templateTextProvider.dailyClose(card);
    expect(lines.length).toBeGreaterThan(6);
    for (const locale of ['en', 'fr'] as const) {
      for (const m of lines) expect(bannedIn(renderMsg(m, locale)), renderMsg(m, locale)).toEqual([]);
    }
    expect(renderMsg(lines[1]!, 'fr')).toMatch(/valeur nette/);
  });

  it('the story headlines the close embeds are clean (every wire headline of a short run, two seeds)', { timeout: 60_000 }, () => {
    const heads = new Set<string>();
    for (const seed of ['banned-a', 'banned-b']) {
      const g: GameState = createGame(seed, { warmupDays: 1, npcs: true });
      for (let k = 0; k < 3 * 720; k++) {
        stepGame(g);
        for (const w of g.wire) if (w.news) heads.add(w.text);
      }
    }
    expect(heads.size).toBeGreaterThan(5);
    for (const h of heads) expect(bannedIn(h), h).toEqual([]);
  });

  it('every English world key has a French twin with the same slots', () => {
    const enKeys = Object.keys(en).filter((k) => WORLD_PREFIXES.some((p) => k.startsWith(p)));
    for (const k of enKeys) {
      expect(k in fr, `fr missing ${k}`).toBe(true);
    }
  });
});
