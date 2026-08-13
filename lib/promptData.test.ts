import { describe, expect, it } from "vitest";
import type { HebrewPeriodSummary, WesternPeriodSummary } from "./forecast";
import type {
  NumeroDerivation,
  StoredHebrewGematria,
  StoredMazal,
  WheelChart,
} from "./view-types";
import {
  renderChartData,
  renderHebrewPeriodData,
  renderMazalData,
  renderNumerologyData,
  renderWesternPeriodData,
} from "./promptData";

const chart: WheelChart = {
  schemaVersion: 1,
  input: {
    utc: "2000-08-09T10:00:00.000Z",
    latitude: 32.1,
    longitude: 34.8,
    houseSystem: "placidus",
    timeCertainty: "exact",
  },
  isSolarChart: false,
  houses: {
    system: "placidus",
    requestedSystem: "placidus",
    fallbackApplied: false,
    cusps: [222.5, 252, 282, 312, 342, 12, 42.5, 72, 102, 132, 162, 192],
    ascendant: 222.5,
    mc: 132,
  },
  placements: [
    {
      planet: "sun",
      longitude: 137.07,
      sign: "leo",
      degreeInSign: 17.07,
      house: 10,
      retrograde: false,
    },
    {
      planet: "moon",
      longitude: 250,
      sign: "sagittarius",
      degreeInSign: 10,
      house: 2,
      retrograde: false,
    },
    {
      planet: "pluto",
      longitude: 245.5,
      sign: "sagittarius",
      degreeInSign: 5.5,
      house: 2,
      retrograde: true,
    },
  ],
  // Six aspects — more than the five the reading resolver interprets — to
  // prove the renderer includes them all.
  aspects: [
    { a: "sun", b: "moon", type: "trine", angle: 120, orb: 1.05 },
    { a: "sun", b: "mercury", type: "conjunction", angle: 0, orb: 2 },
    { a: "sun", b: "pluto", type: "square", angle: 90, orb: 5.2 },
    { a: "moon", b: "venus", type: "sextile", angle: 60, orb: 3 },
    { a: "moon", b: "mars", type: "opposition", angle: 180, orb: 4 },
    { a: "venus", b: "saturn", type: "square", angle: 90, orb: 5.9 },
  ],
  bigThree: { sun: "leo", moon: "sagittarius", ascendant: "scorpio" },
  uncertainties: [{ field: "tz", reason: "Timezone was inferred." }],
  engine: { name: "test", version: "0" },
  tzWarnings: [],
};

describe("renderChartData", () => {
  it("renders every placement with sign, degree, house, and retrograde", () => {
    const out = renderChartData(chart);
    expect(out).toContain("- Sun: Leo 17°04′, 10th house");
    expect(out).toContain("- Moon: Sagittarius 10°00′, 2nd house");
    expect(out).toContain("- Pluto: Sagittarius 5°30′, 2nd house, retrograde");
  });

  it("renders the ascendant, midheaven, and all twelve cusps", () => {
    const out = renderChartData(chart);
    expect(out).toContain("- Ascendant (rising): Scorpio 12°30′");
    expect(out).toContain("- Midheaven (MC): Leo 12°00′");
    expect(out).toContain("- 1st house cusp: Scorpio 12°30′");
    expect(out).toContain("- 7th house cusp: Taurus 12°30′");
    expect(out).toContain("- 12th house cusp: Libra 12°00′");
  });

  it("renders all aspects with orbs, and the uncertainties", () => {
    const out = renderChartData(chart);
    for (const line of [
      "- Sun trine Moon — orb 1°03′",
      "- Sun conjunction Mercury — orb 2°00′",
      "- Sun square Pluto — orb 5°12′",
      "- Moon sextile Venus — orb 3°00′",
      "- Moon opposition Mars — orb 4°00′",
      "- Venus square Saturn — orb 5°54′",
    ]) {
      expect(out).toContain(line);
    }
    expect(out).toContain("Timezone was inferred.");
  });

  it("suppresses houses, degrees, and orbs on a solar chart", () => {
    const solar: WheelChart = {
      ...chart,
      isSolarChart: true,
      houses: null,
      placements: chart.placements.map((p) => ({ ...p, house: null })),
      bigThree: { ...chart.bigThree, ascendant: null },
    };
    const out = renderChartData(solar);
    expect(out).toContain("signs only");
    expect(out).toContain("- Pluto: Sagittarius, retrograde");
    expect(out).toContain("- Sun trine Moon");
    expect(out).not.toContain("house");
    expect(out).not.toContain("Ascendant");
    expect(out).not.toContain("orb");
    expect(out).not.toContain("°");
  });
});

