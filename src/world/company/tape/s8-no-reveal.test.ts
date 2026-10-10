/**
 * Tape section 8, no-reveal (tape-company-building.md section 10a, Velvet v1.5 and Quant section 11). The public view is
 * the only company view a second player may read: founder-only fields never reach it, and the founder view throws for
 * anyone else. Test names carry the Tape id. Layer U, with L (static) for the import boundary.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceTo, BUYER_A, FOUNDER, founded, listedWorld } from '../b1fixture';
import { founderCompanyView, publicCompanyView, type CompanyPublic } from '../views';

const ROOT = resolve(__dirname, '..', '..', '..', '..');

/** Every source file under a directory (recursive), skipping test files. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('Tape s8: no-reveal, lint and links', () => {
  it('founder_view_throws: founderCompanyView for a non-founder throws, and for the founder returns the full view', () => {
    const { g, c } = listedWorld('nr-throw');
    expect(() => founderCompanyView(g.companies!, BUYER_A, c.id, 230)).toThrow(/not the founder/);
    expect(founderCompanyView(g.companies!, FOUNDER, c.id, 230).id).toBe(c.id);
  });

  it('public_view_sentinels: private values (cash, the quarter-to-date revenue, the book) never appear in the public view text', () => {
    const { g, c } = listedWorld('nr-sent');
    advanceTo(g, 230);
    c.cash = 123_456_789.25; // unique sentinels, so a leak shows as a string match
    c.qtd.revenue = 987_654.5;
    const text = JSON.stringify(publicCompanyView(c, 230));
    expect(text).not.toContain('123456789.25');
    expect(text).not.toContain('987654.5');
  });

  it('public_view_schema (keys): the public view carries only CompanyPublic keys (no founder-only key)', () => {
    const { g, c } = listedWorld('nr-keys');
    advanceTo(g, 230);
    // the key set of the CompanyPublic interface (views.ts); an extra key in the built view is a leak
    const allowed: Record<keyof CompanyPublic, true> = {
      id: true, name: true, sector: true, foundedDay: true, tier: true, listed: true, cities: true, products: true,
      headcountBand: true, debt: true, cashDebt: true, filings: true, registry: true, signals: true, credibility: true,
      insiderTrades: true, distressFlag: true, buybackPrograms: true, plans: true, planSkips: true, window: true,
    };
    const keys = Object.keys(publicCompanyView(c, 230));
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(allowed, `key ${k}`).toHaveProperty(k);
  });

  it('private_registry_only: a Seed private company seen by another player shows the registry fields only (no signals, plans, window or trades)', () => {
    const { g, c } = founded('nr-reg');
    advanceTo(g, 10);
    const v = publicCompanyView(c, 10);
    expect(v.name).toBe('Acme');
    expect(v.sector).toBe('tech');
    expect(v.signals).toEqual([]);
    expect(v.plans).toEqual([]);
    expect(v.insiderTrades).toEqual([]);
    expect(v.window).toBeUndefined();
    expect(v.filings).toEqual([]);
  });

  it('lint_founder_view_isolation (L): no source file outside the world layer and the Company app names the founder-only view', () => {
    const forbidden = /\b(CompanyFounderView|CompanyFounderEvent|founderCompanyView|ownCompanyView)\b/;
    const hits = sourceFiles(resolve(ROOT, 'src'))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter((rel) => !rel.startsWith('src/world/') && !rel.startsWith('src/components/apps/company/'))
      .filter((rel) => forbidden.test(readFileSync(resolve(ROOT, rel), 'utf8')));
    expect(hits).toEqual([]);
  });
});
