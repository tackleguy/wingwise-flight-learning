/**
 * VHF COM frequency math for the simulated radio stack.
 *
 * Frequencies are handled internally as integer kHz to avoid floating-point drift.
 * US airspace uses 25 kHz channel spacing; Europe uses 8.33 kHz channel *names*
 * (e.g. 118.005, 118.010, 118.015, 118.025 …).
 */

export type ChannelSpacing = 25 | 8.33;

export const COM_MIN_KHZ = 118_000;
export const COM_MAX_KHZ_25 = 136_975;
export const COM_MAX_KHZ_833 = 136_990;

/** Last two digits of 8.33 kHz channel names inside each 100 kHz block. */
const SUFFIX_833 = [0, 5, 10, 15, 25, 30, 35, 40, 50, 55, 60, 65, 75, 80, 85, 90];
/** All valid kHz offsets (0–999) within one MHz for 8.33 kHz channel names. */
const OFFSETS_833: number[] = Array.from({ length: 10 }, (_, h) =>
  SUFFIX_833.map((s) => h * 100 + s),
).flat();
const OFFSETS_25: number[] = Array.from({ length: 40 }, (_, i) => i * 25);

export const toKhz = (mhz: number) => Math.round(mhz * 1000);
export const fromKhz = (khz: number) => khz / 1000;

/** Frequencies match when they are on the same channel (tolerates 8.33 display rounding). */
export function freqEquals(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.abs(toKhz(a) - toKhz(b)) <= 2;
}

/** Always three decimals, like a panel-mount COM radio. */
export function formatCom(mhz: number): string {
  return (toKhz(mhz) / 1000).toFixed(3);
}

/** Phraseology form: trailing zeros trimmed but at least one decimal ("120.1", "135.275", "125.0"). */
export function formatFreqShort(mhz: number): string {
  let s = (toKhz(mhz) / 1000).toFixed(3);
  while (s.endsWith("0") && !s.endsWith(".0")) s = s.slice(0, -1);
  return s;
}

export function isValidCom(mhz: number, spacing: ChannelSpacing = 25): boolean {
  const k = toKhz(mhz);
  const max = spacing === 25 ? COM_MAX_KHZ_25 : COM_MAX_KHZ_833;
  if (k < COM_MIN_KHZ || k > max) return false;
  const off = k % 1000;
  return spacing === 25 ? off % 25 === 0 : OFFSETS_833.includes(off) || off % 25 === 0;
}

export function validateComInput(mhz: number, spacing: ChannelSpacing): string | null {
  const k = toKhz(mhz);
  if (!Number.isFinite(mhz)) return "Enter a frequency like 121.600";
  if (k < COM_MIN_KHZ || k > (spacing === 25 ? COM_MAX_KHZ_25 : COM_MAX_KHZ_833))
    return "COM range is 118.000 – 136.975 MHz";
  if (!isValidCom(mhz, spacing))
    return spacing === 25
      ? "Not a 25 kHz channel (must end in .x00, .x25, .x50 or .x75)"
      : "Not a valid 8.33 kHz channel name";
  return null;
}

/** Inner knob: step the kHz part, wrapping inside the same MHz like a real radio. */
export function stepFine(mhz: number, dir: number, spacing: ChannelSpacing = 25): number {
  const k = toKhz(mhz);
  const whole = Math.floor(k / 1000);
  const off = k % 1000;
  const list = spacing === 25 ? OFFSETS_25 : OFFSETS_833;
  let idx = list.indexOf(off);
  if (idx < 0) {
    idx = list.findIndex((o) => o > off);
    if (idx < 0) idx = list.length - 1;
  }
  let next = (idx + Math.sign(dir) + list.length) % list.length;
  let nk = whole * 1000 + (list[next] ?? 0);
  const max = spacing === 25 ? COM_MAX_KHZ_25 : COM_MAX_KHZ_833;
  if (nk > max) {
    next = 0;
    nk = whole * 1000 + (list[next] ?? 0);
  }
  return fromKhz(nk);
}

/** Outer knob: step whole MHz, wrapping 118 ↔ 136. */
export function stepCoarse(mhz: number, dir: number): number {
  const k = toKhz(mhz);
  const off = k % 1000;
  let whole = Math.floor(k / 1000) + Math.sign(dir);
  if (whole > 136) whole = 118;
  if (whole < 118) whole = 136;
  return fromKhz(whole * 1000 + off);
}

/** Parse what a user types: "121.6", "121,60", "1216", "121600". */
export function parseFreqInput(raw: string): number | null {
  const s = raw
    .trim()
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!s) return null;
  if (s.includes(".")) {
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }
  if (s.length >= 4 && s.length <= 6) {
    const v = Number(`${s.slice(0, 3)}.${s.slice(3)}`);
    return Number.isFinite(v) ? v : null;
  }
  if (s.length === 3) return Number(s);
  return null;
}
