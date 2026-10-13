'use client';

import { useEffect, useRef } from 'react';
import { useGame } from './store';
import type { PublicPanel } from '@/world/view';

/**
 * A component that reads a public panel (the boards or the directory, R-9-12). It reads the panel once when it mounts (the
 * panel opens), and again each time the panel's version stamp moves while it is mounted. The public tick carries only the stamp.
 */
export function usePublicPanel(panel: PublicPanel): void {
  const stamp = useGame((s) => s.panelStamp[panel]);
  const opened = useRef(false);
  useEffect(() => {
    const s = useGame.getState();
    if (!opened.current) {
      opened.current = true;
      void s.loadPanel(panel);
      return;
    }
    if (s.panelStamp[panel] > s.panelLoaded[panel]) void s.loadPanel(panel);
  }, [panel, stamp]);
}
