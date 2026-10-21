import type { CityOverlay } from '../index';
import { cssVar, fontVar, sizeVar } from '../art/tokens';
import { styleButton } from '../table/table';

export const OVERLAYS: { id: CityOverlay; label: string }[] = [
  { id: 'none', label: 'Normal' },
  { id: 'my_places', label: 'My places' },
  { id: 'districts', label: 'Districts' },
  { id: 'sectors', label: 'Sectors' },
  { id: 'for_sale', label: 'For sale' },
  { id: 'auctions', label: 'Auctions' },
  { id: 'movers', label: 'Movers' },
  { id: 'development', label: 'Development' },
];

/** Narrow containers get the phone layout: a bottom sheet collapsed to a 44 px handle. */
export const PHONE_MAX_WIDTH = 640;
/** Open sheet height cap on phones (spec §7.5) [P]. */
export const SHEET_MAX_FRACTION = 0.4;

export interface Chrome {
  root: HTMLElement;
  stage: HTMLElement;
  labels: HTMLElement;
  tableHost: HTMLElement;
  tableButton: HTMLButtonElement;
  sheet: HTMLElement;
  setTierStyle(t0: boolean): void;
  setPending(text: string | null): void;
  setOverlay(o: CityOverlay): void;
  showMenu(x: number, y: number, title: string, items: { label: string; run: () => void }[]): void;
  hideMenu(): void;
  layout(): void;
  dispose(): void;
}

