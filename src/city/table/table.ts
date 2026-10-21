import type { PickResult } from '../index';
import type { CitySnapshot } from '../data/types';
import { cssVar, fontVar, sizeVar } from '../art/tokens';
import { KIND_LABEL, matches, rowPick, tableRows, type QuoteBp, type TableRow } from './rows';
import { moneyText, pnl } from './format';

export interface TableView {
  readonly root: HTMLElement;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  update(s: CitySnapshot | null, mine: ReadonlySet<string>): void;
  rows(): TableRow[];
  dispose(): void;
}

/** Below this container width the table becomes a two-line list (M5) [P]. */
export const LIST_BREAKPOINT_PX = 560;

const CSS = `
.city-table { position:absolute; inset:0; overflow:auto; box-sizing:border-box; padding:12px; z-index:3;
  background:${cssVar('bg0')}; color:${cssVar('fg')}; font:${sizeVar('body')}/20px ${fontVar('ui')}; container-type:inline-size; }
.city-table .bar { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.city-table .bar label, .city-table th, .city-table caption { font:500 ${sizeVar('label')}/14px ${fontVar('ui')}; letter-spacing:.14em; text-transform:uppercase; color:${cssVar('fgFaint')}; }
.city-table input { flex:1; min-width:0; min-height:44px; box-sizing:border-box; background:${cssVar('win')}; color:${cssVar('fg')};
  border:1px solid ${cssVar('line')}; border-radius:6px; padding:0 10px; font:inherit; }
.city-table table { width:100%; border-collapse:collapse; }
.city-table caption { text-align:left; padding:4px 0 8px; }
.city-table th { text-align:left; padding:6px; font-weight:500; white-space:nowrap; }
.city-table td { padding:4px 6px; border-top:1px solid ${cssVar('line')}; vertical-align:middle; }
.city-table .num { text-align:right; font-family:${fontVar('num')}; font-feature-settings:"tnum"; font-variant-numeric:tabular-nums; white-space:nowrap; }
.city-table .muted { color:${cssVar('fgMuted')}; }
.city-table .gain { color:${cssVar('gain')}; } .city-table .loss { color:${cssVar('loss')}; } .city-table .none { color:${cssVar('fgMuted')}; }
.city-table .name { background:none; border:0; color:${cssVar('fg')}; font:inherit; padding:0; min-height:44px; cursor:pointer; text-align:left; }
.city-table .chip { display:inline-block; padding:0 8px; border:1px solid ${cssVar('line')}; border-radius:999px; font:500 ${sizeVar('label')}/18px ${fontVar('ui')}; color:${cssVar('fgMuted')}; }
.city-table .line2 { display:none; }
@container (max-width: ${LIST_BREAKPOINT_PX - 1}px) {
  .city-table thead, .city-table .wide { display:none; }
  .city-table tr { display:grid; grid-template-columns:minmax(0,1fr) auto; column-gap:12px; border-top:1px solid ${cssVar('line')}; padding:4px 0; }
  .city-table td { border:0; padding:0 2px; }
  .city-table td.cell-name { grid-column:1; overflow-wrap:anywhere; }
  .city-table td.cell-value { grid-column:2; align-self:center; }
  .city-table .line2 { display:block; grid-column:1 / -1; color:${cssVar('fgMuted')}; font-size:${sizeVar('small')}; padding-bottom:4px; }
  .city-table .name { min-height:32px; }
}`;

