import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyPreset, labSimOptions } from "@/lib/avionics/scenarios";
import { AVIONICS_TASKS } from "@/lib/avionics/tasks";
import {
  morse,
  resolveIdentifier,
  searchIdentifiers,
  stepComFreq,
  stepNavFreq,
  syntheticTraffic,
  terrainGridAround,
} from "@/sim/avionics-helpers";
import { SimEngine } from "@/sim/engine";
import { SimProvider } from "@/sim/react";
import {
  Annunciators,
  AutopilotPanel,
  EngineGauges,
  GpsUnit,
  Mfd,
  NavInstrumentsPanel,
  Pfd,
  RadiosPanel,
  SixPack,
  SwitchPanel,
} from "./index";

function makeEngine(perfId = "c172") {
  return new SimEngine(labSimOptions(perfId, "scattered"));
}

function run(e: SimEngine, sec: number) {
  for (let t = 0; t < sec; t += 0.1) e.advance(0.1);
}

describe("avionics helpers", () => {
  it("steps NAV and COM frequencies with wrap-around", () => {
    expect(stepNavFreq(117.95, "khz", 1)).toBe(117);
    expect(stepNavFreq(108.0, "mhz", -1)).toBe(117);
    expect(stepNavFreq(116.75, "khz", 1)).toBe(116.8);
    expect(stepComFreq(118.975, "khz", 1)).toBe(118);
    expect(stepComFreq(118.3, "khz", 1)).toBe(118.325);
  });
  it("searches identifiers and resolves waypoints", () => {
    expect(searchIdentifiers("KHA")[0]?.id).toBe("KHAF");
    expect(resolveIdentifier("OAK", { lat: 37.7, lon: -122.2 })?.lat).toBeCloseTo(37.7259, 3);
    expect(morse("OAK")).toBe("---  .-  -.-");
  });
  it("produces deterministic traffic and a cached terrain grid", () => {
    expect(syntheticTraffic(100, 37.7, -122.2)).toEqual(syntheticTraffic(100, 37.7, -122.2));
    const g1 = terrainGridAround(37.6, -122.2, 10);
    const g2 = terrainGridAround(37.6001, -122.2001, 10);
    expect(g1).toBe(g2);
  });
});

describe("avionics components render from the engine snapshot", () => {
  it("renders every display without crashing (glass and steam)", () => {
    for (const id of ["c172", "pa28"]) {
      const e = makeEngine(id);
      run(e, 1);
      const { unmount } = render(
        <SimProvider engine={e}>
          <Pfd />
          <Mfd />
          <SixPack />
          <NavInstrumentsPanel />
          <GpsUnit />
          <AutopilotPanel />
          <RadiosPanel />
          <Annunciators />
          <SwitchPanel />
          <EngineGauges />
        </SimProvider>,
      );
      expect(screen.getAllByRole("img").length).toBeGreaterThan(10);
      unmount();
    }
  });

  it("autopilot buttons change engine state", () => {
    const e = makeEngine();
    render(
      <SimProvider engine={e}>
        <AutopilotPanel />
      </SimProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "AP" }));
    });
    expect(e.getSnapshot().ap.engaged).toBe(true);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "HDG" }));
    });
    expect(e.getSnapshot().ap.lateral).toBe("HDG");
  });

  it("knobs respond to arrow keys (heading bug)", () => {
    const e = makeEngine();
    render(
      <SimProvider engine={e}>
        <AutopilotPanel />
      </SimProvider>,
    );
    const before = e.getSnapshot().radios.hdgBug;
    const knob = screen.getByRole("slider", { name: /^HDG/ });
    act(() => {
      fireEvent.keyDown(knob, { key: "ArrowUp" });
      fireEvent.keyDown(knob, { key: "ArrowUp" });
    });
    expect(e.getSnapshot().radios.hdgBug).toBe((before + 2) % 360);
  });

  it("transponder keypad only enters 0–7 and commits after four digits", () => {
    const e = makeEngine();
    render(
      <SimProvider engine={e}>
        <RadiosPanel />
      </SimProvider>,
    );
    const pad = screen.getByRole("group", { name: /keypad/i });
    expect(pad.textContent).not.toContain("8");
    for (const d of ["4", "5", "2", "1"]) {
      act(() => {
        fireEvent.click(
          Array.from(pad.querySelectorAll("button")).find((b) => b.textContent === d)!,
        );
      });
    }
    expect(e.getSnapshot().radios.transponder.code).toBe("4521");
  });
});

describe("avionics lab tasks", () => {
  it("has at least 14 tasks with unique ids", () => {
    expect(AVIONICS_TASKS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(AVIONICS_TASKS.map((t) => t.id)).size).toBe(AVIONICS_TASKS.length);
  });

  it("baro, squawk and NAV1 tuning checks react to engine state", () => {
    const e = makeEngine();
    e.setRadios({ altimeterInHg: 29.92 });
    run(e, 0.5);
    const task = (id: string) => AVIONICS_TASKS.find((t) => t.id === id)!;
    expect(task("baro-set").check(e.getSnapshot(), {})).toBe(false);
    e.setRadios({ altimeterInHg: e.getSnapshot().weather.qnhInHg });
    expect(task("baro-set").check(e.getSnapshot(), {})).toBe(true);

    expect(task("squawk").check(e.getSnapshot(), {})).toBe(false);
    e.setRadios({ transponder: { code: "4521", mode: "ALT" } });
    expect(task("squawk").check(e.getSnapshot(), {})).toBe(true);

    e.setRadios({ nav1: { ...e.getSnapshot().radios.nav1, active: 116.8 } });
    run(e, 0.2);
    expect(task("tune-oak").check(e.getSnapshot(), {})).toBe(true);
  });

  it("ILS preset + APR captures the localizer and glideslope", () => {
    const e = makeEngine();
    applyPreset(e, "ils28r");
    e.apToggle();
    e.apLateral("APR");
    let captured = false;
    for (let t = 0; t < 240 && !captured; t += 0.1) {
      e.advance(0.1);
      captured = AVIONICS_TASKS.find((x) => x.id === "ils-capture")!.check(e.getSnapshot(), {});
    }
    expect(captured).toBe(true);
  });
});