const numero: NumeroDerivation = {
  lifePath: {
    value: 1,
    isMaster: false,
    derivation: {
      components: [
        { part: "month", raw: 8, steps: [], reduced: 8 },
        { part: "day", raw: 9, steps: [], reduced: 9 },
        { part: "year", raw: 2000, steps: [2], reduced: 2 },
      ],
      total: 19,
      steps: [10, 1],
    },
  },
  destiny: {
    system: "pythagorean",
    value: 11,
    isMaster: true,
    derivation: {
      words: [
        {
          word: "Dana",
          letters: [
            { char: "d", value: 4 },
            { char: "a", value: 1, isVowel: true },
            { char: "n", value: 5 },
            { char: "a", value: 1, isVowel: true },
          ],
          subtotal: 11,
          steps: [],
          reduced: 11,
        },
      ],
      total: 11,
      steps: [],
    },
  },
  soulUrge: null,
  hebrewDestiny: null,
};

describe("renderNumerologyData", () => {
  it("renders the life path with its component reduction chains", () => {
    const out = renderNumerologyData(numero);
    expect(out).toContain("Life Path: 1");
    expect(out).toContain("- Year: 2000 → 2");
    expect(out).toContain("- Total: 19 → 10 → 1");
  });

  it("renders name numbers with letters and totals, marking masters", () => {
    const out = renderNumerologyData(numero);
    expect(out).toContain(
      "Destiny (Expression): 11 (master number) — pythagorean",
    );
    expect(out).toContain("- Dana: d=4 a=1 n=5 a=1; 11");
    expect(out).toContain("- Total: 11");
  });

  it("skips null and absent numbers", () => {
    const out = renderNumerologyData(numero);
    expect(out).not.toContain("Soul Urge");
    expect(out).not.toContain("Hebrew Destiny");
  });

  it("includes the Hebrew destiny when present", () => {
    const withHebrew: NumeroDerivation = {
      ...numero,
      hebrewDestiny: {
        system: "gematria",
        variant: "hechrachi",
        value: 8,
        isMaster: false,
        derivation: {
          words: [
            {
              word: "דנה",
              letters: [
                { char: "ד", value: 4 },
                { char: "נ", value: 50 },
                { char: "ה", value: 5 },
              ],
              subtotal: 59,
              steps: [14, 5],
              reduced: 5,
            },
          ],
          total: 5,
          steps: [],
        },
      },
    };
    const out = renderNumerologyData(withHebrew);
    expect(out).toContain("Hebrew Destiny: 8 — gematria (hechrachi)");
    expect(out).toContain("- דנה: ד=4 נ=50 ה=5; 59 → 14 → 5");
  });
});

const hebrewDateParts = {
  year: 5760,
  month: 10,
  day: 24,
  monthKey: "tevet" as const,
  monthName: "Tevet",
  weekday: 6,
  renderGematriya: "כ״ד טֵבֵת תש״ס",
};

const mazal: StoredMazal = {
  schemaVersion: 1,
  input: {
    civilDate: { year: 2000, month: 1, day: 1 },
    utc: "2000-01-01T10:00:00.000Z",
    latitude: 32.1,
    longitude: 34.8,
    tzId: "Asia/Jerusalem",
    timeCertainty: "unknown",
  },
  hebrewDate: {
    civil: hebrewDateParts,
    effective: hebrewDateParts,
    afterSunset: false,
    sunsetUtc: null,
    ambiguity: "unknown_time",
  },
  mazal: { month: "tevet", mazal: "gdi", hebrew: "גדי", sign: "capricorn" },
  seferYetzirah: {
    month: "tevet",
    letter: "ע",
    letterName: "Ayin",
    tribe: "dan",
    tribeHebrew: "דן",
    faculty: "anger",
    facultyHebrew: "רוגז",
  },
  dayPlanet: { weekday: 6, planet: "saturn", ambiguous: true },
  planetaryHour: null,
  uncertainties: [{ field: "birth_time", reason: "Birth time unknown." }],
  engine: { name: "test", version: "0" },
};

