import type { Locale } from '@/i18n';
import type { TextOverlayMap } from '@/net/protocol';

/**
 * The model line for a wire item in a language, or null when the text slot wrote none (the caller shows the template).
 * Presentation only: the overlay is never part of the world state (lead-phase7.md P7-2).
 */
export function overlayText(map: TextOverlayMap, id: string, locale: Locale): string | null {
  const line = map[id];
  const text = line?.[locale];
  return typeof text === 'string' && text.trim() !== '' ? text : null;
}
