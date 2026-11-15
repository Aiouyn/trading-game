// AI playtesters. node sim/playtest/run.ts --sessions 6 --turns 100 [--model claude-haiku-5-5]
// Each session starts sim/play.ts on a fresh saved world. The model sees the terminal and types one command.
// ANTHROPIC_API_KEY is required. --fake types random valid commands when there is no key.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const play = path.join(root, 'sim/play.ts');
const bridge = path.join(here, 'bridge.py');
const reportPath = path.join(here, 'playtest-report.md');
const SENTINEL = '<<<PLAYTEST-END>>>';
const TAGS = ['CONFUSED', 'BLOCKED', 'SURPRISED', 'BORED', 'DELIGHTED'] as const;

type Tag = (typeof TAGS)[number];
type PersonaKey = 'beginner' | 'trader' | 'tycoon' | 'saver' | 'cheat' | 'dynasty';

interface Persona { key: PersonaKey; name: string; blurb: string; goal: string }
interface Seen { firm: string; net: string; date: string }
interface Frame { dead: boolean; screen: string }
interface Moment { session: number; persona: string; turn: number; tag: Tag; thought: string; screen: string; command: string }
interface Outcome { netWorth: string; cash: string; when: string; firms: string; prison: string; death: string }
interface Turn { thought: string; command: string; input: number; output: number; cost: number }
interface SessionLog {
  index: number; persona: Persona; seed: string; outcome: Outcome;
  moments: Moment[]; calls: number; input: number; output: number; cost: number; error?: string;
}

const SYSTEM = [
  'You are a new player at a text terminal. You have no manual.',
  'You know only what is on the screen, who you are, and your goal. Each turn you type one command.',
  'Reply with exactly two lines:',
  'THOUGHT: one line. When one of these is true, start the line with that word:',
  'CONFUSED you do not understand the screen or a result;',
  'BLOCKED you want to do something and there is no command for it, and include the words "wanted command: NAME";',
  'SURPRISED the world reacted in a way you did not expect;',
  'BORED nothing worth doing;',
  'DELIGHTED something felt great.',
  'COMMAND: the one command you type.',
].join('\n');

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf('--' + flag);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (!v || v.startsWith('--')) return fallback;
  return v;
}

