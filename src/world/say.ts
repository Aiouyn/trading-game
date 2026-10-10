import type { Msg } from '@/i18n';
import { notify } from './core';
import { textProvider } from './text';
import type { InboxItem, GameState, StepOutput } from './types';

/**
 * A private line to a player's inbox made from a message descriptor: the English text is kept for old clients and logs,
 * and the descriptor lets the viewer's language render it (the rule for every new line in Phase 3).
 */
export function say(g: GameState, out: StepOutput | null, pid: string, kind: InboxItem['kind'], tone: InboxItem['tone'], msg: Msg): void {
  notify(g, out, pid, { kind, tone, text: textProvider.render(msg, 'en'), msg });
}
