import { describe, expect, it } from "vitest";
import { buildChart, positionsAt, separation } from "../src";

/**
 * Golden chart tests (PRD §8).
 *
 * Fixtures assert against astronomically exact events (equinox, solstice,
 * J2000 epoch) and against Swiss Ephemeris reference output for 12 charts
 * spanning 1879–2024, both hemispheres, the equator, and high latitude.
 *
 * Reference provenance: astro.com swetest CGI (Swiss Ephemeris 2.10.03),
 * retrieved 2026-08-13 with `-b<d.m.y> -ut<h:m:s> -p0123456789 -fPLS
 * -house<lon>,<lat>,P`. Longitudes are stored verbatim as printed
 * (D°M'S.ssss); retrograde lists come from the negative daily-speed column.
 * Einstein's chart is additionally cross-checked against Astro-Databank
 * (Rodden AA): Sun 23°30' Pisces, Moon 14°32' Sagittarius, Asc 11°38' Cancer.
 *
 * Measured max deviations on first run (astronomy-engine vs Swiss Ephemeris,
 * post-1900 fixtures): planets ≤ ~17″ (worst: Neptune), Moon ≤ ~10″, angles
 * ≤ ~30″. The tolerances below (1′ planets, 30″ Moon, 2′ angles, 3′ for the
 * pre-1900 chart where ΔT modeling differences dominate) leave 2–4×
 * headroom over those measurements.
 */

function lonOf(chart: ReturnType<typeof buildChart>, planet: string): number {
  return chart.placements.find((p) => p.planet === planet)!.longitude;
}

/** Parse a swetest longitude string (e.g. `353°30'27.8914`) to degrees. */
function dms(value: string): number {
  const m = /^(\d+)°\s*(\d+)'\s*([\d.]+)$/.exec(value.trim());
  if (!m) throw new Error(`bad dms: ${value}`);
  return Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
}

const PLANETS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;
type GoldenPlanet = (typeof PLANETS)[number];

interface GoldenFixture {
  label: string;
  utc: Date;
  latitude: number;
  longitude: number;
  /** Swiss Ephemeris longitudes, verbatim from swetest. */
  expected: Record<GoldenPlanet, string>;
  /** Planets whose swetest daily speed was negative at the instant. */
  retrograde: GoldenPlanet[];
  /** Placidus angles from swetest -house; absent for the solar chart. */
  angles?: { ascendant: string; mc: string };
  /** Per-fixture tolerance overrides in degrees. */
  planetTol?: number;
  moonTol?: number;
}

// 1′ for planets, 3′ for the fast-moving Moon, 6′ for angles (which compound
// obliquity, sidereal time, and the published values' own rounding).
const PLANET_TOL = 1 / 60;
const MOON_TOL = 30 / 3600;
const ANGLE_TOL = 2 / 60;

