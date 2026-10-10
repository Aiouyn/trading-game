import { createRegistry, dispatch } from './rpc';
import { SandboxError, type SandboxErrorCode } from './sandbox';

/**
 * Page side of the sandbox: the same dispatch, run in a Web Worker when the browser has one (the engine's 30-day
 * replay is seconds of work), and in the page otherwise (tests, server render).
 */
export interface SandboxClient {
  call<T = unknown>(req: unknown): Promise<T>;
  dispose(): void;
}

export function createSandboxClient(): SandboxClient {
  if (typeof Worker === 'undefined') {
    const reg = createRegistry();
    return {
      call<T = unknown>(req: unknown): Promise<T> {
        try {
          return Promise.resolve(dispatch(reg, req) as T);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      dispose() {},
    };
  }
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let seq = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const m = ev.data;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new SandboxError((m.error ?? 'internal') as SandboxErrorCode));
  };
  return {
    call<T = unknown>(req: unknown): Promise<T> {
      const id = ++seq;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: (v) => resolve(v as T), reject });
        worker.postMessage({ id, req });
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}
