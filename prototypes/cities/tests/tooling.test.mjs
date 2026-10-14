import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const checker = resolve('prototypes/cities/tools/check-source.mjs');

test('check-source rejects conflict markers in a temporary fixture directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'city-check-'));
  try {
    await writeFile(join(dir, 'conflict.js'), 'const a = 1;\n<<<<<<< HEAD\nconst b = 2;\n=======\nconst b = 3;\n>>>>>>> branch\n');
    const r = spawnSync(process.execPath, [checker, dir], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unresolved conflict/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