function num(flag: string, fallback: number): number {
  const raw = arg(flag, String(fallback));
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${flag} needs a positive whole number, got ${raw}`);
    process.exit(1);
  }
  return n;
}

function asKey(word: string): PersonaKey {
  switch (word) {
    case 'beginner':
    case 'trader':
    case 'tycoon':
    case 'saver':
    case 'cheat':
    case 'dynasty':
      return word;
    default:
      throw new Error(`personas.txt: unknown key ${word}`);
  }
}

function asTag(word: string): Tag | undefined {
  switch (word) {
    case 'CONFUSED':
    case 'BLOCKED':
    case 'SURPRISED':
    case 'BORED':
    case 'DELIGHTED':
      return word;
    default:
      return undefined;
  }
}

function loadPersonas(file: string): Persona[] {
  const out: Persona[] = [];
  let cur: Partial<Persona> = {};
  const flush = (): void => {
    if (!cur.key && !cur.name && !cur.blurb && !cur.goal) return;
    if (!cur.key || !cur.name || !cur.blurb || !cur.goal) throw new Error(`${file}: a persona needs key, name, blurb and goal`);
    out.push({ key: cur.key, name: cur.name, blurb: cur.blurb, goal: cur.goal });
    cur = {};
  };
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key === 'key') cur.key = asKey(val);
    else if (key === 'name') cur.name = val;
    else if (key === 'blurb') cur.blurb = val;
    else if (key === 'goal') cur.goal = val;
  }
  flush();
  if (!out.length) throw new Error(`${file}: no personas`);
  return out;
}

function tagOf(thought: string): Tag | undefined {
  const m = thought.match(/^\s*(CONFUSED|BLOCKED|SURPRISED|BORED|DELIGHTED)\b/);
  return asTag(m?.[1] ?? '');
}

function wanted(thought: string): string | undefined {
  const m = thought.match(/\bwanted command:\s*([a-z][a-z0-9 ]*)/i);
  if (!m?.[1]) return undefined;
  return m[1].trim().toLowerCase().replace(/[.\s]+$/, '');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, xs: readonly T[]): T {
  if (!xs.length) throw new Error('empty choice');
  const item = xs[Math.floor(rng() * xs.length)];
  if (item === undefined) throw new Error('empty choice');
  return item;
}

function contactLine(screen: string): string {
  return screen.split('\n').find((l) => l.includes('contacts:')) ?? '';
}

function workSlot(screen: string): string {
  return contactLine(screen).match(/(\d+)\s+[A-Za-z]+\s+work/)?.[1] ?? '0';
}

function familySlot(screen: string): string {
  return contactLine(screen).match(/(\d+)\s+[A-Za-z]+\s+family/)?.[1] ?? workSlot(screen);
}

function employer(screen: string): string {
  return screen.match(/\((frm_[a-z0-9_]+)\)/)?.[1] ?? 'frm_titan_machine';
}

function commands(key: PersonaKey, screen: string, turn: number, seen: Seen): string[] {
  const slot = familySlot(screen);
  const work = workSlot(screen);
  const firm = seen.firm || employer(screen);
  const event = screen.match(/\[(\d+)\]/)?.[1];
  const order = screen.match(/#(\d+)/)?.[1];
  switch (key) {
    case 'beginner':
      return ['news', `talk ${work}`, 'sheet', 'deposit 100', 'buy BANK 1', 'wait 1w', 'wait 1m'];
    case 'trader': {
      const xs = ['buy BANK 1', 'buy BANK 5', 'sell BANK 1', 'short BANK 1', 'news', 'wait 1d', 'sheet', 'fut long OIL 1 1'];
      if (order) xs.push(`cancel ${order}`);
      if (event) xs.push(`why ${event}`);
      return xs;
    }
    case 'tycoon': {
      const xs = [`found Shop${turn} / MANUFACTURING 15000`, 'board', 'news', 'wait 1m', `bid ${firm} 2x cash`];
      if (seen.firm) xs.push(`ceo ${seen.firm}`, `ipo ${seen.firm} 0.2`);
      return xs;
    }
    case 'saver':
      return ['deposit 5000', 'bond buy 10y 1', 'bond buy 30y 1', 'withdraw 100', 'news', 'wait 1m', 'sheet'];
    case 'cheat': {
      const xs = [`ask ${work} ${firm}`, `talk ${work}`, 'short BANK 10', 'buy BANK 20', 'news', 'wait 1w'];
      if (event) xs.push(`why ${event}`);
      return xs;
    }
    case 'dynasty':
      return [`court ${slot}`, `marry ${slot}`, 'child', 'will spouse', 'school', `talk ${slot}`, 'wait 1m', 'news'];
    default: {
      const never: never = key;
      return never;
    }
  }
}

function delight(line: string): string | undefined {
  if (/^you found /.test(line)) return 'DELIGHTED the firm is mine';
  if (/^order \d/.test(line) || /^buy \d/.test(line) || /^sell \d/.test(line)) return 'DELIGHTED the order went in';
  if (/^deposited /.test(line)) return 'DELIGHTED the cash left the spending wallet';
  if (/^married /.test(line)) return 'DELIGHTED the marriage took';
  if (/ is born$/.test(line)) return 'DELIGHTED a child was born';
  if (/ told you:/.test(line)) return 'DELIGHTED someone knew something and said it';
  if (/^courted /.test(line)) return 'DELIGHTED courting did something';
  return undefined;
}

function gap(key: PersonaKey, screen: string, turn: number): string | undefined {
  if (!/Year \d+/.test(screen)) return undefined;
  switch (key) {
    case 'beginner':
      if (turn % 5 === 0) return 'CONFUSED I cannot tell which words this terminal accepts';
      if (turn % 5 === 1) return 'BLOCKED wanted command: help';
      return undefined;
    case 'trader':
      if (/shares:/.test(screen)) return undefined;
      if (turn % 4 === 0) return 'CONFUSED the screen lists no share prices and no tickers';
      if (turn % 4 === 1) return 'BLOCKED wanted command: prices';
      return undefined;
    case 'tycoon':
      if (/companies:/.test(screen)) return undefined;
      if (turn % 4 === 0) return 'BLOCKED wanted command: companies';
      if (turn % 4 === 1) return 'CONFUSED I cannot see a firm I own, or how to take one over';
      return undefined;
    case 'saver':
      if (/time deposits:/.test(screen)) return undefined;
      if (turn % 5 === 0) return 'BLOCKED wanted command: savings';
      if (turn % 5 === 1) return 'CONFUSED I cannot tell where cash would be safe';
      return undefined;
    case 'cheat':
      if (/private:/.test(screen)) return undefined;
      if (turn % 4 === 0) return 'BLOCKED wanted command: tip';
      if (turn % 4 === 1) return 'CONFUSED nothing here is a secret I could trade on';
      return undefined;
    case 'dynasty':
      if (turn % 4 === 0 && /no spouse/.test(screen)) return 'CONFUSED I see people, but not how a family starts';
      if (turn % 4 === 1 && /children none/.test(screen)) return 'BLOCKED wanted command: family';
      return undefined;
    default: {
      const never: never = key;
      return never;
    }
  }
}

function react(key: PersonaKey, screen: string, turn: number, seen: Seen): string | undefined {
  const lines = screen.split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = [...lines].reverse().find((l) => /^(rejected:|unknown command|usage:)/i.test(l));
  if (bad) return `SURPRISED the terminal said "${bad}"`;
  for (const line of [...lines].reverse()) {
    const hit = delight(line);
    if (hit) return hit;
  }
  const net = screen.match(/net worth (-?\$[\d,]+\.\d{2})/)?.[1];
  const date = screen.match(/Year \d+, month \d+, day \d+/)?.[0];
  if (net && date && seen.net === net && seen.date === date && turn > 4) return 'BORED the date and the net worth did not move';
  if (lines.length <= 4 && lines.some((l) => l === 'no news' || l === 'you hold no board seat')) return 'BORED nothing worth doing showed up';
  return gap(key, screen, turn);
}

function fakeTurn(persona: Persona, screen: string, turn: number, seen: Seen, rng: () => number): Turn {
  const command = pick(rng, commands(persona.key, screen, turn, seen));
  const thought = react(persona.key, screen, turn, seen) ?? `trying ${command}`;
  return { thought, command, input: 0, output: 0, cost: 0 };
}

function absorb(seen: Seen, screen: string): void {
  const found = screen.match(/you found [^(]+\(([a-z0-9_]+)\)/);
  if (found?.[1]) seen.firm = found[1];
  const net = screen.match(/net worth (-?\$[\d,]+\.\d{2})/);
  if (net?.[1]) seen.net = net[1];
  const date = screen.match(/Year \d+, month \d+, day \d+/);
  if (date?.[0]) seen.date = date[0];
}

function windowOf(raw: string): string {
  const lines = raw.replace(/\s+$/, '').split('\n');
  if (lines.length && /^>\s*$/.test(lines[lines.length - 1] ?? '')) lines.pop();
  return lines.slice(-40).join('\n');
}

function userText(persona: Persona, screen: string): string {
  return `Who you are: ${persona.name}. ${persona.blurb}\nYour goal: ${persona.goal}\n\nTerminal:\n\n${screen || '(the terminal is blank)'}`;
}

function parseReply(raw: string): { thought: string; command: string } {
  const text = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
  let thought = '';
  let command = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (/^THOUGHT:/i.test(line)) thought = line.replace(/^THOUGHT:\s*/i, '');
    else if (/^COMMAND:/i.test(line)) command = line.replace(/^COMMAND:\s*/i, '');
  }
  if (!thought) {
    const line = text.split('\n').map((l) => l.trim()).find((l) => l && !/^COMMAND:/i.test(l));
    thought = line ?? 'CONFUSED no thought came back';
  }
  if (!command) command = 'wait 1d';
  return { thought: thought.replace(/\s+/g, ' ').slice(0, 400), command: command.trim() };
}

interface Usage { input_tokens?: number; output_tokens?: number }
interface ApiReply { content?: { type?: string; text?: string }[]; usage?: Usage }

function callCost(model: string, input: number, output: number): number {
  if (model !== 'claude-haiku-5-5') return 0;
  if (input > 100_000) return (input * 0.50 + output * 2.50) / 1e6;
  return (input * 0.10 + output * 0.50) / 1e6;
}

async function askApi(model: string, key: string, persona: Persona, screen: string): Promise<Turn> {
  const modern = /claude-(haiku|sonnet|opus|fable|mythos)-5/.test(model);
  const body: Record<string, unknown> = {
    model,
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: 'user', content: userText(persona, screen) }],
  };
  if (modern) {
    body.output_config = { effort: 'low' };
    body.thinking = { type: 'disabled' };
  }
  let last = 'model call failed';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': modern ? '2026-10-21' : '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${raw.slice(0, 400)}`);
      const data = JSON.parse(raw) as ApiReply;
      const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
      const parsed = parseReply(text);
      const input = data.usage?.input_tokens ?? 0;
      const output = data.usage?.output_tokens ?? 0;
      return { ...parsed, input, output, cost: callCost(model, input, output) };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && /HTTP (429|500|502|503|529)/.test(last)) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw e instanceof Error ? e : new Error(last);
    }
  }
  throw new Error(last);
}

