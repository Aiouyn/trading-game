import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const privacy = read('../../docs/V1-PRIVACY.md');
const acceptance = read('../../docs/team/specs/tape-acceptance.md');

/** The text of one "## N." section of the privacy list, up to the next "## " heading. */
function section(prefix: string): string {
  const start = privacy.indexOf(`## ${prefix}`);
  if (start < 0) return '';
  const rest = privacy.slice(start + 3);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

describe('docs/V1-PRIVACY.md: the public-records list (P4) and the L1 keys (P6)', () => {
  it('section 1 lists exactly the allowed public records: filings of 0.5% or more, Wire purchases, profile holdings', () => {
    const s1 = section('1.');
    expect(s1).toMatch(/Filings of 0\.5% or more/);
    expect(s1).toMatch(/Purchases of businesses and property on the Wire/);
    expect(s1).toMatch(/Profile holdings/);
    expect((s1.match(/^\d\. \*\*/gm) ?? []).length).toBe(3);
  });

  it('section 2 names every never-shown item of the lead ruling', () => {
    const s2 = section('2.');
    for (const item of ['Market positions', 'Orders', 'P&L curves', 'Trading style', 'Bots and NPC personas']) {
      expect(s2).toContain(item);
    }
  });

  it('section 4 allows only tg-prefs and tg-token in localStorage (L1)', () => {
    const s4 = section('4.');
    expect(s4).toContain('`tg-prefs`');
    expect(s4).toContain('`tg-token`');
    expect(s4).toMatch(/Nothing else is written to localStorage/);
  });

  it('section 5 keeps the live seed out of the source: drawn at first boot, stored in the database', () => {
    expect(section('5.')).toMatch(/random seed at its first boot/);
  });
});

describe('docs/team/specs/tape-acceptance.md: the L-checks assert the public list (P4, P6)', () => {
  it('L1 names the two allowed localStorage keys', () => {
    const l1 = acceptance.split('\n').find((l) => l.startsWith('| L1 |')) ?? '';
    expect(l1).toContain('`tg-prefs`');
    expect(l1).toContain('`tg-token`');
  });

  it('L3 and L4 point to the public-records list in docs/V1-PRIVACY.md', () => {
    for (const row of ['| L3 |', '| L4 |']) {
      const line = acceptance.split('\n').find((l) => l.startsWith(row)) ?? '';
      expect(line, row).toContain('docs/V1-PRIVACY.md');
    }
  });
});
