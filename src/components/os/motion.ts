// Reduce motion, one check for every motion a script starts (UX stage 6, item 2). The CSS answers to both the Settings switch
// (html[data-motion="reduce"]) and the system setting (prefers-reduced-motion). A script asks reducedMotion() instead of its own
// media query, so the switch counts as well as the system: before, a takeover or a ceremony still played with the switch on.

import { useSyncExternalStore } from 'react';

/** The system setting's media query. */
export const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Fired on window when the Settings switch changes, so a mounted component reads the new choice. */
export const MOTION_EVENT = 'tg-motion';

/** True when the system asks for reduced motion. */
export function systemReducesMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_MOTION_QUERY).matches;
}

/** True when motion should stop: the Settings switch is on, or the system asks for it. */
export function reducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce') return true;
  return systemReducesMotion();
}

/** Tells the mounted components that the choice changed (the Settings switch calls this after it writes <html>). */
export function announceMotion(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOTION_EVENT));
}

/**
 * Settles the motion already running, so Reduce motion takes effect at once. A CSS transition keeps the duration it started with:
 * a shelf tip fading in from a hover would run its 120 ms out after the switch is on. Such a motion is finished. Infinite
 * animations are left alone (the CSS stops them after one pass).
 */
export function finishRunningMotion(): void {
  if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return;
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue;
    const end = a.effect?.getComputedTiming().endTime;
    if (typeof end === 'number' && Number.isFinite(end)) a.finish();
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(MOTION_EVENT, onChange);
  const mql = window.matchMedia(REDUCE_MOTION_QUERY);
  mql.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(MOTION_EVENT, onChange);
    mql.removeEventListener('change', onChange);
  };
}

/** The reduced-motion choice for a component: it follows the Settings switch and the system setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedMotion, () => false);
}