function openFrames(stream: Readable): { frame(): Promise<Frame> } {
  let buf = '';
  let ended = false;
  let fail: Error | undefined;
  const waiters: { resolve: (s: string) => void; reject: (e: Error) => void }[] = [];
  const kick = (): void => {
    while (waiters.length) {
      const i = buf.indexOf('\n');
      if (i < 0) {
        if (!ended) return;
        const err = fail ?? new Error('playtest bridge closed');
        while (waiters.length) waiters.shift()?.reject(err);
        return;
      }
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      waiters.shift()?.resolve(line);
    }
  };
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => { buf += chunk; kick(); });
  stream.on('end', () => { ended = true; kick(); });
  stream.on('error', (err: Error) => { fail = err; ended = true; kick(); });
  const line = (): Promise<string> => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); kick(); });
  return {
    async frame() {
      const flag = await line();
      const lines: string[] = [];
      for (;;) {
        const got = await line();
        if (got === SENTINEL) break;
        lines.push(got);
      }
      if (flag !== '0' && flag !== '1') throw new Error(`bad frame ${flag}`);
      return { dead: flag === '1', screen: lines.join('\n') };
    },
  };
}

function deadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => {
      clearTimeout(t);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

function freshWorld(seed: string, dir: string): void {
  const res = spawnSync(process.execPath, [play, '--seed', seed, '--save', dir], { cwd: root, encoding: 'utf8' });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || `play.ts --save exited ${res.status}`).slice(0, 500));
}

