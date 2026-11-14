/**
 * PIREP (pilot weather report) interpreter — FAA format, AIM 7-1-18 / AC 00-45.
 *
 *   OAK UA /OV OAK270015/TM 1530/FL085/TP C172/SK BKN030-TOP055/WX FV05SM HZ/TA M02
 *          /WV 27045KT/TB MOD 060-080/IC LGT RIME 070-090/RM SMOOTH ABV 090
 *
 * Note: cloud bases/tops and altitudes in PIREPs are MSL (unlike METAR cloud heights, which are AGL).
 */
import { parseWeatherGroup } from "@/lib/weather/metar";

export interface PirepField {
  code: string;
  label: string;
  raw: string;
  text: string;
  warn?: boolean;
}

export interface Pirep {
  raw: string;
  station: string | null;
  urgent: boolean;
  fields: PirepField[];
  errors: string[];
  summary: string;
}

const FIELD_LABEL: Record<string, string> = {
  OV: "Location",
  TM: "Time",
  FL: "Altitude",
  TP: "Aircraft type",
  SK: "Sky cover",
  WX: "Weather & visibility",
  TA: "Air temperature",
  WV: "Wind",
  TB: "Turbulence",
  IC: "Icing",
  RM: "Remarks",
};

const COVER: Record<string, string> = {
  SKC: "sky clear",
  CLR: "clear",
  FEW: "few clouds",
  SCT: "scattered clouds",
  BKN: "broken clouds",
  OVC: "overcast",
  OVX: "obscured",
};

const INTENSITY: Record<string, string> = {
  NEG: "none (negative)",
  SMTH: "smooth",
  SMOOTH: "smooth",
  TRACE: "trace",
  TRC: "trace",
  LGT: "light",
  LT: "light",
  MOD: "moderate",
  SEV: "severe",
  EXTRM: "extreme",
  EXTRM_: "extreme",
};

const FREQ: Record<string, string> = {
  OCNL: "occasional",
  INTMT: "intermittent",
  CONS: "continuous",
  CONT: "continuous",
};
const TB_TYPE: Record<string, string> = {
  CHOP: "chop",
  CAT: "clear-air turbulence",
  LLWS: "low-level wind shear",
  MWAVE: "mountain wave",
};
const IC_TYPE: Record<string, string> = {
  RIME: "rime",
  CLR: "clear",
  CLEAR: "clear",
  MX: "mixed",
  MXD: "mixed",
};

const ft = (hundreds: string) => `${(Number(hundreds) * 100).toLocaleString("en-US")} ft MSL`;

function altRange(tokens: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    const r = /^(\d{3})-(\d{3})$/.exec(t);
    if (r) out.push(`between ${ft(r[1] ?? "0")} and ${ft(r[2] ?? "0")}`);
    else if (/^\d{3}$/.test(t)) out.push(`at ${ft(t)}`);
    else if ((t === "BLO" || t === "BLW" || t === "BLOW") && /^\d{3}$/.test(tokens[i + 1] ?? "")) {
      out.push(`below ${ft(tokens[i + 1] ?? "0")}`);
      i++;
    } else if ((t === "ABV" || t === "ABOVE") && /^\d{3}$/.test(tokens[i + 1] ?? "")) {
      out.push(`above ${ft(tokens[i + 1] ?? "0")}`);
      i++;
    } else if (t === "DURC" || t === "DURGC") out.push("during climb");
    else if (t === "DURD" || t === "DURGD") out.push("during descent");
  }
  return out.join(", ");
}

function intensityText(tok: string): string | null {
  const parts = tok.split("-");
  if (parts.every((p) => INTENSITY[p])) return parts.map((p) => INTENSITY[p]).join(" to ");
  return null;
}

