// node app/build-quay.ts
// Production Quay: next build --webpack from a shadow project (no top-level app/), then copy the
// standalone server and the real traced files into dist/quay. The shared node_modules is a junction
// onto another drive, so Next's own standalone copy skips it. This script copies those files itself.
import crypto from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const distDir = path.join(root, 'dist');
const distQuay = path.join(distDir, 'quay');
const buildRoot = path.join(distDir, 'buildroot');
const NEED_KB = 3 * 1024 * 1024;
// Present in the lockfile, absent from the shared node_modules junction. Build-time only, except @next/env.
const VENDOR_NAMES = [
  '@next/env',
  '@alloc/quick-lru',
  '@jridgewell/remapping',
  '@jridgewell/gen-mapping',
  '@jridgewell/sourcemap-codec',
  '@jridgewell/trace-mapping',
  '@jridgewell/resolve-uri',
  '@img/colour',
];

type TraceResult = { fileList: Set<string>; esmFileList?: Set<string> };

// The shared junction is missing a few lockfile packages. Fetch those tarballs only. Never npm install.
async function ensureVendor(): Promise<string> {
  const modules = path.join(distDir, 'vendor', 'node_modules');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, { resolved?: string; integrity?: string }>;
  };
  fs.mkdirSync(distDir, { recursive: true });
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  for (const name of VENDOR_NAMES) {
    const dest = path.join(modules, ...name.split('/'));
    if (fs.existsSync(path.join(dest, 'package.json'))) continue;
    const meta = lock.packages?.[`node_modules/${name}`];
    const url = meta?.resolved;
    const integrity = meta?.integrity ?? '';
    const expect = integrity.startsWith('sha512-') ? integrity.slice('sha512-'.length) : '';
    if (!url || !expect) throw new Error(`lockfile has no tarball for ${name}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name} download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = crypto.createHash('sha512').update(bytes).digest('base64');
    if (got !== expect) throw new Error(`${name} hash ${got}`);
    const tmp = fs.mkdtempSync(path.join(distDir, 'vendor-'));
    try {
      const tgz = path.join(tmp, 'pkg.tgz');
      fs.writeFileSync(tgz, bytes);
      const ext = spawnSync(tar, ['-xf', tgz, '-C', tmp], { stdio: 'inherit' });
      if (ext.status !== 0) throw new Error(`could not unpack ${name}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(tmp, 'package'), dest, { recursive: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return modules;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function freeKb(): number {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],
    { encoding: 'utf8', windowsHide: true },
  );
  if (r.status !== 0) throw new Error((r.stderr || 'could not read free RAM').trim());
  const n = Number(String(r.stdout).trim());
  if (!Number.isFinite(n)) throw new Error(`free RAM was ${JSON.stringify(r.stdout)}`);
  return n;
}

async function waitForRam(): Promise<void> {
  for (;;) {
    const kb = freeKb();
    const gb = kb / 1024 / 1024;
    const line = `free RAM ${gb.toFixed(2)} GB`;
    if (kb >= NEED_KB) {
      console.log(line);
      return;
    }
    console.log(`${line}, waiting for 3 GB`);
    await sleep(60_000);
  }
}

function buildEnv(modules: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  const cur = env.NODE_OPTIONS ?? '';
  if (!cur.includes('--max-old-space-size')) env.NODE_OPTIONS = `${cur} --max-old-space-size=3072`.trim();
  env.NODE_PATH = env.NODE_PATH ? `${modules}${path.delimiter}${env.NODE_PATH}` : modules;
  return env;
}

function treeOf(pid: number): { bytes: number; count: number } {
  const script = `
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize
$kids = @{}
$ws = @{}
foreach ($p in $all) {
  $id = [int]$p.ProcessId
  $parent = [int]$p.ParentProcessId
  $ws[$id] = [int64]$p.WorkingSetSize
  if (-not $kids.ContainsKey($parent)) { $kids[$parent] = New-Object System.Collections.Generic.List[int] }
  $kids[$parent].Add($id)
}
$sum = [int64]0
$n = 0
$q = New-Object System.Collections.Generic.Queue[int]
$q.Enqueue(${pid})
$seen = @{}
while ($q.Count -gt 0) {
  $id = $q.Dequeue()
  if ($seen.ContainsKey($id)) { continue }
  $seen[$id] = $true
  $n += 1
  if ($ws.ContainsKey($id)) { $sum += $ws[$id] }
  if ($kids.ContainsKey($id)) { foreach ($c in $kids[$id]) { $q.Enqueue($c) } }
}
"$sum $n"
`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  const [bytes, count] = String(r.stdout).trim().split(/\s+/).map(Number);
  return { bytes: Number.isFinite(bytes) ? bytes : 0, count: Number.isFinite(count) ? count : 0 };
}

function paint(line: string): void {
  const text = line.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!text) return;
  if (process.stdout.isTTY) process.stdout.write(`\r${text}`.padEnd(148));
  else console.log(text);
}