function send(child: ChildProcess, command: string): void {
  const line = command.replace(/[\r\n]/g, ' ').trim().slice(0, 240) || 'wait 1d';
  child.stdin?.write(line + '\n');
}

function stop(child: ChildProcess): void {
  child.stdin?.end();
  if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
}

async function runSession(opts: {
  index: number; persona: Persona; seed: string; turns: number; tmp: string;
  fake: boolean; model: string; key: string;
}): Promise<SessionLog> {
  const dir = path.join(opts.tmp, `s${opts.index}`);
  freshWorld(opts.seed, dir);
  const child = spawn('python3', ['-u', bridge, process.execPath, play, '--load', dir, '--save', dir], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  let errText = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => { errText += chunk; });
  if (!child.stdout) throw new Error('bridge has no stdout');
  const frames = openFrames(child.stdout);
  const rng = mulberry32(opts.index * 100003 + 17);
  const seen: Seen = { firm: '', net: '', date: '' };
  const moments: Moment[] = [];
  let calls = 0, input = 0, output = 0, cost = 0, transcript = '';
  try {
    let fr = await deadline(frames.frame(), 200_000, 'the game did not draw a screen');
    let played = 0;
    while (played < opts.turns && !fr.dead) {
      const screen = windowOf(fr.screen);
      transcript += screen + '\n';
      const turn = played + 1;
      const decision = opts.fake
        ? fakeTurn(opts.persona, screen, turn, seen, rng)
        : await askApi(opts.model, opts.key, opts.persona, screen);
      calls += 1;
      input += decision.input;
      output += decision.output;
      cost += decision.cost;
      const tag = tagOf(decision.thought);
      if (tag) moments.push({
        session: opts.index, persona: opts.persona.name, turn, tag,
        thought: decision.thought, screen, command: decision.command,
      });
      const mark = tag ? ` ${tag}` : '';
      console.log(`session ${opts.index} turn ${turn}${mark}  ${decision.command}`);
      absorb(seen, screen);
      send(child, decision.command);
      played += 1;
      fr = await deadline(frames.frame(), 200_000, `turn ${turn} did not return`);
    }
    if (!fr.dead) {
      send(child, 'quit');
      fr = await deadline(frames.frame(), 200_000, 'quit did not return');
    }
    transcript += windowOf(fr.screen) + '\n';
  } finally {
    stop(child);
  }
  if (errText.trim()) throw new Error(errText.trim().slice(0, 500));
  return {
    index: opts.index, persona: opts.persona, seed: opts.seed, outcome: outcomeOf(transcript),
    moments, calls, input, output, cost,
  };
}

