'use client';

import { useSyncExternalStore } from 'react';

/** DESIGN.md §5 breakpoints. */
export const PHONE_MAX = 767;
export const DESKTOP_MIN = 1200;

const subs = new Map<string, (cb: () => void) => () => void>();

function subscribeTo(query: string) {
  const hit = subs.get(query);
  if (hit) return hit;
  const fn = (cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  };
  subs.set(query, fn);
  return fn;
}

export function useMedia(query: string, serverValue = false): boolean {
  return useSyncExternalStore(subscribeTo(query), () => window.matchMedia(query).matches, () => serverValue);
}

export const useIsPhone = () => useMedia(`(max-width: ${PHONE_MAX}px)`);
export const useIsDesktop = () => useMedia(`(min-width: ${DESKTOP_MIN}px)`);