export function createChrome(opts: {
  container: HTMLElement;
  onOverlay: (o: CityOverlay) => void;
  onRotate: (step: 1 | -1) => void;
  onZoom: (factor: number) => void;
  onTable: () => void;
}): Chrome {
  const root = el('div', 'city-root');
  Object.assign(root.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: cssVar('bg0'),
    color: cssVar('fg'),
    font: `${sizeVar('small')}/18px ${fontVar('ui')}`,
    touchAction: 'none',
  });
  const stage = el('div', 'city-stage');
  Object.assign(stage.style, { position: 'absolute', inset: '0' });
  const labels = el('div', 'city-labels');
  Object.assign(labels.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
  const tableHost = el('div', 'city-table-host');
  const tableButton = document.createElement('button');
  tableButton.type = 'button';
  tableButton.className = 'city-view-as-table';
  tableButton.textContent = 'View as table';
  styleButton(tableButton);
  Object.assign(tableButton.style, { position: 'absolute', top: '8px', left: '8px', zIndex: '2' });
  tableButton.addEventListener('click', () => opts.onTable());

  const pending = el('div', 'city-pending');
  pending.setAttribute('role', 'status');
  Object.assign(pending.style, {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2',
    color: cssVar('fgMuted'),
    background: cssVar('win'),
    border: `1px solid ${cssVar('line')}`,
    borderRadius: '6px',
    padding: '2px 8px',
  });
  pending.hidden = true;

  // Control sheet
  const sheet = el('section', 'city-sheet');
  sheet.setAttribute('aria-label', 'Map controls');
  // Title bar = toggle, with a 36×4 --line grab handle on phones (review m1)
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'city-sheet-handle';
  styleButton(handle);
  Object.assign(handle.style, { width: '100%', height: '44px', minHeight: '44px', borderRadius: '10px 10px 0 0', border: '0', background: 'transparent', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const grab = el('span', 'city-sheet-grab');
  grab.setAttribute('aria-hidden', 'true');
  Object.assign(grab.style, { position: 'absolute', top: '6px', left: '50%', width: '36px', height: '4px', marginLeft: '-18px', borderRadius: '2px', background: cssVar('line') });
  const handleText = el('span', 'city-sheet-title');
  handleText.textContent = 'Map controls';
  Object.assign(handleText.style, labelStyle(), { color: cssVar('fgMuted'), paddingTop: '6px' });
  handle.append(grab, handleText);
  const body = el('div', 'city-sheet-body');
  body.id = `city-sheet-body-${Math.random().toString(36).slice(2, 8)}`;
  handle.setAttribute('aria-controls', body.id);
  Object.assign(body.style, { overflow: 'auto', padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' });
  const chips = new Map<CityOverlay, HTMLButtonElement>();
  const lensLabel = el('div', 'city-sheet-label');
  lensLabel.textContent = 'Map lens';
  Object.assign(lensLabel.style, labelStyle(), { width: '100%' });
  const t0Note = el('p', 'city-t0-note');
  t0Note.textContent = 'Map picture · updates daily';
  Object.assign(t0Note.style, { margin: '4px 0', color: cssVar('fgMuted'), width: '100%' });
  t0Note.hidden = true;
  const live: HTMLElement[] = [lensLabel];
  body.append(t0Note, lensLabel);
  for (const o of OVERLAYS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.setAttribute('aria-pressed', 'false');
    chip(b, false);
    b.addEventListener('click', () => opts.onOverlay(o.id));
    chips.set(o.id, b);
    live.push(b);
    body.append(b);
  }
  const viewLabel = lensLabel.cloneNode() as HTMLElement;
  viewLabel.textContent = 'View';
  live.push(viewLabel);
  body.append(viewLabel);
  // 24-grid, 1.5 px stroke glyphs in --fg, 44 px targets (review m3)
  const tool = (paths: string, aria: string, run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', aria);
    b.className = 'city-tool';
    b.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    chip(b, false);
    Object.assign(b.style, { color: cssVar('fg'), width: '44px', height: '44px', padding: '0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px' });
    b.addEventListener('click', run);
    live.push(b);
    body.append(b);
  };
  tool('<path d="M4 10a8 8 0 1 1 2 7"/><path d="M4 4v6h6"/>', 'Rotate left', () => opts.onRotate(-1));
  tool('<path d="M20 10a8 8 0 1 0-2 7"/><path d="M20 4v6h-6"/>', 'Rotate right', () => opts.onRotate(1));
  tool('<path d="M12 5v14M5 12h14"/>', 'Zoom in', () => opts.onZoom(1.25));
  tool('<path d="M5 12h14"/>', 'Zoom out', () => opts.onZoom(0.8));
  sheet.append(handle, body);

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    body.hidden = !v;
    body.style.display = v ? 'flex' : 'none'; // inline display would otherwise beat [hidden]
    handle.setAttribute('aria-expanded', String(v));
  };
  handle.addEventListener('click', () => setOpen(!open));

  const menu = el('div', 'city-menu');
  menu.setAttribute('role', 'menu');
  Object.assign(menu.style, {
    position: 'absolute',
    zIndex: '4',
    background: cssVar('win'),
    border: `1px solid ${cssVar('line')}`,
    borderRadius: '8px',
    padding: '4px',
    minWidth: '160px',
  });
  menu.hidden = true;

  root.append(stage, labels, tableButton, pending, sheet, menu, tableHost);
  opts.container.append(root);

  let phone: boolean | null = null;
  const layout = () => {
    const w = root.clientWidth, h = root.clientHeight;
    const isPhone = w <= PHONE_MAX_WIDTH;
    if (isPhone !== phone) {
      phone = isPhone;
      setOpen(!isPhone); // phone: collapsed on mount
    }
    Object.assign(sheet.style, {
      position: 'absolute',
      zIndex: '2',
      background: cssVar('win'),
      border: `1px solid ${cssVar('line')}`,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      ...(isPhone
        ? { left: '0', right: '0', bottom: '0', top: '', width: 'auto', borderRadius: '10px 10px 0 0', maxHeight: `${Math.floor(h * SHEET_MAX_FRACTION)}px` }
        : { right: '8px', top: '8px', left: '', bottom: '', width: '240px', borderRadius: '10px', maxHeight: `${Math.floor(h - 16)}px` }),
    });
  };

  return {
    root,
    stage,
    labels,
    tableHost,
    tableButton,
    sheet,
    setTierStyle(t0) {
      // T0: no lenses or camera tools on a static picture (review M7)
      t0Note.hidden = !t0;
      for (const e of live) e.style.display = t0 ? 'none' : '';
      styleButton(tableButton, t0); // T0: the one accent button, and larger
      Object.assign(tableButton.style, t0
        ? { position: 'absolute', top: '', left: '50%', bottom: '64px', transform: 'translateX(-50%)', zIndex: '2', fontSize: '15px', padding: '0 20px' }
        : { position: 'absolute', top: '8px', left: '8px', bottom: '', transform: '', zIndex: '2' });
    },
    setPending(text) {
      pending.hidden = text === null;
      pending.textContent = text ?? '';
    },
    setOverlay(o) {
      for (const [id, b] of chips) {
        chip(b, id === o);
        b.setAttribute('aria-pressed', String(id === o));
      }
    },
    showMenu(x, y, title, items) {
      menu.replaceChildren();
      const t = el('div', 'city-menu-title');
      t.textContent = title;
      Object.assign(t.style, { color: cssVar('fgMuted'), padding: '4px 8px' });
      menu.append(t);
      for (const it of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.textContent = it.label;
        chip(b, false);
        Object.assign(b.style, { display: 'block', width: '100%', textAlign: 'left' });
        b.addEventListener('click', () => {
          menu.hidden = true;
          it.run();
        });
        menu.append(b);
      }
      menu.hidden = false;
      const w = root.clientWidth, h = root.clientHeight;
      menu.style.left = `${Math.min(Math.max(4, x), w - 170)}px`;
      menu.style.top = `${Math.min(Math.max(4, y), h - 40 - items.length * 44)}px`;
      (menu.querySelector('[role=menuitem]') as HTMLButtonElement | null)?.focus();
    },
    hideMenu() {
      menu.hidden = true;
    },
    layout,
    dispose() {
      root.remove();
    },
  };
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Label style (17 §3.3.2): 10.5 px, 500, uppercase, 0.14em, --fg-faint. */
function labelStyle(): Partial<CSSStyleDeclaration> {
  return { font: `500 ${sizeVar('label')}/14px ${fontVar('ui')}`, letterSpacing: '0.14em', textTransform: 'uppercase', color: cssVar('fgFaint') };
}

/** Chips use --fg-muted/--line; the active chip uses --win2 + --fg (spec §7.3). */
function chip(b: HTMLButtonElement, active: boolean): void {
  Object.assign(b.style, {
    background: active ? cssVar('win2') : 'transparent',
    color: active ? cssVar('fg') : cssVar('fgMuted'),
    border: `1px solid ${cssVar('line')}`,
    borderRadius: '999px',
    padding: '0 10px',
    minHeight: '44px',
    minWidth: '44px',
    font: 'inherit',
    cursor: 'pointer',
  });
}
