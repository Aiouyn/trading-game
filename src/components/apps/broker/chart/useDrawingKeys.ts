'use client';

/**
 * The drawing keys (TradingView's): Alt+T trend line, Alt+H horizontal line, Alt+V vertical line, Alt+F Fibonacci, Alt+L long and
 * Alt+S short position; Esc returns to the cursor (and cancels a shape in progress); Delete or Backspace removes the selected
 * drawing; Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes. The keys do nothing while a field has the focus.
 */
import { useEffect, type RefObject } from 'react';
import { useDrawings, type Tool } from './drawingStore';

const ALT: Record<string, Tool> = { t: 'trend', h: 'hline', v: 'vline', f: 'fib', l: 'long', s: 'short' };

/** Route placement through this chart's panel; repeated drawing ids in other charts are unrelated. */
export function placeSelectedPosition(root: ParentNode | null, assetId: string, drawingId: string): boolean {
  const panel = root?.querySelector<HTMLElement>('[data-testid="position-panel"]');
  if (!panel || panel.dataset.assetId !== assetId || panel.dataset.drawingId !== drawingId) return false;
  const place = panel.querySelector<HTMLButtonElement>('[data-testid="position-place"]');
  if (!place || place.disabled) return false;
  place.click();
  return true;
}

export function useDrawingKeys(assetId: string, enabled: boolean, root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const owner = target?.closest('[data-testid="chart-card"]');
      if (owner && owner !== root.current) return;
      const st = useDrawings.getState();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.altKey && !e.ctrlKey && !e.metaKey && ALT[k]) {
        e.preventDefault();
        st.setTool(ALT[k]!);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(assetId); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); st.redo(assetId); }
        return;
      }
      if (k === 'Escape') {
        if (st.tool !== 'cursor') st.setTool('cursor');
        else st.select(null);
        return;
      }
      if (k === 'Enter' && st.selected) {
        const d = (st.byAsset[assetId] ?? []).find((x) => x.id === st.selected);
        if (d && (d.kind === 'long' || d.kind === 'short') && placeSelectedPosition(root.current, assetId, d.id)) e.preventDefault();
        return;
      }
      if ((k === 'Delete' || k === 'Backspace') && st.selected && !st.locked) {
        e.preventDefault();
        const list = st.byAsset[assetId] ?? [];
        if (list.find((d) => d.id === st.selected)?.locked) return;
        st.commit(assetId, list.filter((d) => d.id !== st.selected));
        st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assetId, enabled, root]);
}
