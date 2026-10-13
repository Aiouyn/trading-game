'use client';

/**
 * The drawing toolbar on the chart's left edge (R-10-5). The tools sit in flyout groups, as TradingView groups them: a group's
 * button shows the tool last used from it, and its caret opens the group. Below the tools: the magnet, lock, hide all, delete
 * all, and undo and redo. Keys: the shortcut of each tool is shown in its tooltip (Alt+T, Alt+H, and so on).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { useDrawings, type Tool } from './drawingStore';

/** The groups in toolbar order: the tools of each (the first is its default), and the shortcut that picks each. */
const GROUPS: { id: string; tools: Tool[] }[] = [
  { id: 'cursor', tools: ['cursor', 'cross'] },
  { id: 'lines', tools: ['trend', 'ray', 'extended', 'hline', 'hray', 'vline', 'channel'] },
  { id: 'shapes', tools: ['rect', 'ellipse'] },
  { id: 'fib', tools: ['fib'] },
  { id: 'measure', tools: ['pricerange', 'daterange', 'datepricerange'] },
  { id: 'position', tools: ['long', 'short'] },
  { id: 'notes', tools: ['text', 'arrow', 'brush'] },
];

/** The keyboard shortcuts of the tools (TradingView's), by tool. */
export const SHORTCUTS: Partial<Record<Tool, string>> = {
  trend: 'Alt+T', hline: 'Alt+H', fib: 'Alt+F', long: 'Alt+L', short: 'Alt+S', vline: 'Alt+V', cursor: 'Esc',
};

/** A small glyph per tool, drawn in the toolbar's 18-pixel box. */
function Glyph({ tool }: { tool: Tool }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const g: Record<Tool, ReactNode> = {
    cursor: <path {...s} d="M5 3l10 6-4.5 1.2L8.5 15z" />,
    cross: <><path {...s} d="M9 2v14M2 9h14" /></>,
    trend: <path {...s} d="M3 14L15 4" />,
    ray: <path {...s} d="M3 13L15 5M3 13h0" />,
    extended: <path {...s} d="M1 12L17 6" />,
    hline: <path {...s} d="M2 9h14" />,
    hray: <><path {...s} d="M4 9h12" /><circle cx={4} cy={9} r={1.5} fill="currentColor" /></>,
    vline: <path {...s} d="M9 2v14" />,
    channel: <><path {...s} d="M3 13L15 6M3 8L15 1" /></>,
    rect: <rect {...s} x={3} y={5} width={12} height={8} />,
    ellipse: <ellipse {...s} cx={9} cy={9} rx={7} ry={5} />,
    fib: <><path {...s} d="M3 3h12M3 7h12M3 11h12M3 15h12" strokeDasharray="2 2" /></>,
    pricerange: <><path {...s} d="M4 3v12M14 3v12M4 6h10M4 12h10" /></>,
    daterange: <><path {...s} d="M3 4v10M15 4v10M3 9h12" /></>,
    datepricerange: <rect {...s} x={3} y={4} width={12} height={10} />,
    long: <><path {...s} d="M3 11h12" /><path {...s} d="M3 11L15 4M3 11L15 15" strokeWidth={1} /></>,
    short: <><path {...s} d="M3 7h12" /><path {...s} d="M3 7L15 14M3 7L15 3" strokeWidth={1} /></>,
    text: <path {...s} d="M4 4h10M9 4v10M6.5 14h5" />,
    arrow: <path {...s} d="M3 14L14 4M14 4l-5 0M14 4l0 5" />,
    brush: <path {...s} d="M3 12c2-5 4-5 5-2s3 3 4-1 2-3 3-2" />,
  };
  return <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>{g[tool]}</svg>;
}

/** The label of a tool, in the reader's language. */
export function toolLabel(tool: Tool): string {
  return t(`broker.tool.${tool}`);
}

