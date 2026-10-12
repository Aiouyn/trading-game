import { sectorName } from '@/engine';
import { hasKey, t } from '@/i18n';

/**
 * A market sector's name in the viewer's language: `sector.<id>` in the dictionaries (en and fr), else the engine's own
 * name. The English keys carry the engine's names, so English reads as it did before.
 */
export function sectorLabel(id: string): string {
  const key = `sector.${id}`;
  return hasKey(key) ? t(key) : sectorName(id);
}

/**
 * A business sector's name in the viewer's language: `biz.sectorName.<id>` (`biz.sector.<id>` is its blurb), else the name
 * the content carries (the English the businesses table was written in).
 */
export function bizSectorLabel(id: string, fallback: string): string {
  const key = `biz.sectorName.${id}`;
  return hasKey(key) ? t(key) : fallback;
}
