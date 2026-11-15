/**
 * METAR parser — turns the text of an aviation routine weather report into numbers.
 *
 *   METAR KDEN 150253Z 29006KT 1 3/4SM BKN004 06/05 A2991 RMK AO2 SFC VIS 7 SLP116
 *   METAR LIRF 150250Z VRB06KT 9999 -TSRA FEW015CB SCT025 13/13 Q1016 NOSIG
 *
 * Original work written from the public format description (WMO code FM 15 / FAA and ICAO
 * usage). It understands: wind with gusts, variable wind (VRB) and variable sectors (240V300),
 * knots / metres per second / km/h; visibility in statute miles (with fractions, P6SM, M1/4SM)
 * and in metres (9999, CAVOK); weather groups (RA, SN, BR, FG, TS, +/−, VC …); cloud layers
 * FEW/SCT/BKN/OVC and vertical visibility VV; CLR/SKC/NSC/NCD; temperature and dew point with M
 * for minus; altimeter A2992 and Q1013; AUTO / COR. Remarks (RMK …) and trend forecasts
 * (TEMPO / BECMG …) are not part of the observation and are ignored.
 *
 * It never throws: anything it does not understand is collected in `unparsed`.
 */

export type MetarCloudCover = "FEW" | "SCT" | "BKN" | "OVC" | "VV";

export interface MetarWind {
  /** Direction the wind blows FROM, degrees TRUE (METAR winds are true, not magnetic). null = variable (VRB) or missing. */
  dirTrue: number | null;
  /** The report said VRB (no single direction). */
  variable: boolean;
  /** Mean speed, kt (converted when the report uses m/s or km/h). */
  kt: number;
  /** Peak gust SPEED, kt (e.g. 25 for 15G25KT). null = no gust reported. */
  gustKt: number | null;
  /** Variable sector, e.g. 240V300 → 240 and 300. null when not reported. */
  varFrom: number | null;
  varTo: number | null;
}

export interface MetarWeather {
  /** The group as written, e.g. "-TSRA". */
  raw: string;
  intensity: "light" | "moderate" | "heavy";
  /** VC: in the vicinity of the airport, not at it. */
  vicinity: boolean;
  /** MI PR BC DR BL SH TS FZ */
  descriptors: string[];
  /** DZ RA SN SG IC PL GR GS UP BR FG FU VA DU SA HZ PY PO SQ FC SS DS */
  phenomena: string[];
}

export interface MetarCloud {
  cover: MetarCloudCover;
  /** Height of the base above the airport, ft. null = not measured (e.g. VV///). */
  baseFtAgl: number | null;
  /** Significant convective cloud: cumulonimbus (CB, a thunderstorm cloud) or towering cumulus (TCU). */
  type: "CB" | "TCU" | null;
}

export interface ParsedMetar {
  raw: string;
  type: "METAR" | "SPECI" | null;
  station: string | null;
  /** Day of the month and time of the observation, UTC. */
  day: number | null;
  hour: number | null;
  minute: number | null;
  /** Fully automatic report, no human observer. */
  auto: boolean;
  /** A corrected report. */
  corrected: boolean;
  /** The station sent "NIL": no report. */
  nil: boolean;
  wind: MetarWind | null;
  /** Prevailing visibility, statute miles. null = not reported. */
  visibilitySm: number | null;
  /** True when the report gives only a lower bound ("10SM" from an automatic station, P6SM, 9999, CAVOK): it is at least this. */
  visibilityOrMore: boolean;
  /** True for "M1/4SM": less than the value given. */
  visibilityLessThan: boolean;
  /** "Ceiling And Visibility OK": 10 km or more, no cloud below 5,000 ft, no significant weather. */
  cavok: boolean;
  weather: MetarWeather[];
  clouds: MetarCloud[];
  /** The report said the sky is clear, and how: CLR (US automatic, below 12,000 ft), SKC, NSC, NCD — or CAVOK. */
  skyClear: "CLR" | "SKC" | "NSC" | "NCD" | "CAVOK" | null;
  tempC: number | null;
  dewpointC: number | null;
  /** Altimeter setting (QNH) in inches of mercury, whichever unit the report used. */
  altimeterInHg: number | null;
  /** The same in hectopascals. */
  qnhHpa: number | null;
  /** Text after RMK (not interpreted). */
  remarks: string;
  /** Trend forecast appended to the report (NOSIG, TEMPO …, BECMG …), not interpreted. */
  trend: string;
  /** Groups in the body that were not understood. */
  unparsed: string[];
}

