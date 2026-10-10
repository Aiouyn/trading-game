import { describe, expect, it } from 'vitest';
import { APP_IDS } from '@/shell/apps';
import { APP_GLYPH, SCREEN_APP } from './appMap';
import { GLYPH_NAMES } from './glyphs';

describe('app and screen maps', () => {
  it('gives every app a glyph that exists in the glyph set', () => {
    expect(Object.keys(APP_GLYPH).sort()).toEqual([...APP_IDS].sort());
    for (const app of APP_IDS) expect(GLYPH_NAMES).toContain(APP_GLYPH[app]);
  });

  it('opens every old screen in an app that exists', () => {
    for (const app of Object.values(SCREEN_APP)) expect(APP_IDS).toContain(app);
  });
});
