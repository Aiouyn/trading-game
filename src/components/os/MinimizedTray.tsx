'use client';

// The minimized-window tray (UX evaluation 4): every collapsed window, named, one click to restore it. It sits beside the dock
// and shows only while a window is minimized, so no window is pushed out silently. A window of another workspace restores there.
import { t } from '@/i18n';
import { APPS } from '@/shell/apps';
import { WORKSPACE_NAMES } from './WorkspaceTabs';
import { dispatchWm, useFocusHint, useShell } from './shellStore';

export function MinimizedTray() {
  const wins = useShell((s) => s.shell.wins);
  const activeWs = useShell((s) => s.shell.activeWs);
  const collapsed = wins.filter((w) => w.state === 'collapsed');
  if (collapsed.length === 0) return null;
  return (
    <div className="os-tray" role="group" aria-label={t('shell.tray.title')} data-testid="os-tray">
      <span className="os-tray-title">
        {t('shell.tray.title')} <span className="os-tray-count" data-testid="os-tray-count">{collapsed.length}</span>
      </span>
      {collapsed.map((w) => {
        const name = t(APPS[w.app].titleKey);
        const ws = w.ws !== activeWs ? t(`shell.ws.${WORKSPACE_NAMES[w.ws] ?? 'trade'}`) : null;
        return (
          <button
            key={w.id}
            type="button"
            className="os-tray-item"
            data-testid={`tray-${w.id}`}
            title={t('shell.tray.restore', { name })}
            onClick={() => {
              dispatchWm({ type: 'restore', id: w.id });
              useFocusHint.setState({ id: w.id });
            }}
          >
            {name}
            {ws !== null && <span className="os-tray-ws">{ws}</span>}
          </button>
        );
      })}
    </div>
  );
}
