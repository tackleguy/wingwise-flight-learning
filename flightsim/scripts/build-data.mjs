// Builds the simulator's world database from OurAirports open data (public domain).
//
//   node scripts/build-data.mjs [path-to-ourairports-data-folder]
//
// Without an argument the CSV files are downloaded from
// https://davidmegginson.github.io/ourairports-data/ . Output goes to public/data/.
//
// Notes on honesty: where OurAirports has no runway-end coordinates, the runway is placed through
// the airport reference point using its published heading (or its runway number plus the local
// magnetic variation from the World Magnetic Model). Those runways are flagged `est: 1` and the
// simulator labels them "position estimated".
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const geomagnetism = require("geomagnetism");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "data");
const srcDir = process.argv[2];
const BASE = "https://davidmegginson.github.io/ourairports-data/";

async function load(name) {
  if (srcDir && existsSync(join(srcDir, name))) return readFileSync(join(srcDir, name), "utf8");
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`Download failed for ${name}: HTTP ${res.status}`);
  return res.text();
}

/** RFC-4180 CSV parser (quoted fields, embedded commas/quotes/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const num = (s) => (s === "" || s === undefined ? null : Number.isFinite(Number(s)) ? Number(s) : null);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const D2R = Math.PI / 180;
const R_NM = 3440.065;
const FT_PER_NM = 6076.12;

function bearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}
function distNm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * D2R) / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}
function dest(lat, lon, brg, nm) {
  const d = nm / R_NM, b = brg * D2R, p1 = lat * D2R, l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / D2R, ((l2 / D2R + 540) % 360) - 180];
}

const SURFACE = [
  [/^(asp|bit|asph|tar|pem|mac)/i, 1], // asphalt / bitumen / macadam
  [/^(con|pcc|concrete)/i, 2],
  [/(grass|turf|grs|sod)/i, 3],
  [/(gravel|grvl|gvl|crushed)/i, 4],
  [/(dirt|earth|soil|sand|clay|laterite|coral|lat|unpaved|grd|ground)/i, 5],
  [/(water)/i, 6],
  [/(snow|ice)/i, 7],
  [/(paved)/i, 1],
];
function surfaceCode(s) {
  const t = (s || "").trim();
  for (const [re, code] of SURFACE) if (re.test(t)) return code;
  return 0;
}

const TYPE = { small_airport: 0, medium_airport: 1, large_airport: 2 };
const model = geomagnetism.model(new Date());
const magVar = (lat, lon) => model.point([lat, lon]).decl;

const [airportsCsv, runwaysCsv, navaidsCsv, freqCsv, countriesCsv] = await Promise.all(
  ["airports.csv", "runways.csv", "navaids.csv", "airport-frequencies.csv", "countries.csv"].map(load),
);
const airportsRaw = parseCsv(airportsCsv);
const runwaysRaw = parseCsv(runwaysCsv);
const navaidsRaw = parseCsv(navaidsCsv);
const freqRaw = parseCsv(freqCsv);
const countriesRaw = parseCsv(countriesCsv);

// ---- runways grouped by airport ident
const rwByAirport = new Map();
for (const r of runwaysRaw) {
  if (r.closed === "1") continue;
  const list = rwByAirport.get(r.airport_ident) ?? [];
  list.push(r);
  rwByAirport.set(r.airport_ident, list);
}

const A = { ident: [], icao: [], iata: [], name: [], city: [], country: [], type: [], lat: [], lon: [], elev: [], rw0: [], rwn: [] };
const R = { ap: [], len: [], wid: [], surf: [], lit: [], est: [], aId: [], aLat: [], aLon: [], aElev: [], aHdg: [], aDisp: [], bId: [], bLat: [], bLon: [], bElev: [], bHdg: [], bDisp: [] };
const identToIdx = new Map();
let estCount = 0;
let skippedNoRunway = 0;

for (const a of airportsRaw) {
  const type = TYPE[a.type];
  if (type === undefined) continue; // heliports, seaplane bases, balloonports and closed airports are left out
  const lat = num(a.latitude_deg), lon = num(a.longitude_deg);
  if (lat === null || lon === null) continue;
  const rws = rwByAirport.get(a.ident) ?? [];
  const built = [];
  const estByHeading = new Map();
  for (const r of rws) {
    const surf = surfaceCode(r.surface);
    if (surf === 6) continue; // water runways are not usable by the landplane trainer
    let len = num(r.length_ft);
    const wid = num(r.width_ft);
    let aLat = num(r.le_latitude_deg), aLon = num(r.le_longitude_deg), bLat = num(r.he_latitude_deg), bLon = num(r.he_longitude_deg);
    let aHdg, bHdg, est = 0;
    if (aLat !== null && aLon !== null && bLat !== null && bLon !== null) {
      const d = distNm(aLat, aLon, bLat, bLon) * FT_PER_NM;
      if (d < 300) continue; // degenerate
      aHdg = bearing(aLat, aLon, bLat, bLon);
      bHdg = bearing(bLat, bLon, aLat, aLon);
      // Trust the surveyed end points for geometry; keep the published length unless it is far off.
      if (len === null || Math.abs(d - len) / d > 0.25) len = Math.round(d);
    } else {
      if (len === null || len < 300) continue;
      let h = num(r.le_heading_degT);
      if (h === null) {
        const m = /^(\d{1,2})/.exec(r.le_ident || "");
        if (!m) continue;
        const n = Number(m[1]);
        if (n < 1 || n > 36) continue;
        h = (n * 10 + magVar(lat, lon) + 360) % 360;
      }
      // Several estimated runways on the same heading (parallels) are spread sideways 200 m apart.
      const key = Math.round(h / 10);
      const k = estByHeading.get(key) ?? 0;
      estByHeading.set(key, k + 1);
      const [cLat, cLon] = k === 0 ? [lat, lon] : dest(lat, lon, h + 90, (k * 200) / 1852);
      const half = len / 2 / FT_PER_NM;
      [aLat, aLon] = dest(cLat, cLon, (h + 180) % 360, half);
      [bLat, bLon] = dest(cLat, cLon, h, half);
      aHdg = h;
      bHdg = (h + 180) % 360;
      est = 1;
      estCount++;
    }
    built.push({
      len: Math.round(len), wid: Math.round(wid ?? (len > 5000 ? 150 : len > 2500 ? 75 : 50)), surf, lit: r.lighted === "1" ? 1 : 0, est,
      aId: (r.le_ident || "").trim(), aLat: r5(aLat), aLon: r5(aLon), aElev: num(r.le_elevation_ft), aHdg: Math.round(aHdg * 10) / 10, aDisp: num(r.le_displaced_threshold_ft) ?? 0,
      bId: (r.he_ident || "").trim(), bLat: r5(bLat), bLon: r5(bLon), bElev: num(r.he_elevation_ft), bHdg: Math.round(bHdg * 10) / 10, bDisp: num(r.he_displaced_threshold_ft) ?? 0,
    });
  }
  // Airports with no usable runway record stay searchable (rwn = 0): the simulator can still
  // place the aircraft at the airport reference point, and says that no runway data exists.
  if (!built.length) skippedNoRunway++;
  // Fill in missing runway designators from the heading (e.g. heading 284° → "28").
  for (const b of built) {
    const fromHdg = (h) => String(Math.round((((h - magVar(lat, lon)) % 360) + 360) % 360 / 10) || 36).padStart(2, "0");
    if (!b.aId) b.aId = fromHdg(b.aHdg);
    if (!b.bId) b.bId = fromHdg(b.bHdg);
  }
  const idx = A.ident.length;
  identToIdx.set(a.ident, idx);
  A.ident.push(a.ident);
  A.icao.push(a.icao_code || a.gps_code || "");
  A.iata.push(a.iata_code || "");
  A.name.push(a.name);
  A.city.push(a.municipality || "");
  A.country.push(a.iso_country || "");
  A.type.push(type);
  A.lat.push(r5(lat));
  A.lon.push(r5(lon));
  A.elev.push(num(a.elevation_ft) === null ? null : Math.round(num(a.elevation_ft)));
  A.rw0.push(R.ap.length);
  A.rwn.push(built.length);
  built.sort((x, y) => y.len - x.len);
  for (const b of built) {
    R.ap.push(idx);
    for (const k of Object.keys(b)) R[k].push(b[k]);
  }
}

// ---- frequencies
const F = { ap: [], type: [], desc: [], mhz: [] };
for (const f of freqRaw) {
  const idx = identToIdx.get(f.airport_ident);
  const mhz = num(f.frequency_mhz);
  if (idx === undefined || mhz === null || mhz < 108 || mhz > 137) continue;
  F.ap.push(idx);
  F.type.push((f.type || "").toUpperCase().trim());
  F.desc.push((f.description || "").trim());
  F.mhz.push(Math.round(mhz * 1000) / 1000);
}

// ---- navaids
const NAVTYPE = { VOR: 0, "VOR-DME": 1, VORTAC: 2, DME: 3, NDB: 4, "NDB-DME": 5, TACAN: 6 };
const N = { ident: [], name: [], type: [], khz: [], lat: [], lon: [], elev: [], magVar: [], usage: [], power: [], ap: [] };
for (const n of navaidsRaw) {
  const type = NAVTYPE[n.type];
  const lat = num(n.latitude_deg), lon = num(n.longitude_deg), khz = num(n.frequency_khz);
  if (type === undefined || lat === null || lon === null || khz === null) continue;
  N.ident.push(n.ident);
  N.name.push(n.name);
  N.type.push(type);
  N.khz.push(khz);
  N.lat.push(r5(lat));
  N.lon.push(r5(lon));
  N.elev.push(num(n.elevation_ft) === null ? null : Math.round(num(n.elevation_ft)));
  // VOR radials are referenced to the station's "slaved variation" when published.
  const v = num(n.slaved_variation_deg) ?? num(n.magnetic_variation_deg);
  N.magVar.push(v === null ? null : Math.round(v * 10) / 10);
  N.usage.push((n.usageType || "").toUpperCase());
  N.power.push((n.power || "").toUpperCase());
  N.ap.push(identToIdx.get(n.associated_airport) ?? -1);
}

const countries = Object.fromEntries(countriesRaw.map((c) => [c.code, c.name]));
const meta = {
  v: 1,
  generated: new Date().toISOString().slice(0, 10),
  source: "OurAirports (https://ourairports.com/data/) — public domain, no guarantee of accuracy. Not for real-world navigation.",
  counts: { airports: A.ident.length, runways: R.ap.length, runwaysEstimated: estCount, frequencies: F.ap.length, navaids: N.ident.length },
};

mkdirSync(outDir, { recursive: true });
const write = (name, obj) => {
  const s = JSON.stringify(obj);
  writeFileSync(join(outDir, name), s);
  return `${name} ${(s.length / 1e6).toFixed(2)} MB`;
};
console.log(
  [
    write("airports.json", { meta, countries, ...A }),
    write("runways.json", R),
    write("frequencies.json", F),
    write("navaids.json", N),
  ].join("\n"),
);
console.log(JSON.stringify(meta.counts), "airports with no runway data (kept, rwn=0):", skippedNoRunway);
