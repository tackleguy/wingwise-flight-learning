/**
 * Panel lighting model (pure). Decides the colour of everything on the panel from
 *   - daylight:    0 = night … 1 = day (src/core/sun.ts)
 *   - panelLight:  the PANEL LT dimmer, 0…1 (controls.lights.panel)
 *   - powered:     the electrical bus is alive (the lamps need electricity)
 *
 * By day the markings are plain white paint. At night with the panel lights off they are almost
 * black — deliberately hard to read, which is what a real cockpit looks like when you forget the
 * dimmer. With the lights on, the markings glow warm like incandescent post / flood lighting.
 */
import { clamp } from "@/core/math";

export type Rgb = readonly [number, number, number];

const BASE = {
  mk: [244, 243, 238],
  green: [52, 178, 78],
  yellow: [244, 196, 48],
  red: [228, 58, 46],
  orange: [255, 148, 28],
  sky: [66, 142, 214],
  ground: [124, 82, 46],
  face: [11, 11, 12],
  bezel: [30, 31, 34],
  bezelHi: [70, 72, 78],
  panel: [47, 51, 58],
  panelHi: [62, 67, 76],
  panelLo: [36, 39, 45],
  glare: [14, 15, 17],
  knob: [26, 27, 30],
  knobHi: [92, 95, 102],
  redKnob: [196, 40, 34],
  rocker: [232, 230, 224],
  rockerRed: [206, 44, 38],
  tube: [222, 222, 210],
  lcd: [134, 148, 126],
  lcdInk: [16, 22, 16],
  screw: [120, 122, 128],
} as const satisfies Record<string, Rgb>;

export type LightKey = keyof typeof BASE;

/** Colour of incandescent panel lighting. */
const WARM: Rgb = [255, 196, 128];

export interface PanelLighting {
  /** Reflected (ambient) light on the panel, 0…1. */
  ambient: number;
  /** Strength of the panel lighting actually visible, 0…1 (zero by day, or without electricity). */
  glow: number;
  /** CSS custom properties to set on the panel root. */
  vars: Record<string, string>;
  /** Changes only when the picture would change (used to avoid needless style writes). */
  key: string;
}

const css = (c: readonly number[]) => `rgb(${Math.round(clamp(c[0]!, 0, 255))} ${Math.round(clamp(c[1]!, 0, 255))} ${Math.round(clamp(c[2]!, 0, 255))})`;

export function panelLighting(daylight: number, panelLight: number, powered: boolean): PanelLighting {
  const day = clamp(Number.isFinite(daylight) ? daylight : 1, 0, 1);
  const dim = clamp(Number.isFinite(panelLight) ? panelLight : 0, 0, 1);
  // A little light always remains (moon, town glow, the radios) so the panel is dark, not invisible.
  const ambient = 0.1 + 0.9 * day;
  const lampsOn = powered && dim > 0.02;
  const glow = lampsOn ? (0.28 + 0.72 * dim) * (1 - day) : 0;

  const lit = (base: Rgb, reflect: number, emit: number, tint = 1): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const warm = WARM[i]! / 255;
      // reflected daylight + lamp light (tinted warm)
      out.push(base[i]! * (ambient * reflect + glow * emit * (1 - tint + tint * warm)));
    }
    return out;
  };

  const vars: Record<string, string> = {
    // back-lit / post-lit markings: strong response to the dimmer
    "--tx-mk": css(lit(BASE.mk, 1, 0.96)),
    "--tx-green": css(lit(BASE.green, 1, 0.9, 0.5)),
    "--tx-yellow": css(lit(BASE.yellow, 1, 0.9, 0.5)),
    "--tx-red": css(lit(BASE.red, 1, 0.92, 0.35)),
    "--tx-orange": css(lit(BASE.orange, 1, 0.92, 0.4)),
    "--tx-sky": css(lit(BASE.sky, 1, 0.8, 0.45)),
    "--tx-ground": css(lit(BASE.ground, 1, 0.85, 0.5)),
    "--tx-tube": css(lit(BASE.tube, 1, 0.85)),
    "--tx-lcd": css(lit(BASE.lcd, 1, 0.8)),
    "--tx-lcd-ink": css(lit(BASE.lcdInk, 1, 0.5)),
    // surfaces only catch a little flood light
    "--tx-face": css(lit(BASE.face, 1, 0.5)),
    "--tx-bezel": css(lit(BASE.bezel, 1, 0.42)),
    "--tx-bezel-hi": css(lit(BASE.bezelHi, 1, 0.4)),
    "--tx-panel": css(lit(BASE.panel, 1, 0.3)),
    "--tx-panel-hi": css(lit(BASE.panelHi, 1, 0.3)),
    "--tx-panel-lo": css(lit(BASE.panelLo, 1, 0.3)),
    "--tx-glare": css(lit(BASE.glare, 1, 0.2)),
    "--tx-knob": css(lit(BASE.knob, 1, 0.5)),
    "--tx-knob-hi": css(lit(BASE.knobHi, 1, 0.5)),
    "--tx-red-knob": css(lit(BASE.redKnob, 1, 0.7, 0.4)),
    "--tx-rocker": css(lit(BASE.rocker, 1, 0.62)),
    "--tx-rocker-red": css(lit(BASE.rockerRed, 1, 0.7, 0.4)),
    "--tx-screw": css(lit(BASE.screw, 1, 0.4)),
    // placards printed on the panel
    "--tx-label": css(lit(BASE.mk, 0.92, 0.8)),
    // brightness factor for the few fixed-colour metal parts (key, shafts)
    "--tx-dim": String(Math.round(clamp(ambient + glow * 0.45, 0, 1) * 100) / 100),
  };
  const key = `${Math.round(ambient * 60)}|${Math.round(glow * 60)}`;
  return { ambient, glow, vars, key };
}

/** Relative luminance (0…1) of an "rgb(r g b)" string produced by this module — used by the tests. */
export function luminance(rgb: string): number {
  const m = /rgb\((\d+) (\d+) (\d+)\)/.exec(rgb);
  if (!m) return 0;
  return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
}
