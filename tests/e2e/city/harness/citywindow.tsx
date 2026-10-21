// C-05: mounts Spec 1's real src/apps/city/CityWindow.tsx (not a stand-in) inside a real shell
// store, so the seam is exercised exactly as the shell uses it: import('@/city'),
// createCityRenderer with its options, mount, setVisibility/setMyPlaces/setTier from store
// changes, and unmount + dispose on React unmount.
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CityWindow } from '@/apps/city/CityWindow';
import { ShellCtx } from '@/components/shell/ShellContext';
import { createShellStore } from '@/shell/store';
import { mockChannels } from '@/shell/mockChannels';
import type { BodyState } from '@/components/shell/AppBody';

const store = createShellStore(mockChannels(new URLSearchParams(location.search)));
const el = document.getElementById('app')!;
let root: Root | null = null;

function render(state: BodyState): void {
  root ??= createRoot(el);
  root.render(createElement(ShellCtx.Provider, { value: store }, createElement(CityWindow, { state })));
}

const api = {
  mount: () => render({ focused: true, collapsed: false, background: false }),
  setBody: (s: BodyState) => render(s),
  setMyPlaces: (ids: string[]) =>
    store.setState((s) => ({ channels: { ...s.channels, me: { ...s.channels.me, myPlaces: ids } } })),
  setTierOverride: (t: 'auto' | 'T0' | 'T1' | 'T2') => store.setState((s) => ({ local: { ...s.local, renderTierOverride: t } })),
  unmount: () => {
    root?.unmount();
    root = null;
  },
};
(window as unknown as { cityWindow: typeof api }).cityWindow = api;
api.mount();
