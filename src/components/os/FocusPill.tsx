'use client';

// The focus-mode exit pill (UX stage 6, item 4): on entering focus mode a pill sits at the top centre of the desktop for
// three seconds, saying how to leave ("Exit focus  Ctrl ."). A click leaves focus mode too. The shelf is hidden in focus
// mode, so the pill is the only control on screen that names the way out. The pill mounts when focus mode starts, so its
// timer starts with the entry and a second entry shows it again.
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { isFocused } from '@/shell/wm';
import { dispatchWm, useShell } from './shellStore';

/** How long the pill stays up after focus mode is entered (ms). */
export const FOCUS_PILL_MS = 3000;

export function FocusPill() {
  const on = useShell((s) => isFocused(s.shell));
  return on ? <FocusPillOnce /> : null;
}

function FocusPillOnce() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const h = window.setTimeout(() => setShow(false), FOCUS_PILL_MS);
    return () => window.clearTimeout(h);
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="os-focus-pill" data-testid="focus-exit" onClick={() => dispatchWm({ type: 'toggleFocusMode' })}>
      {t('shell.focus.exit')} <span className="os-kbd">{t('shell.keys.focus')}</span>
    </button>
  );
}
