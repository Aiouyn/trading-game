// node app/build-zip.ts
// Writes dist/PortAvalon-win64.zip with sim, ui, app, a 10-line README, and the official Windows Node.
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const zipPath = path.join(dist, 'PortAvalon-win64.zip');
const README = [
  'Port Avalon is a life in a city. This folder is the Windows game.',
  'Double-click app/Play Port Avalon.cmd.',
  'The game opens in your browser. You do not need to install Node.js.',
  'Close the Port Avalon window when you want to stop.',
  'The first launch writes the six cities in that window.',
  'A line there shows the year each city has reached.',
  'The title screen asks you to choose a life while they are written.',
  'Your net worth, job, household and the markets are all one city.',
  'Click a number to see why it happened, down to the person who caused it.',
  'Play.',
];

if (README.length !== 10) throw new Error(`README is ${README.length} lines`);

function copyTree(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const base = path.basename(from);
      if (base === 'node_modules' || base === '.git' || base.startsWith('.prove-')) return false;
      return true;
    },
  });
}

async function officialNode(dir: string): Promise<void> {
  const sumsRes = await fetch('https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt');
  if (!sumsRes.ok) throw new Error(`nodejs.org sums ${sumsRes.status}`);
  const sums = await sumsRes.text();
  const row = sums.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find((p) => p[1] && /^node-v22\.\d+\.\d+-win-x64\.zip$/.test(p[1]));
  if (!row) throw new Error('no Windows x64 zip in the Node 22 sums');
  const [hash, name] = row;
  const url = `https://nodejs.org/dist/latest-v22.x/${name}`;
  console.log(url);
  const zipRes = await fetch(url);
  if (!zipRes.ok) throw new Error(`nodejs.org ${zipRes.status} for ${name}`);
  const bytes = Buffer.from(await zipRes.arrayBuffer());
  const got = crypto.createHash('sha256').update(bytes).digest('hex');
  if (got !== hash) throw new Error(`node zip hash ${got} != ${hash}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-node-'));
  const z = path.join(tmp, name);
  fs.writeFileSync(z, bytes);
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const unpacked = path.join(tmp, 'unpacked');
  fs.mkdirSync(unpacked);
  const ext = spawnSync(tar, ['-xf', z, '-C', unpacked], { stdio: 'inherit' });
  if (ext.status !== 0) throw new Error('could not unpack the official Node zip');
  const inner = fs.readdirSync(unpacked).find((n) => n.startsWith('node-v'));
  if (!inner) throw new Error('the Node zip had no node folder');
  const src = path.join(unpacked, inner);
  if (!fs.existsSync(path.join(src, 'node.exe'))) throw new Error('the Node zip had no node.exe');
  copyTree(src, dir);
  fs.rmSync(tmp, { recursive: true, force: true });
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-zip-'));
try {
  copyTree(path.join(root, 'sim'), path.join(stage, 'sim'));
  copyTree(path.join(root, 'ui'), path.join(stage, 'ui'));
  copyTree(here, path.join(stage, 'app'));
  fs.writeFileSync(path.join(stage, 'README.txt'), README.join('\n') + '\n');
  const lines = fs.readFileSync(path.join(stage, 'README.txt'), 'utf8').split(/\n/).filter((l) => l.length > 0);
  if (lines.length !== 10) throw new Error(`README.txt has ${lines.length} lines`);
  console.log('fetching the official Node for Windows x64');
  await officialNode(path.join(stage, 'node'));
  fs.mkdirSync(dist, { recursive: true });
  fs.rmSync(zipPath, { force: true });
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const packed = spawnSync(tar, ['-a', '-c', '-f', zipPath, '-C', stage, '.'], { stdio: 'inherit' });
  if (packed.status !== 0) throw new Error('could not write the zip');
  const size = fs.statSync(zipPath).size;
  console.log(`${zipPath} ${size} bytes`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
