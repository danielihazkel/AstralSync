import { describe, expect, it } from "vitest";
import {
  EXALTATIONS,
  essentialDignity,
  solarCondition,
} from "../src/dignities";
import { TRADITIONAL_RULERS } from "../src/profections";
import { PLANETS, SIGNS, type Planet } from "../src/types";

const CLASSICAL: Planet[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
];

describe("essentialDignity", () => {
  it("reports domicile in every ruled sign", () => {
    for (const sign of SIGNS) {
      expect(essentialDignity(TRADITIONAL_RULERS[sign], sign)).toBe(
        "domicile",
      );
    }
  });

  it("reports detriment opposite every domicile", () => {
    expect(essentialDignity("mars", "libra")).toBe("detriment");
    expect(essentialDignity("venus", "aries")).toBe("detriment");
    expect(essentialDignity("saturn", "cancer")).toBe("detriment");
    expect(essentialDignity("moon", "capricorn")).toBe("detriment");
    expect(essentialDignity("sun", "aquarius")).toBe("detriment");
  });

  it("reports the classical exaltations and their falls", () => {
    expect(essentialDignity("saturn", "libra")).toBe("exaltation");
    expect(essentialDignity("saturn", "aries")).toBe("fall");
    expect(essentialDignity("sun", "aries")).toBe("exaltation");
    expect(essentialDignity("sun", "libra")).toBe("fall");
    expect(essentialDignity("jupiter", "cancer")).toBe("exaltation");
    expect(essentialDignity("jupiter", "capricorn")).toBe("fall");
    expect(essentialDignity("moon", "taurus")).toBe("exaltation");
    expect(essentialDignity("moon", "scorpio")).toBe("fall");
  });

  it("ranks domicile over exaltation for Mercury in Virgo", () => {
    // Virgo is both Mercury's domicile and its exaltation; likewise Pisces
    // is both its detriment and its fall — the stronger label wins.
    expect(essentialDignity("mercury", "virgo")).toBe("domicile");
    expect(essentialDignity("mercury", "pisces")).toBe("detriment");
  });

  it("is null for neutral placements and for the moderns everywhere", () => {
    expect(essentialDignity("venus", "gemini")).toBeNull();
    expect(essentialDignity("mars", "sagittarius")).toBeNull();
    for (const planet of PLANETS.filter((p) => !CLASSICAL.includes(p))) {
      expect(EXALTATIONS[planet]).toBeUndefined();
      for (const sign of SIGNS) {
        expect(essentialDignity(planet, sign)).toBeNull();
      }
    }
  });
});

describe("solarCondition", () => {
  it("applies the classical thresholds on ecliptic separation", () => {
    expect(solarCondition(100.2, 100.0)).toBe("cazimi"); // 12′
    expect(solarCondition(100.3, 100.0)).toBe("combust"); // 18′
    expect(solarCondition(108.0, 100.0)).toBe("combust"); // 8°
    expect(solarCondition(110.0, 100.0)).toBe("under_beams"); // 10°
    expect(solarCondition(116.9, 100.0)).toBe("under_beams");
    expect(solarCondition(120.0, 100.0)).toBeNull(); // 20°
  });

  it("measures separation across the 0° wrap", () => {
    expect(solarCondition(359.9, 0.1)).toBe("cazimi");
    expect(solarCondition(355.0, 5.0)).toBe("under_beams");
  });
});
