'use client';

// The window tab strip at the foot of the work area (UX evaluation 10). In the single and halves modes only some windows show;
// the strip names every open window of the workspace, and a click brings one to the front. It shows only with two or more windows.
import { t } from '@/i18n';
import { APPS } from '@/shell/apps';
import { TAB_H } from '@/shell/geometry';
import { focusedId } from '@/shell/wm';
import { dispatchWm, useFocusHint, useShell } from './shellStore';

export function WindowTabs() {
  const shell = useShell((s) => s.shell);
  const focus = focusedId(shell);
  const open = shell.wins
    .filter((w) => w.ws === shell.activeWs && w.state === 'open')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (
    <div
      className="os-wintabs"
      role="tablist"
      aria-label={t('shell.tabs')}
      data-testid="win-tabs"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: TAB_H, zIndex: 3 }}
    >
      {open.map((w) => {
        const on = w.id === focus;
        const label = t(APPS[w.app].titleKey) + (w.app === 'broker' && w.props.ticker ? ` ${w.props.ticker}` : '');
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`os-wintab${on ? ' on' : ''}`}
            data-testid={`win-tab-${w.id}`}
            onClick={() => {
              dispatchWm({ type: 'focus', id: w.id });
              useFocusHint.setState({ id: w.id });
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
