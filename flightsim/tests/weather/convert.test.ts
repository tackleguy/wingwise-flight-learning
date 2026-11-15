/** From a report to the simulator's Environment: units, heights above sea level, estimated tops and winds aloft. */
import { describe, expect, it } from "vitest";
import { windAt } from "@/core/sim";
import { GRADIENT_TURN_DEG, buildCloudLayers, buildWeather, buildWindLayers, cloudThicknessFt, estimateVisibilitySm, metarToObservation, type ObsCloud } from "@/weather/convert";
import { parseMetar } from "@/weather/metar";

const FT_PER_M = 3.280839895;
const fromMetar = (raw: string, elevFt: number, lat = 40) => buildWeather(metarToObservation(parseMetar(raw), { elevFt, lat, lon: 0 }), { fallbackElevFt: 0, lat });
const cloud = (cover: ObsCloud["cover"], baseFtAgl: number, type: ObsCloud["type"] = null): ObsCloud => ({ cover, baseFtAgl, type, obscured: false });

describe("METAR → Environment", () => {
  it("converts cloud bases from above-ground to above-sea-level using the station elevation", () => {
    // Denver: 1,656 m = 5,433 ft
    const elev = 1656 * FT_PER_M;
    const { env } = fromMetar("METAR KDEN 150253Z 29006KT 1 3/4SM BKN004 06/05 A2991 RMK AO2", elev);
    expect(env.stationElevFt).toBeCloseTo(5433, 0);
    expect(env.clouds).toHaveLength(1);
    expect(env.clouds[0]!.cover).toBe("BKN");
    expect(env.clouds[0]!.baseFtMsl).toBe(Math.round(elev + 400));
    expect(env.clouds[0]!.topFtMsl).toBeGreaterThan(env.clouds[0]!.baseFtMsl + 999);
    expect(env.visibilitySm).toBe(1.75);
    expect(env.tempC).toBe(6);
    expect(env.dewpointC).toBe(5);
    expect(env.qnhInHg).toBeCloseTo(29.91, 2);
    expect(env.source).toBe("metar");
    expect(env.stationId).toBe("KDEN");
    expect(env.rawReport).toContain("KDEN 150253Z");
  });

  it("converts an altimeter in hectopascals (Q) to inches of mercury", () => {
    expect(fromMetar("METAR EGLL 150250Z 07002KT 9999 NCD 02/01 Q1013", 83).env.qnhInHg).toBeCloseTo(29.91, 2);
    expect(fromMetar("METAR EGPH 150250Z 23018KT 9999 -RA FEW048 09/06 Q0996", 135).env.qnhInHg).toBeCloseTo(29.41, 2);
    expect(fromMetar("METAR FAOR 150300Z 06009KT 8000 OVC004 15/14 Q1024 NOSIG", 5525).env.qnhInHg).toBeCloseTo(30.24, 2);
    expect(fromMetar("METAR KSFO 150256Z 00000KT 10SM BKN180 16/11 A2998", 7).env.qnhInHg).toBe(29.98);
  });

  it("stores the gust as the increment above the mean wind, and the surface wind at station elevation", () => {
    const { env } = fromMetar("METAR EGPC 150250Z AUTO 01020G31KT 8000 -RA BKN006/// OVC014/// 06/05 Q0992", 125);
    expect(env.gustKt).toBe(11);
    expect(env.wind[0]).toEqual({ altFtMsl: 125, dirTrue: 10, kt: 20 });
    expect(env.precipitation).toBe("rain");
    expect(env.visibilitySm).toBeCloseTo(4.97, 2);
    // the lower layer is squeezed under the upper one, never overlapping it
    expect(env.clouds.map((c) => c.cover)).toEqual(["BKN", "OVC"]);
    expect(env.clouds[0]!.topFtMsl).toBeLessThanOrEqual(env.clouds[1]!.baseFtMsl - 200);
    expect(env.clouds[1]!.topFtMsl - env.clouds[1]!.baseFtMsl).toBe(3000); // rain: a thick layer
  });

  it("turns vertical visibility (fog hiding the sky) into a solid layer from that height", () => {
    const { env } = fromMetar("SPECI KHVR 150300Z AUTO 24004KT 1/4SM FG VV002 00/00 A2977", 2589);
    expect(env.clouds).toEqual([{ cover: "OVC", baseFtMsl: 2789, topFtMsl: 3989 }]);
    expect(env.visibilitySm).toBe(0.25);
    const unmeasured = fromMetar("METAR EDWE 150250Z AUTO 14006KT 0550 FZFG VV/// 00/M00 Q1009", 0).env;
    expect(unmeasured.clouds).toEqual([{ cover: "OVC", baseFtMsl: 100, topFtMsl: 1300 }]);
  });

  it("recognises rain, snow, a mix (by temperature) and ignores weather that is only in the vicinity", () => {
    expect(fromMetar("METAR PABR 150253Z 07027G36KT 1 1/4SM -SN BR OVC013 M12/M14 A2986", 20).env.precipitation).toBe("snow");
    expect(fromMetar("METAR KXXX 150253Z 07010KT 3SM RASN OVC013 03/02 A2986", 20).env.precipitation).toBe("rain");
    expect(fromMetar("METAR KXXX 150253Z 07010KT 3SM RASN OVC013 01/00 A2986", 20).env.precipitation).toBe("snow");
    expect(fromMetar("METAR LSZH 150250Z VRB01KT 9999 VCSH FEW036 M00/M01 Q1015", 1400).env.precipitation).toBe("none");
    expect(fromMetar("METAR KXXX 150253Z 07010KT 5SM BR OVC013 03/02 A2986", 20).env.precipitation).toBe("none");
    expect(fromMetar("METAR KXXX 150253Z 07010KT 2SM -DZ OVC004 03/02 A2986", 20).env.precipitation).toBe("rain");
  });

  it("a thunderstorm makes the air turbulent and its cloud deep", () => {
    const b = fromMetar("METAR LIRF 150250Z VRB06KT 9999 -TSRA FEW015CB SCT025 13/13 Q1016", 7);
    expect(b.env.turbulence).toBeGreaterThan(0.3);
    expect(b.convective).toBe(1);
    expect(b.env.precipitation).toBe("rain");
    expect(b.dirSwingDeg).toBe(60); // "VRB": the light wind wanders
  });

  it("uses the middle of a variable sector when no mean direction is given, and swings across it", () => {
    const b = buildWeather(metarToObservation(parseMetar("METAR OMDB 150300Z 14003KT 110V170 CAVOK 22/15 Q1016"), { elevFt: 16 }), { fallbackElevFt: 0, lat: 25 });
    expect(b.env.wind[0]!.dirTrue).toBe(140);
    expect(b.dirSwingDeg).toBe(30);
    const across = buildWeather(metarToObservation(parseMetar("METAR ZBAA 150230Z 04004MPS 360V090 CAVOK 13/M04 Q1025"), { elevFt: 100 }), { fallbackElevFt: 0, lat: 40 });
    expect(across.dirSwingDeg).toBe(45);
  });

  it("fills in what a report lacks and says so", () => {
    const b = fromMetar("METAR PABA 150256Z AUTO 07039G43KT 1/2SM -SN FZFG OVC004 M12/M13 RMK AO2", 3);
    expect(b.env.qnhInHg).toBe(29.92);
    expect(b.notes.join(" ")).toMatch(/altimeter setting was not reported/);
    expect(b.notes.join(" ")).toMatch(/estimated from the surface wind/);
    const bare = buildWeather(metarToObservation(parseMetar("METAR KXXX 150256Z")), { fallbackElevFt: 5000, lat: 40 });
    expect(bare.env.stationElevFt).toBe(5000);
    expect(bare.env.tempC).toBe(5); // standard atmosphere at 5,000 ft
    expect(bare.env.wind[0]!.kt).toBe(0);
    expect(bare.notes.join(" ")).toMatch(/did not report wind/);
    expect(bare.env.visibilitySm).toBeGreaterThanOrEqual(10);
  });

  it("uses the model wind only when the station reported none", () => {
    const obs = metarToObservation(parseMetar("METAR KXXX 150256Z 10SM CLR 16/11 A2998"), { elevFt: 10 });
    const b = buildWeather(obs, { fallbackElevFt: 0, lat: 37, modelWind: { dirTrue: 200, kt: 9, gustKt: null } });
    expect(b.env.wind[0]).toEqual({ altFtMsl: 10, dirTrue: 200, kt: 9 });
    expect(b.notes.join(" ")).toMatch(/Open-Meteo weather model/);
    const withWind = buildWeather(metarToObservation(parseMetar("METAR KXXX 150256Z 30004KT 10SM CLR 16/11 A2998"), { elevFt: 10 }), {
      fallbackElevFt: 0,
      lat: 37,
      modelWind: { dirTrue: 200, kt: 9, gustKt: null },
    });
    expect(withWind.env.wind[0]).toEqual({ altFtMsl: 10, dirTrue: 300, kt: 4 });
  });
});

