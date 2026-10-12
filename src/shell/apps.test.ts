import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APPS,
  APP_IDS,
  BUILTIN_LAYOUTS,
  MAX_BROKERS,
  MAX_CUSTOM_LAYOUTS,
  MAX_FILE_ID,
  READY_VIEWS,
  SHELF_ORDER,
  cleanProps,
  isAppId,
  isBuiltinLayout,
  normalizeTicker,
  secondWindowReady,
} from './apps';
import { RANK_ORDER } from './ctx';

const i18n = (name: 'en' | 'fr'): Record<string, string> =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../i18n/${name}.json`, import.meta.url)), 'utf8'));

describe('app registry', () => {
  it('has one entry per app id, with the id on the entry', () => {
    for (const id of APP_IDS) {
      expect(APPS[id].id).toBe(id);
      expect(APPS[id].titleKey).toBe(`shell.app.${id}`);
    }
    expect(Object.keys(APPS).sort()).toEqual([...APP_IDS].sort());
  });

  it('keeps the minimum sizes from the specs (Broker 480x420, Wire 360x280, Portfolio 400x220, others 400x300)', () => {
    expect([APPS.broker.minW, APPS.broker.minH]).toEqual([480, 420]);
    expect([APPS.wire.minW, APPS.wire.minH]).toEqual([360, 280]);
    expect([APPS.portfolio.minW, APPS.portfolio.minH]).toEqual([400, 220]);
    for (const id of APP_IDS) {
      if (['broker', 'wire', 'portfolio'].includes(id)) continue;
      expect([APPS[id].minW, APPS[id].minH], id).toEqual([400, 300]);
    }
  });

  it('caps Brokers at 4, one per ticker, and research one window per file', () => {
    expect(MAX_BROKERS).toBe(4);
    expect(APPS.broker.instances).toEqual({ kind: 'per-ticker', max: 4 });
    expect(APPS.research.instances).toEqual({ kind: 'per-file' });
    expect(APPS.portfolio.instances).toEqual({ kind: 'single' });
  });

  it('allows a second Portfolio only through Review, with the journal view, capped at two', () => {
    expect(APPS.portfolio.secondInstance).toEqual({ layout: 'review', view: 'journal', max: 2 });
    expect(MAX_CUSTOM_LAYOUTS).toBe(5);
  });

  it('opens the second Portfolio only when its journal view is built (the journal and analyst views are built in Phase 3)', () => {
    expect(READY_VIEWS).toEqual(['journal', 'analyst']);
    expect(secondWindowReady('portfolio')).toBe(true);
    expect(secondWindowReady('portfolio', [])).toBe(false);
    expect(secondWindowReady('portfolio', ['analyst'])).toBe(false);
    expect(secondWindowReady('wire')).toBe(false);
  });

  it('keeps unlock ranks as data, Company hidden until R2 and Research at R3', () => {
    expect(APPS.company.minRank).toBe('R2');
    expect(APPS.company.hideWhenLocked).toBe(true);
    expect(APPS.research.minRank).toBe('R3');
    expect(APPS.research.hideWhenLocked).toBe(false);
    expect(APPS.broker.minRank).toBeNull();
    for (const id of APP_IDS) {
      const r = APPS[id].minRank;
      if (r !== null) expect(RANK_ORDER, id).toContain(r);
    }
  });

  it('shows Exchange from Phase 4 and Launchpad from Phase 5, on the shelf after the Exchange (C-38)', () => {
    expect(APPS.exchange.available).toBe(true);
    expect(APPS.launchpad.available).toBe(true);
    for (const id of APP_IDS) expect(APPS[id].available, id).toBe(true);
    expect(SHELF_ORDER).toContain('exchange');
    expect(SHELF_ORDER).toContain('launchpad');
    expect(SHELF_ORDER.indexOf('launchpad')).toBe(SHELF_ORDER.indexOf('exchange') + 1);
  });

  it('orders the shelf with Broker first and lists each visible app once', () => {
    expect(SHELF_ORDER[0]).toBe('broker');
    expect(new Set(SHELF_ORDER).size).toBe(SHELF_ORDER.length);
    const visible = APP_IDS.filter((id) => APPS[id].available).sort();
    expect([...SHELF_ORDER].sort()).toEqual(visible);
  });

  it('gives every app name a French and English string', () => {
    const en = i18n('en');
    const fr = i18n('fr');
    for (const id of APP_IDS) {
      const key = APPS[id].titleKey;
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(fr[key], `fr ${key}`).toBeTruthy();
    }
  });

  it('recognises app ids only', () => {
    expect(isAppId('broker')).toBe(true);
    expect(isAppId('ailab')).toBe(true);
    expect(isAppId('lab')).toBe(false);
    expect(isAppId('__proto__')).toBe(false);
    expect(isAppId(3)).toBe(false);
  });
});

describe('props', () => {
  it('upper-cases tickers and rejects odd shapes', () => {
    expect(normalizeTicker(' hlcn ')).toBe('HLCN');
    expect(normalizeTicker('bad ticker!!')).toBeNull();
    expect(normalizeTicker('')).toBeNull();
  });

  it('cleans props per app and drops nothing it should keep', () => {
    expect(cleanProps('broker', { ticker: 'brnt', extra: 1 })).toEqual({ ticker: 'BRNT' });
    expect(cleanProps('broker', undefined)).toEqual({});
    expect(cleanProps('portfolio', { view: 'journal' })).toEqual({ view: 'journal' });
    expect(cleanProps('portfolio', { view: 'nope' })).toBeNull();
    expect(cleanProps('wire', { ticker: 'BRNT' })).toBeNull();
    expect(cleanProps('research', { fileId: 'f-1_a' })).toEqual({ fileId: 'f-1_a' });
    expect(cleanProps('research', { fileId: 'a/b' })).toBeNull();
    expect(cleanProps('broker', 'HLCN')).toBeNull();
  });
});

describe('file ids and built-in names', () => {
  it('caps a file id at 55 characters, so research-<fileId> fits the 64-character window id', () => {
    expect(MAX_FILE_ID).toBe(55);
    expect(cleanProps('research', { fileId: 'a'.repeat(55) })).toEqual({ fileId: 'a'.repeat(55) });
    expect(cleanProps('research', { fileId: 'a'.repeat(56) })).toBeNull();
    expect(`research-${'a'.repeat(MAX_FILE_ID)}`.length).toBe(64);
  });

  it('names the three built-in layouts and nothing else', () => {
    expect(BUILTIN_LAYOUTS).toEqual(['trade', 'review', 'research']);
    expect(isBuiltinLayout('Trade'.toLowerCase())).toBe(true);
    expect(isBuiltinLayout('mine')).toBe(false);
  });
});
