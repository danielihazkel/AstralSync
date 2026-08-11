import { describe, expect, it } from "vitest";
import { CONTENT_VERSION } from "./versions";
import {
  buildSnapshotRows,
  computeAstro,
  computeNumero,
  resolveChartMoment,
  type ProfileBirthData,
} from "./snapshots";

const base: ProfileBirthData = {
  fullBirthName: "Ada King Lovelace",
  nameScript: "latin",
  birthDate: { year: 1990, month: 6, day: 15 },
  birthTime: { hour: 14, minute: 30 },
  timeCertainty: "exact",
  birthLat: 52.52,
  birthLng: 13.4,
  tzIana: "Europe/Berlin",
  overrideOffsetMinutes: null,
};

describe("resolveChartMoment", () => {
  it("resolves a known time through the IANA database", () => {
    const m = resolveChartMoment(base);
    // Berlin mid-June is CEST, UTC+2.
    expect(m.offsetMinutes).toBe(120);
    expect(m.utc.toISOString()).toBe("1990-06-15T12:30:00.000Z");
    expect(m.warnings).toEqual([]);
  });

  it("uses local noon when birth time is unknown", () => {
    const m = resolveChartMoment({
      ...base,
      birthTime: null,
      timeCertainty: "unknown",
    });
    expect(m.utc.toISOString()).toBe("1990-06-15T10:00:00.000Z");
  });

  it("applies a manual offset override verbatim", () => {
    const m = resolveChartMoment({ ...base, overrideOffsetMinutes: 90 });
    expect(m.offsetMinutes).toBe(90);
    expect(m.utc.toISOString()).toBe("1990-06-15T13:00:00.000Z");
    expect(m.warnings).toEqual([]);
  });

  it("still warns about pre-1970 dates when the offset is overridden", () => {
    const m = resolveChartMoment({
      ...base,
      birthDate: { year: 1879, month: 3, day: 14 },
      overrideOffsetMinutes: 60,
    });
    expect(m.warnings).toContain("pre_1970_offset_uncertain");
  });
});

describe("computeAstro", () => {
  it("produces a full chart for a known time", () => {
    const { chart } = computeAstro(base, "placidus");
    expect(chart.isSolarChart).toBe(false);
    expect(chart.bigThree.sun).toBe("gemini");
    expect(chart.bigThree.ascendant).not.toBeNull();
    expect(chart.houses).not.toBeNull();
  });

  it("produces a solar chart with suppressed houses for unknown time", () => {
    const { chart } = computeAstro(
      { ...base, birthTime: null, timeCertainty: "unknown" },
      "placidus",
    );
    expect(chart.isSolarChart).toBe(true);
    expect(chart.bigThree.ascendant).toBeNull();
    expect(chart.houses).toBeNull();
    for (const p of chart.placements) expect(p.house).toBeNull();
  });
});

describe("computeNumero", () => {
  it("uses Pythagorean destiny and soul urge for Latin names", () => {
    const n = computeNumero(base);
    expect(n.system).toBe("pythagorean");
    expect(n.lifePath.value).toBeGreaterThan(0);
    expect(n.destiny?.system).toBe("pythagorean");
    expect(n.soulUrge?.system).toBe("pythagorean");
  });

  it("uses gematria without soul urge for Hebrew names", () => {
    const n = computeNumero({
      ...base,
      fullBirthName: "דוד כהן",
      nameScript: "hebrew",
    });
    expect(n.system).toBe("gematria");
    expect(n.destiny?.system).toBe("gematria");
    expect(n.soulUrge).toBeNull();
  });

  it("returns null name numbers when no birth name is given", () => {
    const n = computeNumero({ ...base, fullBirthName: null });
    expect(n.destiny).toBeNull();
    expect(n.soulUrge).toBeNull();
    expect(n.lifePath.value).toBeGreaterThan(0);
  });
});

describe("buildSnapshotRows", () => {
  const astro = computeAstro(base, "placidus");
  const numero = computeNumero(base);
  const { astroRow, numeroRow } = buildSnapshotRows(7, 3, astro, numero, "placidus");

  it("copies scalar columns from the chart", () => {
    expect(astroRow.profileId).toBe(7);
    expect(astroRow.version).toBe(3);
    expect(astroRow.houseSystem).toBe("placidus");
    expect(astroRow.sunSign).toBe(astro.chart.bigThree.sun);
    expect(astroRow.moonSign).toBe(astro.chart.bigThree.moon);
    expect(astroRow.ascendant).toBe(astro.chart.bigThree.ascendant);
    expect(astroRow.isSolarChart).toBe(false);
  });

  it("records engine and content versions", () => {
    expect(astroRow.engine).toBe("astronomy-engine");
    expect(astroRow.engineVersion).toBe("2.1.19");
    expect(astroRow.contentVersion).toBe(CONTENT_VERSION);
  });

  it("stores the complete render record in placementsJson", () => {
    const placements = astroRow.placementsJson as Record<string, unknown>;
    expect(placements.houses).toBeTruthy();
    expect(placements.placements).toHaveLength(10);
    expect(placements.uncertainties).toBeDefined();
    expect(placements.tzWarnings).toEqual([]);
    // Aspects live in their own column, not duplicated here.
    expect(placements.aspects).toBeUndefined();
    expect(Array.isArray(astroRow.aspectsJson)).toBe(true);
  });

  it("maps numerology scalars and full derivations", () => {
    expect(numeroRow.profileId).toBe(7);
    expect(numeroRow.version).toBe(3);
    expect(numeroRow.system).toBe("pythagorean");
    expect(numeroRow.lifePathInt).toBe(numero.lifePath.value);
    expect(numeroRow.destinyInt).toBe(numero.destiny?.value);
    expect(numeroRow.soulUrgeInt).toBe(numero.soulUrge?.value);
    expect(numeroRow.isMasterLp).toBe(numero.lifePath.isMaster);
    const derivation = numeroRow.derivationJson as Record<string, unknown>;
    expect(derivation.lifePath).toBeTruthy();
    expect(derivation.destiny).toBeTruthy();
    expect(derivation.soulUrge).toBeTruthy();
  });
});
