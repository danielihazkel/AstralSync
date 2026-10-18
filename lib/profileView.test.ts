import type { Reading, ReadingGenerator } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

// getProfileView is a Prisma read. The fake below keeps the one behaviour
// this suite is about — the `readings` include filter — real: it returns
// only the stored readings whose generator the caller asked for, exactly as
// the database would. Everything else is a fixed row.

const STORED: Reading[] = (
  ["llm", "hebrew_llm", "life_story"] as ReadingGenerator[]
).map((generator, i) => ({
  id: i + 1,
  astroSnapshotId: 7,
  generator,
  bodyMd: `stored ${generator}`,
  modelName: "m",
  contentVersion: "1",
  createdAt: new Date("2026-09-01T10:00:00Z"),
})) as unknown as Reading[];

type IncludeArgs = {
  include?: { readings?: { where?: { generator?: { in?: string[] } } } };
};

function astroRow(args: IncludeArgs) {
  const wanted = args.include?.readings?.where?.generator?.in;
  return {
    id: 7,
    profileId: 1,
    version: 1,
    houseSystem: "placidus",
    isSolarChart: false,
    sunSign: "gemini",
    moonSign: "leo",
    ascendant: 100,
    placementsJson: {},
    aspectsJson: [],
    engine: "e",
    engineVersion: "1",
    contentVersion: "1",
    note: null,
    createdAt: new Date("2026-09-01T09:00:00Z"),
    readings: wanted
      ? STORED.filter((r) => wanted.includes(r.generator))
      : STORED,
  };
}

const numeroRow = {
  id: 3,
  version: 1,
  system: "pythagorean",
  lifePathInt: 4,
  destinyInt: 7,
  soulUrgeInt: 2,
  isMasterLp: false,
  derivationJson: {},
  createdAt: new Date("2026-09-01T09:00:00Z"),
};

vi.mock("./db", () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(async () => ({
        id: 1,
        displayName: "Ada",
        fullBirthName: "Ada King",
        hebrewBirthName: null,
        nameScript: "latin",
        birthDate: new Date("1990-06-15T00:00:00Z"),
        birthTime: "14:30",
        timeCertainty: "exact",
        birthCity: null,
        birthLat: 52.52,
        birthLng: 13.4,
        tzIana: "Europe/Berlin",
        utcOffsetMinutes: 120,
        offsetOverridden: false,
        isPrimary: true,
        tagsJson: null,
        createdAt: new Date("2026-09-01T09:00:00Z"),
      })),
    },
    astroSnapshot: {
      findFirst: vi.fn(async (args: IncludeArgs) => astroRow(args)),
      findUnique: vi.fn(async (args: IncludeArgs) => astroRow(args)),
    },
    numeroSnapshot: {
      findFirst: vi.fn(async () => numeroRow),
      findUnique: vi.fn(async () => numeroRow),
    },
    hebrewSnapshot: {
      findUnique: vi.fn(async () => ({
        id: 5,
        version: 1,
        hebrewDate: "x",
        monthKey: "sivan",
        dayPlanet: "venus",
        hourPlanet: "mars",
        dateGematriaInt: 10,
        mazalJson: {},
        gematriaJson: null,
        engine: "e",
        engineVersion: "1",
        contentVersion: "1",
        createdAt: new Date("2026-09-01T09:00:00Z"),
      })),
    },
  },
}));

import { getProfileView } from "./snapshots";

describe("getProfileView stored readings", () => {
  it("surfaces every generator the view renders, life_story included", async () => {
    const view = await getProfileView(1);
    expect(view?.astro.llmReading?.bodyMd).toBe("stored llm");
    expect(view?.hebrew?.llmReading?.bodyMd).toBe("stored hebrew_llm");
    // Was null for every profile: the include filter dropped the row, so
    // the panel offered Generate for a reading that already existed.
    expect(view?.astro.lifeStoryReading?.bodyMd).toBe("stored life_story");
  });

  it("loads the same set when a historical version is requested", async () => {
    const view = await getProfileView(1, 1);
    expect(view?.astro.lifeStoryReading?.bodyMd).toBe("stored life_story");
  });
});