function runBuild(modules: string, nextBin: string): Promise<{ code: number; peak: number; procs: number; log: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(process.execPath, [nextBin, 'build', '--webpack'], {
      cwd: buildRoot,
      env: buildEnv(modules),
      windowsHide: true,
    });
    let log = '';
    let peak = 0;
    let procs = 1;
    const take = (buf: Buffer): void => {
      const text = buf.toString('utf8');
      log += text;
      if (log.length > 400_000) log = log.slice(-200_000);
      for (const line of text.split(/\r?\n/)) if (line.trim()) paint(line);
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    const timer = setInterval(() => {
      if (!child.pid) return;
      const tree = treeOf(child.pid);
      if (tree.bytes > peak) peak = tree.bytes;
      if (tree.count + 1 > procs) procs = tree.count + 1;
    }, 2000);
    child.on('error', (err) => {
      clearInterval(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearInterval(timer);
      if (child.pid) {
        const tree = treeOf(child.pid);
        if (tree.bytes > peak) peak = tree.bytes;
      }
      resolve({ code: code ?? 1, peak, procs, log });
    });
  });
}

function scrubLinks(dir: string): void {
  let st: fs.Stats;
  try { st = fs.lstatSync(dir); }
  catch { return; }
  if (st.isSymbolicLink()) {
    fs.unlinkSync(dir);
    return;
  }
  if (!st.isDirectory()) return;
  for (const name of fs.readdirSync(dir)) scrubLinks(path.join(dir, name));
}

function findLinks(dir: string, out: string[]): void {
  let st: fs.Stats;
  try { st = fs.lstatSync(dir); }
  catch { return; }
  if (st.isSymbolicLink()) {
    out.push(dir);
    return;
  }
  if (!st.isDirectory()) return;
  for (const name of fs.readdirSync(dir)) findLinks(path.join(dir, name), out);
}

function assertShared(realModules: string): void {
  const sentinel = path.join(realModules, 'next', 'package.json');
  if (!fs.existsSync(sentinel)) throw new Error(`shared node_modules was damaged: ${sentinel}`);
}

function safeRemove(dir: string, realModules: string): void {
  for (const name of ['node_modules', 'src', 'public']) {
    const p = path.join(dir, name);
    try {
      if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p);
    } catch { /* absent */ }
  }
  scrubLinks(dir);
  const left: string[] = [];
  findLinks(dir, left);
  if (left.length) throw new Error(`refusing to delete ${dir}; links remain: ${left.join(', ')}`);
  fs.rmSync(dir, { recursive: true, force: true });
  assertShared(realModules);
}

function proveUnlink(realModules: string): void {
  const target = path.join(distDir, 'link-target');
  const probe = path.join(distDir, 'link-probe');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'ok.txt'), 'ok');
  try {
    if (fs.existsSync(probe)) fs.unlinkSync(probe);
  } catch { /* a previous probe directory is removed below */ }
  if (fs.existsSync(probe)) safeRemove(probe, realModules);
  fs.symlinkSync(target, probe, 'junction');
  fs.unlinkSync(probe);
  if (!fs.existsSync(path.join(target, 'ok.txt'))) throw new Error('unlink followed the junction');
  fs.rmSync(target, { recursive: true, force: true });
  assertShared(realModules);
}

function junction(target: string, link: string): void {
  fs.symlinkSync(target, link, 'junction');
}

