import { adjust, mixOklab, withHue, type Rgb } from './color';
import type { Tokens } from './tokens';

/** Scene colours that are not UI tokens, derived from tokens in OKLab (spec §1, §7) [P]. */
export interface Ramps {
  water: Rgb;
  land: Rgb;
  park: Rgb;
  road: Rgb;
  facades: [Rgb, Rgb, Rgb, Rgb];
  roof: Rgb;
  litWindow: Rgb;
  darkWindow: Rgb;
  keyLight: Rgb; // warm dusk key
  fillLight: Rgb; // cool fill
  brass: Rgb; // == --acc, only for my places, crown towers, selection
  gain: Rgb;
  loss: Rgb;
  label: Rgb;
  districtHues: Rgb[];
}

export function buildRamps(t: Tokens): Ramps {
  const land = mixOklab(t.win, t.win2, 0.6);
  return {
    water: adjust(t.bg0, 0.8, 0.6), // darkest
    land,
    park: mixOklab(land, t.gain, 0.06),
    road: mixOklab(t.win2, t.line, 0.6),
    facades: [
      mixOklab(t.line, t.fgMuted, 0.18),
      mixOklab(t.line, t.fgMuted, 0.3),
      mixOklab(t.win2, t.fgMuted, 0.32),
      mixOklab(t.line, t.fg, 0.22),
    ],
    roof: mixOklab(t.line, t.fgMuted, 0.42),
    litWindow: withHue(adjust(t.fg, 0.97, 1), 0, 0.045),
    darkWindow: adjust(t.bg0, 1.15, 1),
    keyLight: withHue(t.fg, 0, 0.03),
    fillLight: withHue(adjust(t.fgMuted, 0.9, 1), 180, 0.025),
    brass: t.acc,
    gain: t.gain,
    loss: t.loss,
    label: t.fg,
    districtHues: [0, 60, 120, 180, 240, 300].map((h) => withHue(mixOklab(t.line, t.fgMuted, 0.35), h, 0.05)),
  };
}
