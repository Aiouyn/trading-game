'use client';

import { create } from 'zustand';

export type BoardSort = 'bump' | 'cap' | 'created' | 'replies' | 'vol' | 'curve';
const SORTS: BoardSort[] = ['bump', 'cap', 'created', 'replies', 'vol', 'curve'];

/** One device preference, retained when a feed, token page or Launchpad window unmounts. */
export const useBoardPrefs = create<{
  sort: BoardSort;
  loaded: boolean;
  load(): void;
  setSort(sort: BoardSort): void;
}>((set, get) => ({
  sort: 'created',
  loaded: false,
  load() {
    if (get().loaded) return;
    let sort: BoardSort = 'created';
    try {
      const prefs = JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}');
      if (SORTS.includes(prefs?.launchpadSort)) sort = prefs.launchpadSort;
    } catch { /* Unavailable/corrupt storage falls back to most recent. */ }
    set({sort, loaded:true});
  },
  setSort(sort) {
    set({sort, loaded:true});
    try {
      const raw = JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}');
      const prefs = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      window.localStorage.setItem('tg-prefs', JSON.stringify({...prefs, launchpadSort:sort}));
    } catch { /* The in-memory selection still survives feed remounts. */ }
  },
}));
