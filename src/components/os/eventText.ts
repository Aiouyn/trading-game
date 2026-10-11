// The words for a world event, in the viewer's language (en.json / fr.json). Pure apart from `t`. The engine sends the English
// headline for the log, and the i18n key for the same line; the app shows the key. An announced major has neither a kind nor
// a headline before its onset, so it reads as a generic market event.
import { t } from '@/i18n';
import type { WorldEventFrame } from '@/world/view';

/** The kind's name, or the generic market event for an announced major (its kind is not shown before the onset). */
export function kindLabel(kind: WorldEventFrame['kind']): string {
  return kind ? t(`event.kind.${kind}`) : t('event.kind.unknown');
}

/** The headline in the viewer's language; the generic line when the headline is hidden (an announced major). */
export function headlineText(ev: Pick<WorldEventFrame, 'headline' | 'headlineKey'>): string {
  if (ev.headlineKey) return t(ev.headlineKey);
  return ev.headline ?? t('event.panel.hidden');
}

/** The dot colour of the banner: the kind's colour, or the warning colour for an announced major (no kind yet). */
export function kindDot(kind: WorldEventFrame['kind']): string {
  switch (kind) {
    case 'crash': return 'bg-loss';
    case 'bubble': return 'bg-gain';
    case 'crisis': return 'bg-warn';
    case 'flash': return 'bg-info';
    default: return 'bg-warn';
  }
}
