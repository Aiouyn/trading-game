// M1-07 chart colour parsing (not prices, so outside the G1 price files): the library reads only rgb()/rgba() itself,
// and the volume colours are the computed form of a color-mix() of the candle tokens (chartTheme.ts VOLUME_MIX).

/** `color(srgb r g b / a)` to the library's Rgba: channels 0–1 become 0–255; null = not this form. */
export function parseSrgb(color: string): [number, number, number, number] | null {
  const m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color);
  if (!m) return null;
  const ch = (x: string) => Math.max(0, Math.min(255, Math.round(Number(x) * 255)));
  return [ch(m[1]!), ch(m[2]!), ch(m[3]!), m[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(m[4])))];
}