/** The toolbar: the groups with their flyouts, then the switches and the history. */
export function DrawingToolbar({ onDeleteAll, onUndo, onRedo, canUndo, canRedo }: {
  onDeleteAll: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  const tool = useDrawings((s) => s.tool);
  const setTool = useDrawings((s) => s.setTool);
  const magnet = useDrawings((s) => s.magnet);
  const setMagnet = useDrawings((s) => s.setMagnet);
  const locked = useDrawings((s) => s.locked);
  const setLocked = useDrawings((s) => s.setLocked);
  const hidden = useDrawings((s) => s.hidden);
  const setHidden = useDrawings((s) => s.setHidden);
  // the tool each group last used: its button shows that one
  const [last, setLast] = useState<Record<string, Tool>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const bar = useRef<HTMLDivElement>(null);
  const flyout = useRef<HTMLUListElement>(null);

  // a press outside the toolbar closes the open flyout (the press still reaches its target)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node) && !flyout.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (g: { id: string }, tl: Tool) => {
    setLast((m) => ({ ...m, [g.id]: tl }));
    setTool(tl);
    setOpen(null);
  };

  const shown = (g: { id: string; tools: Tool[] }): Tool => last[g.id] ?? g.tools[0]!;
  const active = (g: { tools: Tool[] }) => g.tools.includes(tool);

  const utility = (key: string, label: string, pressed: boolean | undefined, onClick: () => void, disabled = false, testId?: string, glyph?: ReactNode) => (
    <button
      key={key} type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
      data-testid={testId ?? `tool-${key}`}
      className={`flex h-7 w-7 items-center justify-center rounded-sm ${pressed ? 'bg-brass/15 text-brass-hi' : 'text-fg-muted hover:bg-ink-2 hover:text-fg'} disabled:opacity-40`}
    >
      {glyph}
    </button>
  );

  return (
    <div ref={bar} className="flex w-9 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-3 bg-ink-1 py-1" data-testid="drawing-toolbar" role="toolbar" aria-label={t('broker.tool.bar')}>
      {GROUPS.map((g) => {
        const current = shown(g);
        const isActive = active(g);
        return (
          <div key={g.id} className="relative">
            <button
              type="button" aria-label={toolLabel(current)} title={`${toolLabel(current)}${SHORTCUTS[current] ? ` (${SHORTCUTS[current]})` : ''}`}
              aria-pressed={isActive} data-testid={`tool-group-${g.id}`}
              onClick={() => pick(g, current)}
              className={`relative flex h-7 w-7 items-center justify-center rounded-sm ${isActive ? 'bg-brass/15 text-brass-hi' : 'text-fg-muted hover:bg-ink-2 hover:text-fg'}`}
            >
              <Glyph tool={current} />
              {g.tools.length > 1 && (
                <span
                  role="button" tabIndex={-1} aria-label={t('broker.tool.more')} data-testid={`tool-more-${g.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (open === g.id) { setOpen(null); return; }
                    const r = e.currentTarget.parentElement!.getBoundingClientRect();
                    setAt({ top: r.top, left: r.right + 4 });
                    setOpen(g.id);
                  }}
                  className="absolute bottom-0 right-0 flex h-3 w-3 items-end justify-end text-fg-faint"
                >
                  <svg width={6} height={6} viewBox="0 0 6 6" aria-hidden><path d="M6 0v6H0z" fill="currentColor" /></svg>
                </span>
              )}
            </button>
            {open === g.id && (
              <ul ref={flyout} role="menu" aria-label={t(`broker.tool.group.${g.id}`)} data-testid={`tool-flyout-${g.id}`} style={{ top: at.top, left: at.left }} className="fixed z-[8] w-44 rounded-md border border-ink-3 bg-ink-1 p-1 shadow-lg">
                {g.tools.map((tl) => (
                  <li key={tl} role="none">
                    <button
                      type="button" role="menuitem" data-testid={`tool-${tl}`} onClick={() => pick(g, tl)}
                      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-small ${tool === tl ? 'bg-brass/15 text-brass-hi' : 'text-fg-muted hover:bg-ink-2 hover:text-fg'}`}
                    >
                      <Glyph tool={tl} />
                      <span className="flex-1">{toolLabel(tl)}</span>
                      {SHORTCUTS[tl] && <span className="num text-micro text-fg-faint">{SHORTCUTS[tl]}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <div className="my-1 h-px w-6 bg-ink-3" />
      {utility('magnet', t('broker.tool.magnet'), magnet, () => setMagnet(!magnet), false, undefined, <MagnetGlyph />)}
      {utility('lock', t('broker.tool.lock'), locked, () => setLocked(!locked), false, undefined, <LockIcon />)}
      {utility('hide', t('broker.tool.hide'), hidden, () => setHidden(!hidden), false, undefined, <EyeIcon />)}
      {utility('delete', t('broker.tool.deleteAll'), undefined, onDeleteAll, false, undefined, <TrashIcon />)}
      <div className="my-1 h-px w-6 bg-ink-3" />
      {utility('undo', t('broker.tool.undo'), undefined, onUndo, !canUndo, undefined, <UndoIcon />)}
      {utility('redo', t('broker.tool.redo'), undefined, onRedo, !canRedo, undefined, <RedoIcon />)}
    </div>
  );
}

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function MagnetGlyph() { return <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><path {...ICON} d="M3 2v6a5 5 0 0010 0V2M3 5h3M10 5h3" /></svg>; }
function LockIcon() { return <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><rect {...ICON} x={3} y={7} width={10} height={7} rx={1} /><path {...ICON} d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>; }
function EyeIcon() { return <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><path {...ICON} d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle {...ICON} cx={8} cy={8} r={2} /></svg>; }
function TrashIcon() { return <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><path {...ICON} d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.7 9.5h5.6l.7-9.5" /></svg>; }
function UndoIcon() { return <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><path {...ICON} d="M5 5L2.5 7.5 5 10M3 7.5h7a3.5 3.5 0 010 7H7" /></svg>; }
function RedoIcon() { return <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><path {...ICON} d="M11 5l2.5 2.5L11 10M13 7.5H6a3.5 3.5 0 000 7h3" /></svg>; }
