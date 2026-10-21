import { adjust, mixOklab, srgbToOklab, withHue, type Rgb } from './color';
import type { Tokens } from './tokens';

/** Scene colours that are not UI tokens, derived from tokens in OKLab (spec §1, §7, review M1–M3). */
export interface Ramps {
  water: Rgb;
  land: Rgb;
  park: Rgb;
  road: Rgb;
  facades: [Rgb, Rgb, Rgb, Rgb];
  /** roof tint (--win2-derived), lit-face key tint, shadow-face tint (--win) */
  top: Rgb;
  shadow: Rgb;
  litWindow: Rgb;
  darkWindow: Rgb;
  keyLight: Rgb; // warm dusk key from the west, --acc-lo at low strength
  fillLight: Rgb; // cool fill, --info at ~10 %
  brass: Rgb; // --acc: lit face of brass parts
  brassHi: Rgb; // --acc-hi: top
  brassLo: Rgb; // --acc-lo: shadow face
  gain: Rgb;
  loss: Rgb;
  label: Rgb;
  labelHalo: Rgb;
  districtHues: Rgb[];
}

const lightness = (c: Rgb) => srgbToOklab(c)[0];

export function buildRamps(t: Tokens): Ramps {
  const land = mixOklab(t.win, t.win2, 0.4);
  // water: --bg0 mixed 15 % with --info, then held at --bg0's lightness so it stays the darkest
  const tinted = mixOklab(t.bg0, t.info, 0.15);
  const water = adjust(tinted, lightness(t.bg0) / lightness(tinted), 1);
  return {
    water,
    land,
    park: mixOklab(land, t.gain, 0.07),
    road: t.line,
    facades: [
      mixOklab(t.win2, t.fgMuted, 0.2),
      mixOklab(t.win2, t.fgMuted, 0.27),
      mixOklab(t.line, t.fgMuted, 0.3),
      mixOklab(t.line, t.fg, 0.24),
    ],
    top: mixOklab(t.win2, t.fgMuted, 0.48),
    shadow: t.win,
    litWindow: mixOklab(t.fg, t.accHi, 0.2),
    darkWindow: mixOklab(t.bg0, t.win, 0.5),
    keyLight: t.accLo,
    fillLight: t.info,
    brass: t.acc,
    brassHi: t.accHi,
    brassLo: t.accLo,
    gain: t.gain,
    loss: t.loss,
    label: t.fg,
    labelHalo: t.bg0,
    districtHues: [0, 45, 90, 135, 180, 225, 270, 315].map((h) => withHue(mixOklab(t.line, t.fgMuted, 0.35), h, 0.05)),
  };
}