function decodeOV(v: string): string {
  const s = v.trim();
  const rad = /^([A-Z0-9]{3,4})\s?(\d{3})(\d{3})$/.exec(s);
  if (rad) return `${Number(rad[3])} nm from ${rad[1]} on the ${rad[2]}° radial`;
  const route = s.split("-");
  if (route.length > 1) return `Along the route ${route.map((r) => decodeOV(r)).join(" to ")}`;
  const ll = /^(\d{2,4})([NS])\s?(\d{3,5})([EW])$/.exec(s);
  if (ll) return `Position ${ll[1]}${ll[2]} ${ll[3]}${ll[4]}`;
  if (/^[A-Z0-9]{3,4}$/.test(s)) return `Over ${s}`;
  return s;
}

function decodeFL(v: string): { text: string; warn?: boolean } {
  const s = v.replace(/^FL/, "").trim();
  if (/^\d{3}$/.test(s)) return { text: ft(s) };
  if (s === "UNKN") return { text: "Altitude unknown" };
  if (s === "DURD") return { text: "During descent" };
  if (s === "DURC") return { text: "During climb" };
  return { text: s };
}

function decodeSK(v: string): string {
  const layers = v
    .split(/[/,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = layers.map((l) => {
    let txt = "";
    const tokens = l.split(/\s+/);
    for (const t of tokens) {
      const top = /^TOPS?(\d{3})$/.exec(t);
      const m = top
        ? null
        : /^([A-Z]{3})(?:-([A-Z]{3}))?(\d{3}|UNKN)?(?:-TOP(\d{3}|UNKN))?$/.exec(t);
      if (m && COVER[m[1] ?? ""]) {
        const cov = m[2] ? `${COVER[m[1] ?? ""]} to ${COVER[m[2]] ?? m[2]}` : COVER[m[1] ?? ""];
        txt += `${cov?.[0]?.toUpperCase()}${cov?.slice(1)}`;
        if (m[3]) txt += m[3] === "UNKN" ? ", base unknown" : `, base ${ft(m[3])}`;
        if (m[4]) txt += m[4] === "UNKN" ? ", tops unknown" : `, tops ${ft(m[4])}`;
      } else if (top) {
        txt += `${txt ? ", " : ""}tops ${ft(top[1] ?? "0")}`;
      } else if (/^\d{3}-TOP\d{3}$/.test(t)) {
        const [b, tp] = t.split("-TOP");
        txt += `${txt ? ", " : ""}base ${ft(b ?? "0")}, tops ${ft(tp ?? "0")}`;
      } else {
        txt += `${txt ? " " : ""}${t}`;
      }
    }
    return txt;
  });
  return out.join("; ");
}

function decodeWX(v: string): string {
  const parts: string[] = [];
  for (const t of v.split(/\s+/).filter(Boolean)) {
    const fv = /^FV(\d{2})SM$/.exec(t) ?? /^FV(\d+)SM$/.exec(t);
    if (fv) {
      parts.push(`flight visibility ${Number(fv[1])} SM`);
      continue;
    }
    if (t === "FV99SM") {
      parts.push("flight visibility unrestricted");
      continue;
    }
    const w = parseWeatherGroup(t);
    if (w) parts.push(w.text);
    else parts.push(t);
  }
  const s = parts.join(", ");
  return s ? `${s[0]?.toUpperCase()}${s.slice(1)}` : v;
}

function decodeTA(v: string): string {
  const m = /^(M|-)?(\d{1,2})$/.exec(v.trim());
  if (!m) return v;
  const c = (m[1] ? -1 : 1) * Number(m[2]);
  return `${c}°C (${Math.round((c * 9) / 5 + 32)}°F)${c <= 0 && c >= -20 ? " — at or below freezing: icing possible in visible moisture" : ""}`;
}

function decodeWV(v: string): string {
  const m = /^(\d{3})(\d{2,3})(KT)?$/.exec(v.trim());
  if (!m) return v;
  return `From ${m[1]}° (true) at ${Number(m[2])} kt`;
}

function decodeTB(v: string): { text: string; warn: boolean } {
  const segs = v
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  let warn = false;
  const texts = segs.map((seg) => {
    const toks = seg.split(/\s+/);
    const words: string[] = [];
    const alts: string[] = [];
    for (const t of toks) {
      const it = intensityText(t);
      if (it) {
        words.push(it);
        if (/SEV|EXTRM/.test(t)) warn = true;
      } else if (FREQ[t]) words.unshift(FREQ[t] ?? t);
      else if (TB_TYPE[t]) words.push(TB_TYPE[t] ?? t);
      else alts.push(t);
    }
    const a = altRange(alts);
    return `${words.join(" ") || seg}${words.length && !words.some((w) => /chop|turbulence|shear|wave/.test(w)) ? " turbulence" : ""}${a ? ` ${a}` : ""}`;
  });
  const s = texts.join("; ");
  return { text: `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`, warn };
}

function decodeIC(v: string): { text: string; warn: boolean } {
  const toks = v.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  const alts: string[] = [];
  let warn = false;
  for (const t of toks) {
    const it = intensityText(t);
    if (it) {
      words.push(it);
      if (/SEV|MOD/.test(t)) warn = true;
    } else if (IC_TYPE[t]) words.push(IC_TYPE[t] ?? t);
    else alts.push(t);
  }
  const a = altRange(alts);
  const s =
    `${words.join(" ")}${words.length && !words.includes("none (negative)") ? " icing" : ""}${a ? ` ${a}` : ""}`.trim() ||
    v;
  return { text: `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`, warn };
}

const CODES = ["OV", "TM", "FL", "TP", "SK", "WX", "TA", "WV", "TB", "IC", "RM"];

export function parsePirep(raw: string): Pirep {
  const text = raw.replace(/\s+/g, " ").trim().toUpperCase();
  const errors: string[] = [];
  const head = /^(?:([A-Z0-9]{3,4})\s+)?(UUA|UA)\b/.exec(text);
  const urgent = head?.[2] === "UUA";
  const station = head?.[1] ?? null;
  if (!head)
    errors.push(
      'A PIREP starts with "UA" (routine) or "UUA" (urgent), optionally preceded by the station identifier.',
    );
  const body = head ? text.slice(head[0].length) : text;
  // Split at "/XX" where XX is a field code (FL may be followed directly by digits).
  const re = /\/\s*(OV|TM|FL|TP|SK|WX|TA|WV|TB|IC|RM)(?=\s|\d|UNKN|DUR|$)/g;
  const marks: { code: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)))
    marks.push({ code: m[1] ?? "", start: m.index, end: m.index + m[0].length });
  const fields: PirepField[] = [];
  marks.forEach((mk, i) => {
    const next = marks[i + 1];
    const value = body.slice(mk.end, next ? next.start : undefined).trim();
    const label = FIELD_LABEL[mk.code] ?? mk.code;
    const rawField = `/${mk.code} ${value}`.trim();
    let t: string;
    let warn = false;
    switch (mk.code) {
      case "OV":
        t = decodeOV(value);
        break;
      case "TM":
        t = /^\d{4}$/.test(value)
          ? `${value.slice(0, 2)}:${value.slice(2)} UTC (${value}Z)`
          : value;
        break;
      case "FL":
        t = decodeFL(value).text;
        break;
      case "TP":
        t = value ? `${value} (ICAO type designator)` : "Not reported";
        break;
      case "SK":
        t = decodeSK(value);
        break;
      case "WX":
        t = decodeWX(value);
        break;
      case "TA":
        t = decodeTA(value);
        break;
      case "WV":
        t = decodeWV(value);
        break;
      case "TB": {
        const d = decodeTB(value);
        t = d.text;
        warn = d.warn;
        break;
      }
      case "IC": {
        const d = decodeIC(value);
        t = d.text;
        warn = d.warn;
        break;
      }
      default:
        t = value;
    }
    fields.push({ code: mk.code, label, raw: rawField, text: t, warn });
  });
  for (const req of ["OV", "TM", "FL", "TP"])
    if (head && !fields.some((f) => f.code === req))
      errors.push(`Required field /${req} (${FIELD_LABEL[req]}) is missing.`);
  if (head && fields.length && !fields.some((f) => !["OV", "TM", "FL", "TP"].includes(f.code)))
    errors.push("A PIREP must report at least one weather element (/SK, /WX, /TA, /WV, /TB, /IC).");

  const get = (c: string) => fields.find((f) => f.code === c)?.text;
  const parts = [
    `${urgent ? "URGENT pilot report" : "Routine pilot report"}${station ? ` (filed through ${station})` : ""}`,
    get("TP") ? `by the crew of a ${get("TP")?.replace(" (ICAO type designator)", "")}` : "",
    get("OV")
      ? get("OV")?.startsWith("Over")
        ? `over${get("OV")?.slice(4)}`
        : `at ${get("OV")}`
      : "",
    get("FL")
      ? /^During|unknown/i.test(get("FL") ?? "")
        ? (get("FL") ?? "").toLowerCase()
        : `at ${get("FL")}`
      : "",
    get("TM") ? `at ${get("TM")?.split(" (")[0]}` : "",
  ].filter(Boolean);
  return { raw, station, urgent, fields, errors, summary: `${parts.join(", ")}.` };
}

