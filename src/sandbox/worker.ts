import { createRegistry, dispatch, errorCode } from './rpc';

/**
 * Web Worker entry: the sandbox engine runs here, off the UI thread. A 30-day run costs a few seconds of engine time,
 * so the page never steps it itself. Messages are { id, req } and replies are { id, ok, result | error }.
 */
interface WorkerPort {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: (msg: unknown) => void;
}

const reg = createRegistry();
const port = self as unknown as WorkerPort;

port.onmessage = (ev) => {
  const msg = ev.data as { id: number; req: unknown };
  try {
    port.postMessage({ id: msg.id, ok: true, result: dispatch(reg, msg.req) });
  } catch (e) {
    port.postMessage({ id: msg.id, ok: false, error: errorCode(e) });
  }
};