const gematria: StoredHebrewGematria = {
  dateGematria: {
    value: 5,
    isMaster: false,
    derivation: {
      components: [
        { part: "day", raw: 24, steps: [6], reduced: 6 },
        { part: "year", raw: 5760, steps: [18, 9], reduced: 9 },
      ],
      total: 15,
      steps: [6],
    },
  },
  katanName: null,
};

describe("renderMazalData", () => {
  it("renders the date, mazal, Sefer Yetzirah, day planet, and gematria", () => {
    const out = renderMazalData(mazal, gematria);
    expect(out).toContain(
      "Hebrew date (sunset-adjusted): 24 Tevet 5760 (כ״ד טֵבֵת תש״ס), Saturday",
    );
    expect(out).toContain("- Date ambiguity: unknown_time");
    expect(out).toContain("Mazal (month sign): Tevet — Gdi (Capricorn), Hebrew גדי");
    expect(out).toContain(
      "Sefer Yetzirah: letter ע (Ayin), tribe Dan (דן), faculty anger (רוגז)",
    );
    expect(out).toContain("Day planet: Saturday — Saturn (weekday uncertain)");
    expect(out).toContain("Hebrew date gematria: 5");
    expect(out).toContain("- Day: 24 → 6");
    expect(out).toContain("- Total: 15 → 6");
    expect(out).toContain("Birth time unknown.");
  });

  it("skips the planetary hour when null and includes it when present", () => {
    expect(renderMazalData(mazal, gematria)).not.toContain("Planetary hour");
    const withHour: StoredMazal = {
      ...mazal,
      planetaryHour: {
        planet: "venus",
        hourIndex: 3,
        isDay: true,
        dayRuler: "saturn",
        startUtc: "2000-01-01T08:00:00.000Z",
        endUtc: "2000-01-01T09:00:00.000Z",
        uncertain: true,
      },
    };
    expect(renderMazalData(withHour, gematria)).toContain(
      "Planetary hour: 3rd hour of the day — Venus; day ruler Saturn (approximate birth time — hour boundaries may shift)",
    );
  });

  it("skips the name gematria when absent and renders it when present", () => {
    expect(renderMazalData(mazal, gematria)).not.toContain("Name gematria");
    const withName: StoredHebrewGematria = {
      ...gematria,
      katanName: {
        system: "gematria",
        variant: "katan",
        value: 3,
        isMaster: false,
        derivation: {
          words: [
            {
              word: "דנה",
              letters: [
                { char: "ד", value: 4 },
                { char: "נ", value: 5 },
                { char: "ה", value: 5 },
              ],
              subtotal: 14,
              steps: [5],
              reduced: 5,
            },
          ],
          total: 5,
          steps: [],
        },
      },
    };
    const out = renderMazalData(mazal, withName);
    expect(out).toContain("Name gematria (mispar katan): 3 — gematria (katan)");
    expect(out).toContain("- דנה: ד=4 נ=5 ה=5; 14 → 5");
  });

  it("notes an after-sunset birth", () => {
    const afterSunset: StoredMazal = {
      ...mazal,
      hebrewDate: { ...mazal.hebrewDate, afterSunset: true },
    };
    expect(renderMazalData(afterSunset, gematria)).toContain(
      "Born after sunset",
    );
  });
});

