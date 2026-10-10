'use client';

import type { WireItem } from '@/world/types';

/** Tone colours for the Wire, the inbox, the bell panel and the notices (the Quay chrome reads the same tones). */
export const TONE_TEXT: Record<WireItem['tone'], string> = {
  gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', info: 'text-info', brass: 'text-brass',
};
export const TONE_BAR: Record<WireItem['tone'], string> = {
  gain: 'bg-gain', loss: 'bg-loss', warn: 'bg-warn', info: 'bg-info', brass: 'bg-brass',
};
