import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(process.argv[2] ?? 'prototypes/cities');
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'evidence', 'test-results'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}
for (const file of await walk(root)) {
  if (!['.js', '.mjs', '.html', '.json'].includes(extname(file))) continue;
  const source = await readFile(file, 'utf8');
  if (/^(<<<<<<< |=======$|>>>>>>> )/m.test(source)) {
    throw new Error(`unresolved conflict: ${file}`);
  }
  if (['.js', '.mjs'].includes(extname(file))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${file}\n${result.stderr}`);
  }
}
console.log('source checks passed');
