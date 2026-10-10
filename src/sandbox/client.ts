import { createRegistry, dispatch, errorCode } from './rpc';
import { SandboxError, type SandboxErrorCode } from './sandbox';

/**
 * Page side of the sandbox: the same dispatch, run in a Web Worker when the browser has one (a 30-day run is a few
 * seconds of engine time), and in the page otherwise (tests, server render). Both paths reject with a SandboxError
 * carrying a stable code, so the UI sees the same codes either way.
 */
export interface SandboxClient {
  call<T = unknown>(req: unknown): Promise<T>;
  dispose(): void;
}

/** The part of the Worker API the client uses (a test passes a fake). */
export interface WorkerLike {
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessageerror: ((ev: unknown) => void) | null;
  postMessage(msg: unknown): void;
  terminate(): void;
}

export type WorkerFactory = () => WorkerLike;

interface Reply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: SandboxErrorCode;
}

/** Use `factory` when given (tests); otherwise the page's Worker, or the page itself when there is no Worker. */
export function createSandboxClient(factory?: WorkerFactory): SandboxClient {
  if (factory) return workerClient(factory);
  if (typeof Worker === 'undefined') return pageClient();
  return workerClient(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
}

function pageClient(): SandboxClient {
  const reg = createRegistry();
  let closed = false;
  return {
    call<T = unknown>(req: unknown): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (closed) {
          reject(new SandboxError('disposed'));
          return;
        }
        try {
          resolve(dispatch(reg, req) as T);
        } catch (e) {
          reject(new SandboxError(errorCode(e)));
        }
      });
    },
    dispose() {
      closed = true;
      reg.sandboxes.clear();
    },
  };
}

function workerClient(make: WorkerFactory): SandboxClient {
  const worker = make();
  let seq = 0;
  /** set once the worker has failed (or the client was disposed): every later call rejects with this code */
  let dead: SandboxErrorCode | null = null;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const failAll = (code: SandboxErrorCode): void => {
    dead = dead ?? code;
    for (const p of pending.values()) p.reject(new SandboxError(code));
    pending.clear();
  };

  worker.onmessage = (ev) => {
    const m = ev.data as Reply;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new SandboxError(m.error ?? 'internal'));
  };
  // a worker that fails to load or crashes would otherwise leave every pending call unsettled
  worker.onerror = () => failAll('worker-failed');
  worker.onmessageerror = () => failAll('worker-failed');

  return {
    call<T = unknown>(req: unknown): Promise<T> {
      if (dead) return Promise.reject(new SandboxError(dead));
      const id = ++seq;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: (v) => resolve(v as T), reject });
        try {
          worker.postMessage({ id, req });
        } catch {
          pending.delete(id);
          reject(new SandboxError('internal'));
        }
      });
    },
    dispose() {
      failAll('disposed');
      worker.terminate();
    },
  };
}
