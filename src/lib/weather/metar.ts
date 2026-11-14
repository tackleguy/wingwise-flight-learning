/**
 * METAR decoder (FAA / ICAO format as used in the United States).
 *
 * Shared by the academy exercises and the Weather Lab. The parser is tolerant: anything it does
 * not understand is kept in `unparsed` instead of throwing, so it is safe to feed real-world
 * reports. All group parsers are exported so the TAF decoder can reuse them.
 *
 *   const m = parseMetar("KJFK 141751Z 31015G25KT 1 1/2SM -RA BR BKN008 OVC015 08/06 A2992 RMK AO2");
 *   m.wind?.gustKt     // 25
 *   m.visibility?.sm   // 1.5
 *   m.ceilingFt        // 800
 *   m.flightCategory   // "IFR"
 */

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

export interface ObsTime {
  day: number;
  hour: number;
  minute: number;
}

export interface Wind {
  /** True direction in degrees, "VRB" for variable, null when calm. */
  direction: number | "VRB" | null;
  speedKt: number;
  gustKt: number | null;
  /** Variable direction range, e.g. 280V350. */
  variableFrom: number | null;
  variableTo: number | null;
  calm: boolean;
  raw: string;
}

export interface Visibility {
  /** Statute miles (converted from meters when reported in meters). */
  sm: number;
  /** "M1/4SM" — less than the reported value. */
  lessThan: boolean;
  /** "P6SM" — greater than the reported value. */
  greaterThan: boolean;
  raw: string;
}

export interface WeatherPhenomenon {
  raw: string;
  intensity: "light" | "moderate" | "heavy" | "vicinity";
  /** e.g. "TS", "SH", "FZ" */
  descriptor: string | null;
  /** e.g. ["RA", "SN"] */
  phenomena: string[];
  /** Plain-English decode, e.g. "light freezing rain". */
  text: string;
}

export type CloudCover = "SKC" | "CLR" | "NSC" | "NCD" | "FEW" | "SCT" | "BKN" | "OVC" | "VV";

export interface CloudLayer {
  cover: CloudCover;
  /** Feet AGL. Null for SKC/CLR or "VV///". */
  baseFt: number | null;
  /** Convective type, if reported. */
  type: "CB" | "TCU" | null;
  raw: string;
}

export interface Altimeter {
  inHg: number;
  hPa: number;
  raw: string;
}

export interface Metar {
  raw: string;
  type: "METAR" | "SPECI";
  station: string;
  time: ObsTime | null;
  auto: boolean;
  corrected: boolean;
  wind: Wind | null;
  visibility: Visibility | null;
  /** Runway visual range groups, kept raw (e.g. "R04/2200FT"). */
  rvr: string[];
  weather: WeatherPhenomenon[];
  clouds: CloudLayer[];
  /** Lowest BKN/OVC/VV layer in feet AGL; null if none (unlimited). */
  ceilingFt: number | null;
  tempC: number | null;
  dewpointC: number | null;
  altimeter: Altimeter | null;
  /** Remarks section, verbatim (without the "RMK" keyword). */
  remarks: string;
  /** Tokens the decoder did not recognise. */
  unparsed: string[];
  flightCategory: FlightCategory | null;
}

/* ------------------------------------------------------------------------------------------ */
/* Dictionaries                                                                                */
/* ------------------------------------------------------------------------------------------ */

export const DESCRIPTORS: Record<string, string> = {
  MI: "shallow",
  PR: "partial",
  BC: "patches of",
  DR: "low drifting",
  BL: "blowing",
  SH: "showers",
  TS: "thunderstorm",
  FZ: "freezing",
};

