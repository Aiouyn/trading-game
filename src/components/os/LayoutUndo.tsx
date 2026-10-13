'use client';

// Undo for the last layout (UX evaluation 6): a layout that moved the desk offers "Undo layout" for ten seconds, then the offer goes.
import { useEffect } from 'react';
import { t } from '@/i18n';
import { LAYOUT_UNDO_MS, undoLayout, useLayoutUndo } from './shellStore';

export function LayoutUndo() {
  const prev = useLayoutUndo((s) => s.prev);
  const seq = useLayoutUndo((s) => s.seq);
  useEffect(() => {
    if (prev === null) return;
    const h = window.setTimeout(() => useLayoutUndo.setState({ prev: null }), LAYOUT_UNDO_MS);
    return () => window.clearTimeout(h);
  }, [prev, seq]);
  if (prev === null) return null;
  return (
    <button type="button" className="os-undo" data-testid="layout-undo" onClick={undoLayout}>
      {t('shell.layout.undo')}
    </button>
  );
}