const westernSummary: WesternPeriodSummary = {
  period: {
    kind: "week",
    start: { year: 2026, month: 8, day: 9 },
    end: { year: 2026, month: 8, day: 15 },
    days: 7,
  },
  startPlacements: [
    {
      planet: "sun",
      longitude: 137,
      sign: "leo",
      degreeInSign: 17,
      house: 10,
      retrograde: false,
    },
    {
      planet: "saturn",
      longitude: 5.5,
      sign: "aries",
      degreeInSign: 5.5,
      house: 6,
      retrograde: true,
    },
  ],
  natal: { version: 2, isSolarChart: false, moonUncertain: false },
  moonBySign: [
    {
      sign: "pisces",
      fromDate: { year: 2026, month: 8, day: 9 },
      toDate: { year: 2026, month: 8, day: 10 },
    },
    {
      sign: "aries",
      fromDate: { year: 2026, month: 8, day: 11 },
      toDate: { year: 2026, month: 8, day: 13 },
    },
    {
      sign: "taurus",
      fromDate: { year: 2026, month: 8, day: 14 },
      toDate: { year: 2026, month: 8, day: 15 },
    },
  ],
  moonNext: null,
  events: [
    {
      type: "ingress",
      planet: "mercury",
      fromSign: "leo",
      toSign: "virgo",
      aroundDate: { year: 2026, month: 8, day: 12 },
    },
    {
      type: "station",
      planet: "saturn",
      direction: "retrograde",
      aroundDate: { year: 2026, month: 8, day: 14 },
    },
  ],
  topAspects: [
    {
      a: "saturn",
      b: "sun",
      type: "square",
      minOrb: 0.2,
      closestDate: { year: 2026, month: 8, day: 11 },
      appliedAllPeriod: true,
    },
    {
      a: "mars",
      b: "venus",
      type: "trine",
      minOrb: 1.5,
      closestDate: { year: 2026, month: 8, day: 13 },
      appliedAllPeriod: false,
    },
  ],
};

describe("renderWesternPeriodData", () => {
  it("renders the period, positions with natal houses, and Moon spans", () => {
    const out = renderWesternPeriodData(westernSummary);
    expect(out).toContain("Period: week, 2026-08-09 to 2026-08-15");
    expect(out).toContain("- Sun: Leo 17°00′, 10th natal house");
    expect(out).toContain("- Saturn: Aries 5°30′, 6th natal house, retrograde");
    expect(out).toContain("- Moon in Pisces: 2026-08-09 to 2026-08-10");
    expect(out).toContain("- Moon in Aries: 2026-08-11 to 2026-08-13");
  });

  it("renders events approximately and aspect windows with orbs", () => {
    const out = renderWesternPeriodData(westernSummary);
    expect(out).toContain(
      "- Mercury enters Virgo (from Leo) around 2026-08-12",
    );
    expect(out).toContain("- Saturn stations retrograde around 2026-08-14");
    expect(out).toContain(
      "- Transiting Saturn square natal Sun — closest around 2026-08-11, orb 0°12′, in orb all period",
    );
    expect(out).toContain(
      "- Transiting Mars trine natal Venus — closest around 2026-08-13, orb 1°30′",
    );
  });

  it("renders a day period with the Moon's next sign, signs-only when solar", () => {
    const day: WesternPeriodSummary = {
      ...westernSummary,
      period: {
        kind: "day",
        start: { year: 2026, month: 8, day: 13 },
        end: { year: 2026, month: 8, day: 13 },
        days: 1,
      },
      natal: { ...westernSummary.natal, isSolarChart: true },
      startPlacements: westernSummary.startPlacements.map((p) => ({
        ...p,
        house: null,
      })),
      moonBySign: [
        {
          sign: "aries",
          fromDate: { year: 2026, month: 8, day: 13 },
          toDate: { year: 2026, month: 8, day: 13 },
        },
      ],
      moonNext: { sign: "taurus", date: { year: 2026, month: 8, day: 14 } },
      events: [],
    };
    const out = renderWesternPeriodData(day);
    expect(out).toContain("Period: day, 2026-08-13");
    expect(out).toContain("signs only");
    expect(out).toContain("- Saturn: Aries, retrograde");
    expect(out).not.toContain("natal house");
    expect(out).toContain("- Moon in Aries: 2026-08-13");
    expect(out).toContain("- The Moon moves into Taurus by 2026-08-14.");
  });
});

