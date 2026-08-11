import type { Profile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { CONTENT_VERSION } from "./versions";
import {
  buildSnapshotRows,
  computeAstro,
  computeHebrew,
  computeNumero,
  profileRowToBirthData,
  resolveChartMoment,
  type ProfileBirthData,
} from "./snapshots";

const base: ProfileBirthData = {
  fullBirthName: "Ada King Lovelace",
  hebrewBirthName: null,
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

  it("uses gematria without soul urge for Hebrew-only profiles", () => {
    const n = computeNumero({
      ...base,
      fullBirthName: null,
      hebrewBirthName: "דוד כהן",
    });
    expect(n.system).toBe("gematria");
    expect(n.destiny?.system).toBe("gematria");
    expect(n.soulUrge).toBeNull();
    // The primary destiny IS the gematria result for Hebrew-only profiles.
    expect(n.hebrewDestiny).toEqual(n.destiny);
  });

  it("computes both systems when Latin and Hebrew names coexist", () => {
    const n = computeNumero({ ...base, hebrewBirthName: "דוד כהן" });
    expect(n.system).toBe("pythagorean");
    expect(n.destiny?.system).toBe("pythagorean");
    expect(n.soulUrge?.system).toBe("pythagorean");
    expect(n.hebrewDestiny?.system).toBe("gematria");
    expect(n.hebrewDestiny?.variant).toBe("hechrachi");
  });

  it("returns null name numbers when no birth name is given", () => {
    const n = computeNumero({ ...base, fullBirthName: null });
    expect(n.destiny).toBeNull();
    expect(n.soulUrge).toBeNull();
    expect(n.hebrewDestiny).toBeNull();
    expect(n.lifePath.value).toBeGreaterThan(0);
  });
});

describe("computeHebrew", () => {
  it("computes the Mazal chart from the same instant as the astro chart", () => {
    const h = computeHebrew(base);
    // 1990-06-15 Berlin, 14:30 CEST (12:30Z) — daytime, sunset 19:31Z.
    expect(h.mazal.hebrewDate.civil).toMatchObject({
      day: 22,
      monthName: "Sivan",
      year: 5750,
      weekday: 5, // Friday
    });
    expect(h.mazal.hebrewDate.afterSunset).toBe(false);
    expect(h.mazal.input.utc).toBe("1990-06-15T12:30:00.000Z");
    expect(h.mazal.mazal).toMatchObject({ month: "sivan", mazal: "teomim" });
    expect(h.mazal.dayPlanet.planet).toBe("venus");
  });

  it("keys date gematria to the effective Hebrew date (day 22 master kept)", () => {
    const h = computeHebrew(base);
    // day 22 (master, kept) + year 5750 → 17 → 8; 22+8 = 30 → 3.
    expect(h.dateGematria.derivation.components[0]).toMatchObject({
      part: "day",
      raw: 22,
      reduced: 22,
    });
    expect(h.dateGematria.value).toBe(3);
  });

  it("adds a mispar katan name reading only when a Hebrew name exists", () => {
    expect(computeHebrew(base).katanName).toBeNull();
    const h = computeHebrew({ ...base, hebrewBirthName: "דוד כהן" });
    expect(h.katanName?.system).toBe("gematria");
    expect(h.katanName?.variant).toBe("katan");
  });

  it("suppresses the planetary hour and flags the date for unknown time", () => {
    const h = computeHebrew({ ...base, birthTime: null, timeCertainty: "unknown" });
    expect(h.mazal.planetaryHour).toBeNull();
    expect(h.mazal.hebrewDate.ambiguity).toBe("unknown_time");
    expect(h.mazal.hebrewDate.effective).toEqual(h.mazal.hebrewDate.civil);
  });
});

