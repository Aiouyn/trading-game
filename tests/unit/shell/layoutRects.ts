// Expected named-layout rects at 1440×900 after minimum-size clamping (S1-10, PR #2 answer 2).
// Work area: x 8, y 42, w 1424, h 798 (strip 34, shelf 52, gutter 8).
export const LAYOUT_RECTS_1440: Record<string, [string, number, number, number, number][]> = {
  trade: [["broker", 8, 42, 896, 798], ["wire", 912, 42, 520, 395], ["portfolio", 912, 445, 520, 395]],
  review: [["portfolio", 8, 42, 708, 798], ["portfolio", 724, 42, 708, 798]],
  research: [["research", 8, 42, 896, 798], ["broker", 912, 42, 520, 420], ["wire", 912, 470, 520, 370]],
  operator: [["businesses", 8, 42, 708, 798], ["city", 724, 42, 708, 400], ["property", 724, 450, 708, 390]],
  shadow: [["security", 8, 42, 708, 798], ["ailab", 724, 42, 708, 798]],
  institution: [["institutions", 8, 42, 947, 798], ["messages", 963, 42, 469, 395], ["markets", 963, 445, 469, 395]],
};
