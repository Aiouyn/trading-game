import { describe, expect, it } from 'vitest';
import { welcomeJson, type WelcomeParts } from '../../../server/wire';
import { overlayText } from './overlay';

const PARTS: WelcomeParts = {
  playerId: 'u_1', tickMs: 5000, frameJson: '{}', defsJson: '[]', meJson: 'null', pubJson: '{}', directoryJson: '[]', chatJson: '{}', serverTime: 7,
};

describe('overlayText', () => {
  const map = { w1: { en: 'Acme beat.', fr: 'Acme a dépassé.' }, w2: { en: 'Only English.', fr: '  ' } };

  it('gives the line in the viewer language when present', () => {
    expect(overlayText(map, 'w1', 'fr')).toBe('Acme a dépassé.');
    expect(overlayText(map, 'w1', 'en')).toBe('Acme beat.');
  });

  it('gives null (the template shows) when the item or the language has no line', () => {
    expect(overlayText(map, 'w9', 'en')).toBeNull();
    expect(overlayText(map, 'w2', 'fr')).toBeNull();
  });
});

describe('the welcome carries the overlay only when given', () => {
  it('is byte-identical to the old welcome with no overlay field (the slot is off)', () => {
    const json = welcomeJson(PARTS);
    expect(json).toBe('{"t":"welcome","playerId":"u_1","tickMs":5000,"frame":{},"defs":[],"me":null,"pub":{},"directory":[],"chat":{},"serverTime":7}');
    expect(JSON.parse(json)).not.toHaveProperty('textOverlay');
  });

  it('adds the overlay as a top-level field when the slot is on', () => {
    const parsed = JSON.parse(welcomeJson({ ...PARTS, textOverlayJson: '{"w1":{"en":"A","fr":"B"}}' })) as { textOverlay: unknown; serverTime: number };
    expect(parsed.textOverlay).toEqual({ w1: { en: 'A', fr: 'B' } });
    expect(parsed.serverTime).toBe(7);
  });
});