export const PHENOMENA: Record<string, string> = {
  DZ: "drizzle",
  RA: "rain",
  SN: "snow",
  SG: "snow grains",
  IC: "ice crystals",
  PL: "ice pellets",
  GR: "hail",
  GS: "small hail / snow pellets",
  UP: "unknown precipitation",
  BR: "mist",
  FG: "fog",
  FU: "smoke",
  VA: "volcanic ash",
  DU: "widespread dust",
  SA: "sand",
  HZ: "haze",
  PY: "spray",
  PO: "dust/sand whirls",
  SQ: "squalls",
  FC: "funnel cloud",
  SS: "sandstorm",
  DS: "duststorm",
};

export const COVER_TEXT: Record<CloudCover, string> = {
  SKC: "sky clear",
  CLR: "clear below 12,000 ft",
  NSC: "no significant cloud",
  NCD: "no cloud detected",
  FEW: "few",
  SCT: "scattered",
  BKN: "broken",
  OVC: "overcast",
  VV: "vertical visibility (indefinite ceiling)",
};

/* ------------------------------------------------------------------------------------------ */
/* Group parsers                                                                               */
/* ------------------------------------------------------------------------------------------ */

const WIND_RE = /^(\d{3}|VRB|\/\/\/)(\d{2,3}|\/\/)(?:G(\d{2,3}))?(KT|MPS|KMH)$/;

export function parseWindGroup(tok: string): Wind | null {
  const m = WIND_RE.exec(tok);
  if (!m) return null;
  const unit = m[4];
  const conv = unit === "MPS" ? 1.94384 : unit === "KMH" ? 0.539957 : 1;
  const dirRaw = m[1] ?? "";
  const spdRaw = m[2] ?? "";
  const speedKt = spdRaw.includes("/") ? 0 : Math.round(Number(spdRaw) * conv);
  const gustKt = m[3] ? Math.round(Number(m[3]) * conv) : null;
  const calm = dirRaw === "000" && speedKt === 0;
  const direction: Wind["direction"] = calm ? null : dirRaw === "VRB" ? "VRB" : dirRaw.includes("/") ? null : Number(dirRaw);
  return { direction, speedKt, gustKt, variableFrom: null, variableTo: null, calm, raw: tok };
}

const VAR_RE = /^(\d{3})V(\d{3})$/;

function parseFraction(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const f = /^(\d+)\/(\d+)$/.exec(s);
  if (f && Number(f[2]) !== 0) return Number(f[1]) / Number(f[2]);
  return null;
}

/**
 * Visibility may span two tokens ("1 1/2SM"). Returns the parsed visibility and how many tokens
 * were consumed, or null.
 */
export function parseVisibilityTokens(tokens: string[], i: number): { vis: Visibility; used: number } | null {
  const t = tokens[i];
  if (!t) return null;
  // Whole number followed by a fraction: "1 1/2SM", "2 1/4SM"
  const next = tokens[i + 1];
  if (/^\d+$/.test(t) && next && /^\d+\/\d+SM$/.test(next)) {
    const frac = parseFraction(next.replace("SM", ""));
    if (frac !== null) {
      return { vis: { sm: Number(t) + frac, lessThan: false, greaterThan: false, raw: `${t} ${next}` }, used: 2 };
    }
  }
  const sm = /^([PM])?(\d+(?:\/\d+)?)SM$/.exec(t);
  if (sm) {
    const v = parseFraction(sm[2] ?? "");
    if (v === null) return null;
    return { vis: { sm: v, lessThan: sm[1] === "M", greaterThan: sm[1] === "P", raw: t }, used: 1 };
  }
  // Meters (ICAO): 4 digits, optional direction suffix (e.g. 2000SW) or NDV
  const meters = /^(\d{4})(?:NDV|[NSEW]{1,2})?$/.exec(t);
  if (meters) {
    const mtr = Number(meters[1]);
    if (mtr === 9999) return { vis: { sm: 6.2, lessThan: false, greaterThan: true, raw: t }, used: 1 };
    return { vis: { sm: Math.round((mtr / 1609.34) * 100) / 100, lessThan: false, greaterThan: false, raw: t }, used: 1 };
  }
  if (t === "CAVOK") return { vis: { sm: 6.2, lessThan: false, greaterThan: true, raw: t }, used: 1 };
  return null;
}

