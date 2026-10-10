import { describe, expect, it } from 'vitest';
import { createSandboxClient, type SandboxClient, type WorkerLike } from './client';
import { SandboxError } from './sandbox';

/** the code a rejected call carries ('ok' when it resolved) */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof SandboxError ? e.code : `raw:${String(e)}`;
  }
}

/** a Worker stand-in: records what the client posts and lets a test send replies or failures */
class FakeWorker implements WorkerLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessageerror: ((ev: unknown) => void) | null = null;
  sent: { id: number; req: unknown }[] = [];
  terminated = false;
  failPost = false;

  postMessage(msg: unknown): void {
    if (this.failPost) throw new Error('DataCloneError');
    this.sent.push(msg as { id: number; req: unknown });
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(msg: unknown): void {
    this.onmessage?.({ data: msg });
  }
}

describe('sandbox client: page path (no Worker in this environment)', () => {
  it('runs the same dispatch and resolves with its result', async () => {
    const c: SandboxClient = createSandboxClient();
    const made = await c.call<{ id: string; origin: string }>({ op: 'create', spec: { kind: 'practice', id: 'page' } });
    expect(made.origin).toBe('live');
    const v = await c.call<{ tick: number }>({ op: 'view', id: made.id });
    expect(v.tick).toBe(0);
    c.dispose();
  });

  it('rejects with a stable code, and an unexpected error becomes internal', async () => {
    const c = createSandboxClient();
    expect(await codeOf(c.call({ op: 'view', id: 'nope' }))).toBe('bad-id');
    const bomb = new Proxy({ op: 'view', id: 's1' }, { get() { throw new Error('boom'); } });
    expect(await codeOf(c.call(bomb))).toBe('internal');
  });

  it('refuses calls after dispose', async () => {
    const c = createSandboxClient();
    c.dispose();
    expect(await codeOf(c.call({ op: 'view', id: 's1' }))).toBe('disposed');
  });
});

describe('sandbox client: worker path', () => {
  it('a reply settles its call with the result, or with the code the worker sent', async () => {
    const w = new FakeWorker();
    const c = createSandboxClient(() => w);
    const ok = c.call<{ n: number }>({ op: 'view', id: 's1' });
    const id1 = w.sent[0]!.id;
    w.reply({ id: id1, ok: true, result: { n: 1 } });
    expect(await ok).toEqual({ n: 1 });

    const bad = c.call({ op: 'view', id: 'nope' });
    const id2 = w.sent[1]!.id;
    w.reply({ id: id2, ok: false, error: 'bad-id' });
    expect(await codeOf(bad)).toBe('bad-id');
  });

  it('a worker that errors settles every pending call and refuses later ones', async () => {
    const w = new FakeWorker();
    const c = createSandboxClient(() => w);
    const a = c.call({ op: 'step', id: 's1', ticks: 720 });
    const b = c.call({ op: 'view', id: 's1' });
    w.onerror?.(new Event('error'));
    expect(await codeOf(a)).toBe('worker-failed');
    expect(await codeOf(b)).toBe('worker-failed');
    expect(await codeOf(c.call({ op: 'view', id: 's1' }))).toBe('worker-failed');
  });

  it('a message the worker cannot decode settles pending calls the same way', async () => {
    const w = new FakeWorker();
    const c = createSandboxClient(() => w);
    const a = c.call({ op: 'view', id: 's1' });
    w.onmessageerror?.(new Event('messageerror'));
    expect(await codeOf(a)).toBe('worker-failed');
  });

  it('a request the worker cannot take is rejected at once, not left pending', async () => {
    const w = new FakeWorker();
    w.failPost = true;
    const c = createSandboxClient(() => w);
    expect(await codeOf(c.call({ op: 'view', id: 's1' }))).toBe('internal');
  });

  it('dispose settles pending calls as disposed and stops the worker', async () => {
    const w = new FakeWorker();
    const c = createSandboxClient(() => w);
    const a = c.call({ op: 'view', id: 's1' });
    c.dispose();
    expect(await codeOf(a)).toBe('disposed');
    expect(w.terminated).toBe(true);
  });
});
