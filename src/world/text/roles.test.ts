import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import type { Msg } from '@/i18n';
import { BANNED_WORDS, BANNED_WORDS_FR, ADVICE_PATTERNS_EN, ADVICE_PATTERNS_FR, adviceIn, bannedIn } from './banned';
import { renderMsg } from './template';
import { VARIANTS, analystMsg, executivesMsg, moderatorMsg, newsroomMsg, rivalMsg, rumorMsg, variantOf, vkey, type NewsFacts } from './roles';
import { textProvider } from './index';

type Dict = Record<string, string>;
const EN = en as Dict;
const FR = fr as Dict;

/** Every role message type: the keys that have variants (`base.0` .. `base.7`), grouped by base. */
function variantBases(dict: Dict): Map<string, string[]> {
  const bases = new Map<string, string[]>();
  for (const k of Object.keys(dict)) {
    const m = /^(txt\..+)\.(\d)$/.exec(k);
    if (!m) continue;
    bases.set(m[1]!, [...(bases.get(m[1]!) ?? []), k]);
  }
  return bases;
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');

/** A sample value for every placeholder, so a template reads as a sentence for the banned and advice checks. */
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_w, k: string) => (k === 'n' || k === 'count' ? '3' : k === 'pct' || k === 'move' || k === 'gap' || k === 'change' ? '+1.2%' : 'Sample'));

describe('the role copy (Phase 7, P7-1)', () => {
  it('every message type has the same eight variants in English and French', () => {
    const enBases = variantBases(EN);
    const frBases = variantBases(FR);
    expect([...enBases.keys()].sort()).toEqual([...frBases.keys()].sort());
    for (const [base, keys] of enBases) {
      expect(keys.length, `${base} variants in en`).toBe(VARIANTS);
      expect(frBases.get(base)?.length, `${base} variants in fr`).toBe(VARIANTS);
    }
  });

  it('the variants of a type use the same placeholders, and English and French agree on them', () => {
    for (const [base, keys] of variantBases(EN)) {
      const expected = vars(EN[keys[0]!]!);
      for (const k of keys) {
        expect(vars(EN[k]!), `${k} placeholders`).toBe(expected);
        expect(vars(FR[k.replace(/^txt\./, 'txt.')]!), `${k} placeholders in fr`).toBe(expected);
      }
      expect(base.length).toBeGreaterThan(4);
    }
  });

  it('the fragments (the phrases that fill a slot) exist in both languages with the same placeholders', () => {
    const fragments = Object.keys(EN).filter((k) => k.startsWith('txt.') && !/\.\d$/.test(k));
    expect(fragments.length).toBeGreaterThan(10);
    for (const k of fragments) {
      expect(k in FR, `${k} in fr`).toBe(true);
      expect(vars(FR[k]!), `${k} placeholders`).toBe(vars(EN[k]!));
    }
  });

  it('no template gives advice, a forecast or a banned word (English and French)', () => {
    for (const [k, v] of Object.entries(EN)) {
      if (!k.startsWith('txt.')) continue;
      const text = fill(v);
      expect(bannedIn(text), `${k}`).toEqual([]);
      expect(adviceIn(text, ADVICE_PATTERNS_EN), `${k}`).toEqual([]);
    }
    for (const [k, v] of Object.entries(FR)) {
      if (!k.startsWith('txt.')) continue;
      const text = fill(v);
      expect(bannedIn(text, BANNED_WORDS_FR), `${k}`).toEqual([]);
      expect(adviceIn(text, ADVICE_PATTERNS_FR), `${k}`).toEqual([]);
    }
    expect(BANNED_WORDS.length).toBeGreaterThan(0);
  });

  it('every variant renders with every placeholder filled, in both languages', () => {
    const facts: NewsFacts[] = [
      { kind: 'move', id: 'a', name: 'Acme', move: 0.04 },
      { kind: 'move', id: 'a2', name: 'Acme', move: -0.04 },
      { kind: 'auction', id: 'b', name: 'Acme', move: 0.02 },
      { kind: 'halt', id: 'c', name: 'Acme', move: -0.12 },
      { kind: 'reopen', id: 'd', name: 'Acme', gap: 0.03 },
      { kind: 'reopen', id: 'd2', name: 'Acme', gap: -0.03 },
      { kind: 'earnings', id: 'e', name: 'Acme', surprise: 1.6, move: 0.08, quote: { key: 'txt.exec.great.0', vars: { name: 'Acme' } } },
      { kind: 'earnings', id: 'e2', name: 'Acme', surprise: 0, move: 0, quote: { key: 'txt.exec.flat.0', vars: { name: 'Acme' } } },
      { kind: 'earnings', id: 'e3', name: 'Acme', surprise: -1.2, move: -0.2, quote: { key: 'txt.exec.awful.0', vars: { name: 'Acme' } } },
      { kind: 'preview', id: 'f', name: 'Acme', consensus: 0.7, daysAway: 1 },
      { kind: 'preview', id: 'f2', name: 'Acme', consensus: -0.4, daysAway: 3 },
      { kind: 'preview', id: 'f3', name: 'Acme', consensus: 0.05, daysAway: 2 },
      { kind: 'macro', id: 'g', macro: 'cpi', actual: 0.041, consensus: 0.035, diff: 0.006 },
      { kind: 'macro', id: 'g2', macro: 'jobs', actual: 0.02, consensus: 0.03, diff: -0.01 },
      { kind: 'macro', id: 'g3', macro: 'cpi', actual: 0.03, consensus: 0.03, diff: 0 },
      { kind: 'rates', id: 'h', policy: 0.0475, change: 0.0025, expected: 0 },
      { kind: 'rates', id: 'h2', policy: 0.04, change: -0.0025, expected: -0.0025 },
      { kind: 'rates', id: 'h3', policy: 0.04, change: 0, expected: 0.0025 },
      { kind: 'listing', id: 'i', event: 'ipo', name: 'Acme', price: 12.5, child: '' },
      { kind: 'listing', id: 'i2', event: 'bankruptcy', name: 'Acme', price: 0.4, child: '' },
      { kind: 'listing', id: 'i3', event: 'merger', name: 'Acme', price: 30, child: '' },
      { kind: 'listing', id: 'i4', event: 'spinoff', name: 'Acme', price: 0, child: 'Beta' },
      { kind: 'index', id: 'j', phase: 'announced', index: 'AV50', days: 1, adds: ['Beta'], removes: ['Gamma'] },
      { kind: 'index', id: 'j2', phase: 'announced', index: 'AV50', days: 4, adds: ['Beta'], removes: [] },
      { kind: 'index', id: 'j3', phase: 'effective', index: 'AV50', days: 0, adds: [], removes: ['Gamma'] },
      { kind: 'squeeze', id: 'k', name: 'Acme', cover: 0.4 },
      { kind: 'filing', id: 'l', handle: 'Ada', name: 'Acme', level: 0.05 },
      { kind: 'margin', id: 'm', equity: 1200, required: 1500 },
      { kind: 'liquidated', id: 'n', qty: 40, asset: 'ACME', price: 12.25 },
      { kind: 'liquidation', id: 'o', asset: 'ACME' },
      { kind: 'option', id: 'p', contract: 'ACME|C|10', payout: 250 },
      { kind: 'option', id: 'p2', contract: 'ACME|C|10', payout: 0 },
      { kind: 'regime', id: 'q', from: 'expansion', to: 'contraction' },
      { kind: 'regime', id: 'q2', from: 'x', to: 'y' },
    ];
    for (const f of facts) {
      const m = newsroomMsg(f);
      for (const locale of ['en', 'fr'] as const) {
        const out = renderMsg(m, locale);
        expect(out, `${f.kind} ${locale}`).not.toMatch(/\{\w+\}/);
        expect(out.length).toBeGreaterThan(10);
      }
    }
  });

  it('the Wire, the close card, the rivals and the desk memo all render French without an English sentence', () => {
    const quote: Msg = executivesMsg({ id: 'x', name: 'Acme', surprise: 0.9 });
    const earnings = newsroomMsg({ kind: 'earnings', id: 'e1', name: 'Acme', surprise: 0.9, move: 0.05, quote });
    expect(renderMsg(earnings, 'fr')).toMatch(/\. «|« /);
    expect(renderMsg(rivalMsg({ id: 'hale', day: 4, pastPct: 0.02 }), 'fr')).toMatch(/[a-zé]/);
    const memo = textProvider.deskMemo({ assetId: 'ACME', from: 1, to: 3, move: 0.03, dominant: 'news', pool: { id: 'retail', buying: true } });
    expect(memo.length).toBeGreaterThan(0);
    for (const m of memo) expect(renderMsg(m, 'fr')).not.toMatch(/ did | led the buying/);
  });
});