const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    label: "Albert Einstein — 1879-03-14 10:50 UT, Ulm (Rodden AA)",
    utc: new Date(Date.UTC(1879, 2, 14, 10, 50, 0)),
    latitude: 48.4,
    longitude: 10.0,
    expected: {
      sun: "353°30'27.8914",
      moon: "254°31'33.2806",
      mercury: "3° 8'37.9861",
      venus: "16°59' 6.0362",
      mars: "296°54'51.2010",
      jupiter: "327°29' 2.7613",
      saturn: "4°11'23.3833",
      uranus: "151°17'18.9588",
      neptune: "37°52'19.0720",
      pluto: "54°43'32.0298",
    },
    retrograde: ["uranus"],
    angles: { ascendant: "101°38'47.0576", mc: "342°50'23.5146" },
    // Pre-1900: ΔT modeling differences dominate; allow 3′.
    planetTol: 3 / 60,
  },
  {
    label: "1900-06-15 08:30 UT, London",
    utc: new Date(Date.UTC(1900, 5, 15, 8, 30, 0)),
    latitude: 51.5074,
    longitude: -0.1278,
    expected: {
      sun: "83°45' 5.7867",
      moon: "291°45'40.4972",
      mercury: "101°22'19.3547",
      venus: "113°57'11.1225",
      mars: "51°21'53.4169",
      jupiter: "243°43'43.1649",
      saturn: "272°21'35.4751",
      uranus: "249°55'11.0307",
      neptune: "86°36' 8.6898",
      pluto: "76°21'42.5321",
    },
    retrograde: ["jupiter", "saturn", "uranus"],
    angles: { ascendant: "138°17'56.4573", mc: "32°44'47.3175" },
  },
  {
    label: "1945-05-08 20:00 UT, Berlin",
    utc: new Date(Date.UTC(1945, 4, 8, 20, 0, 0)),
    latitude: 52.52,
    longitude: 13.405,
    expected: {
      sun: "47°50'16.8757",
      moon: "5°18' 7.2590",
      mercury: "21°58'43.7824",
      venus: "17°16' 4.6295",
      mars: "4°35'36.0734",
      jupiter: "167°34'42.7279",
      saturn: "97°18'20.6586",
      uranus: "71°42'25.0188",
      neptune: "184° 0'10.2238",
      pluto: "127°58'57.1104",
    },
    retrograde: ["jupiter", "neptune"],
    angles: { ascendant: "242°20'44.3537", mc: "179°39'14.6611" },
  },
  {
    label: "1969-07-20 20:17 UT, Houston",
    utc: new Date(Date.UTC(1969, 6, 20, 20, 17, 0)),
    latitude: 29.76,
    longitude: -95.36,
    expected: {
      sun: "117°54'38.6750",
      moon: "187°52'25.5403",
      mercury: "115°50'34.4804",
      venus: "75° 2'14.7198",
      mars: "242°46'23.8634",
      jupiter: "180°44'46.4699",
      saturn: "38° 5'52.7947",
      uranus: "180°41'24.0844",
      neptune: "236° 1'22.5219",
      pluto: "173° 0'25.8921",
    },
    retrograde: ["neptune"],
    angles: { ascendant: "229°20'40.9663", mc: "145° 2'21.6408" },
  },
  {
    label: "1978-12-25 15:45 UT, Tokyo",
    utc: new Date(Date.UTC(1978, 11, 25, 15, 45, 0)),
    latitude: 35.6762,
    longitude: 139.6503,
    expected: {
      sun: "273°29'52.3177",
      moon: "217°52'29.7183",
      mercury: "251°34'46.5718",
      venus: "229°14'53.3755",
      mars: "279°49'52.6945",
      jupiter: "127°37'49.0848",
      saturn: "163°56'16.8651",
      uranus: "229°23'52.2995",
      neptune: "258°36' 5.2850",
      pluto: "199° 0'15.6808",
    },
    retrograde: ["jupiter", "saturn"],
    angles: { ascendant: "196°20'43.2658", mc: "108°11' 6.5408" },
  },
  {
    label: "1987-06-15 06:30 UT, Sydney (southern hemisphere)",
    utc: new Date(Date.UTC(1987, 5, 15, 6, 30, 0)),
    latitude: -33.8688,
    longitude: 151.2093,
    expected: {
      sun: "83°38'56.1669",
      moon: "311°36'46.7522",
      mercury: "105°30' 5.4118",
      venus: "64°55'42.7288",
      mars: "106°16' 4.7188",
      jupiter: "23°26'20.3370",
      saturn: "257°25'26.1199",
      uranus: "264°46'52.8057",
      neptune: "276°59'10.4150",
      pluto: "217°26'30.3953",
    },
    retrograde: ["saturn", "uranus", "neptune", "pluto"],
    angles: { ascendant: "259°13'23.2434", mc: "149°36'51.7949" },
  },
  {
    label: "1995-09-23 03:00 UT, Quito (equator)",
    utc: new Date(Date.UTC(1995, 8, 23, 3, 0, 0)),
    latitude: -0.1807,
    longitude: -78.4678,
    expected: {
      sun: "179°37'26.6814",
      moon: "160°13' 9.4091",
      mercury: "200° 9'17.1891",
      venus: "188°35'57.4206",
      mars: "220°37'13.8357",
      jupiter: "249°18'22.7096",
      saturn: "350°41'16.1693",
      uranus: "296°36' 2.5623",
      neptune: "292°48'49.4397",
      pluto: "238°23'11.4235",
    },
    retrograde: ["mercury", "saturn", "uranus", "neptune"],
    angles: { ascendant: "60° 8'18.8461", mc: "325°46'24.5931" },
  },
  {
    label: "2000-01-01 12:00 UT, Greenwich (J2000)",
    utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    latitude: 51.4779,
    longitude: 0,
    expected: {
      sun: "280°22' 8.1072",
      moon: "223°19'25.5052",
      mercury: "271°53'21.3974",
      venus: "241°33'56.8382",
      mars: "327°57'47.8891",
      jupiter: "25°15'11.1138",
      saturn: "40°23'44.3886",
      uranus: "314°48'33.0758",
      neptune: "303°11'34.8476",
      pluto: "251°27'17.2055",
    },
    retrograde: ["saturn"],
    angles: { ascendant: "24°15'58.2811", mc: "279°36'39.9161" },
  },
  {
    label: "2010-02-14 09:30 UT, Mumbai",
    utc: new Date(Date.UTC(2010, 1, 14, 9, 30, 0)),
    latitude: 19.076,
    longitude: 72.8777,
    expected: {
      sun: "325°34'39.7580",
      moon: "328°34'36.6705",
      mercury: "305°47'41.3724",
      venus: "333°37' 8.7113",
      mars: "124° 4'58.4666",
      jupiter: "336°20'55.1537",
      saturn: "183°46'35.7288",
      uranus: "354°51'47.8348",
      neptune: "326° 8'15.7495",
      pluto: "274°43'56.3414",
    },
    retrograde: ["mars", "saturn"],
    angles: { ascendant: "97°32'32.9855", mc: "359°38'58.3329" },
  },
  {
    label: "2015-11-11 11:11 UT, Reykjavík (high latitude)",
    utc: new Date(Date.UTC(2015, 10, 11, 11, 11, 0)),
    latitude: 64.1466,
    longitude: -21.9426,
    expected: {
      sun: "228°44' 4.1008",
      moon: "225°39'24.4750",
      mercury: "225° 3'27.8614",
      venus: "183° 3'44.3623",
      mars: "179° 8' 4.2722",
      jupiter: "168°25' 6.0982",
      saturn: "245°16'19.6338",
      uranus: "17°21'12.1109",
      neptune: "337° 2' 1.7813",
      pluto: "283°31'36.9376",
    },
    retrograde: ["uranus", "neptune"],
    angles: { ascendant: "239°28'42.2927", mc: "197°27' 3.7226" },
  },
  {
    label: "2024-04-08 18:18 UT, Buenos Aires (solar-eclipse day)",
    utc: new Date(Date.UTC(2024, 3, 8, 18, 18, 0)),
    latitude: -34.6037,
    longitude: -58.3816,
    expected: {
      sun: "19°23'54.5549",
      moon: "19°22'14.3415",
      mercury: "24°47'56.8461",
      venus: "4°26'33.5327",
      mars: "343° 2'59.5901",
      jupiter: "49° 2'43.1406",
      saturn: "344°27'18.1224",
      uranus: "51°10'15.6953",
      neptune: "358°11'24.2825",
      pluto: "301°58' 3.5226",
    },
    retrograde: ["mercury"],
    angles: { ascendant: "128° 2'33.1328", mc: "55°56'19.2311" },
  },
  {
    label: "1962-08-05 19:00 UT, Los Angeles (unknown-time solar chart: planets only)",
    utc: new Date(Date.UTC(1962, 7, 5, 19, 0, 0)),
    latitude: 34.05,
    longitude: -118.24,
    expected: {
      sun: "132°51'40.8256",
      moon: "191°12' 3.7667",
      mercury: "140°31'50.9607",
      venus: "176°48'29.7474",
      mars: "79° 1'40.7448",
      jupiter: "340°51' 3.1616",
      saturn: "307°41'41.6993",
      uranus: "149°44'25.2518",
      neptune: "220°45'55.8557",
      pluto: "158°55'16.3982",
    },
    retrograde: ["jupiter", "saturn"],
  },
];

