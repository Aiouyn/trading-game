'use client';

/**
 * The object properties panel (R-10-5): the selected drawing's colour, width, line style and text, its lock and its delete. Each
 * change is one undo step. A position tool shows its risk panel instead (PositionPanel), which also carries the place-the-order
 * action.
 */
import type { ChartDrawing, DrawingColor, LineStyle } from '@/world/drawings';
import { DRAWING_COLORS, LINE_STYLES } from '@/world/drawings';
import { t } from '@/i18n';
import { useDrawings } from './drawingStore';
import { PositionPanel } from './PositionPanel';

/** The text colour each swatch shows (the same tokens the shapes take). */
export const SWATCH: Record<DrawingColor, string> = {
  brass: 'text-brass', info: 'text-info', gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', steel: 'text-steel', line: 'text-fg',
};

/** The selected drawing's panel, or nothing when no drawing is selected (or a drawing tool is in hand). */
export function DrawingPanel({ assetId, onPlaced, orders = true }: { assetId: string; onPlaced?: () => void; /** a curve token has no broker book until it graduates */ orders?: boolean }) {
  const selected = useDrawings((s) => s.selected);
  const tool = useDrawings((s) => s.tool);
  const list = useDrawings((s) => s.byAsset[assetId]) ?? [];
  const d = selected ? list.find((x) => x.id === selected) : undefined;
  if (!d || tool !== 'cursor' && tool !== 'cross') return null;
  const edit = (patch: Partial<ChartDrawing>) => {
    const st = useDrawings.getState();
    st.commit(assetId, (st.byAsset[assetId] ?? []).map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
  };
  const remove = () => {
    const st = useDrawings.getState();
    st.commit(assetId, (st.byAsset[assetId] ?? []).filter((x) => x.id !== d.id));
    st.select(null);
  };
  const isPosition = d.kind === 'long' || d.kind === 'short';
  return (
    <div
      className={`pointer-events-auto absolute z-[7] max-h-[calc(100%-1rem)] overflow-y-auto rounded-md border border-ink-3 bg-ink-1/95 p-2 text-small shadow-lg ${isPosition ? 'bottom-2 left-2 w-60' : 'left-2 top-2 w-56'}`}
      data-testid="drawing-panel" role="dialog" aria-label={t('broker.props.title')}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-micro uppercase tracking-wide text-fg-faint">{t(`broker.tool.${d.kind}`)}</span>
        <button type="button" onClick={() => useDrawings.getState().select(null)} className="px-1 text-fg-faint hover:text-fg" aria-label={t('common.close')}>×</button>
      </div>
      {isPosition && orders ? (
        <PositionPanel assetId={assetId} drawing={d} onPlaced={onPlaced} />
      ) : isPosition ? (
        <p className="mb-2 text-caption text-fg-muted" data-testid="lp-position-note">{t('lp.chart.positionNote')}</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1" role="radiogroup" aria-label={t('broker.props.color')}>
            {DRAWING_COLORS.map((c) => (
              <button
                key={c} type="button" role="radio" aria-checked={(d.color ?? 'brass') === c} aria-label={t(`broker.props.color.${c}`)}
                data-testid={`prop-color-${c}`} onClick={() => edit({ color: c })}
                className={`flex h-6 w-6 items-center justify-center rounded-sm ${SWATCH[c]} ${(d.color ?? 'brass') === c ? 'ring-1 ring-brass' : 'hover:bg-ink-2'}`}
              >
                <span className="block h-3 w-3 rounded-full bg-current" />
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-1" role="radiogroup" aria-label={t('broker.props.width')}>
            {([1, 2, 3, 4] as const).map((w) => (
              <button
                key={w} type="button" role="radio" aria-checked={(d.width ?? 2) === w} data-testid={`prop-width-${w}`} onClick={() => edit({ width: w })}
                className={`h-6 min-w-[1.75rem] rounded-sm border px-1 text-micro ${(d.width ?? 2) === w ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-1" role="radiogroup" aria-label={t('broker.props.style')}>
            {LINE_STYLES.map((s: LineStyle) => (
              <button
                key={s} type="button" role="radio" aria-checked={(d.style ?? 'solid') === s} data-testid={`prop-style-${s}`} onClick={() => edit({ style: s })}
                className={`h-6 flex-1 rounded-sm border px-1 text-micro ${(d.style ?? 'solid') === s ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
              >
                {t(`broker.props.style.${s}`)}
              </button>
            ))}
          </div>
          {d.kind === 'text' && (
            <label className="mb-2 block text-micro text-fg-faint">
              {t('broker.props.text')}
              <input
                data-testid="prop-text" maxLength={80} defaultValue={d.text ?? ''} key={d.id}
                onBlur={(e) => { if (e.target.value !== (d.text ?? '')) edit({ text: e.target.value }); }}
                className="mt-0.5 w-full rounded-sm border border-ink-3 bg-ink-0 px-2 py-1 text-small text-fg"
              />
            </label>
          )}
        </>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-ink-3 pt-2">
        <label className="flex items-center gap-1.5 text-micro text-fg-muted">
          <input type="checkbox" checked={!!d.locked} onChange={(e) => edit({ locked: e.target.checked })} data-testid="prop-lock" />
          {t('broker.tool.lock')}
        </label>
        <button type="button" onClick={remove} data-testid="prop-delete" className="rounded-sm border border-loss/50 px-2 py-0.5 text-micro text-loss hover:bg-loss/10">
          {t('broker.props.delete')}
        </button>
      </div>
    </div>
  );
}
