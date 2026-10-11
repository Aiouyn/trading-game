import type { Msg } from '@/i18n';
import { textProvider } from '../text';
import { normalizeName, type NameRefusal } from './moderate';

/** The refusal codes a name or ticker check gives, with the list that refused it (moderate.ts keeps the rules). */
const MODERATED: Record<string, NameRefusal> = {
  nameAbuse: 'abuse', nameCrypto: 'crypto', nameBrand: 'brand', nameFigure: 'figure', nameTaken: 'taken', tickerCrypto: 'crypto',
};

/**
 * The moderator's line for a refused name or ticker (Phase 7, P7-1): the first of the three refusal parts, from the moderator role
 * (text/roles.ts moderatorMsg), so the world and the Create form say the same thing in the viewer's language. Null for a code the
 * moderator does not decide.
 */
export function moderatorLine(code: string, subject: string | undefined): Msg | null {
  const reason = MODERATED[code];
  if (!reason || !subject) return null;
  return textProvider.moderator({ id: `${reason}:${normalizeName(subject).joined}`, reason, name: subject });
}
