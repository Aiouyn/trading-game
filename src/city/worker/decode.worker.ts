/// <reference lib="webworker" />
import { decodeChunk } from './decode';

interface Req {
  id: number;
  buf: ArrayBuffer;
}

self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, buf } = ev.data;
  try {
    const t0 = performance.now();
    const out = decodeChunk(buf);
    const ms = performance.now() - t0;
    (self as unknown as Worker).postMessage({ id, ok: true, ids: out.ids, parts: out.parts, refs: out.refs, ms }, [out.parts.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