const hebrewDay = (
  civilDay: number,
  hebDay: number,
  weekday: number,
  monthName = "Av",
  month = 5,
  gematriaValue = 7,
  isMaster = false,
): HebrewPeriodSummary["days"][number] => ({
  civil: { year: 2026, month: 8, day: civilDay },
  hebrew: {
    year: 5786,
    month,
    day: hebDay,
    monthKey: monthName === "Elul" ? "elul" : "av",
    monthName,
    weekday,
    renderGematriya: "כ״ו אָב תשפ״ו",
  },
  dayPlanet: (["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const)[
    weekday
  ],
  dateGematria: {
    value: gematriaValue,
    isMaster,
    derivation: {
      components: [
        { part: "day", raw: hebDay, steps: [], reduced: hebDay % 9 || 9 },
        { part: "year", raw: 5786, steps: [26, 8], reduced: 8 },
      ],
      total: 15,
      steps: [6],
    },
  },
});

const hebrewSummary: HebrewPeriodSummary = {
  period: {
    kind: "week",
    start: { year: 2026, month: 8, day: 9 },
    end: { year: 2026, month: 8, day: 15 },
    days: 7,
  },
  days: [
    hebrewDay(9, 26, 0),
    hebrewDay(10, 27, 1),
    hebrewDay(11, 28, 2),
    hebrewDay(12, 29, 3),
    hebrewDay(13, 30, 4),
    hebrewDay(14, 1, 5, "Elul", 6, 11, true),
    hebrewDay(15, 2, 6, "Elul", 6),
  ],
  months: [
    {
      monthKey: "av",
      monthName: "Av",
      mazal: { month: "av", mazal: "aryeh", hebrew: "אריה", sign: "leo" },
      seferYetzirah: {
        month: "av",
        letter: "ט",
        letterName: "Tet",
        tribe: "shimon",
        tribeHebrew: "שמעון",
        faculty: "hearing",
        facultyHebrew: "שמיעה",
      },
      fromCivil: { year: 2026, month: 8, day: 9 },
      toCivil: { year: 2026, month: 8, day: 13 },
    },
    {
      monthKey: "elul",
      monthName: "Elul",
      mazal: { month: "elul", mazal: "betulah", hebrew: "בתולה", sign: "virgo" },
      seferYetzirah: {
        month: "elul",
        letter: "י",
        letterName: "Yod",
        tribe: "gad",
        tribeHebrew: "גד",
        faculty: "action",
        facultyHebrew: "מעשה",
      },
      fromCivil: { year: 2026, month: 8, day: 14 },
      toCivil: { year: 2026, month: 8, day: 15 },
    },
  ],
};

describe("renderHebrewPeriodData", () => {
  it("renders the Hebrew date range, month rows, and the boundary note", () => {
    const out = renderHebrewPeriodData(hebrewSummary);
    expect(out).toContain(
      "Hebrew dates (daytime mapping, no sunset adjustment): 26 Av 5786 to 2 Elul 5786",
    );
    expect(out).toContain(
      "Month Av (civil 2026-08-09 to 2026-08-13): mazal Aryeh (Leo), Hebrew אריה",
    );
    expect(out).toContain("Sefer Yetzirah letter ט (Tet), tribe Shimon");
    expect(out).toContain(
      "the mazal shifts from Aryeh to Betulah on 2026-08-14",
    );
  });

  it("renders per-day lines with day planets and gematria for a week", () => {
    const out = renderHebrewPeriodData(hebrewSummary);
    expect(out).toContain(
      "- Sunday 2026-08-09 — 26 Av 5786 (כ״ו אָב תשפ״ו), day planet Sun, date gematria 7",
    );
    expect(out).toContain(
      "- Friday 2026-08-14 — 1 Elul 5786 (כ״ו אָב תשפ״ו), day planet Venus, date gematria 11 (master number)",
    );
  });

  it("for a month: no per-day lines, cycle note, only master-number days listed", () => {
    const monthSummary: HebrewPeriodSummary = {
      ...hebrewSummary,
      period: {
        kind: "month",
        start: { year: 2026, month: 8, day: 9 },
        end: { year: 2026, month: 8, day: 15 },
        days: 7,
      },
    };
    const out = renderHebrewPeriodData(monthSummary);
    expect(out).toContain("Day planets cycle with the week");
    expect(out).not.toContain("- Sunday 2026-08-09");
    expect(out).toContain("Master-number date gematria days:");
    expect(out).toContain("- 2026-08-14 (1 Elul): 11");
    expect(out).not.toContain("- 2026-08-09 (26 Av)");
  });

  it("never renders a planetary hour", () => {
    expect(renderHebrewPeriodData(hebrewSummary)).not.toContain(
      "Planetary hour",
    );
  });
});
