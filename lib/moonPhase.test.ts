import { describe, expect, it } from "vitest";
import { moonPhaseFromLongitudes, moonPhaseName } from "./moonPhase";

describe("moonPhaseName", () => {
  it("names the cardinal points inside their ±11.25° bands", () => {
    expect(moonPhaseName(0)).toBe("New Moon");
    expect(moonPhaseName(11.24)).toBe("New Moon");
    expect(moonPhaseName(348.76)).toBe("New Moon");
    expect(moonPhaseName(90)).toBe("First Quarter");
    expect(moonPhaseName(180)).toBe("Full Moon");
    expect(moonPhaseName(270)).toBe("Third Quarter");
  });

  it("names the intermediate phases just outside the bands", () => {
    expect(moonPhaseName(11.25)).toBe("Waxing Crescent");
    expect(moonPhaseName(45)).toBe("Waxing Crescent");
    expect(moonPhaseName(101.25)).toBe("Waxing Gibbous");
    expect(moonPhaseName(135)).toBe("Waxing Gibbous");
    expect(moonPhaseName(225)).toBe("Waning Gibbous");
    expect(moonPhaseName(315)).toBe("Waning Crescent");
    expect(moonPhaseName(348.74)).toBe("Waning Crescent");
    expect(moonPhaseName(348.75)).toBe("New Moon");
  });

  it("normalizes angles outside [0, 360)", () => {
    expect(moonPhaseName(360)).toBe("New Moon");
    expect(moonPhaseName(-90)).toBe("Third Quarter");
    expect(moonPhaseName(450)).toBe("First Quarter");
  });
});

describe("moonPhaseFromLongitudes", () => {
  it("uses the Moon − Sun elongation", () => {
    expect(moonPhaseFromLongitudes(10, 10)).toBe("New Moon");
    expect(moonPhaseFromLongitudes(10, 100)).toBe("First Quarter");
    expect(moonPhaseFromLongitudes(10, 190)).toBe("Full Moon");
    expect(moonPhaseFromLongitudes(10, 280)).toBe("Third Quarter");
  });

  it("wraps across 0° Aries", () => {
    // Sun at 350°, Moon at 80° → elongation 90°.
    expect(moonPhaseFromLongitudes(350, 80)).toBe("First Quarter");
    // Sun at 20°, Moon at 350° → elongation 330°.
    expect(moonPhaseFromLongitudes(20, 350)).toBe("Waning Crescent");
  });
});
