'use client';

// Shelf (P2-053..P2-055, P2-047, 52 px): app tiles in shelf order with a divider after the first four,
// the Trade layout button and its menu, focus mode, and one box per workspace. Locked apps are drawn
// disabled with the unlock tip; Company has no tile until it unlocks (C-11). The shelf is a toolbar: the
// arrow keys move between its buttons (V:261).
import { type KeyboardEvent, Fragment } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { APPS, type AppId } from '@/shell/apps';
import { BP_FULL } from '@/shell/geometry';
import { focusedId, isFocused } from '@/shell/wm';
import { APP_GLYPH } from './appMap';
import { Glyph } from './glyphs';
import { LayoutMenu } from './LayoutMenu';
import { applyNamedLayout, dispatchWm, openApp, useLayoutMenu, useShell } from './shellStore';

export function Shelf() {
  const shell = useShell((s) => s.shell);
  const ctx = useShell((s) => s.ctx);
  const selected = useGame((s) => s.selected);
  const menuOpen = useLayoutMenu((s) => s.open);
  const focus = focusedId(shell);
  const activeApp: AppId | null = shell.wins.find((w) => w.id === focus)?.app ?? null;
  const running = new Set(shell.wins.map((w) => w.app));
  const tiles = shell.shelf.filter((a) => APPS[a].available && (!APPS[a].hideWhenLocked || ctx.unlocked(a)));
  const focusOn = isFocused(shell);
  const wide = shell.vp.w >= BP_FULL;

  // Left and Right move along the toolbar's buttons (the tiles, then the tools), as a toolbar does.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.os-tile, .os-tools > button'));
    const at = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    btns[(at + (e.code === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length]?.focus();
  };

  return (
    <nav className="os-shelf" role="toolbar" aria-label={t('shell.apps')} data-testid="os-shelf" onKeyDown={onKeyDown}>
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
                openApp(a, a === 'broker' ? { ticker: selected } : {}, { focus: true });
              }}
            >
              <Glyph name={APP_GLYPH[a]} size={22} />
              {running.has(a) && <span className="os-tile-dot" aria-hidden />}
            </button>
          </Fragment>
        );
      })}
      {menuOpen && <LayoutMenu />}
      <div className="os-tools">
        {wide && (
          <>
            <button
              type="button"
              className="os-tool"
              data-testid="shelf-layout"
              onClick={() => applyNamedLayout('trade', selected)}
            >
              <Glyph name="layout" size={14} />
              {t('shell.layout.trade')}
            </button>
            <button
              type="button"
              className="os-tool os-tool-icon"
              data-testid="shelf-layout-menu"
              aria-label={t('shell.layout.menu')}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              title={t('shell.layout.menu')}
              onClick={() => useLayoutMenu.setState({ open: !menuOpen })}
            >
              <Glyph name="chev" size={12} />
            </button>
          </>
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
      </div>
    </nav>
  );
}
