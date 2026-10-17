import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { headlineKey, precursorKey } from '@/engine';
import { VARIANTS, narratorMsg, newsroomMsg, type NarratorFacts, type NewsFacts } from './roles';
import { renderMsg } from './template';
import { WIRE_TAGS, wireTagKey, wireTagMsg } from './wireTags';
import { moderatorLine } from '../launchpad/moderatorLine';

type Dict = Record<string, string>;
const EN = en as Dict;
const FR = fr as Dict;

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');

/** Each engine event line has eight variants per locale, with the same placeholders (the Phase 7 copy rule). */
describe('engine event lines (P7-1, newsroom: headlines and precursors)', () => {
  const bases = ['event.headline.crash', 'event.headline.bubble', 'event.headline.crisis', 'event.headline.flash', 'event.pre.crash', 'event.pre.bubble', 'event.pre.crisis'];
  it.each(bases)('%s has eight variants in English and French, with the same placeholders', (base) => {
    for (let i = 0; i < VARIANTS; i++) {
      const k = `${base}.${i}`;
      expect(EN[k], `${k} en`).toBeTruthy();
      expect(FR[k], `${k} fr`).toBeTruthy();
      expect(vars(FR[k]!), `${k} placeholders`).toBe(vars(EN[k]!));
    }
    expect(Object.keys(EN).filter((k) => k.startsWith(`${base}.`))).toHaveLength(VARIANTS);
  });

  it('the variant of a headline is chosen by the event id, stable and in range', () => {
    const a = headlineKey('crash', 'Markets in freefall.', 'ev7');
    expect(a).toMatch(/^event\.headline\.crash\.[0-7]$/);
    expect(headlineKey('crash', 'Markets in freefall.', 'ev7')).toBe(a);
    const seen = new Set<string>();
    for (let i = 1; i <= 200; i++) seen.add(headlineKey('crash', 'Markets in freefall.', `ev${i}`)!);
    expect(seen.size).toBe(VARIANTS);
  });

  it('a line the lists do not hold has no key (the English stays, as before)', () => {
    expect(headlineKey('crash', 'Something else.', 'ev1')).toBeNull();
    expect(precursorKey('crash', 'Something else.', 'ev1')).toBeNull();
  });

  it('a precursor is keyed by the event and its line, so two lines of one event can differ', () => {
    const k1 = precursorKey('crisis', 'Interbank lending rates spike overnight', 'ev3');
    expect(k1).toMatch(/^event\.pre\.crisis\.[0-7]$/);
    expect(precursorKey('crisis', 'Interbank lending rates spike overnight', 'ev3')).toBe(k1);
  });
});

describe('the Wire tags (the labels the client shows in the viewer’s language)', () => {
  it('every label has an English and a French key', () => {
    for (const tag of WIRE_TAGS) {
      const k = wireTagKey(tag);
      expect(EN[k], `${tag} en`).toBeTruthy();
      expect(FR[k], `${tag} fr`).toBeTruthy();
    }
  });

  it('a known label maps to its key, and an unknown tag (a ticker) maps to nothing', () => {
    expect(wireTagMsg('Central bank')).toEqual({ key: 'wire.tag.central-bank' });
    expect(renderMsg(wireTagMsg('Deal')!, 'fr')).toBe('Affaire');
    expect(wireTagMsg('ACME')).toBeUndefined();
  });
});

describe('the newsroom facts Phase 7 added (P7-1: the engine lines that had no descriptor)', () => {
  const facts: NewsFacts[] = [
    { kind: 'sale', id: 's1', name: 'Harbour Bakery', price: 12_400 },
    { kind: 'deal', id: 'd1', handle: 'Ada', biz: 'Harbour Bakery', city: 'Port Avalon' },
    { kind: 'property', id: 'p1', handle: 'Ada', type: 'office tower', district: 'Gilt Hall', city: 'Port Avalon' },
    ...['viral', 'award', 'contract', 'rival_closes', 'breakdown', 'inspection', 'strike', 'breach', 'bad_review', 'supply'].flatMap((event) => [
      { kind: 'bizEvent' as const, id: `b-${event}`, event, biz: 'Harbour Bakery', city: 'Port Avalon', mult: 1.4, days: 1 },
      { kind: 'bizEvent' as const, id: `b-${event}-down`, event, biz: 'Harbour Bakery', city: 'Port Avalon', mult: 0.6, days: 3 },
    ]),
    { kind: 'chapter', id: 'c1', number: 2, winner: 'Ada' },
    { kind: 'chapter', id: 'c2', number: 2, winner: null },
    { kind: 'hallOfFame', id: 'h1', rank: 1, number: 2 },
    { kind: 'priced', id: 'i1', name: 'Gilt Works', ticker: 'GLTW', price: 12.5 },
    { kind: 'tradePlan', id: 't1', name: 'Gilt Works', from: 4, to: 9 },
    { kind: 'buyback', id: 'y1', name: 'Gilt Works', size: 500, from: 4, to: 9 },
    { kind: 'lawsuit', id: 'l1', handle: 'Ada', defendant: 'Bob', law: 'cyber intrusion' },
    { kind: 'lawsuit', id: 'l2', handle: 'Ada', defendant: 'Bob', law: 'fund abuse' },
    { kind: 'verdict', id: 'v1', defendant: 'Bob', plaintiff: 'Ada', law: 'model theft' },
  ];

  it('every fact renders with every placeholder filled, in both languages, with no English where French is asked', () => {
    for (const f of facts) {
      const m = newsroomMsg(f);
      expect(renderMsg(m, 'en'), `${f.kind} en`).not.toMatch(/\{\w+\}|@|txt\./);
      const frText = renderMsg(m, 'fr');
      expect(frText, `${f.kind} fr`).not.toMatch(/\{\w+\}|@|txt\./);
      expect(frText.length, `${f.kind} fr length`).toBeGreaterThan(10);
    }
  });

  it('the business line reads the day count in both languages (one day, days)', () => {
    const one = renderMsg(newsroomMsg({ kind: 'bizEvent', id: 'b-viral', event: 'viral', biz: 'X', city: 'Y', mult: 1.4, days: 1 }), 'en');
    expect(one).toContain('1 day');
    expect(one).toContain('+40%');
    const many = renderMsg(newsroomMsg({ kind: 'bizEvent', id: 'b-viral-down', event: 'viral', biz: 'X', city: 'Y', mult: 0.6, days: 3 }), 'fr');
    expect(many).toContain('3 jours');
    expect(many).toContain('−40\u00a0%');
  });

  it('the court kind is a fragment in each language, and an unknown kind shows as it is', () => {
    expect(renderMsg(newsroomMsg({ kind: 'lawsuit', id: 'x', handle: 'A', defendant: 'B', law: 'cyber intrusion' }), 'fr')).toContain('l’intrusion informatique');
    expect(renderMsg(newsroomMsg({ kind: 'lawsuit', id: 'x', handle: 'A', defendant: 'B', law: 'something new' }), 'en')).toContain('something new');
  });
});

