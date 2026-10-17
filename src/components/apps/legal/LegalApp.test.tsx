import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLocale } from '@/i18n';
import { applyCommand, createGame } from '@/world/game';
import { directory, playerView } from '@/world/view';
import type { CourtCase, GameState } from '@/world/types';
import { COUNSEL_COST, FILING_FEE } from '@/world/court';
import { money } from '@/game/format';
import { emptyLab } from '@/world/lab';
import { LegalApp } from './LegalApp';

const holder = vi.hoisted(() => ({
  state: {} as Record<string, unknown>, hook: 0, kind: 'cyber intrusion' as CourtCase['kind'], counsel: '1', review: false,
}));
vi.mock('@/game/store', () => ({ useGame: (sel: (s: unknown) => unknown) => sel(holder.state) }));
vi.mock('@/game/usePublicPanel', () => ({ usePublicPanel: () => {} }));
// Seed the selected claim, counsel and review state for server rendering; all child hooks use real React.
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  return { ...real, useState: (initial: unknown) => {
    const hook = holder.hook++;
    const selected = hook === 1 ? holder.kind : hook === 2 ? holder.counsel : hook === 3 ? holder.review : initial;
    return real.useState(selected);
  } };
});

function world(): GameState {
  const g = createGame('legal-render', { warmupDays: 0, npcs: false });
  for (const [id, handle] of [['u1', 'trader_0'], ['u2', 'trader_1']] as const) {
    expect(applyCommand(g, id, { type: 'join', handle, country: 'AV' }).ok).toBe(true);
  }
  return g;
}

function render(g: GameState, kind: CourtCase['kind'], review = false, counsel = 1): string {
  holder.state = { me: playerView(g, 'u1'), directory: directory(g), act: vi.fn(), frame: { tick: g.market.tick } };
  holder.kind = kind;
  holder.counsel = String(counsel);
  holder.review = review;
  holder.hook = 0;
  return renderToStaticMarkup(<LegalApp />);
}

function tag(html: string, id: string): string {
  const found = html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`));
  expect(found, id).not.toBeNull();
  return found![0];
}

afterEach(() => useLocale.getState().setLocale('en'));

describe('Legal filing controls render the engine evidence and costs', () => {
  it('zero model-theft evidence disables File and confirmation with an exact French minimum', () => {
    const g = world();
    useLocale.getState().setLocale('fr');
    const html = render(g, 'model theft');
    expect(tag(html, 'file-case')).toMatch(/\sdisabled=""/);
    expect(html).toContain('27,5 points');
    expect(html).toContain('court-block-reason');
    expect(tag(render(g, 'model theft', true), 'court-commit-confirm')).toMatch(/\sdisabled=""/);
  });

  it('the selected claim shows its exact evidence and enables File at 27.5, not 27', () => {
    const g = world();
    g.market.accounts.u1!.cash = FILING_FEE + COUNSEL_COST[1]!;
    g.cyber.evidence['u2>u1'] = 27;
    expect(tag(render(g, 'model theft'), 'file-case')).toMatch(/\sdisabled=""/);
    g.cyber.evidence['u2>u1'] = 27.5;
    const html = render(g, 'model theft');
    expect(tag(html, 'file-case')).not.toMatch(/\sdisabled=""/);
    expect(html).toContain('27.5 points');
  });

  it('residue-only theft evidence is suggested and displayed for the selected claim', () => {
    const g = world();
    g.market.accounts.u1!.cash = FILING_FEE;
    g.lab.u2 = emptyLab();
    g.lab.u2.models.push({ id: 'stolen', name: 'Student', kind: 'trading', mcs: 1, createdTick: 0, residue: 0.5 });
    const html = render(g, 'model theft', false, 0);
    expect(html).toContain('30 points');
    expect(tag(html, 'file-case')).not.toMatch(/\sdisabled=""/);
  });

  it.each([0, 1, 2, 3])('counsel %i renders a flat filing fee, counsel once, total and zero cash after', (counsel) => {
    const g = world();
    g.cyber.evidence['u2>u1'] = 40;
    const total = FILING_FEE + COUNSEL_COST[counsel]!;
    g.market.accounts.u1!.cash = total;
    const html = render(g, 'cyber intrusion', true, counsel);
    const row = (id: string) => html.match(new RegExp(`data-testid="${id}">[\\s\\S]*?</div>`))![0];
    expect(row('court-commit-filing')).toContain(money(FILING_FEE));
    expect(row('court-commit-counsel')).toContain(money(COUNSEL_COST[counsel]!));
    expect(row('court-commit-fee')).toContain(money(total));
    expect(row('court-commit-after')).toContain(money(0));
    expect(tag(html, 'court-commit-confirm')).not.toMatch(/\sdisabled=""/);
    g.market.accounts.u1!.cash = total - 1;
    const short = render(g, 'cyber intrusion', true, counsel);
    expect(short).not.toContain('court-commit-after');
    expect(tag(short, 'court-commit-confirm')).toMatch(/\sdisabled=""/);
  });
});
