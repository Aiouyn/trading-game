import { describe, expect, it } from 'vitest';
import { SANDBOX } from './config';
import { exportRun, importRun, serializeRun, type RunFile } from './runfile';
import { Sandbox, SandboxError } from './sandbox';

const TICKS_PER_DAY = 720;

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof SandboxError) return e.code;
    throw e;
  }
  return 'no-error';
}

/** a practice run with one trade, stepped two days; the file text is the thing a player exports */
function practiceFile(id = 'rt'): { text: string; run: RunFile } {
  const sb = Sandbox.create({ kind: 'practice', id });
  sb.step(TICKS_PER_DAY);
  sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
  sb.step(TICKS_PER_DAY);
  sb.act({ type: 'place', order: { assetId: 'SILV', side: 'buy', type: 'limit', qty: 3, limitPrice: 1 } });
  sb.step(10);
  const run = exportRun(sb);
  return { text: serializeRun(run), run };
}

function edit(text: string, change: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(text) as Record<string, unknown>;
  change(o);
  return JSON.stringify(o);
}

describe('run files: export and import', () => {
  it('a run round-trips to the same digest, and re-exports byte for byte', () => {
    const { text } = practiceFile('round');
    const back = importRun(text);
    expect(back.origin).toBe('imported');
    expect(back.tick).toBe(JSON.parse(text).ticks);
    expect(serializeRun(exportRun(back))).toBe(text);
  }, 60_000);

  it('the file holds no player id, no live seed and no account data beyond the practice account', () => {
    const { text } = practiceFile('scan');
    expect(text).not.toContain('avalon');
    expect(text).not.toMatch(/"playerId"/);
    expect(text).not.toContain('"accounts"');
    expect(JSON.parse(text).sandboxSeed.startsWith(SANDBOX.seedPrefix)).toBe(true);
  }, 60_000);

  it('a scenario run exports and imports from a partial run', () => {
    const sb = Sandbox.create({ kind: 'scenario', scenarioId: 'flash' });
    sb.advance(TICKS_PER_DAY * 2);
    const text = serializeRun(exportRun(sb));
    const back = importRun(text);
    expect(back.plan.kind).toBe('scenario');
    expect(back.tick).toBe(2 * TICKS_PER_DAY);
    expect(back.digest()).toBe(sb.digest());
  }, 60_000);

  it('an open practice run that runs past the cap stops at the cap and still exports', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'long' });
    sb.advance((SANDBOX.maxRunDays + 1) * TICKS_PER_DAY);
    expect(sb.tick).toBe(SANDBOX.maxRunDays * TICKS_PER_DAY);
    const text = serializeRun(exportRun(sb));
    expect(importRun(text).tick).toBe(SANDBOX.maxRunDays * TICKS_PER_DAY);
  }, 120_000);
});