describe("buildSnapshotRows", () => {
  const astro = computeAstro(base, "placidus");
  const numero = computeNumero(base);
  const hebrew = computeHebrew(base);
  const { astroRow, numeroRow, hebrewRow } = buildSnapshotRows(
    7,
    3,
    astro,
    numero,
    hebrew,
    "placidus",
  );

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
    // Explicit null (not undefined) so the stored JSON is self-describing.
    expect(derivation.hebrewDestiny).toBeNull();
  });

  it("stores the gematria destiny in derivationJson for both-names profiles", () => {
    const both: ProfileBirthData = { ...base, hebrewBirthName: "דוד כהן" };
    const rows = buildSnapshotRows(
      7,
      4,
      computeAstro(both, "placidus"),
      computeNumero(both),
      computeHebrew(both),
      "placidus",
    );
    const derivation = rows.numeroRow.derivationJson as Record<
      string,
      { system?: string; variant?: string }
    >;
    expect(derivation.hebrewDestiny?.system).toBe("gematria");
    expect(derivation.hebrewDestiny?.variant).toBe("hechrachi");
    // Numero column semantics unchanged: primary system stays Pythagorean.
    expect(rows.numeroRow.system).toBe("pythagorean");
    // The Mazal snapshot's name reading uses the katan variant.
    const gematria = rows.hebrewRow.gematriaJson as Record<
      string,
      { variant?: string }
    >;
    expect(gematria.katanName?.variant).toBe("katan");
  });

  it("denormalizes the Hebrew snapshot columns from the Mazal chart", () => {
    expect(hebrewRow.profileId).toBe(7);
    expect(hebrewRow.version).toBe(3);
    expect(hebrewRow.hebrewDate).toBe("22 Sivan 5750");
    expect(hebrewRow.monthKey).toBe("sivan");
    expect(hebrewRow.dayPlanet).toBe("venus");
    expect(hebrewRow.hourPlanet).toBe(hebrew.mazal.planetaryHour?.planet);
    expect(hebrewRow.dateGematriaInt).toBe(3);
    expect(hebrewRow.engine).toBe("@hebcal/core");
    expect(hebrewRow.engineVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(hebrewRow.contentVersion).toBe(CONTENT_VERSION);
    const gematria = hebrewRow.gematriaJson as Record<string, unknown>;
    expect(gematria.dateGematria).toBeTruthy();
    expect(gematria.katanName).toBeNull(); // Latin name — no gematria reading
    expect((hebrewRow.mazalJson as Record<string, unknown>).schemaVersion).toBe(1);
  });

  it("nulls the hour planet column for unknown time", () => {
    const unknown: ProfileBirthData = {
      ...base,
      birthTime: null,
      timeCertainty: "unknown",
    };
    const rows = buildSnapshotRows(
      7,
      4,
      computeAstro(unknown, "placidus"),
      computeNumero(unknown),
      computeHebrew(unknown),
      "placidus",
    );
    expect(rows.hebrewRow.hourPlanet).toBeNull();
  });
});

describe("profileRowToBirthData (lazy backfill input)", () => {
  const row: Profile = {
    id: 7,
    displayName: "Ada",
    fullBirthName: "Ada King Lovelace",
    hebrewBirthName: null,
    nameScript: "latin",
    birthDate: new Date(Date.UTC(1990, 5, 15)),
    birthTime: "14:30",
    timeCertainty: "exact",
    birthCityGeonameId: null,
    birthLat: 52.52,
    birthLng: 13.4,
    tzIana: "Europe/Berlin",
    utcOffsetMinutes: 120,
    offsetOverridden: false,
    createdAt: new Date(),
  };

  it("round-trips a stored profile into the computation shape", () => {
    expect(profileRowToBirthData(row)).toEqual(base);
  });

  it("maps an unknown time to a null birthTime", () => {
    const d = profileRowToBirthData({
      ...row,
      birthTime: null,
      timeCertainty: "unknown",
    });
    expect(d.birthTime).toBeNull();
    expect(d.timeCertainty).toBe("unknown");
  });

  it("restores the manual offset override only when the flag is set", () => {
    expect(
      profileRowToBirthData({ ...row, offsetOverridden: true }).overrideOffsetMinutes,
    ).toBe(120);
    expect(profileRowToBirthData(row).overrideOffsetMinutes).toBeNull();
  });

  it("carries the Hebrew name into the computation shape", () => {
    const d = profileRowToBirthData({ ...row, hebrewBirthName: "דוד כהן" });
    expect(d.hebrewBirthName).toBe("דוד כהן");
    expect(profileRowToBirthData(row).hebrewBirthName).toBeNull();
  });
});
