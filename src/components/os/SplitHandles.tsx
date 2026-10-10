'use client';

// Shared-edge handles (P2-025, V:68): on the full layout, the boundary between two tiled windows is a
// handle. A drag moves the boundary; on release the reducer writes both windows' slots as one custom
// split. The split is a fraction, so it stays exact at any size. A split the minimum sizes refuse
// shows a toast and changes nothing.
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { t } from '@/i18n';
import type { Size } from '@/shell/geometry';
import { dispatchWm, notify } from './shellStore';
import type { SharedEdge } from './windowMath';

const HANDLE_PX = 10;
const MIN_FRAC = 0.05;
const MAX_FRAC = 0.95;

export function SplitHandles({ edges, wa }: { edges: readonly SharedEdge[]; wa: Size }) {
  return (
    <>
      {edges.map((e) => (
        <SplitHandle key={`${e.a}|${e.b}|${e.axis}`} edge={e} wa={wa} />
      ))}
    </>
  );
}

function SplitHandle({ edge, wa }: { edge: SharedEdge; wa: Size }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<number | null>(null);
  const vertical = edge.axis === 'x';
  const at = pos ?? edge.pos;
  const style = vertical
    ? { left: at * wa.w - HANDLE_PX / 2, top: edge.lo * wa.h, width: HANDLE_PX, height: (edge.hi - edge.lo) * wa.h }
    : { top: at * wa.h - HANDLE_PX / 2, left: edge.lo * wa.w, height: HANDLE_PX, width: (edge.hi - edge.lo) * wa.w };

  const down = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const box = ref.current?.parentElement?.getBoundingClientRect();
    if (!box) return;
    let cur = edge.pos;
    const move = (m: PointerEvent): void => {
      const f = vertical ? (m.clientX - box.left) / wa.w : (m.clientY - box.top) / wa.h;
      cur = Math.min(MAX_FRAC, Math.max(MIN_FRAC, f));
      setPos(cur);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPos(null);
      if (Math.abs(cur - edge.pos) < 0.001) return;
      const r = dispatchWm({ type: 'splitEdge', a: edge.a, b: edge.b, axis: edge.axis, at: cur });
      if (!r.ok) notify(t('shell.split.min'), 'warn');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      className={`os-split ${vertical ? 'v' : 'h'}`}
      style={{ position: 'absolute', ...style }}
      data-testid={`os-split-${edge.a}-${edge.b}`}
      aria-hidden
      onPointerDown={down}
    />
  );
}