function lastMatch(text: string, re: RegExp): string | undefined {
  const all = [...text.matchAll(re)];
  return all.length ? all[all.length - 1]?.[1] : undefined;
}

function firmsOf(text: string): string {
  const companies = [...text.matchAll(/companies: (.+)/g)];
  const founded = [...text.matchAll(/you found ([^(]+) \(([^)]+)\)/g)];
  const controlled = lastMatch(text, /controlled (\d+)/g);
  const owned = companies.length
    ? (companies[companies.length - 1]?.[1]?.trim() ?? 'none')
    : founded.length
      ? founded.map((m) => `${m[1]?.trim() ?? ''} (${m[2] ?? ''})`).join('; ')
      : 'none';
  return controlled ? `${owned}; dynasty controlled ${controlled}` : owned;
}

function outcomeOf(text: string): Outcome {
  let death = 'no';
  if (/continues the house/.test(text)) death = 'died, and the house continued';
  else if (/has died|The game is over|The house ends/.test(text)) death = 'yes';
  const prisonLine = text.split('\n').find((l) => /prison|imprison/i.test(l));
  return {
    netWorth: lastMatch(text, /net worth (-?\$[\d,]+\.\d{2})/g) ?? 'unknown',
    cash: lastMatch(text, /(?:^|\s)cash (-?\$[\d,]+\.\d{2})/g) ?? 'unknown',
    when: lastMatch(text, /(Year \d+, month \d+, day \d+)/g) ?? 'unknown',
    firms: firmsOf(text),
    prison: prisonLine ? `yes (${prisonLine.trim()})` : 'no',
    death,
  };
}

function problemKey(thought: string, tag: Tag): string {
  if (tag === 'BLOCKED') {
    const w = wanted(thought);
    if (w) return `no command for ${w}`;
  }
  if (tag === 'SURPRISED') {
    const m = thought.match(/rejected:\s*([^"]+)/i) ?? thought.match(/unknown command\s+(\S+)/i) ?? thought.match(/usage:\s*([^"]+)/i);
    if (m?.[1]) {
      const reason = m[1].trim().replace(/\s+/g, ' ');
      return `surprised: ${reason.length > 90 ? reason.slice(0, 90) : reason}`;
    }
  }
  const rest = thought.replace(/^(CONFUSED|BLOCKED|SURPRISED|BORED|DELIGHTED)\b\s*/, '');
  const words = rest.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 8).join(' ');
  return `${tag.toLowerCase()}: ${words || thought}`;
}

