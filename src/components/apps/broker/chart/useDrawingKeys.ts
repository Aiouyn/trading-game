'use client';

/**
 * The drawing keys (TradingView's): Alt+T trend line, Alt+H horizontal line, Alt+V vertical line, Alt+F Fibonacci, Alt+L long and
 * Alt+S short position; Esc returns to the cursor (and cancels a shape in progress); Delete or Backspace removes the selected
 * drawing; Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes. The keys do nothing while a field has the focus.
 */
import { useEffect } from 'react';
import { useDrawings, type Tool } from './drawingStore';

const ALT: Record<string, Tool> = { t: 'trend', h: 'hline', v: 'vline', f: 'fib', l: 'long', s: 'short' };

export function useDrawingKeys(assetId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
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
        const place = document.querySelector<HTMLButtonElement>('[data-testid="position-place"]');
        if (d && (d.kind === 'long' || d.kind === 'short') && place && !place.disabled) { e.preventDefault(); place.click(); }
        return;
      }
      if ((k === 'Delete' || k === 'Backspace') && st.selected) {
        e.preventDefault();
        const list = st.byAsset[assetId] ?? [];
        st.commit(assetId, list.filter((d) => d.id !== st.selected));
        st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assetId, enabled]);
}