function createBuildRoot(realModules: string): void {
  fs.mkdirSync(path.join(buildRoot, 'tools'), { recursive: true });
  for (const name of ['package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
    fs.copyFileSync(path.join(root, name), path.join(buildRoot, name));
  }
  fs.copyFileSync(path.join(root, 'tools', 'quay-e2e-flag.ts'), path.join(buildRoot, 'tools', 'quay-e2e-flag.ts'));
  junction(path.join(root, 'src'), path.join(buildRoot, 'src'));
  if (fs.existsSync(path.join(root, 'public'))) junction(path.join(root, 'public'), path.join(buildRoot, 'public'));
  junction(realModules, path.join(buildRoot, 'node_modules'));
  if (fs.existsSync(path.join(buildRoot, 'app'))) throw new Error('shadow project must not contain app/');
  assertShared(realModules);
}

function copyReal(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyReal(path.join(src, name), path.join(dest, name));
    return;
  }
  if (!st.isFile()) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyFollow(src: string, dest: string): void {
  if (path.basename(src) === 'node_modules') throw new Error(`refusing to copy ${src}`);
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    copyFollow(fs.realpathSync(src), dest);
    return;
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyFollow(path.join(src, name), path.join(dest, name));
    return;
  }
  if (!st.isFile()) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function listJs(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) listJs(p, out);
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
}

function skipTraced(rel: string): boolean {
  const norm = rel.replace(/\//g, path.sep);
  if (norm.endsWith('.map')) return true;
  if (norm.includes(`${path.sep}@next${path.sep}swc-`) || norm.startsWith(`@next${path.sep}swc-`)) return true;
  if (norm.includes(`${path.sep}next${path.sep}dist${path.sep}docs${path.sep}`)) return true;
  if (norm.startsWith(`.next${path.sep}cache${path.sep}`) || norm.includes(`${path.sep}.next${path.sep}cache${path.sep}`)) return true;
  return false;
}

function destFor(abs: string, realModules: string): string | null {
  let real = abs;
  try { real = fs.realpathSync(abs); }
  catch { return null; }
  let st: fs.Stats;
  try { st = fs.statSync(real); }
  catch { return null; }
  if (!st.isFile()) return null;
  const fromModules = path.relative(realModules, real);
  if (fromModules && !fromModules.startsWith('..') && !path.isAbsolute(fromModules)) {
    if (skipTraced(fromModules)) return null;
    return path.join(distQuay, 'node_modules', fromModules);
  }
  const fromRoot = path.relative(buildRoot, real);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null;
  if (fromRoot === 'node_modules' || fromRoot.startsWith(`node_modules${path.sep}`)) return null;
  if (skipTraced(fromRoot)) return null;
  return path.join(distQuay, fromRoot);
}

async function traceIntoQuay(realModules: string, vendorModules: string): Promise<number> {
  const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft') as {
    nodeFileTrace: (files: string[], opts: Record<string, unknown>) => Promise<TraceResult>;
  };
  const files: string[] = [];
  listJs(path.join(buildRoot, '.next', 'server'), files);
  for (const rel of [
    'dist/server/lib/start-server.js',
    'dist/compiled/jest-worker/processChild.js',
    'dist/compiled/jest-worker/threadChild.js',
  ]) {
    const p = path.join(realModules, 'next', rel);
    if (fs.existsSync(p)) files.push(p);
  }
  if (!files.length) throw new Error('the Quay build produced no server javascript');
  const prev = process.env.NODE_PATH;
  process.env.NODE_PATH = prev ? `${vendorModules}${path.delimiter}${prev}` : vendorModules;
  let result: TraceResult;
  try {
    result = await nodeFileTrace(files, {
      base: buildRoot,
      processCwd: buildRoot,
      mixedModules: true,
      moduleSyncCatchall: true,
    });
  } finally {
    if (prev === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = prev;
  }
  const all = new Set(result.fileList);
  if (result.esmFileList) for (const file of result.esmFileList) all.add(file);
  let copied = 0;
  for (const file of all) {
    const abs = path.isAbsolute(file) ? file : path.resolve(buildRoot, file);
    const dest = destFor(abs, realModules);
    if (!dest || fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(fs.realpathSync(abs), dest);
    copied += 1;
  }
  return copied;
}

function appPages(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) appPages(p, out);
    else if (ent.isFile() && ent.name === 'page.js') out.push(p);
  }
}