describe("Swiss Ephemeris golden fixtures", () => {
  for (const fixture of GOLDEN_FIXTURES) {
    describe(fixture.label, () => {
      const chart = buildChart({
        utc: fixture.utc,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        houseSystem: "placidus",
      });

      it("matches every planet longitude", () => {
        for (const planet of PLANETS) {
          const tol =
            planet === "moon"
              ? (fixture.moonTol ?? MOON_TOL)
              : (fixture.planetTol ?? PLANET_TOL);
          expect
            .soft(
              separation(lonOf(chart, planet), dms(fixture.expected[planet])),
              `${planet} longitude`,
            )
            .toBeLessThan(tol);
        }
      });

      it("matches the retrograde flags", () => {
        for (const planet of PLANETS) {
          expect(
            chart.placements.find((p) => p.planet === planet)!.retrograde,
            `${planet} retrograde`,
          ).toBe(fixture.retrograde.includes(planet));
        }
      });

      if (fixture.angles) {
        const angles = fixture.angles;
        it("matches the Placidus Ascendant and MC", () => {
          expect(
            separation(chart.houses!.ascendant, dms(angles.ascendant)),
            "ascendant",
          ).toBeLessThan(ANGLE_TOL);
          expect(
            separation(chart.houses!.mc, dms(angles.mc)),
            "mc",
          ).toBeLessThan(ANGLE_TOL);
        });
      }
    });
  }
});

