'use client';

// Shelf (P2-053..P2-055, P2-047, 52 px): app tiles in shelf order with a divider after the first four,
// the trade layout button, focus mode, and one box per workspace. Locked apps are drawn disabled with
// the unlock tip; Company has no tile until it unlocks (C-11).
import { Fragment } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { APPS, type AppId } from '@/shell/apps';
import { BP_FULL } from '@/shell/geometry';
import { focusedId, isFocused } from '@/shell/wm';
import { APP_GLYPH } from './appMap';
import { Glyph } from './glyphs';
import { dispatchWm, openApp, useShell } from './shellStore';

export function Shelf() {
  const shell = useShell((s) => s.shell);
  const ctx = useShell((s) => s.ctx);
  const selected = useGame((s) => s.selected);
  const focus = focusedId(shell);
  const activeApp: AppId | null = shell.wins.find((w) => w.id === focus)?.app ?? null;
  const running = new Set(shell.wins.map((w) => w.app));
  const tiles = shell.shelf.filter((a) => APPS[a].available && (!APPS[a].hideWhenLocked || ctx.unlocked(a)));
  const focusOn = isFocused(shell);
  const wide = shell.vp.w >= BP_FULL;

  return (
    <nav className="os-shelf" role="toolbar" aria-label={t('shell.apps')} data-testid="os-shelf">
      {tiles.map((a, i) => {
        const def = APPS[a];
        const name = t(def.titleKey);
        const locked = !ctx.unlocked(a);
        const tip = locked ? t('shell.locked.tip', { app: name, rank: t(`rank.${def.minRank ?? 'R0'}`) }) : name;
        const cls = ['os-tile', running.has(a) ? 'run' : '', activeApp === a ? 'on' : '', locked ? 'locked' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <Fragment key={a}>
            {i === 4 && <span className="os-sep" aria-hidden />}
            <button
              type="button"
              className={cls}
              data-testid={`shelf-app-${a}`}
              aria-label={tip}
              aria-disabled={locked || undefined}
              title={tip}
              onClick={() => {
                if (locked) return;
                openApp(a, a === 'broker' ? { ticker: selected } : {});
              }}
            >
              <Glyph name={APP_GLYPH[a]} size={22} />
              {running.has(a) && <span className="os-tile-dot" aria-hidden />}
            </button>
          </Fragment>
        );
      })}
      <div className="os-tools">
        {wide && (
          <button
            type="button"
            className="os-tool"
            data-testid="shelf-layout"
            onClick={() => dispatchWm({ type: 'applyLayout', name: 'trade', ticker: selected })}
          >
            <Glyph name="layout" size={14} />
            {t('shell.layout.trade')}
          </button>
        )}
        <button
          type="button"
          className="os-tool"
          data-testid="shelf-focus"
          aria-pressed={focusOn}
          onClick={() => dispatchWm({ type: 'toggleFocusMode' })}
        >
          <Glyph name="focus" size={14} />
          {t('shell.focus')} <span className="os-kbd">{t('shell.keys.focus')}</span>
        </button>
        <div className="os-ws" role="group" aria-label={t('shell.apps')}>
          {Array.from({ length: ctx.workspaces }, (_, n) => (
            <button
              key={n}
              type="button"
              data-testid={`ws-${n}`}
              className={`os-ws-box${n === shell.activeWs ? ' on' : ''}`}
              aria-label={t('shell.workspace', { n: n + 1 })}
              aria-pressed={n === shell.activeWs}
              onClick={() => dispatchWm({ type: 'switchWs', ws: n })}
            >
              {n + 1}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
