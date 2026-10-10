import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { BANNED_WORDS, bannedIn } from '@/world/text/banned';

// The Phase 3 trading copy (keyboard confirm, plans, DRIP, reasons, the liquidation line) must not carry forecast or advice
// language. "buy" and "sell" are the order labels the whole Broker uses, so they are the only banned words allowed here.
const TRADE_LABELS = new Set(['buy', 'sell']);
const PREFIXES = ['broker.confirm', 'broker.quickEnter', 'broker.liquidation', 'broker.plans.', 'holdings.drip', 'holdings.col.drip', 'holdings.lastFill', 'holdings.reason.', 'portfolio.'];

const keys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => PREFIXES.some((p) => k === p || k.startsWith(p)));

describe('trading copy (Phase 3 B3)', () => {
  it('the banned list still names the forecast and advice words the copy is checked against', () => {
    expect(BANNED_WORDS).toEqual(expect.arrayContaining(['should', 'expect', 'likely', 'will', 'next', 'target', 'signal']));
  });

  for (const [name, dict] of [['English', en], ['French', fr]] as const) {
    it(`no ${name} trading string uses a banned word, other than the order labels`, () => {
      const dictionary = dict as Record<string, string>;
      const found: string[] = [];
      for (const k of keys(dictionary)) {
        for (const w of bannedIn(dictionary[k]!)) if (!TRADE_LABELS.has(w)) found.push(`${k}: ${w}`);
      }
      expect(found).toEqual([]);
    });
  }

  it('every English trading key has a French string', () => {
    const missing = keys(en as Record<string, string>).filter((k) => !(k in (fr as Record<string, string>)));
    expect(missing).toEqual([]);
  });
});
