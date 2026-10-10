import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { freshWorldSeed } from '@/world/seed';
import { Store, WORLD_SEED_KEY } from '../../server/db';

const dirs: string[] = [];
const open: Store[] = [];

function store(): Store {
  const dir = mkdtempSync(join(tmpdir(), 'tg-seed-'));
  dirs.push(dir);
  const s = new Store(dir);
  open.push(s);
  return s;
}

afterEach(() => {
  for (const s of open.splice(0)) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('the live world seed (P5): random at first boot, kept only in the database', () => {
  it('a fresh seed is 16 hex characters, and two draws differ', () => {
    const a = freshWorldSeed();
    const b = freshWorldSeed();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(b).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });

  it('the first boot draws and stores a seed; later boots keep it, whatever they would draw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-seed-'));
    dirs.push(dir);
    const first = new Store(dir);
    open.push(first);
    const seed = first.worldSeed(() => 'aaaaaaaaaaaaaaaa');
    expect(seed).toBe('aaaaaaaaaaaaaaaa');
    expect(first.getBlob(WORLD_SEED_KEY)).toBe('aaaaaaaaaaaaaaaa');
    expect(first.worldSeed(() => 'bbbbbbbbbbbbbbbb')).toBe('aaaaaaaaaaaaaaaa');
    first.close();
    open.pop();
    const again = new Store(dir);
    open.push(again);
    expect(again.worldSeed(() => 'cccccccccccccccc')).toBe('aaaaaaaaaaaaaaaa');
  });

  it('a new database gets a random seed from the platform source, not a fixed one', () => {
    const s = store();
    const seed = s.worldSeed(freshWorldSeed);
    expect(seed).toMatch(/^[0-9a-f]{16}$/);
    expect(seed).not.toBe('avalon');
  });
});
