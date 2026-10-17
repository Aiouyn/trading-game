import { describe, expect, it } from 'vitest';
import { DRAWING_CAPS, sanitizeDrawings, type ChartDrawing } from './drawings';

const line = (id: string, extra: Partial<ChartDrawing> = {}): ChartDrawing => ({
  id, kind: 'trend', points: [{ t: 10, p: 100 }, { t: 20, p: 101 }], ...extra,
});

describe('chart drawings kept per player', () => {
  it('accepts a clean list and keeps the shape it was sent with', () => {
    const r = sanitizeDrawings([line('a', { color: 'brass', width: 2, style: 'dashed' }), line('b', { text: 'note' })]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('drops unknown fields and refuses a bad kind, colour, width, style, number or text', () => {
    const r = sanitizeDrawings([{ ...line('a'), evil: '<script>' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value[0]!)).not.toContain('evil');
    expect(sanitizeDrawings([{ ...line('a'), kind: 'nope' }])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([line('a', { color: '#ff0000' as never })])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([line('a', { width: 9 as never })])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([line('a', { style: 'wavy' as never })])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([line('a', { text: 'x'.repeat(DRAWING_CAPS.text + 1) })])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([{ ...line('a'), points: [{ t: 1, p: Number.NaN }] }])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([{ ...line('a'), points: [{ t: 1.5, p: 3 }] }])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings([{ ...line('a'), points: [{ t: 1, p: 0 }] }])).toEqual({ ok: false, error: 'drawingBad' });
  });

  it('caps the number of drawings per symbol, the points per drawing, and the bytes', () => {
    const many = Array.from({ length: DRAWING_CAPS.perSymbol + 1 }, (_, i) => line(`d${i}`));
    expect(sanitizeDrawings(many)).toEqual({ ok: false, error: 'drawingsFull' });
    const long = { ...line('a'), points: Array.from({ length: DRAWING_CAPS.points + 1 }, (_, i) => ({ t: i, p: 1 + i })) };
    expect(sanitizeDrawings([long])).toEqual({ ok: false, error: 'drawingBad' });
    const big = Array.from({ length: DRAWING_CAPS.perSymbol }, (_, i) => ({
      ...line(`b${i}`), points: Array.from({ length: DRAWING_CAPS.points }, (_, k) => ({ t: k, p: 1 + k / 10 })), text: 'x'.repeat(80),
    }));
    expect(sanitizeDrawings(big)).toEqual({ ok: false, error: 'drawingsTooLarge' });
  });

  it('refuses duplicate ids and a non-list', () => {
    expect(sanitizeDrawings([line('a'), line('a')])).toEqual({ ok: false, error: 'drawingBad' });
    expect(sanitizeDrawings({ nope: true })).toEqual({ ok: false, error: 'drawingBad' });
  });

  it('keeps a position tool’s risk settings, and refuses a negative or non-finite one', () => {
    const pos = { ...line('p'), kind: 'long' as const, points: [{ t: 1, p: 50 }, { t: 9, p: 52 }, { t: 9, p: 49 }], position: { riskUsd: 250, riskPct: 0.5 } };
    const r = sanitizeDrawings([pos]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]!.position).toEqual({ riskUsd: 250, riskPct: 0.5 });
    expect(sanitizeDrawings([{ ...pos, position: { riskUsd: -1, riskPct: 1 } }])).toEqual({ ok: false, error: 'drawingBad' });
  });
});