describe('run files: import refuses what it cannot check', () => {
  it('a changed command is caught by the digest', () => {
    const { run } = practiceFile('tamper');
    const text = edit(JSON.stringify(run), (o) => {
      const c = (o.commands as { command: { order: { qty: number } } }[])[0]!;
      c.command.order.qty = 2;
    });
    expect(errorOf(() => importRun(text))).toBe('digest-mismatch');
  }, 60_000);

  it('a changed digest is caught', () => {
    const { text } = practiceFile('digest');
    expect(errorOf(() => importRun(edit(text, (o) => { o.digest = '0000000000000000'; })))).toBe('digest-mismatch');
  }, 60_000);

  it('a file from another config or engine version is refused', () => {
    const { text } = practiceFile('version');
    expect(errorOf(() => importRun(edit(text, (o) => { o.configVersion = 99; })))).toBe('bad-version');
    expect(errorOf(() => importRun(edit(text, (o) => { o.engineVersion = 99; })))).toBe('bad-version');
    expect(errorOf(() => importRun(edit(text, (o) => { o.format = 'other'; })))).toBe('bad-version');
  }, 60_000);

  it('an unknown top-level field is refused (no smuggled data)', () => {
    const { text } = practiceFile('extra');
    expect(errorOf(() => importRun(edit(text, (o) => { o.playerId = 'p1'; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.ranked = true; })))).toBe('bad-run');
  }, 60_000);

  it('a live or foreign seed is refused', () => {
    const { text } = practiceFile('seed');
    expect(errorOf(() => importRun(edit(text, (o) => { o.sandboxSeed = 'avalon'; })))).toBe('bad-run');
    // a practice seed with the sandbox prefix is a valid plan, but its market differs, so the digest refuses it
    expect(errorOf(() => importRun(edit(text, (o) => { o.sandboxSeed = 'sbx:practice:other'; })))).toBe('digest-mismatch');
  }, 60_000);

  it('a scenario header must name the table seed', () => {
    const sb = Sandbox.create({ kind: 'scenario', scenarioId: 'quiet' });
    const text = serializeRun(exportRun(sb));
    expect(errorOf(() => importRun(edit(text, (o) => { o.sandboxSeed = 'sbx:scenario:quiet:s999'; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.startingCash = 1e9; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.initialRegime = 'overheating'; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.weekKey = '2026-W41'; })))).toBe('bad-run');
  });

  it('a challenge header must name its week seed, its week and its scenario', () => {
    const sb = Sandbox.create({ kind: 'challenge', weekKey: '2026-W41' });
    sb.step(TICKS_PER_DAY);
    const text = serializeRun(exportRun(sb));
    expect(importRun(text).plan.kind).toBe('challenge');
    expect(errorOf(() => importRun(edit(text, (o) => { o.weekKey = null; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.weekKey = '2026-W42'; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.sandboxSeed = 'sbx:challenge:2026-W41:other-salt'; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.scenarioId = 'quiet'; })))).toBe('bad-run');
    expect(errorOf(() => importRun(edit(text, (o) => { o.scenarioId = null; })))).toBe('bad-run');
  }, 120_000);

  it('a challenge header that names a week is not a scenario header', () => {
    const sb = Sandbox.create({ kind: 'challenge', weekKey: '2026-W41' });
    const text = serializeRun(exportRun(sb));
    expect(errorOf(() => importRun(edit(text, (o) => { o.kind = 'scenario'; })))).toBe('bad-run');
  }, 60_000);

  it('input that is not text is a bad run, not a size problem', () => {
    expect(errorOf(() => importRun(42 as unknown as string))).toBe('bad-run');
    expect(errorOf(() => importRun(null as unknown as string))).toBe('bad-run');
  });

  it('a player cannot raise the paper cash', () => {
    const { text } = practiceFile('cash');
    expect(errorOf(() => importRun(edit(text, (o) => { o.startingCash = 1e12; })))).toBe('bad-run');
  }, 60_000);

  it('a player id or prototype key inside a command is refused', () => {
    const { text } = practiceFile('proto');
    expect(errorOf(() => importRun(edit(text, (o) => {
      (o.commands as { command: { order: Record<string, unknown> } }[])[0]!.command.order.playerId = 'p1';
    })))).toBe('bad-command');
    expect(errorOf(() => importRun(text.replace('"digest"', '"__proto__":{"x":1},"digest"')))).toBe('bad-run');
  }, 60_000);

  it('a cancel that cancels nothing is a replay failure, not a silent skip', () => {
    const { text } = practiceFile('cancel');
    const bad = edit(text, (o) => {
      const cmds = o.commands as { tick: number; command: unknown }[];
      cmds.push({ tick: cmds[cmds.length - 1]!.tick, command: { type: 'cancel', orderId: 'practice-999' } });
    });
    expect(errorOf(() => importRun(bad))).toBe('replay-rejected');
  }, 60_000);

  it('ticks beyond the longest run, or out of order, are refused', () => {
    const { text } = practiceFile('ticks');
    expect(errorOf(() => importRun(edit(text, (o) => { o.ticks = (SANDBOX.maxRunDays + 1) * TICKS_PER_DAY; })))).toBe('bad-ticks');
    expect(errorOf(() => importRun(edit(text, (o) => { (o.commands as { tick: number }[]).reverse(); })))).toBe('bad-ticks');
  }, 60_000);

  it('a file above the byte cap is refused before it is parsed', () => {
    const big = `{"pad":"${'x'.repeat(SANDBOX.maxRunBytes)}"}`;
    expect(errorOf(() => importRun(big))).toBe('run-too-large');
  });

  it('a file with too many commands is refused', () => {
    const { text } = practiceFile('count');
    const cmds = Array.from({ length: SANDBOX.maxRunCommands + 1 }, () => ({ tick: 0, command: { type: 'cancel', orderId: 'practice-1' } }));
    expect(errorOf(() => importRun(edit(text, (o) => { o.commands = cmds; })))).toBe('run-too-large');
  }, 60_000);

  it('text that is not a JSON object is refused', () => {
    expect(errorOf(() => importRun('not json'))).toBe('bad-run');
    expect(errorOf(() => importRun('[1,2,3]'))).toBe('bad-run');
    expect(errorOf(() => importRun('null'))).toBe('bad-run');
  });
});