function missingName(m: Moment): string | undefined {
  return wanted(m.thought) ?? m.screen.match(/unknown command\s+(\S+)/i)?.[1]?.toLowerCase();
}

function quotesOf(group: Moment[]): Moment[] {
  const out: Moment[] = [];
  const seen = new Set<number>();
  for (const m of group) {
    if (seen.has(m.session)) continue;
    seen.add(m.session);
    out.push(m);
    if (out.length === 3) return out;
  }
  for (const m of group) {
    if (out.includes(m)) continue;
    out.push(m);
    if (out.length === 3) break;
  }
  return out;
}

function fence(screen: string): string {
  const body = screen.length ? screen.replace(/```/g, "'''") : '(blank)';
  return '```\n' + body + '\n```';
}

function render(logs: SessionLog[], meta: { model: string; fake: boolean; sessions: number; turns: number }): string {
  const lines: string[] = [];
  const model = meta.fake ? 'fake (random valid commands, no API key)' : meta.model;
  lines.push(`# Playtest report`, '', `Model: ${model}. Sessions: ${meta.sessions}. Turns: ${meta.turns}.`, '');
  for (const log of logs) {
    const o = log.outcome;
    lines.push(`## Session ${log.index} — ${log.persona.name}`, '');
    lines.push(`Goal: ${log.persona.goal}`, '');
    lines.push(`Seed: ${log.seed}.`, '');
    lines.push(`Outcome: net worth ${o.netWorth}; cash ${o.cash}; firms: ${o.firms}; prison: ${o.prison}; death: ${o.death}; at ${o.when}.`, '');
    lines.push(`Calls: ${log.calls}. Tokens: ${log.input} in, ${log.output} out.`, '');
    if (log.error) lines.push(`Error: ${log.error}`, '');
    lines.push(`### Tagged moments`, '');
    if (!log.moments.length) lines.push('No tagged moments.', '');
    for (const m of log.moments) {
      lines.push(`#### Turn ${m.turn} ${m.tag}`, '', `Thought: ${m.thought}`, '', `Command: ${m.command}`, '', 'Screen:', '', fence(m.screen), '');
    }
  }
  const moments = logs.flatMap((l) => l.moments);
  const troubles = moments.filter((m) => m.tag !== 'DELIGHTED');
  lines.push('## Summary', '');
  const momentWord = moments.length === 1 ? 'moment' : 'moments';
  const sessionWord = logs.length === 1 ? 'session' : 'sessions';
  const troubleWord = troubles.length === 1 ? 'is' : 'are';
  lines.push(`${moments.length} tagged ${momentWord} across ${logs.length} ${sessionWord}. ${troubles.length} ${troubleWord} confusion, a missing command, a surprise, or boredom.`, '');
  lines.push('### Most frequent problems', '');
  const groups = new Map<string, Moment[]>();
  for (const m of moments) {
    const key = problemKey(m.thought, m.tag);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const ranked = [...groups.entries()]
    .filter(([, group]) => group[0] && group[0].tag !== 'DELIGHTED')
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const repeated = ranked.filter((g) => g[1].length >= 2);
  const shown = (repeated.length ? repeated : ranked).slice(0, 8);
  if (!shown.length) lines.push('No problems tagged.', '');
  shown.forEach(([key, group], n) => {
    const who = new Set(group.map((m) => m.session));
    const times = group.length === 1 ? 'moment' : 'moments';
    lines.push(`${n + 1}. **${key}** — ${group.length} ${times} in ${who.size} session${who.size === 1 ? '' : 's'}`);
    for (const m of quotesOf(group)) {
      lines.push(`   > ${m.thought}`);
      lines.push(`   > — session ${m.session}, ${m.persona}, turn ${m.turn}`);
      lines.push('');
    }
  });
  lines.push('### Missing commands', '');
  const missing = new Map<string, { count: number; sessions: Set<number> }>();
  for (const m of moments) {
    const name = missingName(m);
    if (!name) continue;
    const row = missing.get(name) ?? { count: 0, sessions: new Set<number>() };
    row.count += 1;
    row.sessions.add(m.session);
    missing.set(name, row);
  }
  const asked = [...missing.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  if (!asked.length) lines.push('Players did not name a missing command.', '');
  for (const [name, row] of asked) {
    const ss = [...row.sessions].sort((a, b) => a - b).join(', ');
    lines.push(`- ${name} — ${row.count} ask${row.count === 1 ? '' : 's'} (sessions ${ss})`);
  }
  lines.push('', '### Tokens and cost', '');
  for (const log of logs) lines.push(`- Session ${log.index} (${log.persona.name}): ${log.calls} calls, ${log.input} input tokens, ${log.output} output tokens`);
  const calls = logs.reduce((a, l) => a + l.calls, 0);
  const input = logs.reduce((a, l) => a + l.input, 0);
  const output = logs.reduce((a, l) => a + l.output, 0);
  const dollars = logs.reduce((a, l) => a + l.cost, 0);
  lines.push(`- Total: ${calls} calls, ${input} input tokens, ${output} output tokens`);
  if (meta.fake) lines.push('- Cost: $0.00. No API key was set, so a fake model typed random valid commands and used no tokens.');
  else if (meta.model === 'claude-haiku-5-5') lines.push(`- Cost: $${dollars.toFixed(4)} at Claude Haiku 5.5 short-prompt rates ($0.10 per million input tokens, $0.50 per million output tokens).`);
  else lines.push(`- Cost: not priced for ${meta.model}. Tokens above are the billed counts from the API.`);
  lines.push('');
  return lines.join('\n');
}

function emptyOutcome(): Outcome {
  return { netWorth: 'unknown', cash: 'unknown', when: 'unknown', firms: 'none', prison: 'no', death: 'no' };
}

async function main(): Promise<void> {
  const personas = loadPersonas(path.join(here, 'personas.txt'));
  const sessions = num('sessions', personas.length);
  const turns = num('turns', 100);
  const model = arg('model', 'claude-haiku-5-5');
  const fake = process.argv.includes('--fake');
  const key = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!fake && !key) {
    console.error('ANTHROPIC_API_KEY is not set, so there is no model to call.');
    process.exit(1);
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'playtest-'));
  const logs: SessionLog[] = [];
  try {
    for (let i = 0; i < sessions; i++) {
      const persona = personas[i % personas.length];
      if (!persona) throw new Error('no persona');
      const seed = String(i + 1);
      console.log(`\nsession ${i + 1}/${sessions}  ${persona.name}  seed ${seed}`);
      try {
        logs.push(await runSession({ index: i + 1, persona, seed, turns, tmp, fake, model, key }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`session ${i + 1} failed: ${message}`);
        logs.push({
          index: i + 1, persona, seed, outcome: emptyOutcome(), moments: [],
          calls: 0, input: 0, output: 0, cost: 0, error: message,
        });
      }
      const log = logs[logs.length - 1];
      if (log) console.log(`session ${log.index}: calls ${log.calls}, tokens ${log.input + log.output} (${log.input} in, ${log.output} out)`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(reportPath, render(logs, { model, fake, sessions, turns }));
  const calls = logs.reduce((a, l) => a + l.calls, 0);
  const input = logs.reduce((a, l) => a + l.input, 0);
  const output = logs.reduce((a, l) => a + l.output, 0);
  const dollars = logs.reduce((a, l) => a + l.cost, 0);
  console.log(`\ntotal: calls ${calls}, tokens ${input + output} (${input} in, ${output} out)`);
  if (fake) console.log('cost: $0.00 (fake model, no API call)');
  else if (model === 'claude-haiku-5-5') console.log(`cost: $${dollars.toFixed(4)}`);
  else console.log('cost: unpriced model, see token counts');
  console.log(`wrote ${reportPath}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