describe("golden charts", () => {
  it("Sun is at 0° Aries at the March 2020 equinox", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2020, 2, 20, 3, 49, 36)),
      latitude: 0,
      longitude: 0,
    });
    expect(separation(lonOf(chart, "sun"), 0)).toBeLessThan(0.05);
    expect(chart.bigThree.sun === "aries" || chart.bigThree.sun === "pisces").toBe(true);
  });

  it("Sun is at 0° Cancer at the June 2020 solstice", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2020, 5, 20, 21, 43, 40)),
      latitude: 0,
      longitude: 0,
    });
    expect(separation(lonOf(chart, "sun"), 90)).toBeLessThan(0.05);
  });

  it("Sun longitude at the J2000 epoch matches the published value (~280.46°)", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
      latitude: 51.48,
      longitude: 0,
    });
    const sun = lonOf(chart, "sun");
    expect(sun).toBeGreaterThan(280.0);
    expect(sun).toBeLessThan(281.0);
    expect(chart.bigThree.sun).toBe("capricorn");
  });

  it("Albert Einstein (1879-03-14 11:30 LMT, Ulm): Sun, Moon, Ascendant", () => {
    // 11:30 LMT at 10°E ≈ 10:50 UT. Astro-Databank (Rodden AA):
    // Sun 23°30' Pisces, Moon 14°32' Sagittarius, Asc 11°38' Cancer.
    const chart = buildChart({
      utc: new Date(Date.UTC(1879, 2, 14, 10, 50, 0)),
      latitude: 48.4,
      longitude: 10.0,
      houseSystem: "placidus",
    });
    expect(chart.bigThree.sun).toBe("pisces");
    expect(separation(lonOf(chart, "sun"), 330 + 23.5)).toBeLessThan(1.0);

    expect(chart.bigThree.moon).toBe("sagittarius");
    expect(separation(lonOf(chart, "moon"), 240 + 14.53)).toBeLessThan(1.0);

    expect(chart.bigThree.ascendant).toBe("cancer");
    expect(separation(chart.houses!.ascendant, 90 + 11.63)).toBeLessThan(1.5);
  });
});

describe("positions at an instant", () => {
  it("matches the equinox Sun and carries no houses", () => {
    const utc = new Date(Date.UTC(2020, 2, 20, 3, 49, 36));
    const positions = positionsAt(utc);
    const sun = positions.find((p) => p.planet === "sun")!;
    expect(separation(sun.longitude, 0)).toBeLessThan(0.05);
    for (const p of positions) {
      expect(p.house).toBeNull();
      expect(p.degreeInSign).toBeGreaterThanOrEqual(0);
      expect(p.degreeInSign).toBeLessThan(30);
    }
  });

  it("matches the J2000 Sun longitude (~280.46°)", () => {
    const positions = positionsAt(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
    const sun = positions.find((p) => p.planet === "sun")!;
    expect(sun.longitude).toBeGreaterThan(280.0);
    expect(sun.longitude).toBeLessThan(281.0);
    expect(sun.sign).toBe("capricorn");
  });

  it("agrees exactly with buildChart placements at the same instant", () => {
    const utc = new Date(Date.UTC(2023, 4, 1, 0, 0, 0));
    const positions = positionsAt(utc);
    const chart = buildChart({ utc, latitude: 0, longitude: 0 });
    for (const p of positions) {
      const cp = chart.placements.find((c) => c.planet === p.planet)!;
      expect(p.longitude).toBe(cp.longitude);
      expect(p.retrograde).toBe(cp.retrograde);
    }
  });

  it("flags Mercury retrograde at the 2023 station windows, never the luminaries", () => {
    const rx = positionsAt(new Date(Date.UTC(2023, 4, 1, 0, 0, 0)));
    expect(rx.find((p) => p.planet === "mercury")!.retrograde).toBe(true);
    expect(rx.find((p) => p.planet === "sun")!.retrograde).toBe(false);
    expect(rx.find((p) => p.planet === "moon")!.retrograde).toBe(false);

    const direct = positionsAt(new Date(Date.UTC(2023, 2, 1, 0, 0, 0)));
    expect(direct.find((p) => p.planet === "mercury")!.retrograde).toBe(false);
  });
});

describe("retrograde detection", () => {
  it("flags Mercury retrograde on 2023-05-01 (Apr 21 – May 14 station)", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2023, 4, 1, 0, 0, 0)),
      latitude: 0,
      longitude: 0,
    });
    expect(chart.placements.find((p) => p.planet === "mercury")!.retrograde).toBe(true);
  });

  it("does not flag Mercury direct on 2023-03-01", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2023, 2, 1, 0, 0, 0)),
      latitude: 0,
      longitude: 0,
    });
    expect(chart.placements.find((p) => p.planet === "mercury")!.retrograde).toBe(false);
  });

  it("never flags the Sun or Moon retrograde", () => {
    const chart = buildChart({
      utc: new Date(Date.UTC(2023, 4, 1, 0, 0, 0)),
      latitude: 0,
      longitude: 0,
    });
    expect(chart.placements.find((p) => p.planet === "sun")!.retrograde).toBe(false);
    expect(chart.placements.find((p) => p.planet === "moon")!.retrograde).toBe(false);
  });
});
