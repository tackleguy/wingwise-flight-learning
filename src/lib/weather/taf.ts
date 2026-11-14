/**
 * TAF (Terminal Aerodrome Forecast) decoder.
 *
 * Handles the US/ICAO format: TAF [AMD|COR] CCCC ddhhmmZ ddhh/ddhh, followed by the base
 * forecast and change groups FMddhhmm, TEMPO ddhh/ddhh, BECMG ddhh/ddhh, PROB30/PROB40
 * (optionally followed by TEMPO), plus wind shear (WS020/27045KT) and NSW.
 *
 *   const t = parseTaf(raw);
 *   t.periods[0].type            // "BASE"
 *   t.periods[1].from            // { day, hour, minute }
 *   prevailingAt(t, { day: 14, hour: 21, minute: 0 })  // conditions in force
 */
import {
  ceilingOf,
  flightCategory,
  parseCloudGroup,
  parseVisibilityTokens,
  parseWeatherGroup,
  parseWindGroup,
  tokenize,
  type CloudLayer,
  type FlightCategory,
  type ObsTime,
  type Visibility,
  type WeatherPhenomenon,
  type Wind,
} from "./metar";

export type TafChange = "BASE" | "FM" | "TEMPO" | "BECMG" | "PROB";

export interface WindShear {
  heightFt: number;
  direction: number;
  speedKt: number;
  raw: string;
}

export interface TafPeriod {
  type: TafChange;
  /** 30 or 40 for PROB groups. */
  probability: number | null;
  /** True for "PROB30 TEMPO". */
  tempo: boolean;
  from: ObsTime | null;
  to: ObsTime | null;
  wind: Wind | null;
  visibility: Visibility | null;
  weather: WeatherPhenomenon[];
  /** "NSW" — no significant weather (previous weather ends). */
  noSigWeather: boolean;
  clouds: CloudLayer[];
  ceilingFt: number | null;
  windShear: WindShear | null;
  flightCategory: FlightCategory | null;
  raw: string;
  unparsed: string[];
}

export interface Taf {
  raw: string;
  station: string;
  amended: boolean;
  corrected: boolean;
  issued: ObsTime | null;
  validFrom: ObsTime | null;
  validTo: ObsTime | null;
  periods: TafPeriod[];
  remarks: string;
}

const PERIOD_RE = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/;

function parsePeriodRange(tok: string | undefined): { from: ObsTime; to: ObsTime } | null {
  const m = tok ? PERIOD_RE.exec(tok) : null;
  if (!m) return null;
  return {
    from: { day: Number(m[1]), hour: Number(m[2]), minute: 0 },
    to: { day: Number(m[3]), hour: Number(m[4]), minute: 0 },
  };
}

function emptyPeriod(type: TafChange): TafPeriod {
  return {
    type,
    probability: null,
    tempo: false,
    from: null,
    to: null,
    wind: null,
    visibility: null,
    weather: [],
    noSigWeather: false,
    clouds: [],
    ceilingFt: null,
    windShear: null,
    flightCategory: null,
    raw: "",
    unparsed: [],
  };
}

function isChangeStart(tokens: string[], i: number): boolean {
  const t = tokens[i] ?? "";
  if (/^FM\d{6}$/.test(t)) return true;
  if (t === "TEMPO" || t === "BECMG") return true;
  if (/^PROB\d{2}$/.test(t)) return true;
  return false;
}

/** Minutes since the start of the month (comparison helper; handles hour 24). */
export function obsMinutes(t: ObsTime): number {
  return t.day * 1440 + t.hour * 60 + t.minute;
}

function finish(p: TafPeriod, rawTokens: string[]) {
  p.raw = rawTokens.join(" ");
  p.ceilingFt = ceilingOf(p.clouds);
  if (p.visibility || p.clouds.length)
    p.flightCategory = flightCategory(p.ceilingFt, p.visibility?.sm ?? null);
}