export const PIREP_FIELD_HELP: { code: string; label: string; help: string }[] = [
  {
    code: "UA / UUA",
    label: "Report type",
    help: "UA = routine. UUA = urgent: tornado/funnel cloud/waterspout, severe or extreme turbulence (incl. CAT), severe icing, hail, LLWS within 2,000 ft AGL, volcanic ash, or anything the specialist considers hazardous.",
  },
  {
    code: "/OV",
    label: "Location",
    help: "Navaid/airport identifier, often with radial and DME distance: OAK270015 = 15 nm on the 270° radial from OAK.",
  },
  { code: "/TM", label: "Time", help: "UTC time of the observation, HHMM." },
  {
    code: "/FL",
    label: "Altitude",
    help: "Altitude MSL in hundreds of feet (FL085 = 8,500 ft), or DURC/DURD (during climb/descent), UNKN.",
  },
  {
    code: "/TP",
    label: "Aircraft type",
    help: "ICAO type designator — important for judging turbulence/icing reports (a C172 vs. a B738).",
  },
  {
    code: "/SK",
    label: "Sky cover",
    help: "Cover, base and tops in hundreds of feet MSL: BKN030-TOP055.",
  },
  {
    code: "/WX",
    label: "Weather",
    help: "Flight visibility (FV05SM) and weather using METAR codes (HZ, -RA, TS…).",
  },
  { code: "/TA", label: "Temperature", help: "Outside air temperature °C; M = minus." },
  { code: "/WV", label: "Wind", help: "Direction (three digits) and speed: 27045KT." },
  {
    code: "/TB",
    label: "Turbulence",
    help: "Intensity (LGT, MOD, SEV, EXTRM), type (CHOP, CAT, LLWS), frequency (OCNL, INTMT, CONS) and altitudes.",
  },
  {
    code: "/IC",
    label: "Icing",
    help: "Intensity (TRACE, LGT, MOD, SEV), type (RIME, CLR, MX) and altitudes.",
  },
  {
    code: "/RM",
    label: "Remarks",
    help: "Free text — e.g. 'SMOOTH ABV 090', 'LLWS -15KT SFC-008 DURC RWY 28'.",
  },
];

export const PIREP_EXAMPLES = [
  "OAK UA /OV OAK270015/TM 1530/FL085/TP C172/SK BKN030-TOP055/WX FV05SM HZ/TA M02/WV 27045KT/TB MOD 060-080/IC LGT RIME 070-090/RM SMOOTH ABV 090",
  "SEA UUA /OV SEA180020/TM 2215/FL120/TP B738/TA M10/IC SEV RIME 100-130/RM DURD",
  "DEN UA /OV DEN090030/TM 1845/FLDURC/TP PA28/SK SCT080/TB LGT-MOD CHOP 040-080/RM HOT AND BUMPY",
  "SFO UUA /OV SFO/TM 1402/FLDURD/TP A320/WX FV03SM BR/RM LLWS -20KT SFC-006 RWY 28L",
];
