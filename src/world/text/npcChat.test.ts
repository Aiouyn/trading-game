import { describe, expect, it } from 'vitest';
import { translate } from '@/i18n';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { NPCS } from '@/content/progression';
import { CHATTER, npcChatKey, npcChatMsg } from './npcChat';

const enDict = en as Record<string, string>;
const frDict = fr as Record<string, string>;

describe('NPC chatter and bios (P8-4)', () => {
  it('every engine chat line has its key in both locales, with the English template in en.json', () => {
    for (const [style, lines] of Object.entries(CHATTER)) {
      lines.forEach((line, i) => {
        const k = npcChatKey(style as keyof typeof CHATTER, i);
        expect(enDict[k], k).toBe(line);
        expect(frDict[k], k).toBeTruthy();
      });
    }
  });

  it('a stored NPC line maps back to its key, and the English screen shows the stored text', () => {
    for (const [style, lines] of Object.entries(CHATTER)) {
      lines.forEach((line, i) => {
        const stored = line.replace('{a}', 'GX');
        const msg = npcChatMsg(stored);
        expect(msg?.key, stored).toBe(npcChatKey(style as keyof typeof CHATTER, i));
        expect(translate('en', msg!.key, msg!.vars)).toBe(stored);
      });
    }
  });

  it('player text that is not an engine line is left alone', () => {
    expect(npcChatMsg('hello there')).toBeUndefined();
    expect(npcChatMsg('Patience pays. Mostly. Really.')).toBeUndefined();
  });

  it('every NPC bio has a French key, and the English key is the bio the engine stores', () => {
    for (const n of NPCS) {
      const k = `npc.bio.${n.id}`;
      expect(enDict[k], k).toBe(n.bio);
      expect(frDict[k], k).toBeTruthy();
    }
  });
});