describe('the narrator (P7-1: the daily close card lines)', () => {
  const facts: NarratorFacts[] = [
    { id: 'n1', kind: 'head', move: 'up', amount: '$12.00' },
    { id: 'n2', kind: 'head', move: 'down', amount: '$12.00' },
    { id: 'n3', kind: 'head', move: 'flat', amount: '' },
    { id: 'n4', kind: 'best', asset: 'ACME', pct: '+2.00%', usd: '$40.00' },
    { id: 'n5', kind: 'worst', asset: 'ACME', pct: '-2.00%', usd: '-$40.00' },
    { id: 'n6', kind: 'noPositions' },
    { id: 'n7', kind: 'gx', pct: '+0.40%' },
    { id: 'n8', kind: 'sector', which: 'best', sector: 'Tech', pct: '+1.00%' },
    { id: 'n9', kind: 'sector', which: 'worst', sector: 'Tech', pct: '-1.00%' },
    { id: 'n10', kind: 'ghosts', basket: '$1,000.00', random: '$1,001.00', momentum: '$999.00', player: '$1,002.00' },
    { id: 'n11', kind: 'noTrades' },
    { id: 'n12', kind: 'rank', beaten: 2 },
  ];

  it('every narrator line renders in both languages with its placeholders filled', () => {
    for (const f of facts) {
      const m = narratorMsg(f);
      expect(renderMsg(m, 'en'), `${f.kind} en`).not.toMatch(/\{\w+\}/);
      expect(renderMsg(m, 'fr'), `${f.kind} fr`).not.toMatch(/\{\w+\}/);
      expect(m.key, f.kind).toMatch(/^txt\.narr\.\w+(\.\w+)?\.\d$/);
    }
  });

  it('the variant is stable for the same close, and differs between closes', () => {
    expect(narratorMsg({ id: '5:gx', kind: 'gx', pct: '+1%' })).toEqual(narratorMsg({ id: '5:gx', kind: 'gx', pct: '+1%' }));
    const keys = new Set<string>();
    for (let d = 0; d < 80; d++) keys.add(narratorMsg({ id: `${d}:head`, kind: 'head', move: 'up', amount: '$1.00' }).key);
    expect(keys.size).toBe(VARIANTS);
  });
});

describe('the moderator (P7-1: the Launchpad refusals say their first part in the moderator’s line)', () => {
  it('a refused name or ticker gets its list’s line, and a decision the moderator does not make gets none', () => {
    expect(moderatorLine('nameCrypto', 'Bitcoin Pals')!.key).toMatch(/^txt\.mod\.crypto\.\d$/);
    expect(moderatorLine('tickerCrypto', 'DOGE')!.key).toMatch(/^txt\.mod\.crypto\.\d$/);
    expect(moderatorLine('nameBrand', 'Apple Pie')!.key).toMatch(/^txt\.mod\.brand\.\d$/);
    expect(moderatorLine('nameTaken', 'Frogcoin')!.key).toMatch(/^txt\.mod\.taken\.\d$/);
    expect(moderatorLine('tickerTaken', 'FROG')).toBeNull();
    expect(moderatorLine('nameCrypto', undefined)).toBeNull();
  });

  it('the same name always gets the same line, in both languages with the name in it', () => {
    const m = moderatorLine('nameFigure', 'Musk Fan Club')!;
    expect(moderatorLine('nameFigure', 'Musk Fan Club')).toEqual(m);
    expect(renderMsg(m, 'fr')).toContain('Musk Fan Club');
    expect(renderMsg(m, 'en')).toContain('Musk Fan Club');
  });
});
