// Price history the chart indexes by day. The last year stays as daily bars. Older days fold
// into one monthly bar (30-day months) so the series stops growing by an object per stock per day.
// length is still the number of days, and hist[i].c is the close the chart plots.

export interface Bar { o: number; h: number; l: number; c: number; v: number }

const MONTH = 30;
const DAILY = 360;

interface Packed {
  mo: Float64Array;
  months: number;
  tail: Bar[];
  days: number;
}

function foldFront(h: Packed): void {
  const chunk = h.tail.splice(0, MONTH);
  let hi = chunk[0].h, lo = chunk[0].l, v = 0;
  for (const b of chunk) {
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
    v += b.v;
  }
  const at = h.months * 5;
  if (h.mo.length < at + 5) {
    const n = new Float64Array(at + 5 + 60);
    n.set(h.mo);
    h.mo = n;
  }
  h.mo[at] = chunk[0].o;
  h.mo[at + 1] = hi;
  h.mo[at + 2] = lo;
  h.mo[at + 3] = chunk[chunk.length - 1].c;
  h.mo[at + 4] = v;
  h.months++;
}

function monthBar(h: Packed, month: number): Bar {
  const o = month * 5;
  return {
    get o() { return h.mo[o]; },
    set o(v: number) { h.mo[o] = v; },
    get h() { return h.mo[o + 1]; },
    set h(v: number) { h.mo[o + 1] = v; },
    get l() { return h.mo[o + 2]; },
    set l(v: number) { h.mo[o + 2] = v; },
    get c() { return h.mo[o + 3]; },
    set c(v: number) { h.mo[o + 3] = v; },
    get v() { return h.mo[o + 4]; },
    set v(n: number) { h.mo[o + 4] = n; },
  };
}

function at(h: Packed, i: number): Bar {
  const start = h.months * MONTH;
  if (i >= start) return h.tail[i - start];
  return monthBar(h, Math.floor(i / MONTH));
}

function wrap(h: Packed): Bar[] {
  const push = (bar: Bar): number => {
    h.tail.push(bar);
    h.days++;
    while (h.tail.length > DAILY) foldFront(h);
    return h.days;
  };
  const slice = (start?: number, end?: number): Bar[] => {
    const n = h.days;
    let a = start ?? 0;
    let b = end ?? n;
    if (a < 0) a = Math.max(0, n + a);
    if (b < 0) b = Math.max(0, n + b);
    const out: Bar[] = [];
    for (let i = a; i < b && i < n; i++) out.push(at(h, i));
    return out;
  };
  return new Proxy(h as unknown as Bar[], {
    get(target, prop, recv) {
      if (prop === 'length') return h.days;
      if (prop === 'push') return push;
      if (prop === 'slice') return slice;
      if (prop === Symbol.iterator) return function* () {
        for (let m = 0; m < h.months; m++) yield monthBar(h, m);
        yield* h.tail;
      };
      if (typeof prop === 'string') {
        const i = +prop;
        if (Number.isInteger(i) && i >= 0 && i < h.days) return at(h, i);
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

/** Turn a plain daily array into a day-indexed series that folds on later pushes. */
export function packHist(bars: Bar[]): Bar[] {
  const h: Packed = { mo: new Float64Array(0), months: 0, tail: bars.slice(), days: bars.length };
  const out = wrap(h);
  while (h.tail.length > DAILY) foldFront(h);
  return out;
}

/** After a load, a packed series is a plain object. Wrap it so push and indexing work again. */
export function rebindHist(hist: unknown): unknown {
  if (!hist || Array.isArray(hist)) return hist;
  const o = hist as Partial<Packed>;
  if (!o.mo || !o.tail || typeof o.days !== 'number' || typeof o.months !== 'number') return hist;
  return wrap(o as Packed);
}

/** Fold any stock that is still a raw array. A packed series folds itself on push. */
export function packListedHist(w: { state: Record<string, unknown> }): void {
  const stocks = (w.state.markets as { stocks?: { hist: unknown }[] } | undefined)?.stocks;
  if (!stocks) return;
  for (let i = 0; i < stocks.length; i++) {
    const h = stocks[i].hist;
    if (Array.isArray(h) && h.length > DAILY + MONTH) stocks[i].hist = packHist(h);
  }
}
