/**
 * METAR parser. The "real" reports below were fetched from aviationweather.gov on 15 Nov 2026
 * (see tests/weather/fixtures/awc-*.json, which also hold that service's own decoding of each
 * report — used further down as an independent cross-check of the parser).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { metarTimeMs, parseMetar, parseWeatherGroup } from "@/weather/metar";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => JSON.parse(readFileSync(path.join(fixtures, name), "utf8")) as Record<string, unknown>[];

const near = (a: number | null | undefined, b: number, tol = 0.01) => {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tol);
};

describe("METAR parser — real reports (US)", () => {
  it("KSFO: calm wind, 10SM, two broken layers, altimeter in inches", () => {
    const m = parseMetar("METAR KSFO 150256Z 00000KT 10SM BKN180 BKN200 16/11 A2998 RMK AO2 SLP151 T01610106 53005 $");
    expect(m.type).toBe("METAR");
    expect(m.station).toBe("KSFO");
    expect([m.day, m.hour, m.minute]).toEqual([15, 2, 56]);
    expect(m.wind).toEqual({ dirTrue: 0, variable: false, kt: 0, gustKt: null, varFrom: null, varTo: null });
    expect(m.visibilitySm).toBe(10);
    expect(m.visibilityOrMore).toBe(true);
    expect(m.clouds).toEqual([
      { cover: "BKN", baseFtAgl: 18000, type: null },
      { cover: "BKN", baseFtAgl: 20000, type: null },
    ]);
    expect(m.tempC).toBe(16);
    expect(m.dewpointC).toBe(11);
    near(m.altimeterInHg, 29.98);
    near(m.qnhHpa, 1015.2, 0.2);
    expect(m.remarks).toBe("AO2 SLP151 T01610106 53005 $");
    expect(m.unparsed).toEqual([]);
  });

  it("KDEN: a whole number and a fraction of a mile (1 3/4SM), low ceiling", () => {
    const m = parseMetar("METAR KDEN 150253Z 29006KT 1 3/4SM BKN004 06/05 A2991 RMK AO2 SFC VIS 7 SLP116 T00610050 53022");
    expect(m.wind?.dirTrue).toBe(290);
    expect(m.wind?.kt).toBe(6);
    expect(m.visibilitySm).toBe(1.75);
    expect(m.visibilityOrMore).toBe(false);
    expect(m.clouds).toEqual([{ cover: "BKN", baseFtAgl: 400, type: null }]);
    near(m.altimeterInHg, 29.91);
    expect(m.unparsed).toEqual([]); // "SFC VIS 7" is in the remarks and must not be read as visibility
  });

  it("KCOD: gusts", () => {
    const m = parseMetar("METAR KCOD 150256Z AUTO 28007G14KT 10SM CLR 11/M01 A2986 RMK AO2 SLP103 T01111011 51017 $");
    expect(m.auto).toBe(true);
    expect(m.wind).toMatchObject({ dirTrue: 280, kt: 7, gustKt: 14 });
    expect(m.skyClear).toBe("CLR");
    expect(m.clouds).toEqual([]);
    expect(m.tempC).toBe(11);
    expect(m.dewpointC).toBe(-1);
  });

  it("KHVR: SPECI, quarter-mile fog, vertical visibility", () => {
    const m = parseMetar("SPECI KHVR 150300Z AUTO 24004KT 1/4SM FG VV002 00/00 A2977 RMK AO2 T00000000");
    expect(m.type).toBe("SPECI");
    expect(m.visibilitySm).toBe(0.25);
    expect(m.weather.map((w) => w.raw)).toEqual(["FG"]);
    expect(m.clouds).toEqual([{ cover: "VV", baseFtAgl: 200, type: null }]);
    expect(m.tempC).toBe(0);
    expect(m.dewpointC).toBe(0);
  });

  it("KHWD: variable wind (VRB)", () => {
    const m = parseMetar("METAR KHWD 150254Z VRB03KT 10SM CLR 15/11 A2998 RMK AO2 SLP163 T01500106 53007");
    expect(m.wind).toMatchObject({ dirTrue: null, variable: true, kt: 3, gustKt: null });
  });

  it("KOAK: four cloud layers", () => {
    const m = parseMetar("METAR KOAK 150253Z 20003KT 10SM FEW020 FEW055 SCT210 BKN250 13/11 A2998 RMK AO2 SLP153 T01330111 53005");
    expect(m.clouds.map((c) => `${c.cover}${c.baseFtAgl}`)).toEqual(["FEW2000", "FEW5500", "SCT21000", "BKN25000"]);
  });

  it("KBOS: negative dew point only (04/M01)", () => {
    const m = parseMetar("METAR KBOS 150254Z 29008KT 10SM FEW100 04/M01 A2978 RMK AO2 SLP085 T00441006 51012 $");
    expect(m.tempC).toBe(4);
    expect(m.dewpointC).toBe(-1);
  });

  it("PABA: storm-force gusts, snow and freezing fog, NO altimeter group", () => {
    const m = parseMetar("METAR PABA 150256Z AUTO 07039G43KT 1/2SM -SN FZFG OVC004 M12/M13 RMK AO2 PK WND 07044/0242 SLPNO P0000 60000 T11171128 FZRANO TSNO $");
    expect(m.wind).toMatchObject({ dirTrue: 70, kt: 39, gustKt: 43 });
    expect(m.visibilitySm).toBe(0.5);
    expect(m.weather).toHaveLength(2);
    expect(m.weather[0]).toMatchObject({ raw: "-SN", intensity: "light", phenomena: ["SN"] });
    expect(m.weather[1]).toMatchObject({ raw: "FZFG", descriptors: ["FZ"], phenomena: ["FG"] });
    expect(m.tempC).toBe(-12);
    expect(m.dewpointC).toBe(-13);
    expect(m.altimeterInHg).toBeNull();
    expect(m.unparsed).toEqual([]);
  });

  it("PASH and PABE: 2 1/2SM and 1 1/4SM, runway visual range ignored", () => {
    expect(parseMetar("SPECI PASH 150301Z AUTO 34014KT 2 1/2SM -SN BR OVC006 M02/M03 A2945 RMK AO2 CIG 004V009 P0000 T10221028 $").visibilitySm).toBe(2.5);
    const m = parseMetar("SPECI PABE 150258Z AUTO 15005KT 1 1/4SM R19R/5000VP6000FT BR BKN001 M10/M10 A2957 RMK AO2 T11001100 TSNO");
    expect(m.visibilitySm).toBe(1.25);
    expect(m.clouds).toEqual([{ cover: "BKN", baseFtAgl: 100, type: null }]);
    expect(m.weather.map((w) => w.raw)).toEqual(["BR"]);
    expect(m.unparsed).toEqual([]);
  });

  it("KRHV: a stray group is reported as not understood, the rest still parses", () => {
    const m = parseMetar("METAR KRHV 150247Z 00000KT 17SM 09 FEW080 15/09 A3000");
    expect(m.visibilitySm).toBe(17);
    expect(m.clouds).toEqual([{ cover: "FEW", baseFtAgl: 8000, type: null }]);
    expect(m.tempC).toBe(15);
    near(m.altimeterInHg, 30.0);
    expect(m.unparsed).toEqual(["09"]);
  });
});

describe("METAR parser — real reports (international)", () => {
  it("BIKF: CAVOK, minus temperatures, altimeter in hectopascals", () => {
    const m = parseMetar("METAR BIKF 150300Z 08009KT CAVOK M03/M10 Q1006");
    expect(m.cavok).toBe(true);
    expect(m.skyClear).toBe("CAVOK");
    near(m.visibilitySm, 6.21, 0.01);
    expect(m.visibilityOrMore).toBe(true);
    expect(m.tempC).toBe(-3);
    expect(m.dewpointC).toBe(-10);
    expect(m.qnhHpa).toBe(1006);
    near(m.altimeterInHg, 29.71, 0.005);
  });

  it("EGLL: COR and AUTO in the body, 9999, NCD, trend NOSIG", () => {
    const m = parseMetar("METAR EGLL 150250Z COR AUTO 07002KT 9999 NCD 02/01 Q1004 NOSIG");
    expect(m.corrected).toBe(true);
    expect(m.auto).toBe(true);
    expect(m.skyClear).toBe("NCD");
    near(m.visibilitySm, 6.21, 0.01);
    expect(m.visibilityOrMore).toBe(true);
    expect(m.trend).toBe("NOSIG");
    near(m.altimeterInHg, 29.65, 0.005);
  });

  it("EDDF: M00 is zero, not minus zero", () => {
    const m = parseMetar("METAR EDDF 150250Z AUTO 03003KT CAVOK M00/M01 Q1013 NOSIG");
    expect(Object.is(m.tempC, 0)).toBe(true);
    expect(m.dewpointC).toBe(-1);
    near(m.altimeterInHg, 29.91, 0.005);
  });

  it("LIRF: variable wind, light thunderstorm with rain, cumulonimbus", () => {
    const m = parseMetar("METAR LIRF 150250Z VRB06KT 9999 -TSRA FEW015CB SCT025 13/13 Q1016 NOSIG");
    expect(m.wind).toMatchObject({ dirTrue: null, variable: true, kt: 6 });
    expect(m.weather).toEqual([{ raw: "-TSRA", intensity: "light", vicinity: false, descriptors: ["TS"], phenomena: ["RA"] }]);
    expect(m.clouds).toEqual([
      { cover: "FEW", baseFtAgl: 1500, type: "CB" },
      { cover: "SCT", baseFtAgl: 2500, type: null },
    ]);
  });

  it("UUEE: wind in metres per second, runway-state groups ignored", () => {
    const m = parseMetar("METAR UUEE 150230Z 25008MPS 9999 BKN018 02/M01 Q1012 R24L/250151 R24C/250151 NOSIG");
    near(m.wind?.kt, 15.55, 0.01);
    expect(m.wind?.dirTrue).toBe(250);
    expect(m.clouds).toEqual([{ cover: "BKN", baseFtAgl: 1800, type: null }]);
    expect(m.unparsed).toEqual([]);
  });

  it("ZBAA and OMDB: variable sector (360V090, 110V170)", () => {
    const z = parseMetar("METAR ZBAA 150230Z 04004MPS 360V090 CAVOK 13/M04 Q1025 NOSIG");
    expect(z.wind).toMatchObject({ dirTrue: 40, varFrom: 0, varTo: 90 });
    near(z.wind?.kt, 7.78, 0.01);
    const o = parseMetar("METAR OMDB 150300Z 14003KT 110V170 CAVOK 22/15 Q1016 NOSIG");
    expect(o.wind).toMatchObject({ dirTrue: 140, kt: 3, varFrom: 110, varTo: 170 });
  });

  it("VIDP: 800 m in shallow fog with several RVR groups", () => {
    const m = parseMetar("METAR VIDP 150300Z 26004KT 0800 R28/1700 R27/1700 R29R/1900 R29L/1800 MIFG SCT035 BKN090 21/17 Q1015 NOSIG");
    near(m.visibilitySm, 0.497, 0.001);
    expect(m.visibilityOrMore).toBe(false);
    expect(m.weather).toEqual([{ raw: "MIFG", intensity: "moderate", vicinity: false, descriptors: ["MI"], phenomena: ["FG"] }]);
    expect(m.clouds.map((c) => c.baseFtAgl)).toEqual([3500, 9000]);
    expect(m.unparsed).toEqual([]);
  });

  it("RJTT and LFPG: the TEMPO trend forecast is not the current weather", () => {
    const r = parseMetar("METAR RJTT 150230Z 01006KT 9000 -RA FEW015 SCT020 BKN040 15/11 Q1011 TEMPO FM0330 FEW008 BKN012");
    near(r.visibilitySm, 5.59, 0.01);
    expect(r.clouds.map((c) => `${c.cover}${c.baseFtAgl}`)).toEqual(["FEW1500", "SCT2000", "BKN4000"]);
    expect(r.trend).toBe("TEMPO FM0330 FEW008 BKN012");
    const l = parseMetar("METAR LFPG 150300Z 21010KT 9999 -RA BKN004 BKN008 06/06 Q1008 TEMPO 4000 -DZRA BKN005");
    near(l.visibilitySm, 6.21, 0.01);
    expect(l.weather.map((w) => w.raw)).toEqual(["-RA"]);
    expect(l.clouds.map((c) => c.baseFtAgl)).toEqual([400, 800]);
  });

  it("EGPC and NZAA: cloud groups with an unmeasured cloud type (BKN006///)", () => {
    const m = parseMetar("METAR EGPC 150250Z AUTO 01020G31KT 8000 -RA BKN006/// OVC014/// 06/05 Q0992");
    expect(m.wind).toMatchObject({ dirTrue: 10, kt: 20, gustKt: 31 });
    expect(m.clouds).toEqual([
      { cover: "BKN", baseFtAgl: 600, type: null },
      { cover: "OVC", baseFtAgl: 1400, type: null },
    ]);
    near(m.altimeterInHg, 29.29, 0.005);
    expect(parseMetar("METAR NZAA 150300Z AUTO 23009KT 9999 FEW060/// 21/17 Q1015").clouds).toEqual([{ cover: "FEW", baseFtAgl: 6000, type: null }]);
  });

  it("EDWE and LKKV: freezing fog, vertical visibility unmeasured (VV///) and measured (VV002)", () => {
    const e = parseMetar("METAR EDWE 150250Z AUTO 14006KT 0550 R07/0800U FZFG VV/// 00/M00 Q1009");
    near(e.visibilitySm, 0.342, 0.001);
    expect(e.clouds).toEqual([{ cover: "VV", baseFtAgl: null, type: null }]);
    expect(e.dewpointC).toBe(0);
    const k = parseMetar("METAR LKKV 150300Z 05003KT 0800 R29/0900D FZFG VV002 M03/M03 Q1015");
    expect(k.clouds).toEqual([{ cover: "VV", baseFtAgl: 200, type: null }]);
    expect(k.weather[0]).toMatchObject({ descriptors: ["FZ"], phenomena: ["FG"] });
  });

  it("LSZH: showers in the vicinity; EHAM: NSC; ETSH: military colour code; MMMX: NOSIG then remarks", () => {
    const l = parseMetar("METAR LSZH 150250Z AUTO VRB01KT 9999 VCSH FEW036 BKN069 M00/M01 Q1015 NOSIG");
    expect(l.weather).toEqual([{ raw: "VCSH", intensity: "moderate", vicinity: true, descriptors: ["SH"], phenomena: [] }]);
    const e = parseMetar("METAR EHAM 150255Z 15007KT 9000 NSC 01/00 Q1007 NOSIG");
    expect(e.skyClear).toBe("NSC");
    near(e.visibilitySm, 5.59, 0.01);
    const t = parseMetar("METAR ETSH 150220Z 12002KT 9999 FEW300 M02/M03 Q1016 BLU+");
    expect(t.clouds).toEqual([{ cover: "FEW", baseFtAgl: 30000, type: null }]);
    expect(t.unparsed).toEqual([]);
    const x = parseMetar("METAR MMMX 150250Z 08003KT 10SM SCT020 SCT080 17/10 A3030 NOSIG RMK SLP120 52023 914 8/530 HZY");
    near(x.altimeterInHg, 30.3);
    expect(x.remarks).toBe("SLP120 52023 914 8/530 HZY");
    expect(x.unparsed).toEqual([]);
  });

  it("CYVR: Canadian report, 20 statute miles", () => {
    const m = parseMetar("METAR CYVR 150200Z 09014KT 20SM BKN037 OVC210 13/09 A2957 RMK SC7CS1 SLP016");
    expect(m.visibilitySm).toBe(20);
    expect(m.visibilityOrMore).toBe(false);
    near(m.altimeterInHg, 29.57);
  });
});

describe("METAR parser — every feature (constructed reports)", () => {
  it("gusts with a variable sector, P6SM, SKC", () => {
    const m = parseMetar("KXYZ 121651Z 24015G25KT 210V270 P6SM SKC 30/10 A2992");
    expect(m.type).toBeNull();
    expect(m.station).toBe("KXYZ");
    expect(m.wind).toEqual({ dirTrue: 240, variable: false, kt: 15, gustKt: 25, varFrom: 210, varTo: 270 });
    expect(m.visibilitySm).toBe(6);
    expect(m.visibilityOrMore).toBe(true);
    expect(m.skyClear).toBe("SKC");
    expect(m.altimeterInHg).toBe(29.92);
  });

  it("less than a quarter mile (M1/4SM), heavy snow showers, vertical visibility", () => {
    const m = parseMetar("METAR KBUF 010154Z 27022G35KT M1/4SM +SHSN BLSN VV001 M08/M10 A2955");
    expect(m.visibilitySm).toBe(0.25);
    expect(m.visibilityLessThan).toBe(true);
    expect(m.weather[0]).toEqual({ raw: "+SHSN", intensity: "heavy", vicinity: false, descriptors: ["SH"], phenomena: ["SN"] });
    expect(m.weather[1]).toMatchObject({ raw: "BLSN", descriptors: ["BL"], phenomena: ["SN"] });
    expect(m.clouds).toEqual([{ cover: "VV", baseFtAgl: 100, type: null }]);
  });

  it("heavy thunderstorm with rain and hail, towering cumulus, recent weather ignored", () => {
    const m = parseMetar("METAR KOKC 011955Z 22015G30KT 3SM +TSRAGR BR FEW030TCU BKN040CB OVC100 22/20 A2978 RERA RMK AO2");
    expect(m.weather.map((w) => w.raw)).toEqual(["+TSRAGR", "BR"]);
    expect(m.weather[0]).toMatchObject({ intensity: "heavy", descriptors: ["TS"], phenomena: ["RA", "GR"] });
    expect(m.clouds).toEqual([
      { cover: "FEW", baseFtAgl: 3000, type: "TCU" },
      { cover: "BKN", baseFtAgl: 4000, type: "CB" },
      { cover: "OVC", baseFtAgl: 10000, type: null },
    ]);
    expect(m.unparsed).toEqual([]);
  });

  it("metric visibility with a direction, a second (minimum) visibility, wind shear group", () => {
    const m = parseMetar("METAR LOWW 011220Z 31012KT 4000NE 1200SW RA BKN012 OVC030 08/07 Q0987 WS R29 BECMG 6000");
    near(m.visibilitySm, 2.485, 0.001);
    expect(m.qnhHpa).toBe(987);
    near(m.altimeterInHg, 29.146, 0.002);
    expect(m.trend).toBe("BECMG 6000");
    expect(m.unparsed).toEqual([]);
  });

  it("9999NDV from an automatic station, NIL, missing groups", () => {
    expect(parseMetar("METAR EKCH 011250Z AUTO 23008KT 9999NDV NCD 12/08 Q1019").visibilityOrMore).toBe(true);
    expect(parseMetar("METAR ENXX 011250Z NIL").nil).toBe(true);
    const m = parseMetar("METAR EGXX 011250Z AUTO /////KT //// ///////// ///// Q////");
    expect(m.wind).toBeNull();
    expect(m.visibilitySm).toBeNull();
    expect(m.tempC).toBeNull();
    expect(m.altimeterInHg).toBeNull();
  });

  it("wind in km/h, three-digit speed, direction 360", () => {
    near(parseMetar("METAR UXXX 010000Z 18036KMH 9999 SKC 10/05 Q1010").wind?.kt, 19.44, 0.01);
    const m = parseMetar("METAR KMWN 010000Z 360105G125KT 1/8SM FZFG VV000 M20/M20 A2950");
    expect(m.wind).toMatchObject({ dirTrue: 0, kt: 105, gustKt: 125 });
    expect(m.visibilitySm).toBe(0.125);
    expect(m.clouds).toEqual([{ cover: "VV", baseFtAgl: 0, type: null }]);
  });

  it("temperature without dew point, unspaced fraction (11/2SM), CCA correction", () => {
    const m = parseMetar("METAR CYYC 010000Z CCA 18005KT 11/2SM -SN OVC008 M05/ A3012");
    expect(m.corrected).toBe(true);
    expect(m.visibilitySm).toBe(1.5);
    expect(m.tempC).toBe(-5);
    expect(m.dewpointC).toBeNull();
  });

  it("is tolerant: extra spaces, line breaks, trailing '=', empty and garbage input never throw", () => {
    const m = parseMetar("  METAR  KSEA 150253Z\n 12009KT 10SM  SCT040 OVC075 14/07 A2962 = ");
    expect(m.station).toBe("KSEA");
    expect(m.clouds).toHaveLength(2);
    near(m.altimeterInHg, 29.62);
    expect(parseMetar("").station).toBeNull();
    expect(() => parseMetar("complete nonsense ### 123")).not.toThrow();
    expect(() => parseMetar(undefined as unknown as string)).not.toThrow();
    expect(parseMetar("complete nonsense ### 123").wind).toBeNull();
  });

  it("weather groups one by one", () => {
    expect(parseWeatherGroup("RA")).toMatchObject({ intensity: "moderate", phenomena: ["RA"] });
    expect(parseWeatherGroup("-SN")).toMatchObject({ intensity: "light", phenomena: ["SN"] });
    expect(parseWeatherGroup("+RA")).toMatchObject({ intensity: "heavy", phenomena: ["RA"] });
    expect(parseWeatherGroup("BR")).toMatchObject({ phenomena: ["BR"] });
    expect(parseWeatherGroup("FG")).toMatchObject({ phenomena: ["FG"] });
    expect(parseWeatherGroup("TS")).toMatchObject({ descriptors: ["TS"], phenomena: [] });
    expect(parseWeatherGroup("VCTS")).toMatchObject({ vicinity: true, descriptors: ["TS"] });
    expect(parseWeatherGroup("-FZDZ")).toMatchObject({ intensity: "light", descriptors: ["FZ"], phenomena: ["DZ"] });
    expect(parseWeatherGroup("RASN")).toMatchObject({ phenomena: ["RA", "SN"] });
    for (const notWeather of ["NOSIG", "AUTO", "CAVOK", "BLU", "A2992", "10SM", "+", "VC", "", "BKN020"]) expect(parseWeatherGroup(notWeather)).toBeNull();
  });
});

describe("METAR time", () => {
  it("resolves the day of the month against the current date, also across a month and a year boundary", () => {
    const now = Date.UTC(2026, 10, 15, 3, 10);
    expect(metarTimeMs(15, 2, 56, now)).toBe(Date.UTC(2026, 10, 15, 2, 56));
    expect(metarTimeMs(14, 23, 50, now)).toBe(Date.UTC(2026, 10, 14, 23, 50));
    // just after midnight on the 1st: a report from the 31st belongs to the month before
    expect(metarTimeMs(31, 23, 50, Date.UTC(2027, 0, 1, 0, 20))).toBe(Date.UTC(2026, 11, 31, 23, 50));
    // … and when the month before has no 31st, to the one before that (never to the future)
    expect(metarTimeMs(31, 23, 50, Date.UTC(2026, 11, 1, 0, 20))).toBe(Date.UTC(2026, 9, 31, 23, 50));
    expect(metarTimeMs(30, 23, 50, Date.UTC(2026, 11, 1, 0, 20))).toBe(Date.UTC(2026, 10, 30, 23, 50));
    expect(metarTimeMs(null, 1, 1, now)).toBeNull();
  });
});

describe("METAR parser cross-checked against aviationweather.gov's own decoding (73 real reports)", () => {
  const all = [...load("awc-metar-bbox-sfo.json"), ...load("awc-metar-intl.json"), ...load("awc-metar-misc.json")];

  it("has the fixtures", () => {
    expect(all.length).toBe(73);
  });

  it("agrees on wind, visibility, clouds, temperature and altimeter for every report", () => {
    const problems: string[] = [];
    const unparsed: string[] = [];
    for (const e of all) {
      const raw = e.rawOb as string;
      const m = parseMetar(raw);
      const bad = (what: string) => problems.push(`${e.icaoId as string}: ${what} | ${raw}`);
      if (m.station !== e.icaoId) bad(`station ${m.station}`);
      if (m.unparsed.length) unparsed.push(`${e.icaoId as string}: ${m.unparsed.join(" ")}`);

      // wind (the service gives whole knots; m/s reports are rounded there)
      if (typeof e.wspd === "number") {
        if (!m.wind || Math.abs(m.wind.kt - e.wspd) > 0.6) bad(`wind speed ${m.wind?.kt} vs ${e.wspd}`);
        else if (e.wdir === "VRB" ? m.wind.dirTrue !== null : m.wind.dirTrue !== ((e.wdir as number) % 360)) bad(`wind direction ${m.wind.dirTrue} vs ${String(e.wdir)}`);
        const gust = typeof e.wgst === "number" ? e.wgst : null;
        if ((m.wind?.gustKt ?? null) !== gust) bad(`gust ${m.wind?.gustKt} vs ${gust}`);
      }
      // visibility: "10+" / "6+" mean "or more"; numbers are statute miles
      if (typeof e.visib === "string") {
        const base = Number(e.visib.replace("+", ""));
        if (!m.visibilityOrMore || m.visibilitySm === null || Math.abs(m.visibilitySm - base) > 0.25) bad(`visibility ${m.visibilitySm} vs ${e.visib}`);
      } else if (typeof e.visib === "number") {
        if (m.visibilitySm === null || Math.abs(m.visibilitySm - e.visib) > 0.02 + e.visib * 0.01) bad(`visibility ${m.visibilitySm} vs ${e.visib}`);
      }
      // clouds (the service writes vertical visibility as "OVX")
      const theirs = (e.clouds as { cover: string; base: number | null }[]).map((c) => `${c.cover === "OVX" ? "VV" : c.cover}${c.base}`);
      const ours = m.clouds.filter((c) => c.baseFtAgl !== null).map((c) => `${c.cover}${c.baseFtAgl}`);
      if (theirs.join() !== ours.join()) bad(`clouds ${ours.join()} vs ${theirs.join()}`);
      // temperature / dew point: the service uses the tenths from the remarks when present
      if (typeof e.temp === "number" && (m.tempC === null || Math.abs(m.tempC - e.temp) > 0.56)) bad(`temperature ${m.tempC} vs ${e.temp}`);
      if (typeof e.dewp === "number" && (m.dewpointC === null || Math.abs(m.dewpointC - e.dewp) > 0.56)) bad(`dew point ${m.dewpointC} vs ${e.dewp}`);
      // altimeter (the service gives hectopascals)
      if (typeof e.altim === "number") {
        if (m.qnhHpa === null || Math.abs(m.qnhHpa - e.altim) > 0.25) bad(`altimeter ${m.qnhHpa} vs ${e.altim}`);
      } else if (m.qnhHpa !== null) bad(`altimeter ${m.qnhHpa} vs none`);
      // present weather
      const wx = typeof e.wxString === "string" ? e.wxString : "";
      if (m.weather.map((w) => w.raw).join(" ") !== wx) bad(`weather "${m.weather.map((w) => w.raw).join(" ")}" vs "${wx}"`);
    }
    expect(problems).toEqual([]);
    // the only group in 73 real reports that the parser may not know is KRHV's stray "09"
    expect(unparsed).toEqual(["KRHV: 09"]);
  });
});
