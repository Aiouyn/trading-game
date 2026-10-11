import type { Msg } from '@/i18n';

/**
 * The Wire's tags. The engine stores each tag as its English label (WireItem.tag, kept for the log and old clients); the client
 * renders the label in the viewer's language through `wire.tag.<slug>` in en.json and fr.json. An asset's ticker, or a tag the
 * list does not hold, shows as it is.
 */
export const WIRE_TAGS: readonly string[] = [
  'Achievement', 'Alliance', 'Bankruptcy', 'Central bank', 'Chapter', 'Close', 'Court', 'Crash', 'Deal', 'Earnings', 'Economy',
  'Filing', 'Halt', 'IPO', 'Index', 'Margin', 'Markets', 'Milestone', 'Move', 'Preview', 'Property', 'Reopen', 'Security',
  'Spin-off', 'Squeeze', 'Takeover', 'Verdict', 'Whisper', 'Bubble', 'Crisis week', 'Flash crash', 'Inflation', 'Jobs',
  'Auction', 'Liquidation', 'Launchpad', 'Rumor', 'Sponsored',
];

/** The key of a Wire tag's label ("Central bank" is wire.tag.central-bank). */
export function wireTagKey(tag: string): string {
  return `wire.tag.${tag.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** The descriptor of a Wire tag's label, or undefined when the tag is not a known label (the caller shows the tag itself). */
export function wireTagMsg(tag: string): Msg | undefined {
  return WIRE_TAGS.includes(tag) ? { key: wireTagKey(tag) } : undefined;
}
