// City generation off the main thread: a module worker reads the city from the IndexedDB cache or generates it, reports
// progress, and posts the city back with its typed arrays transferred (not copied). The personality object is not sent
// (it holds functions); the page attaches it again by id.
import { PERSONALITIES } from './personalities.js';
import { generateCity } from './gen.js';
import { readCity, writeCity } from './citycache.js';

/** The ArrayBuffers under a city's typed arrays, for transfer. */
function buffersOf(obj, out = new Set(), depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return out;
  if (ArrayBuffer.isView(obj)) { out.add(obj.buffer); return out; }
  if (obj instanceof ArrayBuffer) { out.add(obj); return out; }
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) buffersOf(v, out, depth + 1);
  return out;
}

self.onmessage = async ({ data: { id, reqId } }) => {
  const send = (msg, transfer = []) => self.postMessage({ reqId, ...msg }, transfer);
  try {
    const cached = await readCity(id);
    if (cached) {
      send({ type: 'done', city: cached, cached: true }, [...buffersOf(cached)]);
      return;
    }
    const { P, ...city } = await generateCity(PERSONALITIES[id], (msg) => send({ type: 'progress', msg }));
    // the write clones the city before the buffers are handed over
    await writeCity(id, city);
    send({ type: 'done', city, cached: false }, [...buffersOf(city)]);
  } catch (err) {
    send({ type: 'error', message: String((err && err.stack) || err) });
  }
};
