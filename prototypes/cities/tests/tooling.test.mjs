import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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

test('screenshot tools use portable playwright imports and valid syntax', async () => {
  for (const rel of ['prototypes/cities/tools/cityshot.mjs', 'prototypes/cities/tools/lensshot.mjs']) {
    const file = resolve(rel);
    const src = await readFile(file, 'utf8');
    assert.doesNotMatch(src, /file:\/\/\/C:/i, `${rel} contains obsolete absolute import`);
    const chk = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(chk.status, 0, chk.stderr);
  }
});

test('browser-ready fails fast on pageerror and console error with original text', async () => {
  const { ready } = await import('../tools/browser-ready.mjs');
  const listeners = new Map();
  const fakePage = {
    on(event, fn) { listeners.set(event, fn); },
    async goto() {
      listeners.get('pageerror')?.(new Error('CITY_TEST_FAILURE'));
    },
    async waitForFunction() {
      await new Promise(() => {});
    },
  };
  await assert.rejects(() => ready(fakePage, 'http://127.0.0.1:3650', 2000), /CITY_TEST_FAILURE/);
});
