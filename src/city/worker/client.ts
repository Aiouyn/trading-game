import { decodeChunk, type DecodedChunk } from './decode';

export interface DecodeClient {
  decode(buf: ArrayBuffer): Promise<DecodedChunk>;
  /** Total time spent decoding inside the worker (or inline), ms. */
  readonly decodeMs: number;
  readonly inWorker: boolean;
  dispose(): void;
}

type Reply =
  | { id: number; ok: true; ids: string[]; parts: Float32Array; ms: number }
  | { id: number; ok: false; error: string };

/** Decodes chunks in a Web Worker (spec §5); falls back to inline decoding where Workers are missing. */
export function createDecodeClient(): DecodeClient {
  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  const pending = new Map<number, { resolve: (d: DecodedChunk) => void; reject: (e: Error) => void }>();
  let next = 1;
  let decodeMs = 0;
  if (worker) {
    worker.onmessage = (ev: MessageEvent<Reply>) => {
      const r = ev.data;
      const p = pending.get(r.id);
      if (!p) return;
      pending.delete(r.id);
      if (r.ok) {
        decodeMs += r.ms;
        p.resolve({ ids: r.ids, parts: r.parts });
      } else p.reject(new Error(r.error));
    };
  }
  return {
    get decodeMs() {
      return decodeMs;
    },
    get inWorker() {
      return worker !== null;
    },
    decode(buf) {
      if (!worker) {
        const t0 = performance.now();
        const out = decodeChunk(buf);
        decodeMs += performance.now() - t0;
        return Promise.resolve(out);
      }
      const id = next++;
      const w = worker;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ id, buf }, [buf]);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const p of pending.values()) p.reject(new Error('disposed'));
      pending.clear();
    },
  };
}
