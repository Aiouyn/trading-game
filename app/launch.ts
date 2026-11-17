// Finds nothing itself: the shell picked Node. Builds Quay once if it is missing, starts the simulation and Quay, opens the browser.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(appDir, '..');
const worlds = process.env.PA_WORLDS || path.join(appDir, 'worlds');
const started = Date.now();
const SEEDS = [1, 2, 3, 4, 5, 6];
const YEARS = 100;

function versionParts(v: string): [number, number] {
  const [maj, min] = v.replace(/^v/, '').split('.');
  return [Number(maj) || 0, Number(min) || 0];
}

const [major, minor] = versionParts(process.versions.node);
if (major < 22 || (major === 22 && minor < 6)) {
  console.error('Install Node.js 22.6 or newer from https://nodejs.org/ and run this again.');
  process.exit(1);
}

function nodeArgs(script: string, args: string[]): string[] {
  const below = major < 22 || (major === 22 && minor < 18);
  const flags = below ? ['--experimental-strip-types'] : [];
  return [...flags, script, ...args];
}

function gameEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PA_WORLDS: worlds };
  delete env.SIM_POP;
  if (major < 22 || (major === 22 && minor < 18)) {
    const cur = env.NODE_OPTIONS ?? '';
    if (!cur.includes('--experimental-strip-types')) env.NODE_OPTIONS = `${cur} --experimental-strip-types`.trim();
  }
  return env;
}

function yearsOf(seed: number): number | undefined {
  const dir = path.join(worlds, String(seed));
  const json = path.join(dir, 'world.json');
  if (!fs.existsSync(json) || !fs.existsSync(path.join(dir, 'world.bin'))) return;
  try {
    const fd = fs.openSync(json, 'r');
    const buf = Buffer.alloc(256);
    const n = fs.readSync(fd, buf, 0, 256, 0);
    fs.closeSync(fd);
    const day = buf.toString('utf8', 0, n).match(/"day":(\d+)/);
    if (!day) return;
    return Math.floor(Number(day[1]) / 360);
  } catch {
    return;
  }
}

let worldsJob: ChildProcess | undefined;
let simProc: ChildProcess | undefined;
let quayProc: ChildProcess | undefined;
let stopping = false;

function beginWorlds(): void {
  const missing = SEEDS.filter((s) => yearsOf(s) !== YEARS);
  if (!missing.length) return;
  console.log(`Building cities ${missing.join(' ')}.`);
  worldsJob = spawn(process.execPath, nodeArgs(path.join(appDir, 'make-worlds.ts'), []), {
    cwd: root,
    env: gameEnv(),
    stdio: 'inherit',
  });
  worldsJob.on('exit', (code) => {
    if (code && !stopping) console.error(`city build stopped (${code})`);
  });
}

function freePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolve(freePort(start + 1));
      else reject(err);
    });
    server.listen(start, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : start;
      server.close(() => resolve(port));
    });
  });
}

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function quayDir(): string | null {
  const dirs = [path.join(root, 'quay'), path.join(root, 'dist', 'quay'), path.join(root, '.next', 'standalone')];
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, 'server.js')) && fs.existsSync(path.join(dir, 'node_modules', 'next', 'package.json'))) return dir;
  }
  return null;
}

function runScript(script: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgs(script, []), { cwd: root, env: gameEnv(), stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function ensureQuay(): Promise<string> {
  const have = quayDir();
  if (have) return have;
  console.log('Building Quay.');
  const code = await runScript(path.join(appDir, 'build-quay.ts'));
  if (code !== 0) throw new Error('Quay did not build');
  const built = quayDir();
  if (!built) throw new Error('Quay did not build');
  return built;
}

async function waitUntil(child: ChildProcess, label: string, ready: () => Promise<boolean>): Promise<void> {
  let exited: number | null = null;
  child.on('exit', (code) => { exited = code ?? 1; });
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (exited !== null) throw new Error(`${label} stopped (${exited})`);
    try { if (await ready()) return; }
    catch { /* still opening */ }
    if (Date.now() > deadline) throw new Error(`${label} did not come up`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

function openBrowser(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', 'Port Avalon', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

function stop(child: ChildProcess | undefined): void {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  child.kill('SIGTERM');
}

const shutdown = (): void => {
  if (stopping) return;
  stopping = true;
  stop(quayProc);
  stop(simProc);
  stop(worldsJob);
};
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });
process.on('SIGHUP', () => { shutdown(); process.exit(0); });
process.on('exit', shutdown);

let quayHome = '';
try {
  quayHome = await ensureQuay();
} catch (err) {
  const why = err instanceof Error ? err.message : String(err);
  console.error(why);
  process.exit(1);
}

const simPort = await freePort(4173);
const quayPort = await freePort(simPort + 1);
const env = gameEnv();
console.log('Opening the simulation and Quay.');
simProc = spawn(process.execPath, nodeArgs(path.join(root, 'sim', 'server.ts'), ['--port', String(simPort)]), {
  cwd: root,
  env,
  stdio: 'inherit',
});

try {
  await waitUntil(simProc, 'the simulation', async () => {
    const page = await get(`http://127.0.0.1:${simPort}/`);
    const scenarios = await get(`http://127.0.0.1:${simPort}/scenarios`);
    const title = page.status === 200 && /<title>\s*Avalon\s*<\/title>/i.test(page.body);
    return title && scenarios.status === 200 && scenarios.body.includes('first-paycheck');
  });
} catch (err) {
  const why = err instanceof Error ? err.message : String(err);
  console.error(why);
  shutdown();
  process.exit(1);
}

quayProc = spawn(process.execPath, [path.join(quayHome, 'server.js')], {
  cwd: quayHome,
  env: { ...env, PORT: String(quayPort), HOSTNAME: '127.0.0.1', SIM_PORT: String(simPort), NODE_ENV: 'production' },
  stdio: 'inherit',
});

try {
  await waitUntil(quayProc, 'Quay', async () => {
    const page = await get(`http://127.0.0.1:${quayPort}/`);
    const title = page.status === 200 && /<title>[^<]*Quay/i.test(page.body);
    const api = await get(`http://127.0.0.1:${quayPort}/api/sim/title`);
    return title && api.status === 200 && api.body.includes('first-paycheck');
  });
} catch (err) {
  const why = err instanceof Error ? err.message : String(err);
  console.error(why);
  shutdown();
  process.exit(1);
}

const url = `http://127.0.0.1:${quayPort}/`;
const terminal = `http://127.0.0.1:${simPort}/`;
const upMark = path.join(process.env.TEMP || process.env.TMPDIR || appDir, 'pa-port-avalon-up');
const ms = Date.now() - started;
const readyLine = `Quay ${url}  ·  terminal ${terminal}  ·  ready in ${ms} ms  ·  close this window to stop`;
fs.writeFileSync(upMark, readyLine);
console.log(readyLine);
openBrowser(url);
beginWorlds();

await new Promise<void>((resolve) => {
  const done = (): void => resolve();
  simProc.on('exit', done);
  quayProc.on('exit', done);
});
shutdown();
process.exit(0);