describe("cloud tops", () => {
  it("gives FEW/SCT cumulus 1,500 to 4,000 ft depending on how moist the air is", () => {
    expect(cloudThicknessFt(cloud("SCT", 4000), 15, "none")).toBe(1500);
    expect(cloudThicknessFt(cloud("SCT", 4000), 3, "none")).toBe(4000);
    const mid = cloudThicknessFt(cloud("FEW", 3000), 9, "none");
    expect(mid).toBeGreaterThan(1500);
    expect(mid).toBeLessThan(4000);
  });

  it("gives BKN/OVC stratus 1,000 to 3,000 ft, thickest in rain", () => {
    for (const spread of [0, 2, 5, 10, 20]) {
      const t = cloudThicknessFt(cloud("OVC", 1500), spread, "none");
      expect(t).toBeGreaterThanOrEqual(1000);
      expect(t).toBeLessThanOrEqual(3000);
    }
    expect(cloudThicknessFt(cloud("BKN", 1500), 1, "rain")).toBe(3000);
    expect(cloudThicknessFt(cloud("OVC", 1500), 12, "none")).toBeLessThan(cloudThicknessFt(cloud("OVC", 1500), 1, "none"));
  });

  it("makes thunderstorm cloud deep and high cloud thin", () => {
    expect(cloudThicknessFt(cloud("FEW", 3000, "CB"), 5, "rain")).toBe(9000);
    expect(cloudThicknessFt(cloud("SCT", 3000, "TCU"), 5, "none")).toBe(6000);
    expect(cloudThicknessFt(cloud("SCT", 21000), 5, "none")).toBe(1200);
    expect(cloudThicknessFt(cloud("BKN", 25000), 5, "none")).toBe(1500);
  });

  it("keeps at most four layers, lowest first, bases above sea level, never overlapping", () => {
    const layers = buildCloudLayers([cloud("BKN", 20000), cloud("FEW", 500), cloud("SCT", 7000), cloud("SCT", 13000), cloud("FEW", 5000)], 39, 5, "none");
    expect(layers).toHaveLength(4);
    expect(layers.map((l) => l.baseFtMsl)).toEqual([539, 7039, 13039, 20039]); // the FEW at 5,000 ft is the least significant
    for (let i = 0; i < layers.length; i++) {
      expect(layers[i]!.topFtMsl).toBeGreaterThanOrEqual(layers[i]!.baseFtMsl + 300);
      if (i > 0) expect(layers[i - 1]!.topFtMsl).toBeLessThanOrEqual(layers[i]!.baseFtMsl - 200);
    }
  });
});