export function parseTaf(raw: string): Taf {
  const all = tokenize(raw);
  const rmkIdx = all.indexOf("RMK");
  const tokens = rmkIdx >= 0 ? all.slice(0, rmkIdx) : all;
  const out: Taf = {
    raw: raw.trim(),
    station: "",
    amended: false,
    corrected: false,
    issued: null,
    validFrom: null,
    validTo: null,
    periods: [],
    remarks: rmkIdx >= 0 ? all.slice(rmkIdx + 1).join(" ") : "",
  };

  let i = 0;
  if (tokens[i] === "TAF") i++;
  while (tokens[i] === "AMD" || tokens[i] === "COR") {
    if (tokens[i] === "AMD") out.amended = true;
    else out.corrected = true;
    i++;
  }
  if (tokens[i] && /^[A-Z][A-Z0-9]{3}$/.test(tokens[i] ?? "")) {
    out.station = tokens[i] ?? "";
    i++;
  }
  const iss = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] ?? "");
  if (iss) {
    out.issued = { day: Number(iss[1]), hour: Number(iss[2]), minute: Number(iss[3]) };
    i++;
  }
  const valid = parsePeriodRange(tokens[i]);
  if (valid) {
    out.validFrom = valid.from;
    out.validTo = valid.to;
    i++;
  }

  let cur = emptyPeriod("BASE");
  cur.from = out.validFrom;
  cur.to = out.validTo;
  let curRaw: string[] = [];

  const push = () => {
    finish(cur, curRaw);
    if (curRaw.length) out.periods.push(cur);
  };

  while (i < tokens.length) {
    const t = tokens[i] ?? "";
    if (isChangeStart(tokens, i)) {
      push();
      curRaw = [];
      const fm = /^FM(\d{2})(\d{2})(\d{2})$/.exec(t);
      if (fm) {
        cur = emptyPeriod("FM");
        cur.from = { day: Number(fm[1]), hour: Number(fm[2]), minute: Number(fm[3]) };
        curRaw.push(t);
        i++;
        continue;
      }
      const prob = /^PROB(\d{2})$/.exec(t);
      if (prob) {
        cur = emptyPeriod("PROB");
        cur.probability = Number(prob[1]);
        curRaw.push(t);
        i++;
        if (tokens[i] === "TEMPO") {
          cur.tempo = true;
          curRaw.push("TEMPO");
          i++;
        }
      } else {
        cur = emptyPeriod(t as "TEMPO" | "BECMG");
        curRaw.push(t);
        i++;
      }
      const r = parsePeriodRange(tokens[i]);
      if (r) {
        cur.from = r.from;
        cur.to = r.to;
        curRaw.push(tokens[i] ?? "");
        i++;
      }
      continue;
    }

    curRaw.push(t);
    if (!cur.wind) {
      const w = parseWindGroup(t);
      if (w) {
        cur.wind = w;
        i++;
        continue;
      }
    }
    if (!cur.visibility) {
      const v = parseVisibilityTokens(tokens, i);
      if (v) {
        cur.visibility = v.vis;
        if (v.used === 2) curRaw.push(tokens[i + 1] ?? "");
        i += v.used;
        continue;
      }
    }
    const ws = /^WS(\d{3})\/(\d{3})(\d{2,3})KT$/.exec(t);
    if (ws) {
      cur.windShear = {
        heightFt: Number(ws[1]) * 100,
        direction: Number(ws[2]),
        speedKt: Number(ws[3]),
        raw: t,
      };
      i++;
      continue;
    }
    if (t === "NSW") {
      cur.noSigWeather = true;
      i++;
      continue;
    }
    const cl = parseCloudGroup(t);
    if (cl) {
      cur.clouds.push(cl);
      i++;
      continue;
    }
    const wx = parseWeatherGroup(t);
    if (wx) {
      cur.weather.push(wx);
      i++;
      continue;
    }
    cur.unparsed.push(t);
    i++;
  }
  push();

  // FM groups run until the next FM group (or the end of the TAF).
  const fms = out.periods.filter((p) => p.type === "FM" || p.type === "BASE");
  fms.forEach((p, idx) => {
    const next = fms[idx + 1];
    if (p.type === "BASE") {
      if (next?.from) p.to = next.from;
    } else {
      p.to = next?.from ?? out.validTo;
    }
  });
  return out;
}

/**
 * The prevailing forecast at a given time: the BASE/FM period in force, modified by any BECMG
 * group that has started (BECMG changes are permanent once complete). TEMPO/PROB groups are
 * returned separately because they are temporary fluctuations, not the prevailing forecast.
 */
export function prevailingAt(
  taf: Taf,
  at: ObsTime,
): {
  base: TafPeriod | null;
  becmg: TafPeriod[];
  temporary: TafPeriod[];
  category: FlightCategory | null;
} {
  const t = obsMinutes(at);
  let base: TafPeriod | null = null;
  for (const p of taf.periods) {
    if ((p.type === "BASE" || p.type === "FM") && p.from && obsMinutes(p.from) <= t) base = p;
  }
  const becmg = taf.periods.filter(
    (p) =>
      p.type === "BECMG" &&
      p.from &&
      obsMinutes(p.from) <= t &&
      (!base?.from || obsMinutes(p.from) >= obsMinutes(base.from)),
  );
  const temporary = taf.periods.filter(
    (p) =>
      (p.type === "TEMPO" || p.type === "PROB") &&
      p.from &&
      p.to &&
      obsMinutes(p.from) <= t &&
      t < obsMinutes(p.to),
  );
  let vis = base?.visibility?.sm ?? null;
  let clouds = base?.clouds ?? [];
  for (const b of becmg) {
    if (b.visibility) vis = b.visibility.sm;
    if (b.clouds.length) clouds = b.clouds;
  }
  const category = base ? flightCategory(ceilingOf(clouds), vis) : null;
  return { base, becmg, temporary, category };
}

export function formatObsTime(t: ObsTime | null): string {
  if (!t) return "—";
  return `${String(t.day).padStart(2, "0")}/${String(t.hour).padStart(2, "0")}${String(t.minute).padStart(2, "0")}Z`;
}

export const CHANGE_TEXT: Record<TafChange, string> = {
  BASE: "Initial forecast",
  FM: "From — rapid change; new conditions replace all previous ones",
  TEMPO:
    "Temporary fluctuations lasting less than an hour at a time and in total less than half the period",
  BECMG: "Becoming — gradual change during the period, then prevailing",
  PROB: "Probability (30 or 40 %) of the conditions occurring during the period",
};