const WX_RE = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)?$/;

export function parseWeatherGroup(tok: string): WeatherPhenomenon | null {
  if (tok === "" || tok === "+" || tok === "-") return null;
  const m = WX_RE.exec(tok);
  if (!m) return null;
  const [, intRaw, desc, phenRaw] = m;
  if (!desc && !phenRaw) return null;
  const phenomena = phenRaw ? (phenRaw.match(/.{2}/g) ?? []) : [];
  const intensity: WeatherPhenomenon["intensity"] =
    intRaw === "+" ? "heavy" : intRaw === "-" ? "light" : intRaw === "VC" ? "vicinity" : "moderate";
  const parts: string[] = [];
  if (intensity === "light" || intensity === "heavy") parts.push(intensity);
  const phenText = phenomena.map((p) => PHENOMENA[p] ?? p).join(" and ");
  if (desc === "TS") {
    parts.push(phenText ? `thunderstorm with ${phenText}` : "thunderstorm");
  } else if (desc === "SH") {
    parts.push(phenText ? `${phenText} showers` : "showers");
  } else {
    if (desc) parts.push(DESCRIPTORS[desc] ?? desc);
    if (phenText) parts.push(phenText);
  }
  if (intensity === "vicinity") parts.push("in the vicinity");
  // FC with + is a tornado / waterspout.
  const text = tok === "+FC" ? "tornado or waterspout" : parts.join(" ");
  return { raw: tok, intensity, descriptor: desc ?? null, phenomena, text };
}

const CLOUD_RE = /^(SKC|CLR|NSC|NCD|FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)?(CB|TCU|\/\/\/)?$/;

export function parseCloudGroup(tok: string): CloudLayer | null {
  const m = CLOUD_RE.exec(tok);
  if (!m) return null;
  const cover = m[1] as CloudCover;
  const hasHeight = m[2] && m[2] !== "///";
  if ((cover === "SKC" || cover === "CLR" || cover === "NSC" || cover === "NCD") && m[2]) return null;
  if (!(cover === "SKC" || cover === "CLR" || cover === "NSC" || cover === "NCD") && !m[2]) return null;
  const type = m[3] === "CB" || m[3] === "TCU" ? m[3] : null;
  return { cover, baseFt: hasHeight ? Number(m[2]) * 100 : null, type, raw: tok };
}

/** Lowest broken, overcast or vertical-visibility layer (14 CFR 1.1 "ceiling"). */
export function ceilingOf(layers: CloudLayer[]): number | null {
  let c: number | null = null;
  for (const l of layers) {
    if ((l.cover === "BKN" || l.cover === "OVC" || l.cover === "VV") && l.baseFt !== null) {
      if (c === null || l.baseFt < c) c = l.baseFt;
    }
  }
  return c;
}

const TEMP_RE = /^(M?\d{2})\/(M?\d{2})?$/;

function tempVal(s: string | undefined): number | null {
  if (!s) return null;
  return s.startsWith("M") ? -Number(s.slice(1)) : Number(s);
}

export function parseAltimeterGroup(tok: string): Altimeter | null {
  const a = /^A(\d{4})$/.exec(tok);
  if (a) {
    const inHg = Number(a[1]) / 100;
    return { inHg, hPa: Math.round(inHg * 33.8639), raw: tok };
  }
  const q = /^Q(\d{4})$/.exec(tok);
  if (q) {
    const hPa = Number(q[1]);
    return { inHg: Math.round((hPa / 33.8639) * 100) / 100, hPa, raw: tok };
  }
  return null;
}

/**
 * FAA flight category (as used by the Aviation Weather Center):
 *   LIFR: ceiling < 500 ft and/or visibility < 1 SM
 *   IFR:  ceiling 500 to < 1,000 ft and/or visibility 1 to < 3 SM
 *   MVFR: ceiling 1,000–3,000 ft and/or visibility 3–5 SM
 *   VFR:  ceiling > 3,000 ft and visibility > 5 SM
 * Pass null for an unlimited ceiling / unknown visibility.
 */
