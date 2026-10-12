// `npm run play`: one command for local and LAN play. It builds the web app when the build is missing or older than the
// sources, then starts the world server and the web app together, and prints where to open the game (this computer, and the
// LAN address a phone on the same Wi-Fi uses). Ctrl+C stops both; the world saves and backs up on the way out.
//
// Options:  --build (always build)  --no-build (never build; fails when there is no build)  --help
// Env:      PLAY_WEB_PORT (3000)  PLAY_WORLD_PORT (8797)  PLAY_BUILD_ARGS (extra words for `next build`, e.g. "--webpack")
//           DATA_DIR (./world-data, read by the world server as usual)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_WEB_PORT = 3000;
export const DEFAULT_PLAY_WORLD_PORT = 8797;

/** The sources a web build depends on, relative to the project root. A newer file here makes the build stale. */
const BUILD_INPUTS = ['src', 'public', 'next.config.ts', 'package.json', 'tsconfig.json', 'postcss.config.mjs'];

const USAGE = `Usage: npm run play -- [--build | --no-build] [--help]

  Builds the web app if it is missing or older than its sources (--build forces it, --no-build skips it), then starts the
  world server and the web app. Open the printed address on this computer, or on a phone on the same Wi-Fi.

  PLAY_WEB_PORT   web app port (default ${DEFAULT_WEB_PORT})
  PLAY_WORLD_PORT world server port (default ${DEFAULT_PLAY_WORLD_PORT})
  PLAY_BUILD_ARGS extra arguments for \`next build\`, e.g. "--webpack"
`;

/**
 * The command line: --build forces a build, --no-build never builds, --help prints the usage. Anything else is an error.
 * @param {string[]} argv
 */
export function parsePlayArgs(argv) {
  const out = { build: 'auto', help: false };
  for (const a of argv) {
    if (a === '--build') {
      if (out.build === 'skip') throw new Error('--build and --no-build cannot be used together');
      out.build = 'force';
    } else if (a === '--no-build') {
      if (out.build === 'force') throw new Error('--build and --no-build cannot be used together');
      out.build = 'skip';
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`Unknown option "${a}". Try --help.`);
    }
  }
  return out;
}

/** A TCP port from a text value: a whole number from 1 to 65535. */
export function parsePort(text, name) {
  const s = String(text).trim();
  if (!/^\d+$/.test(s)) throw new Error(`${name} must be a port number (got "${text}")`);
  const n = Number(s);
  if (n < 1 || n > 65535) throw new Error(`${name} must be between 1 and 65535 (got ${n})`);
  return n;
}

/**
 * The two ports from the environment, with their defaults. The web app and the world server cannot share one.
 * @param {Record<string, string | undefined>} env
 */
export function portsFromEnv(env) {
  const web = env.PLAY_WEB_PORT === undefined || env.PLAY_WEB_PORT === '' ? DEFAULT_WEB_PORT : parsePort(env.PLAY_WEB_PORT, 'PLAY_WEB_PORT');
  const world = env.PLAY_WORLD_PORT === undefined || env.PLAY_WORLD_PORT === '' ? DEFAULT_PLAY_WORLD_PORT : parsePort(env.PLAY_WORLD_PORT, 'PLAY_WORLD_PORT');
  if (web === world) throw new Error(`PLAY_WEB_PORT and PLAY_WORLD_PORT must differ (both ${web})`);
  return { web, world };
}

/**
 * Whether the web build must run: no build id yet, or a source file is newer than the build.
 * @param {number | null} buildMtime the build id's modification time (ms), or null when there is no build
 * @param {number | null} newestSource the newest source file's modification time (ms), or null when there are none
 */
export function needsBuild(buildMtime, newestSource) {
  if (buildMtime === null) return true;
  if (newestSource === null) return false;
  return newestSource > buildMtime;
}

/**
 * The first non-internal IPv4 address (the address a phone on the same network uses), or null.
 * @param {Record<string, { address: string; family: string | number; internal: boolean }[] | undefined> | undefined} ifaces
 */
export function lanAddress(ifaces = os.networkInterfaces()) {
  for (const list of Object.values(ifaces ?? {})) {
    for (const i of list ?? []) {
      const v4 = i.family === 'IPv4' || i.family === 4;
      if (v4 && !i.internal) return i.address;
    }
  }
  return null;
}

/** The newest modification time (ms) among the build inputs under `root`, or null when none exists. */
export function newestSourceMtime(root, inputs = BUILD_INPUTS) {
  let newest = null;
  const visit = (p) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === 'node_modules' || name === '.next') continue;
        visit(path.join(p, name));
      }
    } else if (newest === null || st.mtimeMs > newest) {
      newest = st.mtimeMs;
    }
  };
  for (const input of inputs) visit(path.join(root, input));
  return newest;
}

/** The build id's modification time (ms), or null when the web app has not been built. */
export function buildMtime(root) {
  const id = path.join(root, '.next', 'BUILD_ID');
  return existsSync(id) ? statSync(id).mtimeMs : null;
}

/** The `next` executable's entry script, run with the node that runs this script. */
function nextBin(root) {
  return path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
}