describe("visibility estimate", () => {
  it("keeps a measured visibility as it is", () => {
    expect(estimateVisibilitySm(3, false, 10, "none")).toBe(3);
    expect(estimateVisibilitySm(0.25, false, 0, "none")).toBe(0.25);
  });
  it("stretches 'ten miles or more' with the dryness of the air, never below what was reported", () => {
    expect(estimateVisibilitySm(10, true, 1, "none")).toBe(10);
    expect(estimateVisibilitySm(10, true, 5, "none")).toBeCloseTo(17.5, 5);
    expect(estimateVisibilitySm(10, true, 30, "none")).toBe(40);
    expect(estimateVisibilitySm(6.21, true, 1, "none")).toBe(7); // "9999": at least 10 km
    expect(estimateVisibilitySm(10, true, 12, "rain")).toBe(10);
  });
});

describe("wind layers", () => {
  it("starts with the reported wind at station elevation and strengthens with height (friction layer, then gradient wind)", () => {
    const layers = buildWindLayers({ surfaceDirTrue: 270, surfaceKt: 10, stationElevFt: 1000 });
    expect(layers[0]).toEqual({ altFtMsl: 1000, dirTrue: 270, kt: 10 });
    expect(layers.map((l) => l.altFtMsl)).toEqual([1000, 1100, 1300, 2000, 3000, 6000, 11000]);
    for (let i = 1; i < layers.length; i++) expect(layers[i]!.kt).toBeGreaterThan(layers[i - 1]!.kt);
    // one-seventh power law above the 33 ft where the wind is measured: (133/33)^(1/7) = 1.22, (333/33)^(1/7) = 1.39
    expect(layers[1]!.kt).toBeCloseTo(12.2, 5);
    expect(layers[2]!.kt).toBeCloseTo(13.9, 5);
    expect(Math.pow(133 / 33, 1 / 7)).toBeCloseTo(1.22, 2);
    expect(Math.pow(333 / 33, 1 / 7)).toBeCloseTo(1.39, 2);
    expect(windAt({ wind: layers } as never, 1300).kt).toBeCloseTo(13.9, 5);
    expect(windAt({ wind: layers } as never, 900).kt).toBeCloseTo(10, 5);
  });

  it("veers 20 to 30 degrees with height in the northern hemisphere and backs in the southern", () => {
    const north = buildWindLayers({ surfaceDirTrue: 350, surfaceKt: 12, stationElevFt: 0 });
    const south = buildWindLayers({ surfaceDirTrue: 350, surfaceKt: 12, stationElevFt: 0, southern: true });
    const gradientN = north.find((l) => l.altFtMsl === 2000)!;
    const gradientS = south.find((l) => l.altFtMsl === 2000)!;
    expect(gradientN.dirTrue).toBeCloseTo(350 + GRADIENT_TURN_DEG - 360, 5); // 015°
    expect(gradientS.dirTrue).toBeCloseTo(350 - GRADIENT_TURN_DEG, 5); // 325°
    const top = north[north.length - 1]!;
    const veer = ((top.dirTrue - 350 + 540) % 360) - 180;
    expect(veer).toBeGreaterThanOrEqual(20);
    expect(veer).toBeLessThanOrEqual(30);
    expect(gradientN.kt / 12).toBeGreaterThan(1.5);
  });

  it("uses real winds aloft when given and ignores levels at or below the ground", () => {
    // Leadville, Colorado (9,900 ft): the 925 and 850 hPa levels are underground, 700 hPa is at the surface
    const aloft = [
      { altFtMsl: 2434, dirTrue: 318, kt: 5.1 },
      { altFtMsl: 4760, dirTrue: 317, kt: 5.3 },
      { altFtMsl: 9961, dirTrue: 318, kt: 6.2 },
      { altFtMsl: 13947, dirTrue: 320, kt: 8.6 },
    ];
    const layers = buildWindLayers({ surfaceDirTrue: 12, surfaceKt: 6.3, stationElevFt: 9895, aloft });
    expect(layers[layers.length - 1]).toEqual({ altFtMsl: 13947, dirTrue: 320, kt: 8.6 });
    expect(layers.filter((l) => l.altFtMsl < 9895)).toEqual([]);
    for (let i = 1; i < layers.length; i++) expect(layers[i]!.altFtMsl).toBeGreaterThan(layers[i - 1]!.altFtMsl);
    // friction-layer steps never exceed the wind above them
    for (const l of layers) expect(l.kt).toBeLessThanOrEqual(8.6 + 1e-9);
  });

  it("can leave the air still at every height (the calm preset), and always returns at least one layer", () => {
    expect(buildWindLayers({ surfaceDirTrue: null, surfaceKt: 0, stationElevFt: 50, estimateAloft: false })).toEqual([{ altFtMsl: 50, dirTrue: 0, kt: 0 }]);
    const calm = buildWindLayers({ surfaceDirTrue: null, surfaceKt: 0, stationElevFt: 0 });
    expect(calm[0]!.kt).toBe(0);
    expect(calm[calm.length - 1]!.kt).toBeGreaterThan(0); // some wind aloft is still estimated
    expect(calm.every((l) => Number.isFinite(l.dirTrue) && l.dirTrue >= 0 && l.dirTrue < 360)).toBe(true);
  });
});