/** "View as table" (CTY-05, 17 §3.16): an accessible, searchable list of everything on the map. */
export function createTableView(opts: {
  host: HTMLElement;
  /** Screen anchor for a row, so a row pick equals the map pick. */
  anchor: (entityId: string) => { x: number; y: number };
  onPick: (p: PickResult) => void;
  onClose: () => void;
  quote?: (companyId: string) => QuoteBp;
}): TableView {
  const root = document.createElement('section');
  root.className = 'city-table';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'City as a table');
  root.hidden = true;
  const style = document.createElement('style');
  style.textContent = CSS;

  const header = document.createElement('div');
  header.className = 'bar';
  const label = document.createElement('label');
  label.textContent = 'Search the city';
  label.htmlFor = 'city-table-search';
  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'city-table-search';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Back to map';
  styleButton(closeBtn);
  closeBtn.addEventListener('click', () => opts.onClose());
  header.append(label, search, closeBtn);

  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = 'Companies, my places, districts, listings, crown towers and landmarks';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const cols: [string, boolean][] = [['Name', false], ['Kind', false], ['District', false], ['Rent /m² · day', true], ['Today', true], ['Mine', false]];
  for (const [h, num] of cols) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    if (num) th.style.textAlign = 'right';
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  table.append(caption, thead, tbody);
  root.append(style, header, table);
  opts.host.append(root);

  const td = (cls: string, text = '') => {
    const c = document.createElement('td');
    c.className = cls;
    c.textContent = text;
    return c;
  };

  let rows: TableRow[] = [];
  const render = () => {
    tbody.replaceChildren();
    const q = search.value;
    for (const row of rows) {
      if (!matches(row, q)) continue;
      const tr = document.createElement('tr');
      const nameTd = td('cell-name');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'name';
      btn.textContent = row.name;
      btn.dataset.entityId = row.entityId;
      btn.addEventListener('click', () => opts.onPick(rowPick(row, opts.anchor(row.entityId))));
      nameTd.append(btn);
      if (row.mine) {
        const chip = document.createElement('span');
        chip.className = 'chip line2-chip';
        chip.textContent = 'Mine';
        chip.style.marginLeft = '8px';
        nameTd.append(chip);
      }
      const rent = row.rent ? moneyText(row.rent.amount, row.rent.ccy) : '';
      const today = row.today ? pnl(row.today.bp) : null;
      const todayTd = td(`num wide ${today?.tone ?? ''}`, today?.text ?? '');
      // narrow layout: one right-aligned value next to the name
      const valueTd = td(`num cell-value line-value ${today?.tone ?? ''}`, today?.text ?? rent);
      valueTd.style.display = 'none';
      valueTd.dataset.narrow = '1';
      const line2 = td('line2', `${KIND_LABEL[row.kind]} · ${row.district}`);
      tr.append(nameTd, td('wide', KIND_LABEL[row.kind]), td('wide', row.district), td('num wide', rent), todayTd, td('wide', row.mine ? 'Yes' : ''), valueTd, line2);
      tbody.append(tr);
    }
    syncNarrow();
  };
  // the value cell is the only narrow-only cell; toggle it from the container width
  let narrow = false;
  const syncNarrow = () => {
    for (const el of tbody.querySelectorAll<HTMLElement>('[data-narrow]')) el.style.display = narrow ? '' : 'none';
  };
  const ro = new ResizeObserver(() => {
    const n = root.clientWidth < LIST_BREAKPOINT_PX;
    if (n !== narrow) {
      narrow = n;
      syncNarrow();
    }
  });
  ro.observe(root);
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
      narrow = root.clientWidth < LIST_BREAKPOINT_PX;
      render();
      search.focus();
    },
    close() {
      isOpen = false;
      root.hidden = true;
    },
    update(s, mine) {
      rows = s ? tableRows(s, mine, opts.quote) : [];
      if (isOpen) render();
    },
    rows: () => rows,
    dispose() {
      ro.disconnect();
      root.remove();
    },
  };
}

/** Secondary button (`--win2`, `--line`) or the one accent button. */
export function styleButton(b: HTMLButtonElement, accent = false): void {
  Object.assign(b.style, {
    background: accent ? cssVar('acc') : cssVar('win2'),
    color: accent ? cssVar('bg0') : cssVar('fg'),
    border: `1px solid ${accent ? cssVar('acc') : cssVar('line')}`,
    borderRadius: '10px',
    padding: '0 14px',
    minHeight: '44px',
    font: `500 ${sizeVar('small')}/1 ${fontVar('ui')}`,
    cursor: 'pointer',
  });
}
