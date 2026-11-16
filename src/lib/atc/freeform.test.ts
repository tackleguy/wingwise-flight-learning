import { describe, expect, it } from "vitest";
import { AIRPORTS, allRunwayEnds } from "@/lib/data/airports";
import { facilityOf } from "./context";
import { formatFreqShort } from "./frequency";
import {
  advanceFreeFlight,
  aiStateSnapshot,
  applyAiTurn,
  createFreeState,
  facilityAt,
  freeDirectory,
  freeHint,
  readbackExample,
  scriptedTurn,
} from "./freeform";
import { PHONETIC, usRunway } from "./phrase";

function simPilotCall(
  state: ReturnType<typeof createFreeState>["state"],
  text: string,
  mhz?: number,
) {
  const f = mhz ? facilityAt(state, mhz) : facilityOf(state.ctx, state.currentStation);
  if (!f) throw new Error(`No facility for mhz=${mhz} / station=${state.currentStation}`);
  return scriptedTurn(state, text, f);
}

describe("full-flight ATC engine", () => {
  it("flies an end-to-end VFR cross-country flight from departure ramp to destination parking", () => {
    const setup = createFreeState({
      airportIcao: "KPAO",
      destinationIcao: "KSQL",
      aircraftId: "c172",
      callsign: "N172TX",
      rules: "VFR",
      goalId: "vfr-full-flight",
      difficulty: "beginner",
      personality: "professional",
    });

    let s = setup.state;
    expect(s.leg).toBe("departure");
    expect(s.dest?.airport.icao).toBe("KSQL");
    expect(s.goalReached).toBe(false);

    // 1. Request taxi on Ground
    let res = simPilotCall(
      s,
      `Palo Alto Ground, N172TX, Cessna 172 at transient parking with information ${PHONETIC[s.ctx.atis.letter]}, VFR to San Carlos, request taxi.`,
    );
    s = res.state;
    expect(s.phase).toBe("taxiing");
    expect(s.pending?.tag).toBe("taxi");

    // 2. Read back taxi
    res = simPilotCall(s, readbackExample(s, s.pending!, facilityOf(s.ctx, s.pending!.facility)));
    s = res.state;
    expect(s.phase).toBe("holding-short");
    expect(s.currentStation).toBe("tower");

    // 3. Ready for takeoff on Tower
    res = simPilotCall(
      s,
      `Palo Alto Tower, N172TX, holding short runway ${s.ctx.runway.id}, ready for takeoff.`,
    );
    s = res.state;
    expect(s.pending?.tag).toBe("takeoff");

    // 4. Read back takeoff -> airborne, then read back handoff to Departure
    res = simPilotCall(s, readbackExample(s, s.pending!, facilityOf(s.ctx, "tower")));
    s = res.state;
    expect(s.phase).toBe("airborne");
    expect(s.pending?.tag).toBe("handoff");
    res = simPilotCall(s, readbackExample(s, s.pending!, facilityOf(s.ctx, "tower")));
    s = res.state;
    expect(s.currentStation).toBe("departure");

    // 5. Request flight following enroute
    res = simPilotCall(
      s,
      `NorCal Departure, N172TX, Cessna 172, 1,500 feet, request VFR flight following to San Carlos at 3,500.`,
    );
    s = res.state;
    expect(s.pending?.tag).toBe("squawk");
    res = simPilotCall(s, readbackExample(s, s.pending!, facilityOf(s.ctx, s.pending!.facility)));
    s = res.state;
    expect(s.ffActive).toBe(true);

    // 6. Advance to destination approach leg
    const adv = advanceFreeFlight(s);
    s = adv.state;
    expect(s.leg).toBe("destination");
    expect(s.ctx.airport.icao).toBe("KSQL");
    expect(s.phase).toBe("inbound");

    // 7. Report inbound for landing on destination Tower
    const destTwr = facilityOf(s.ctx, "tower");
    res = simPilotCall(
      s,
      `${destTwr.name}, N172TX, 12 miles southeast, inbound landing with information ${PHONETIC[s.ctx.atis.letter]}.`,
      destTwr.mhz,
    );
    s = res.state;
    if (s.pending) {
      res = simPilotCall(s, readbackExample(s, s.pending, destTwr), destTwr.mhz);
      s = res.state;
    }

    // 8. Report final & read back landing clearance
    res = simPilotCall(s, `${destTwr.name}, N172TX, final runway ${s.ctx.runway.id}.`, destTwr.mhz);
    s = res.state;
    expect(s.pending?.tag).toBe("landing");
    res = simPilotCall(s, readbackExample(s, s.pending!, destTwr), destTwr.mhz);
    s = res.state;
    expect(s.phase).toBe("landed");

    // 9. Clear of runway on destination Ground -> goalReached
    const destGnd = facilityOf(s.ctx, "ground");
    res = simPilotCall(
      s,
      `${destGnd.name}, N172TX, clear of runway ${s.ctx.runway.id}, taxi to parking.`,
      destGnd.mhz,
    );
    s = res.state;
    expect(s.phase).toBe("parked");
    expect(s.goalReached).toBe(true);
  });

  it("flies an end-to-end IFR flight including CRAFT clearance, center, approach, and landing", () => {
    const setup = createFreeState({
      airportIcao: "KPAO",
      destinationIcao: "KMRY",
      aircraftId: "sr22",
      callsign: "N422SR",
      rules: "IFR",
      goalId: "ifr-full-flight",
      difficulty: "intermediate",
      personality: "professional",
    });

    let s = setup.state;
    expect(s.currentStation).toBe("clearance");

    // Clearance request + readback
    const clnc = facilityOf(s.ctx, "clearance");
    let res = simPilotCall(
      s,
      `${clnc.name}, N422SR, Cirrus SR22, ready to copy IFR clearance to Monterey.`,
      clnc.mhz,
    );
    s = res.state;
    expect(s.clearance).not.toBeNull();
    expect(s.pending?.tag).toBe("clearance");

    res = simPilotCall(s, readbackExample(s, s.pending!, clnc), clnc.mhz);
    s = res.state;
    expect(s.currentStation).toBe("ground");

    // Taxi + readback
    const gnd = facilityOf(s.ctx, "ground");
    res = simPilotCall(
      s,
      `${gnd.name}, N422SR, at transient parking with information ${PHONETIC[s.ctx.atis.letter]}, ready to taxi.`,
      gnd.mhz,
    );
    s = res.state;
    res = simPilotCall(s, readbackExample(s, s.pending!, gnd), gnd.mhz);
    s = res.state;

    // Takeoff + readback
    const twr = facilityOf(s.ctx, "tower");
    res = simPilotCall(
      s,
      `${twr.name}, N422SR, holding short runway ${s.ctx.runway.id}, ready for takeoff.`,
      twr.mhz,
    );
    s = res.state;
    res = simPilotCall(s, readbackExample(s, s.pending!, twr), twr.mhz);
    s = res.state;
    expect(s.phase).toBe("airborne");

    // Check in with Departure -> climb -> handoff to Center
    const dep = facilityOf(s.ctx, "departure");
    res = simPilotCall(s, `${dep.name}, N422SR, 1,200 climbing ${s.clearance!.altitude}.`, dep.mhz);
    s = res.state;
    if (s.pending) {
      res = simPilotCall(s, readbackExample(s, s.pending, dep), dep.mhz);
      s = res.state;
    }

    // Advance to Monterey destination arrival
    const adv = advanceFreeFlight(s);
    s = adv.state;
    expect(s.leg).toBe("destination");
    expect(s.ctx.airport.icao).toBe("KMRY");
    expect(s.phase).toBe("arrival");

    const app = facilityOf(s.ctx, "approach");
    res = simPilotCall(
      s,
      `${app.name}, N422SR, ${s.ctx.altitude} feet, inbound with information ${PHONETIC[s.ctx.atis.letter]}.`,
      app.mhz,
    );
    s = res.state;
    // Descend -> vectors -> approach clearance
    for (let i = 0; i < 4 && s.pending; i++) {
      res = simPilotCall(s, readbackExample(s, s.pending, facilityOf(s.ctx, s.pending.facility)));
      s = res.state;
    }
    expect(s.phase).toBe("final");

    const destTwr = facilityOf(s.ctx, "tower");
    res = simPilotCall(s, `${destTwr.name}, N422SR, final runway ${s.ctx.runway.id}.`, destTwr.mhz);
    s = res.state;
    res = simPilotCall(s, readbackExample(s, s.pending!, destTwr), destTwr.mhz);
    s = res.state;
    expect(s.phase).toBe("landed");

    const destGnd = facilityOf(s.ctx, "ground");
    res = simPilotCall(
      s,
      `${destGnd.name}, N422SR, clear of runway ${s.ctx.runway.id}, taxi to parking.`,
      destGnd.mhz,
    );
    s = res.state;
    expect(s.goalReached).toBe(true);
  });

  it("handles untowered CTAF self-announces and hints cleanly", () => {
    const ctafAp = AIRPORTS.find((a) => !a.towered)!;
    const setup = createFreeState({
      airportIcao: ctafAp.icao,
      destinationIcao: "KPAO",
      aircraftId: "c172",
      callsign: "N172TX",
      rules: "VFR",
      goalId: "vfr-full-flight",
      difficulty: "beginner",
      personality: "professional",
    });
    let s = setup.state;
    expect(s.currentStation).toBe("ctaf");
    const hint = freeHint(s);
    expect(hint).toContain("Self-announce");
    expect(hint).not.toContain("request taxi");
    const ctaf = facilityOf(s.ctx, "ctaf");
    const r = simPilotCall(
      s,
      `${ctaf.name}, N172TX, taxiing to runway ${s.ctx.runway.id}, ${s.ctx.airportName}.`,
      ctaf.mhz,
    );
    s = r.state;
    expect(s.phase).toBe("holding-short");
  });

  it("handles conversational communicator intents (radio check, weather, altitude, go-around, divert)", () => {
    const setup = createFreeState({
      airportIcao: "KPAO",
      destinationIcao: "KSQL",
      aircraftId: "c172",
      callsign: "N172TX",
      rules: "VFR",
      goalId: "vfr-full-flight",
      difficulty: "beginner",
      personality: "professional",
    });
    let s = setup.state;
    // Radio check
    const rc = simPilotCall(s, "Palo Alto Ground, N172TX, radio check.");
    expect(
      rc.replies.some(
        (r) => r.kind === "atc" && /five by five|loud and clear/i.test(r.phrase.text),
      ),
    ).toBe(true);

    // Move airborne to test weather, altitude request, and diversion
    s = { ...s, phase: "enroute", currentStation: "approach", ffActive: true };
    const app = facilityOf(s.ctx, "approach");
    const wx = simPilotCall(s, `${app.name}, N172TX, request wind and altimeter check.`, app.mhz);
    expect(wx.replies[0]?.phrase.text).toMatch(/altimeter/i);

    const altReq = simPilotCall(s, `${app.name}, N172TX, request climb 5500.`, app.mhz);
    expect(altReq.state.pending?.tag).toBe("altitude");

    const div = simPilotCall(s, `${app.name}, N172TX, request divert to KMRY.`, app.mhz);
    expect(div.state.dest?.airport.icao).toBe("KMRY");
    expect(div.state.ctx.destination.icao).toBe("KMRY");
  });

  it("allows destination runways/frequencies in applyAiTurn guardrails and switches legs", () => {
    const setup = createFreeState({
      airportIcao: "KPAO",
      destinationIcao: "KMRY",
      aircraftId: "c172",
      callsign: "N172TX",
      rules: "VFR",
      goalId: "vfr-full-flight",
      difficulty: "beginner",
      personality: "professional",
    });
    const s = { ...setup.state, phase: "enroute" as const, currentStation: "approach" as const };
    const snap = aiStateSnapshot(s, { aglFt: 4500, onGround: false });
    expect(snap["leg"]).toBe("departure");
    expect(snap["destinationAirport"]).toBeDefined();
    expect(snap["telemetry"]).toBeDefined();

    const destTwr = s.dest!.facilities.tower!;
    const destRwy = usRunway(allRunwayEnds(s.dest!.airport)[0]!.end.id);
    const app = facilityOf(s.ctx, "approach");
    const aiReply = applyAiTurn(
      s,
      {
        station: destTwr.name,
        transmission: `N172TX, ${destTwr.name}, enter left downwind runway ${destRwy}, altimeter 29.98.`,
        stateUpdates: { leg: "destination", currentStation: destTwr.name, phase: "inbound" },
        evaluation: { score: 92, issues: [] },
        hint: `Read back left downwind runway ${destRwy}.`,
      },
      `${destTwr.name}, N172TX, 10 miles north, inbound landing.`,
      destTwr,
    );
    expect(aiReply.ok).toBe(true);
    if (aiReply.ok) {
      expect(aiReply.state.leg).toBe("destination");
      expect(aiReply.state.ctx.airport.icao).toBe("KMRY");
      expect(aiReply.state.pending).not.toBeNull();
    }

    // Hallucinated frequency still rejected
    const bad = applyAiTurn(
      s,
      {
        station: app.name,
        transmission: `N172TX, contact imaginary tower 123.45.`,
      },
      `N172TX check in.`,
      app,
    );
    expect(bad.ok).toBe(false);
    expect(freeDirectory(s).some((d) => d.mhz === destTwr.mhz && d.name === destTwr.name)).toBe(
      true,
    );
    expect(formatFreqShort(destTwr.mhz)).toBeTruthy();
  });
});