const INHG_PER_HPA = 0.0295299830714;
const KT_PER_MPS = 1.9438445;
const KT_PER_KMH = 0.5399568;
const SM_PER_M = 1 / 1609.344;

const WIND_RE = /^(VRB|\d{3}|\/\/\/)(P?\d{2,3}|\/\/)(?:G(P?\d{2,3}|\/\/))?(KT|KTS|MPS|KMH)$/;
const VAR_RE = /^(\d{3})V(\d{3})$/;
const VIS_SM_RE = /^([MP])?(?:(\d{1,3})|(\d{1,2})\/(\d{1,2}))SM$/;
const VIS_M_RE = /^(\d{4})(NDV|N|NE|E|SE|S|SW|W|NW)?$/;
const VIS_KM_RE = /^(\d{1,2})KM$/;
const CLOUD_RE = /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/;
const CLOUD_UNKNOWN_RE = /^\/\/\/(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/;
const TEMP_RE = /^(M?\d{2}|\/\/|XX)\/(M?\d{2}|\/\/|XX)?$/;
const ALT_A_RE = /^A(\d{4})$/;
const ALT_Q_RE = /^Q(?:NH)?(\d{3,4})(?:INS)?$/;
const TIME_RE = /^(\d{2})(\d{2})(\d{2})Z$/;
const STATION_RE = /^[A-Z][A-Z0-9]{3}$/;
const WX_RE = /^(\+|-|VC)?((?:MI|PR|BC|DR|BL|SH|TS|FZ)*)((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;
const RVR_RE = /^R\d{2}[LCR]?\//;
const COLOUR_RE = /^(?:BLACK)?(?:BLU|WHT|GRN|YLO[12]?|AMB|RED)\+?$/;
const TREND_START = new Set(["TEMPO", "BECMG", "INTER", "PROB30", "PROB40"]);
const NOT_A_STATION = new Set(["AUTO", "COR", "NIL", "CAVOK", "METAR", "SPECI"]);

function pairs(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push(s.slice(i, i + 2));
  return out;
}

function speedToKt(value: number, unit: string): number {
  if (unit === "MPS") return value * KT_PER_MPS;
  if (unit === "KMH") return value * KT_PER_KMH;
  return value;
}

function parseSignedTemp(s: string | undefined): number | null {
  if (!s || s === "//" || s === "XX") return null;
  const neg = s.startsWith("M");
  const v = Number(neg ? s.slice(1) : s);
  if (!Number.isFinite(v)) return null;
  return neg && v !== 0 ? -v : v;
}

/** Parse one weather group such as "-TSRA", "VCSH", "+SN", "FZFG", "BR". Returns null when the text is not a weather group. */
export function parseWeatherGroup(token: string): MetarWeather | null {
  if (token.length < 2) return null;
  const m = WX_RE.exec(token);
  if (!m) return null;
  const descriptors = pairs(m[2] ?? "");
  const phenomena = pairs(m[3] ?? "");
  if (!descriptors.length && !phenomena.length) return null;
  const sign = m[1];
  return {
    raw: token,
    intensity: sign === "+" ? "heavy" : sign === "-" ? "light" : "moderate",
    vicinity: sign === "VC",
    descriptors,
    phenomena,
  };
}

function emptyMetar(raw: string): ParsedMetar {
  return {
    raw,
    type: null,
    station: null,
    day: null,
    hour: null,
    minute: null,
    auto: false,
    corrected: false,
    nil: false,
    wind: null,
    visibilitySm: null,
    visibilityOrMore: false,
    visibilityLessThan: false,
    cavok: false,
    weather: [],
    clouds: [],
    skyClear: null,
    tempC: null,
    dewpointC: null,
    altimeterInHg: null,
    qnhHpa: null,
    remarks: "",
    trend: "",
    unparsed: [],
  };
}

/** Parse the text of a METAR or SPECI report. Never throws. */
export function parseMetar(text: string): ParsedMetar {
  const raw = String(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const out = emptyMetar(raw);
  if (!raw) return out;
  const tokens = raw.replace(/=+\s*$/, "").split(" ");
  let i = 0;

  // ---- header: [METAR|SPECI] [COR] STATION DDHHMMZ
  if (tokens[i] === "METAR" || tokens[i] === "SPECI") out.type = tokens[i++] as "METAR" | "SPECI";
  if (tokens[i] === "COR") {
    out.corrected = true;
    i++;
  }
  const maybeStation = tokens[i];
  if (maybeStation && STATION_RE.test(maybeStation) && !NOT_A_STATION.has(maybeStation) && !WIND_RE.test(maybeStation)) {
    out.station = maybeStation;
    i++;
  }
  const time = TIME_RE.exec(tokens[i] ?? "");
  if (time) {
    const d = Number(time[1]);
    const h = Number(time[2]);
    const mi = Number(time[3]);
    if (d >= 1 && d <= 31 && h <= 23 && mi <= 59) {
      out.day = d;
      out.hour = h;
      out.minute = mi;
    }
    i++;
  }

  // ---- body
  let pendingWhole: number | null = null;
  let visSet = false;
  for (; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "RMK") {
      out.remarks = tokens.slice(i + 1).join(" ");
      break;
    }
    if (TREND_START.has(t) || /^FM\d{4,6}$/.test(t)) {
      const rest = tokens.slice(i);
      const rmk = rest.indexOf("RMK");
      out.trend = (out.trend ? out.trend + " " : "") + (rmk >= 0 ? rest.slice(0, rmk) : rest).join(" ");
      if (rmk >= 0) out.remarks = rest.slice(rmk + 1).join(" ");
      break;
    }
    if (t === "NOSIG") {
      out.trend = "NOSIG";
      continue;
    }
    if (t === "$" || t === "") continue; // "$" = the automatic station needs maintenance
    if (t === "AUTO") {
      out.auto = true;
      continue;
    }
    if (t === "COR" || /^CC[A-Z]$/.test(t)) {
      out.corrected = true;
      continue;
    }
    if (t === "NIL") {
      out.nil = true;
      continue;
    }

    // a whole number standing alone just before a fraction: "1 1/2SM"
    if (/^\d{1,2}$/.test(t) && /^\d{1,2}\/\d{1,2}SM$/.test(tokens[i + 1] ?? "")) {
      pendingWhole = Number(t);
      continue;
    }

    // wind
    const w = WIND_RE.exec(t);
    if (w) {
      const unit = w[4] === "KTS" ? "KT" : w[4]!;
      const dirTxt = w[1]!;
      const spdTxt = w[2]!;
      if (spdTxt !== "//") {
        const speed = speedToKt(Number(spdTxt.replace("P", "")), unit);
        const gustTxt = w[3];
        const gust = gustTxt && gustTxt !== "//" ? speedToKt(Number(gustTxt.replace("P", "")), unit) : null;
        const dir = dirTxt === "VRB" || dirTxt === "///" ? null : Number(dirTxt) % 360;
        out.wind = {
          dirTrue: dir !== null && dir >= 0 && dir < 360 ? dir : null,
          variable: dirTxt === "VRB",
          kt: speed,
          gustKt: gust !== null && gust > speed ? gust : null,
          varFrom: out.wind?.varFrom ?? null,
          varTo: out.wind?.varTo ?? null,
        };
      }
      continue;
    }
    const v = VAR_RE.exec(t);
    if (v) {
      const from = Number(v[1]) % 360;
      const to = Number(v[2]) % 360;
      if (out.wind) {
        out.wind.varFrom = from;
        out.wind.varTo = to;
      } else out.wind = { dirTrue: null, variable: true, kt: 0, gustKt: null, varFrom: from, varTo: to };
      continue;
    }

    // visibility
    if (t === "CAVOK") {
      out.cavok = true;
      out.skyClear = "CAVOK";
      if (!visSet) {
        out.visibilitySm = 10000 * SM_PER_M;
        out.visibilityOrMore = true;
        visSet = true;
      }
      continue;
    }
    const vs = VIS_SM_RE.exec(t);
    if (vs) {
      let sm: number;
      if (vs[2] !== undefined) sm = Number(vs[2]);
      else {
        let num = Number(vs[3]);
        const den = Math.max(1, Number(vs[4]));
        let whole = 0;
        // "11/2SM" written without the space means 1 1/2, not eleven halves
        if (pendingWhole === null && num >= 10 && num > den) {
          whole = Math.floor(num / 10);
          num %= 10;
        }
        sm = whole + num / den;
      }
      if (pendingWhole !== null) sm += pendingWhole;
      pendingWhole = null;
      if (!visSet && Number.isFinite(sm)) {
        out.visibilitySm = sm;
        // Automatic US stations cannot see farther than 10 miles: "10SM" means 10 or more.
        out.visibilityOrMore = vs[1] === "P" || (vs[2] !== undefined && sm === 10);
        out.visibilityLessThan = vs[1] === "M";
        visSet = true;
      }
      continue;
    }
    const vm = VIS_M_RE.exec(t);
    if (vm && (visSet || !out.clouds.length)) {
      // The first metre group is the prevailing visibility; later ones (e.g. "1200NE") describe a direction.
      if (!visSet) {
        const metres = Number(vm[1]);
        out.visibilitySm = (metres >= 9999 ? 10000 : metres) * SM_PER_M;
        out.visibilityOrMore = metres >= 9999;
        visSet = true;
      }
      continue;
    }
    const vk = VIS_KM_RE.exec(t);
    if (vk) {
      if (!visSet) {
        out.visibilitySm = Number(vk[1]) * 1000 * SM_PER_M;
        out.visibilityOrMore = Number(vk[1]) >= 10;
        visSet = true;
      }
      continue;
    }
    if (t === "////" || t === "////SM") continue; // visibility not measured
    if (RVR_RE.test(t)) continue; // runway visual range and runway-state groups

    // sky
    if (t === "CLR" || t === "SKC" || t === "NSC" || t === "NCD") {
      out.skyClear = t;
      continue;
    }
    const c = CLOUD_RE.exec(t);
    if (c) {
      out.clouds.push({
        cover: c[1] as MetarCloudCover,
        baseFtAgl: c[2] === "///" ? null : Number(c[2]) * 100,
        type: c[3] === "CB" || c[3] === "TCU" ? c[3] : null,
      });
      continue;
    }
    const cu = CLOUD_UNKNOWN_RE.exec(t);
    if (cu) {
      // amount not measured; keep it only when it flags a thunderstorm cloud at a known height
      if ((cu[2] === "CB" || cu[2] === "TCU") && cu[1] !== "///") out.clouds.push({ cover: "FEW", baseFtAgl: Number(cu[1]) * 100, type: cu[2] });
      continue;
    }

    // temperature / dew point
    const tt = TEMP_RE.exec(t);
    if (tt) {
      out.tempC = parseSignedTemp(tt[1]);
      out.dewpointC = parseSignedTemp(tt[2]);
      continue;
    }

    // altimeter
    const a = ALT_A_RE.exec(t);
    if (a) {
      const inHg = Number(a[1]) / 100;
      if (inHg >= 25 && inHg <= 32.5) {
        out.altimeterInHg = inHg;
        out.qnhHpa = inHg / INHG_PER_HPA;
      }
      continue;
    }
    const q = ALT_Q_RE.exec(t);
    if (q) {
      const hpa = Number(q[1]);
      if (hpa >= 850 && hpa <= 1100) {
        out.qnhHpa = hpa;
        out.altimeterInHg = hpa * INHG_PER_HPA;
      }
      continue;
    }
    if (t === "A////" || t === "Q////") continue;

    // weather (recent weather "RExx" is history, not present weather)
    if (/^RE[A-Z]{2,}$/.test(t)) continue;
    if (t === "NSW" || t === "//") continue;
    const wx = parseWeatherGroup(t);
    if (wx) {
      out.weather.push(wx);
      continue;
    }

    // other groups that carry nothing the simulator uses
    if (t === "WS") {
      // wind shear on a runway: "WS R28", "WS ALL RWY"
      while (/^(ALL|RWY|R\d{2}[LCR]?|RWY\d{2}[LCR]?)$/.test(tokens[i + 1] ?? "")) i++;
      continue;
    }
    if (COLOUR_RE.test(t) || t === "SNOCLO" || /^W\d{2}\/[SH]\d+$/.test(t) || /^\d{8}$/.test(t)) continue;

    out.unparsed.push(t);
  }
  return out;
}

/**
 * Turn the day-of-month and time of a METAR into a full UTC time (ms since 1970): the most recent
 * moment with that day/hour/minute that is not in the future of `nowMs` (a little clock skew allowed).
 */
export function metarTimeMs(day: number | null, hour: number | null, minute: number | null, nowMs: number): number | null {
  if (day === null || hour === null || minute === null) return null;
  const now = new Date(nowMs);
  for (let back = 0; back < 3; back++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() - back;
    const t: number = Date.UTC(y, m, day, hour, minute);
    // Date.UTC rolls an impossible day (e.g. 31 in a 30-day month) into the next month: skip those.
    if (new Date(t).getUTCDate() !== day) continue;
    if (t <= nowMs + 2 * 3600_000) return t;
  }
  return null;
}
