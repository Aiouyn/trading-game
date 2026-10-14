import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STRIP_LINE = /^\s*(<!doctype html>|<html\b[^>]*>|<\/html>|<head>|<\/head>|<body>|<\/body>|<meta\b[^>]*>)\s*$/i;

export function deriveArtifact(html) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const lines = html.split(/\r?\n/);
  const kept = lines.filter((line) => !STRIP_LINE.test(line));
  return kept.join(eol);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const checkOnly = process.argv.includes('--check');
  const indexPath = resolve('prototypes/cities/index.html');
  const artifactPath = resolve('prototypes/cities/artifact.html');
  const indexSrc = await readFile(indexPath, 'utf8');
  const expected = deriveArtifact(indexSrc);
  if (checkOnly) {
    const current = await readFile(artifactPath, 'utf8');
    if (current.replace(/\r\n/g, '\n') !== expected.replace(/\r\n/g, '\n')) {
      console.error('artifact.html is out of sync with index.html');
      process.exit(1);
    }
    console.log('artifact.html is in sync');
  } else {
    await writeFile(artifactPath, expected, 'utf8');
    console.log('updated artifact.html');
  }
}