/** The lines the script prints once both servers are started. */
export function bannerLines({ web, world, lan, data = './world-data' }) {
  const lines = [
    '',
    '  Trading Game is starting.',
    `  This computer:    http://localhost:${web}`,
    lan ? `  Phone on Wi-Fi:   http://${lan}:${web}` : '  Phone on Wi-Fi:   (no network address found)',
    `  World server:     port ${world} (the game talks to it on the same address)`,
    `  Save and backups: ${data} (backups in ${data}/backups, see docs/PLAY.md)`,
    '  Stop with Ctrl+C. The world saves and makes a backup before it stops.',
    '',
  ];
  return lines;
}

function prefixed(name, color) {
  return (line) => `\x1b[${color}m[${name}]\x1b[0m ${line}`;
}

/** Runs one build of the web app (inheriting the terminal), and returns true when it succeeded. */
function buildWeb(root, extra) {
  console.log('  Building the web app (first run, or the sources changed)…');
  const env = { ...process.env };
  // the build must not bake a fixed world address: the page finds the world at run time (layout.tsx, TG_WORLD_PORT)
  delete env.NEXT_PUBLIC_WORLD_URL;
  const r = spawnSync(process.execPath, [nextBin(root), 'build', ...extra], { cwd: root, stdio: 'inherit', env });
  return r.status === 0;
}

function pipe(stream, label) {
  let carry = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const parts = (carry + chunk).split(/\r?\n/);
    carry = parts.pop() ?? '';
    for (const p of parts) if (p.length > 0) process.stdout.write(`${label(p)}\n`);
  });
  stream.on('end', () => {
    if (carry.length > 0) process.stdout.write(`${label(carry)}\n`);
  });
}

/** Starts the world and the web app, and stops both on exit. Returns a promise of the exit code. */
function run(root, ports) {
  const worldLabel = prefixed('world', 33);
  const webLabel = prefixed('web', 36);
  const world = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(ports.world) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const web = spawn(process.execPath, [nextBin(root), 'start', '-H', '0.0.0.0', '-p', String(ports.web)], {
    cwd: root,
    env: { ...process.env, TG_WORLD_PORT: String(ports.world) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipe(world.stdout, worldLabel);
  pipe(world.stderr, worldLabel);
  pipe(web.stdout, webLabel);
  pipe(web.stderr, webLabel);

  return new Promise((resolve) => {
    const children = [{ name: 'world', proc: world }, { name: 'web', proc: web }];
    const alive = (c) => c.proc.exitCode === null && c.proc.signalCode === null;
    let closing = false;
    let code = 0;
    let forceTimer = null;

    const finish = () => {
      if (children.some(alive)) return;
      if (forceTimer) clearTimeout(forceTimer);
      resolve(code);
    };

    // Stops the servers. On a terminal, Ctrl+C reaches both children directly (they save and back up themselves), so this only
    // waits. A signal sent to this script alone is passed on as SIGINT on POSIX; on Windows the children are ended after the wait.
    const stop = (why) => {
      if (closing) return;
      closing = true;
      if (why) console.log(`\n  ${why}`);
      for (const c of children) {
        if (!alive(c)) continue;
        if (process.platform !== 'win32') c.proc.kill('SIGINT');
      }
      forceTimer = setTimeout(() => {
        for (const c of children) if (alive(c)) c.proc.kill('SIGKILL');
      }, 30_000);
      forceTimer.unref();
    };

    for (const c of children) {
      c.proc.on('exit', (exitCode, signal) => {
        if (!closing) {
          code = exitCode ?? 1;
          console.log(`\n  The ${c.name} server stopped${signal ? ` (${signal})` : ` (exit ${exitCode})`}. Stopping the other one.`);
          stop(null);
        }
        finish();
      });
      c.proc.on('error', (err) => {
        console.error(`  Could not start the ${c.name} server: ${err.message}`);
        code = 1;
        stop(null);
      });
    }
    process.on('SIGINT', () => stop(null));
    process.on('SIGTERM', () => stop(null));
  });
}

/** The entry point: parse, build if needed, start both servers, print the addresses. */
export async function main(argv = process.argv.slice(2), env = process.env, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  let args;
  let ports;
  try {
    args = parsePlayArgs(argv);
    ports = portsFromEnv(env);
  } catch (err) {
    console.error(`  ${err.message}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const extra = (env.PLAY_BUILD_ARGS ?? '').split(/\s+/).filter(Boolean);
  const stale = needsBuild(buildMtime(root), newestSourceMtime(root));
  if (args.build === 'skip' && buildMtime(root) === null) {
    console.error('  There is no web build yet. Run `npm run play` without --no-build first.');
    return 2;
  }
  if (args.build === 'force' || (args.build === 'auto' && stale)) {
    if (!buildWeb(root, extra)) {
      console.error('  The web build failed. Fix it (npx next build) and try again.');
      return 1;
    }
  }
  for (const line of bannerLines({ web: ports.web, world: ports.world, lan: lanAddress(), data: env.DATA_DIR || './world-data' })) console.log(line);
  return run(root, ports);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
    // the children are done by now; a lingering timer must not hold the process
    if (code !== 0) process.exit(code);
  });
}