function assertPacked(): void {
  const need = [
    path.join(distQuay, 'server.js'),
    path.join(distQuay, 'node_modules', 'next', 'package.json'),
    path.join(distQuay, 'node_modules', 'next', 'dist', 'server', 'lib', 'start-server.js'),
    path.join(distQuay, 'node_modules', '@next', 'env', 'package.json'),
    path.join(distQuay, '.next', 'static'),
  ];
  for (const p of need) if (!fs.existsSync(p)) throw new Error(`Quay package is missing ${path.relative(distQuay, p)}`);
  const pages: string[] = [];
  appPages(path.join(distQuay, '.next', 'server', 'app'), pages);
  const real = pages.filter((p) => !p.includes('_not-found') && !p.includes('_global-error'));
  if (!real.length) throw new Error('Next built no Quay pages');
  const links: string[] = [];
  findLinks(distQuay, links);
  if (links.length) throw new Error(`Quay package still contains links: ${links.join(', ')}`);
}

function dirBytes(dir: string): number {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) n += dirBytes(p);
    else if (ent.isFile()) n += fs.statSync(p).size;
  }
  return n;
}

let realModules = path.join(root, 'node_modules');
try { realModules = fs.realpathSync(realModules); }
catch { /* the junction path is already what we copy from */ }
assertShared(realModules);

await waitForRam();
const vendorModules = await ensureVendor();
fs.mkdirSync(distDir, { recursive: true });
proveUnlink(realModules);
safeRemove(distQuay, realModules);
safeRemove(buildRoot, realModules);
const repoNext = path.join(root, '.next');
if (fs.existsSync(repoNext)) safeRemove(repoNext, realModules);

createBuildRoot(realModules);
let failed = false;
try {
  const nextBin = path.join(realModules, 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextBin)) throw new Error('next is not installed');
  paint('Building Quay.');
  const built = await runBuild(vendorModules, nextBin);
  if (process.stdout.isTTY) process.stdout.write('\n');
  const peakMb = Math.round(built.peak / 1024 / 1024);
  console.log(`build memory peak: ${peakMb} MB`);
  console.log(`build processes: ${built.procs}`);
  if (built.code !== 0) {
    failed = true;
    const tail = built.log.trim().split(/\r?\n/).slice(-40).join('\n');
    console.error(tail);
    console.error('QUAY_BUILD_FAIL');
    process.exitCode = built.code || 1;
  } else {
    const serverJs = path.join(buildRoot, '.next', 'standalone', 'server.js');
    if (!fs.existsSync(serverJs)) throw new Error('next build did not write .next/standalone/server.js');
    fs.mkdirSync(distQuay, { recursive: true });
    copyReal(path.join(buildRoot, '.next', 'standalone'), distQuay);
    copyFollow(path.join(buildRoot, '.next', 'static'), path.join(distQuay, '.next', 'static'));
    const pub = path.join(root, 'public');
    if (fs.existsSync(pub)) copyFollow(pub, path.join(distQuay, 'public'));
    const filled = await traceIntoQuay(realModules, vendorModules);
    const packedEnv = path.join(distQuay, 'node_modules', '@next', 'env');
    if (!fs.existsSync(path.join(packedEnv, 'package.json'))) {
      fs.mkdirSync(path.dirname(packedEnv), { recursive: true });
      fs.cpSync(path.join(vendorModules, '@next', 'env'), packedEnv, { recursive: true });
    }
    assertPacked();
    const bytes = dirBytes(distQuay);
    console.log(`dist/quay ${bytes} bytes, ${filled} traced files copied`);
    console.log(`build memory peak: ${peakMb} MB`);
    console.log(`QUAY_BUILD_OK ${bytes} peak ${peakMb}`);
  }
} catch (err) {
  failed = true;
  const why = err instanceof Error ? err.message : String(err);
  console.error(why);
  console.error('QUAY_BUILD_FAIL');
  process.exitCode = 1;
} finally {
  try { safeRemove(buildRoot, realModules); }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(why);
    process.exitCode = 1;
  }
  if (failed) {
    try { safeRemove(distQuay, realModules); }
    catch { /* the success path is the one that must keep dist/quay */ }
  }
}
