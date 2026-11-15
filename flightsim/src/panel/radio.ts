/**
 * Radio tuning rules (pure functions, unit-tested).
 * COM: 118.000 – 136.975 MHz in 25 kHz steps.   NAV: 108.00 – 117.95 MHz in 50 kHz steps.
 * As on a real NAV/COM, the large knob changes whole megahertz and the small knob changes the
 * kilohertz part; each wraps around on its own without carrying into the other.
 */
import type { RadioFreqs } from "@/core/types";

export type RadioBand = "com" | "nav";

export const BANDS: Record<RadioBand, { minMhz: number; maxMhz: number; stepKhz: number; decimals: number }> = {
  com: { minMhz: 118, maxMhz: 136, stepKhz: 25, decimals: 3 },
  nav: { minMhz: 108, maxMhz: 117, stepKhz: 50, decimals: 2 },
};

/** Snap any number to the nearest valid channel of the band, in kHz. */
function toChannelKhz(band: RadioBand, mhz: number): number {
  const b = BANDS[band];
  const lo = b.minMhz * 1000;
  const hi = b.maxMhz * 1000 + 1000 - b.stepKhz;
  const khz = Math.round((Number.isFinite(mhz) ? mhz : b.minMhz) * 1000);
  const snapped = Math.round(khz / b.stepKhz) * b.stepKhz;
  return Math.min(hi, Math.max(lo, snapped));
}

/** Snap a frequency (MHz) to a valid channel of the band. */
export const normalizeFreq = (band: RadioBand, mhz: number) => toChannelKhz(band, mhz) / 1000;

/** Turn the large (whole MHz) or small (kHz) tuning knob by `steps` clicks. Returns the new frequency in MHz. */
export function tune(band: RadioBand, mhz: number, part: "mhz" | "khz", steps: number): number {
  const b = BANDS[band];
  const khz = toChannelKhz(band, mhz);
  let whole = Math.floor(khz / 1000);
  let frac = khz - whole * 1000;
  const n = Math.trunc(steps);
  if (part === "mhz") {
    const span = b.maxMhz - b.minMhz + 1;
    whole = b.minMhz + ((((whole - b.minMhz + n) % span) + span) % span);
  } else {
    const count = 1000 / b.stepKhz;
    const idx = (((Math.round(frac / b.stepKhz) + n) % count) + count) % count;
    frac = idx * b.stepKhz;
  }
  return (whole * 1000 + frac) / 1000;
}

/** "122.800" for COM, "110.00" for NAV. */
export const formatFreq = (band: RadioBand, mhz: number) => normalizeFreq(band, mhz).toFixed(BANDS[band].decimals);

/** The flip-flop button: swap active and standby. */
export function flipFlop(r: RadioFreqs): void {
  const a = r.active;
  r.active = r.standby;
  r.standby = a;
}

export const XPDR_MODES = ["OFF", "STBY", "ON", "ALT"] as const;
export type XpdrMode = (typeof XPDR_MODES)[number];

/** Transponder codes use the digits 0–7 only (octal). Returns a clean 4-digit code. */
export function cleanSquawk(code: string): string {
  const digits = (code ?? "").replace(/[^0-7]/g, "").slice(0, 4);
  return digits.padStart(4, "0");
}

/** Step one digit (0 = leftmost) of the transponder code up or down, wrapping 0…7. */
export function stepSquawkDigit(code: string, index: number, dir: number): string {
  const c = cleanSquawk(code).split("");
  const i = Math.min(3, Math.max(0, Math.trunc(index)));
  const d = Number(c[i] ?? "0");
  c[i] = String((((d + Math.trunc(dir)) % 8) + 8) % 8);
  return c.join("");
}
