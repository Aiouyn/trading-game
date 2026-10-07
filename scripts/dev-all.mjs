// Runs the world server and the Next.js app together for local play: `npm run dev:all`.
// The world keeps its data in ./world-data (delete the folder to start a fresh world).
import { spawn } from 'node:child_process';

const procs = [
  { name: 'world', color: '\x1b[33m', cmd: 'npx', args: ['tsx', 'server/index.ts'], env: {} },
  { name: 'web', color: '\x1b[36m', cmd: 'npx', args: ['next', 'dev'], env: {} },
];

const children = procs.map((p) => {
  const child = spawn(p.cmd, p.args, { shell: true, env: { ...process.env, ...p.env } });
  const prefix = `${p.color}[${p.name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(String(d).split('\n').filter(Boolean).map((l) => prefix + l).join('\n') + '\n'));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => { console.log(`${prefix}exited (${code})`); shutdown(); });
  return child;
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill('SIGINT');
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
