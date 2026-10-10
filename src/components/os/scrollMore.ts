'use client';

// The scroll affordance for a window (defect B). A window's content scrolls inside its `.os-body`; when
// more content lies below the visible part, the frame carries `data-more-below`, and the CSS draws a
// subtle fade over the bottom edge. Pure check first, then the DOM hook that keeps the attribute in step.
import { type RefObject, useEffect } from 'react';

/** Whether scrolled content remains below the visible part. `eps` ignores sub-pixel rounding. */
export function moreBelow(scrollTop: number, clientHeight: number, scrollHeight: number, eps = 4): boolean {
  return scrollHeight - (scrollTop + clientHeight) > eps;
}

/** The element that scrolls inside a window body: its `.os-body` when the app has one, else the body. */
function scroller(body: HTMLElement): HTMLElement {
  return body.querySelector<HTMLElement>('.os-body') ?? body;
}

/**
 * Keeps `data-more-below` on the frame in step with the window's scroll position. It re-checks on
 * scroll (captured, since scroll does not bubble), on resize of the body or the window, and after DOM
 * changes inside the body, throttled to one check per frame so a ticking chart costs nothing extra.
 */
export function useMoreBelow(frameRef: RefObject<HTMLElement | null>, bodyRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const frame = frameRef.current;
    const body = bodyRef.current;
    if (!frame || !body) return;
    let raf = 0;
    const sync = (): void => {
      raf = 0;
      const s = scroller(body);
      frame.toggleAttribute('data-more-below', moreBelow(s.scrollTop, s.clientHeight, s.scrollHeight));
    };
    const queue = (): void => {
      if (raf === 0 && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(sync);
      else if (raf === 0) sync();
    };
    sync();
    body.addEventListener('scroll', queue, { capture: true, passive: true });
    window.addEventListener('resize', queue);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue);
    ro?.observe(body);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(queue);
    mo?.observe(body, { childList: true, subtree: true });
    return () => {
      body.removeEventListener('scroll', queue, { capture: true });
      window.removeEventListener('resize', queue);
      ro?.disconnect();
      mo?.disconnect();
      if (raf !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      frame.removeAttribute('data-more-below');
    };
  }, [frameRef, bodyRef]);
}
