'use client';

// The focus-mode exit control (UX stage 6, item 4; UX evaluation 11). On entering focus mode the full pill shows for three
// seconds, saying how to leave ("Exit focus  Ctrl ."). Then it shrinks to its key alone in the bottom-right corner and stays
// there until focus mode ends, so the way out is always reachable and never covers the focused window's title. A click leaves focus mode.
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { isFocused } from '@/shell/wm';
import { dispatchWm, useShell } from './shellStore';

/** How long the full pill stays up after focus mode is entered (ms). */
export const FOCUS_PILL_MS = 3000;

export function FocusPill() {
  const on = useShell((s) => isFocused(s.shell));
  return on ? <FocusPillOnce /> : null;
}

function FocusPillOnce() {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const h = window.setTimeout(() => setQuiet(true), FOCUS_PILL_MS);
    return () => window.clearTimeout(h);
  }, []);
  return (
    <button
      type="button"
      className={`os-focus-pill${quiet ? ' quiet' : ''}`}
      data-testid="focus-exit"
      data-quiet={quiet ? 'true' : 'false'}
      aria-label={t('shell.focus.exit')}
      title={t('shell.focus.exit')}
      onClick={() => dispatchWm({ type: 'toggleFocusMode' })}
    >
      {quiet ? <span className="os-kbd">{t('shell.keys.focus')}</span> : (
        <>
          {t('shell.focus.exit')} <span className="os-kbd">{t('shell.keys.focus')}</span>
        </>
      )}
    </button>
  );
}
