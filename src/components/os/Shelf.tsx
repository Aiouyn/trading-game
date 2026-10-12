'use client';

// Shelf (P2-053..P2-055, P2-047, 52 px): app tiles in three groups (UX stage 6, item 15): Pinned (Broker, Portfolio,
// Wire, Messages), Apps (the rest, in shelf order) and Tools (the Trade layout button and its menu, focus mode). Hovering
// or focusing a tile shows its name in a label; a locked tile names the rank that unlocks it ("R2 Owner"). Locked apps are
// drawn disabled with the unlock tip; Company has no tile until it unlocks (C-11). The shelf is a toolbar: the arrow keys
// move between its buttons (V:261).
import { type KeyboardEvent } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { APPS, type AppId } from '@/shell/apps';
import { BP_FULL } from '@/shell/geometry';
import { focusedId, isFocused } from '@/shell/wm';
import { APP_GLYPH } from './appMap';
import { Glyph } from './glyphs';
import { LayoutMenu } from './LayoutMenu';
import { applyNamedLayout, dispatchWm, openApp, useLayoutMenu, useShell } from './shellStore';

/** The pinned group, in the order the dock shows it (UX stage 6, item 15). Everything else is under Apps. */
const PINNED: readonly AppId[] = ['broker', 'portfolio', 'wire', 'messages'];

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
  const pinned = tiles.filter((a) => PINNED.includes(a));
  const apps = tiles.filter((a) => !PINNED.includes(a));

  // Left and Right move along the toolbar's buttons (the tiles, then the tools), as a toolbar does.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.os-tile, .os-tools > button'));
    const at = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    btns[(at + (e.code === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length]?.focus();
  };

  const tile = (a: AppId) => {
    const def = APPS[a];
    const name = t(def.titleKey);
    const locked = !ctx.unlocked(a);
    // a locked tile names the rank that unlocks it, with its code and name ("R2 Owner")
    const rank = def.minRank ?? 'R0';
    const tip = locked ? t('shell.locked.tip', { app: name, rank: `${rank} ${t(`rank.${rank}`)}` }) : name;
    const cls = ['os-tile', running.has(a) ? 'run' : '', activeApp === a ? 'on' : '', locked ? 'locked' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <button
        key={a}
        type="button"
        className={cls}
        data-testid={`shelf-app-${a}`}
        aria-label={tip}
        aria-disabled={locked || undefined}
        onClick={() => {
          if (locked) return;
          openApp(a, a === 'broker' ? { ticker: selected } : {}, { focus: true });
        }}
      >
        <Glyph name={APP_GLYPH[a]} size={22} />
        {running.has(a) && <span className="os-tile-dot" aria-hidden />}
        <span className="os-tile-tip" role="presentation" aria-hidden data-testid={`shelf-tip-${a}`}>
          {tip}
        </span>
      </button>
    );
  };

  const group = (list: readonly AppId[], name: 'pinned' | 'apps') =>
    list.length === 0 ? null : (
      <div className="os-tiles" role="group" aria-label={t(`shell.dock.${name}`)} data-testid={`shelf-group-${name}`}>
        {list.map(tile)}
      </div>
    );

  return (
    <nav className="os-shelf" role="toolbar" aria-label={t('shell.apps')} data-testid="os-shelf" onKeyDown={onKeyDown}>
      {group(pinned, 'pinned')}
      {pinned.length > 0 && apps.length > 0 && <span className="os-sep" aria-hidden />}
      {group(apps, 'apps')}
      {menuOpen && <LayoutMenu />}
      <div className="os-tools" role="group" aria-label={t('shell.dock.tools')} data-testid="shelf-group-tools">
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