export function flightCategory(ceilingFt: number | null, visibilitySm: number | null): FlightCategory {
  const c = ceilingFt ?? Infinity;
  const v = visibilitySm ?? Infinity;
  if (c < 500 || v < 1) return "LIFR";
  if (c < 1000 || v < 3) return "IFR";
  if (c <= 3000 || v <= 5) return "MVFR";
  return "VFR";
}

export const CATEGORY_INFO: Record<FlightCategory, { label: string; rule: string; tone: "ok" | "primary" | "warning" | "magenta" }> = {
  VFR: { label: "VFR", rule: "Ceiling > 3,000 ft AGL and visibility > 5 SM", tone: "ok" },
  MVFR: { label: "Marginal VFR", rule: "Ceiling 1,000–3,000 ft and/or visibility 3–5 SM", tone: "primary" },
  IFR: { label: "IFR", rule: "Ceiling 500 to below 1,000 ft and/or visibility 1 to below 3 SM", tone: "warning" },
  LIFR: { label: "Low IFR", rule: "Ceiling below 500 ft and/or visibility below 1 SM", tone: "magenta" },
};

/* ------------------------------------------------------------------------------------------ */
/* METAR                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function tokenize(raw: string): string[] {
  return raw
    .replace(/=+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .split(" ")
    .filter(Boolean);
}

export function parseMetar(raw: string): Metar {
  const all = tokenize(raw);
  const rmkIdx = all.indexOf("RMK");
  const tokens = rmkIdx >= 0 ? all.slice(0, rmkIdx) : all;
  const remarks = rmkIdx >= 0 ? all.slice(rmkIdx + 1).join(" ") : "";

  const out: Metar = {
    raw: raw.trim(),
    type: "METAR",
    station: "",
    time: null,
    auto: false,
    corrected: false,
    wind: null,
    visibility: null,
    rvr: [],
    weather: [],
    clouds: [],
    ceilingFt: null,
    tempC: null,
    dewpointC: null,
    altimeter: null,
    remarks,
    unparsed: [],
    flightCategory: null,
  };

  let i = 0;
  if (tokens[i] === "METAR" || tokens[i] === "SPECI") {
    out.type = tokens[i] as "METAR" | "SPECI";
    i++;
  }
  const st = tokens[i];
  if (st && /^[A-Z][A-Z0-9]{3}$/.test(st)) {
    out.station = st;
    i++;
  }
  const tm = tokens[i] ? /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] ?? "") : null;
  if (tm) {
    out.time = { day: Number(tm[1]), hour: Number(tm[2]), minute: Number(tm[3]) };
    i++;
  }

  for (; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (t === "AUTO") {
      out.auto = true;
      continue;
    }
    if (t === "COR") {
      out.corrected = true;
      continue;
    }
    if (t === "NIL") continue;
    if (!out.wind) {
      const w = parseWindGroup(t);
      if (w) {
        out.wind = w;
        const v = VAR_RE.exec(tokens[i + 1] ?? "");
        if (v) {
          w.variableFrom = Number(v[1]);
          w.variableTo = Number(v[2]);
          i++;
        }
        continue;
      }
    }
    if (!out.visibility) {
      const vis = parseVisibilityTokens(tokens, i);
      if (vis) {
        out.visibility = vis.vis;
        i += vis.used - 1;
        continue;
      }
    }
    if (/^R\d{2}[LCR]?\/[PM]?\d{4}(V[PM]?\d{4})?(FT)?[UDN]?$/.test(t)) {
      out.rvr.push(t);
      continue;
    }
    const cl = parseCloudGroup(t);
    if (cl) {
      out.clouds.push(cl);
      continue;
    }
    const tp = TEMP_RE.exec(t);
    if (tp) {
      out.tempC = tempVal(tp[1]);
      out.dewpointC = tempVal(tp[2]);
      continue;
    }
    const alt = parseAltimeterGroup(t);
    if (alt) {
      out.altimeter = alt;
      continue;
    }
    const wx = parseWeatherGroup(t);
    if (wx) {
      out.weather.push(wx);
      continue;
    }
    out.unparsed.push(t);
  }

  out.ceilingFt = ceilingOf(out.clouds);
  // CAVOK implies no ceiling below 5,000 ft and visibility ≥ 10 km.
  out.flightCategory = out.visibility || out.clouds.length ? flightCategory(out.ceilingFt, out.visibility?.sm ?? null) : null;
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Plain-English helpers                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function describeWind(w: Wind | null): string {
  if (!w) return "Wind not reported";
  if (w.calm) return "Calm";
  const dir = w.direction === "VRB" ? "Variable" : w.direction === null ? "Unknown direction" : `${String(w.direction).padStart(3, "0")}° true`;
  let s = `${dir} at ${w.speedKt} kt`;
  if (w.gustKt) s += `, gusting ${w.gustKt} kt`;
  if (w.variableFrom !== null && w.variableTo !== null) s += ` (varying ${String(w.variableFrom).padStart(3, "0")}°–${String(w.variableTo).padStart(3, "0")}°)`;
  return s;
}

export function formatVisibility(v: Visibility | null): string {
  if (!v) return "Not reported";
  const whole = Math.floor(v.sm + 1e-9);
  const frac = v.sm - whole;
  const fracs: [number, string][] = [
    [0.125, "1/8"],
    [0.25, "1/4"],
    [0.375, "3/8"],
    [0.5, "1/2"],
    [0.625, "5/8"],
    [0.75, "3/4"],
  ];
  let txt = String(Math.round(v.sm * 100) / 100);
  if (frac < 1e-6) txt = String(whole);
  else {
    const f = fracs.find(([n]) => Math.abs(n - frac) < 0.01);
    if (f) txt = whole ? `${whole} ${f[1]}` : f[1];
  }
  return `${v.lessThan ? "less than " : v.greaterThan ? "more than " : ""}${txt} SM`;
}

export function describeCloud(l: CloudLayer): string {
  if (l.baseFt === null) return COVER_TEXT[l.cover];
  const base = `${l.baseFt.toLocaleString("en-US")} ft AGL`;
  const type = l.type === "CB" ? " cumulonimbus" : l.type === "TCU" ? " towering cumulus" : "";
  if (l.cover === "VV") return `Vertical visibility ${base} (indefinite ceiling)`;
  return `${COVER_TEXT[l.cover][0]?.toUpperCase()}${COVER_TEXT[l.cover].slice(1)}${type} at ${base}`;
}

/** Relative humidity (%) from temperature and dewpoint (Magnus formula). */
export function relativeHumidity(tempC: number, dewC: number): number {
  const a = 17.625;
  const b = 243.04;
  return Math.round(100 * Math.exp((a * dewC) / (b + dewC) - (a * tempC) / (b + tempC)));
}

/** One-line plain-English summary of a decoded METAR. */
export function summarizeMetar(m: Metar): string {
  const parts: string[] = [];
  parts.push(`Wind ${describeWind(m.wind).toLowerCase()}`);
  parts.push(`visibility ${formatVisibility(m.visibility)}`);
  if (m.weather.length) parts.push(m.weather.map((w) => w.text).join(", "));
  parts.push(m.ceilingFt !== null ? `ceiling ${m.ceilingFt.toLocaleString("en-US")} ft` : "no ceiling");
  if (m.tempC !== null) parts.push(`temperature ${m.tempC}°C${m.dewpointC !== null ? ` / dewpoint ${m.dewpointC}°C` : ""}`);
  if (m.altimeter) parts.push(`altimeter ${m.altimeter.inHg.toFixed(2)} inHg`);
  return parts.join("; ");
}
