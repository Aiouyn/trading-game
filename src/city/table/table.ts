import { signedPct, money } from '@/game/format';
import type { PickResult } from '../index';
import type { CitySnapshot } from '../data/types';
import { cssVar } from '../art/tokens';
import { KIND_LABEL, matches, rowPick, tableRows, type TableRow } from './rows';

export interface TableView {
  readonly root: HTMLElement;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  update(s: CitySnapshot | null, mine: ReadonlySet<string>): void;
  rows(): TableRow[];
  dispose(): void;
}

/** "View as table" (CTY-05, 17 §3.16): an accessible, searchable list of everything on the map. */
export function createTableView(opts: {
  host: HTMLElement;
  /** Screen anchor for a row, so a row pick equals the map pick. */
  anchor: (entityId: string) => { x: number; y: number };
  onPick: (p: PickResult) => void;
  onClose: () => void;
}): TableView {
  const root = document.createElement('section');
  root.className = 'city-table';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'City as a table');
  root.hidden = true;
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'auto',
    background: cssVar('bg0'),
    color: cssVar('fg'),
    padding: '12px',
    boxSizing: 'border-box',
    font: '14px/20px var(--font-inter, system-ui, sans-serif)',
    zIndex: '3',
  } satisfies Partial<CSSStyleDeclaration>);

  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' });
  const label = document.createElement('label');
  label.textContent = 'Search the city';
  label.htmlFor = 'city-table-search';
  label.style.color = cssVar('fgMuted');
  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'city-table-search';
  Object.assign(search.style, {
    flex: '1',
    minWidth: '0',
    background: cssVar('win'),
    color: cssVar('fg'),
    border: `1px solid ${cssVar('line')}`,
    borderRadius: '6px',
    padding: '6px 8px',
    font: 'inherit',
  });
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Back to map';
  styleButton(closeBtn);
  closeBtn.addEventListener('click', () => opts.onClose());
  header.append(label, search, closeBtn);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  const caption = document.createElement('caption');
  caption.textContent = 'Companies, my places, districts, listings, crown towers and landmarks';
  Object.assign(caption.style, { textAlign: 'left', color: cssVar('fgMuted'), padding: '4px 0' });
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of ['Name', 'Kind', 'District', 'Today', 'Mine']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    Object.assign(th.style, { textAlign: 'left', color: cssVar('fgMuted'), fontWeight: '500', padding: '4px 6px' });
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  table.append(caption, thead, tbody);
  root.append(header, table);
  opts.host.append(root);

  let rows: TableRow[] = [];
  const render = () => {
    tbody.replaceChildren();
    const q = search.value;
    for (const row of rows) {
      if (!matches(row, q)) continue;
      const tr = document.createElement('tr');
      tr.style.borderTop = `1px solid ${cssVar('line')}`;
      const nameTd = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = row.name;
      btn.dataset.entityId = row.entityId;
      Object.assign(btn.style, {
        background: 'none',
        border: '0',
        color: cssVar('fg'),
        font: 'inherit',
        padding: '4px 0',
        cursor: 'pointer',
        textAlign: 'left',
      });
      btn.addEventListener('click', () => opts.onPick(rowPick(row, opts.anchor(row.entityId))));
      nameTd.append(btn);
      const today =
        row.dayReturn !== null ? signedPct(row.dayReturn) : row.rent !== null ? `${money(row.rent)} rent` : '';
      const cells = [KIND_LABEL[row.kind], row.district, today, row.mine ? 'Yes' : ''];
      tr.append(nameTd);
      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        td.style.padding = '4px 6px';
        if (i === 2) td.style.fontFamily = 'var(--font-jetbrains-mono, ui-monospace, monospace)';
        tr.append(td);
      });
      tbody.append(tr);
    }
  };
  search.addEventListener('input', render);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') opts.onClose();
  });

  let isOpen = false;
  return {
    root,
    get isOpen() {
      return isOpen;
    },
    open() {
      isOpen = true;
      root.hidden = false;
      render();
      search.focus();
    },
    close() {
      isOpen = false;
      root.hidden = true;
    },
    update(s, mine) {
      rows = s ? tableRows(s, mine) : [];
      if (isOpen) render();
    },
    rows: () => rows,
    dispose() {
      root.remove();
    },
  };
}

export function styleButton(b: HTMLButtonElement, accent = false): void {
  Object.assign(b.style, {
    background: accent ? cssVar('acc') : cssVar('win2'),
    color: accent ? cssVar('bg0') : cssVar('fg'),
    border: `1px solid ${cssVar('line')}`,
    borderRadius: '6px',
    padding: '0 12px',
    minHeight: '44px',
    font: '13px/1 var(--font-inter, system-ui, sans-serif)',
    cursor: 'pointer',
  });
}
