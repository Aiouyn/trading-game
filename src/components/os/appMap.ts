// Static maps between the game's screens, shell apps and glyphs (DECISIONS, C-38). Pure data, so the
// tests can check that every app has a glyph and every old screen has a window.
import type { Screen } from '@/game/store';
import type { AppId } from '@/shell/apps';
import type { GlyphName } from './glyphs';

/** Where each old screen opens on the desktop (Phase 2 step 1: the screens become windows). */
export const SCREEN_APP: Record<Screen, AppId> = {
  market: 'broker',
  portfolio: 'portfolio',
  empire: 'businesses',
  estate: 'boutique',
  lab: 'ailab',
  security: 'security',
  court: 'legal',
  social: 'messages',
  wire: 'wire',
  profile: 'settings',
};

/** The glyph for each app (C-38: each app has one in the same style). */
export const APP_GLYPH: Record<AppId, GlyphName> = {
  broker: 'broker',
  portfolio: 'portfolio',
  wire: 'wire',
  calendar: 'calendar',
  messages: 'messages',
  businesses: 'businesses',
  company: 'company',
  boutique: 'boutique',
  ailab: 'ailab',
  security: 'security',
  legal: 'legal',
  bank: 'bank',
  research: 'research',
  exchange: 'exchange',
  launchpad: 'launchpad',
  learn: 'learn',
  settings: 'settings',
  city: 'company',
};