describe('the variant choice (P7-3: stable by the fact id, never a world stream)', () => {
  it('the same fact id always picks the same variant', () => {
    for (const id of ['12:ACME', '13:regime', 'npc-hale:7']) expect(variantOf(id)).toBe(variantOf(id));
    expect(vkey('txt.x', 'a')).toBe(`txt.x.${variantOf('a')}`);
  });

  it('the variants spread over the eight slots', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(variantOf(`${i}:ACME`));
    expect(seen.size).toBe(VARIANTS);
  });

  it('the same facts give the same message every time', () => {
    const f: NewsFacts = { kind: 'move', id: '99:ACME', name: 'Acme', move: 0.02 };
    expect(newsroomMsg(f)).toEqual(newsroomMsg(f));
  });

  it('the rumor names a source from its own id, and the moderator line keys by reason', () => {
    expect(rumorMsg({ id: '5:ACME', name: 'Acme', direction: 1 }).key).toMatch(/^txt\.rumor\.hot\.\d$/);
    expect(rumorMsg({ id: '5:ACME', name: 'Acme', direction: -1 }).key).toMatch(/^txt\.rumor\.cold\.\d$/);
    expect(moderatorMsg({ id: 'Zed', reason: 'crypto', name: 'Zed' }).key).toMatch(/^txt\.mod\.crypto\.\d$/);
    expect(analystMsg({ id: 'ACME:1:3', kind: 'move', dir: 'flat', asset: 'ACME', pct: 0.0001, from: 1, to: 3 }).key).toMatch(/^txt\.analyst\.flat\.\d$/);
  });
});
