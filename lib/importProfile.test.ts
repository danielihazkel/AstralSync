import { describe, expect, it } from "vitest";
import {
  profileBundleSchema,
  profileExportSchema,
  remapReadingRows,
  remapRelationshipRows,
} from "./importProfile";

/**
 * Synthetic export mirroring the real exportProfile() shape (extra row
 * columns like profileId included, as Prisma emits them) with fabricated
 * birth data.
 */
function validExport() {
  return {
    exportVersion: 1,
    exportedAt: "2026-08-11T12:17:16.778Z",
    profile: {
      id: 12,
      displayName: "Test Person",
      fullBirthName: "Test Full Name",
      hebrewBirthName: null,
      nameScript: "latin",
      birthDate: "1990-02-22",
      birthTime: "18:00",
      timeCertainty: "approx",
      birthCityGeonameId: 293397,
      birthLat: 32.08088,
      birthLng: 34.78057,
      tzIana: "Asia/Jerusalem",
      utcOffsetMinutes: 120,
      offsetOverridden: false,
      createdAt: "2026-08-11T12:15:41.145Z",
    },
    birthCity: {
      geonameId: 293397,
      name: "Tel Aviv",
      asciiName: "Tel Aviv",
      countryCode: "IL",
      admin1: "05",
      lat: 32.08088,
      lng: 34.78057,
      population: 432892,
    },
    astroSnapshots: [
      {
        id: 15,
        profileId: 12,
        version: 1,
        houseSystem: "placidus",
        isSolarChart: false,
        sunSign: "pisces",
        moonSign: "capricorn",
        ascendant: "virgo",
        placementsJson: { schemaVersion: 1, placements: [] },
        aspectsJson: [{ a: "sun", b: "moon", type: "trine", angle: 120, orb: 1 }],
        engine: "astronomy-engine",
        engineVersion: "2.1.19",
        contentVersion: "1",
        createdAt: "2026-08-11T12:15:41.154Z",
      },
      {
        id: 16,
        profileId: 12,
        version: 2,
        houseSystem: "whole_sign",
        isSolarChart: false,
        sunSign: "pisces",
        moonSign: "capricorn",
        ascendant: "virgo",
        placementsJson: { schemaVersion: 1, placements: [] },
        aspectsJson: [],
        engine: "astronomy-engine",
        engineVersion: "2.1.19",
        contentVersion: "1",
        createdAt: "2026-08-12T09:00:00.000Z",
      },
    ],
    numeroSnapshots: [
      {
        id: 15,
        profileId: 12,
        version: 1,
        system: "pythagorean",
        lifePathInt: 7,
        destinyInt: 1,
        soulUrgeInt: 3,
        isMasterLp: false,
        derivationJson: { lifePath: { value: 7 } },
        createdAt: "2026-08-11T12:15:41.164Z",
      },
      {
        id: 16,
        profileId: 12,
        version: 2,
        system: "pythagorean",
        lifePathInt: 7,
        destinyInt: null,
        soulUrgeInt: null,
        isMasterLp: false,
        derivationJson: { lifePath: { value: 7 } },
        createdAt: "2026-08-12T09:00:00.000Z",
      },
    ],
    hebrewSnapshots: [
      {
        id: 4,
        profileId: 12,
        version: 2,
        hebrewDate: "27 Shevat 5750",
        monthKey: "shevat",
        dayPlanet: "sun",
        hourPlanet: null,
        dateGematriaInt: 3,
        mazalJson: { schemaVersion: 1 },
        gematriaJson: { katanName: null },
        engine: "hebcal",
        engineVersion: "5.0.0",
        contentVersion: "1",
        createdAt: "2026-08-12T09:00:00.000Z",
      },
    ],
    readings: [
      {
        id: 3,
        astroSnapshotId: 15,
        numeroSnapshotId: 15,
        bodyMd: "A reading.",
        generator: "llm",
        modelName: "gpt-4o-mini",
        contentVersion: "1",
        createdAt: "2026-08-11T13:00:00.000Z",
      },
      {
        id: 4,
        astroSnapshotId: 16,
        numeroSnapshotId: null,
        bodyMd: "A Mazal reading.",
        generator: "hebrew_llm",
        modelName: null,
        contentVersion: null,
        createdAt: "2026-08-12T10:00:00.000Z",
      },
    ],
  };
}

describe("profileExportSchema", () => {
  it("accepts a full export", () => {
    const parsed = profileExportSchema.safeParse(validExport());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.astroSnapshots).toHaveLength(2);
      expect(parsed.data.readings[1].numeroSnapshotId).toBeNull();
    }
  });

  it("defaults hebrewSnapshots and readings when absent (pre-feature exports)", () => {
    const data = validExport() as Record<string, unknown>;
    delete data.hebrewSnapshots;
    data.readings = [];
    const parsed = profileExportSchema.safeParse(data);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.hebrewSnapshots).toEqual([]);
  });

  it("accepts legacy nameScript values that live input would normalize away", () => {
    const data = validExport();
    data.profile.nameScript = "hebrew";
    expect(profileExportSchema.safeParse(data).success).toBe(true);
  });

  it("rejects an unknown exportVersion", () => {
    const data = { ...validExport(), exportVersion: 2 };
    expect(profileExportSchema.safeParse(data).success).toBe(false);
  });

  it("rejects a reading pointing at a missing astro snapshot", () => {
    const data = validExport();
    data.readings[0].astroSnapshotId = 999;
    const parsed = profileExportSchema.safeParse(data);
    expect(parsed.success).toBe(false);
  });

  it("rejects a reading pointing at a missing numero snapshot", () => {
    const data = validExport();
    data.readings[0].numeroSnapshotId = 999;
    expect(profileExportSchema.safeParse(data).success).toBe(false);
  });

  it("rejects duplicate snapshot versions", () => {
    const data = validExport();
    data.astroSnapshots[1].version = 1;
    expect(profileExportSchema.safeParse(data).success).toBe(false);
  });

  it("requires at least one astro and numero snapshot", () => {
    const data = validExport();
    data.astroSnapshots = [];
    data.readings = [];
    expect(profileExportSchema.safeParse(data).success).toBe(false);
  });
});

describe("remapReadingRows", () => {
  const parsed = profileExportSchema.parse(validExport());
  const astroMap = new Map([
    [15, 101],
    [16, 102],
  ]);
  const numeroMap = new Map([
    [15, 201],
    [16, 202],
  ]);

  it("remaps both FKs and preserves the null numero FK", () => {
    const rows = remapReadingRows(parsed.readings, astroMap, numeroMap);
    expect(rows[0].astroSnapshotId).toBe(101);
    expect(rows[0].numeroSnapshotId).toBe(201);
    expect(rows[1].astroSnapshotId).toBe(102);
    expect(rows[1].numeroSnapshotId).toBeNull();
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[1].modelName).toBeNull();
  });

  it("throws on an unmapped snapshot id", () => {
    expect(() =>
      remapReadingRows(parsed.readings, new Map(), numeroMap),
    ).toThrow(/unmapped astro snapshot id/);
  });
});

describe("profileExportSchema — life events", () => {
  const lifeEvent = {
    id: 1,
    profileId: 12,
    title: "Moved abroad",
    eventDate: "2014-03-12",
    precision: "day",
    category: "relocation",
    notesMd: null,
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z",
  };

  it("accepts an export with life events and a life_story reading", () => {
    const base = validExport();
    const data = {
      ...base,
      lifeEvents: [
        lifeEvent,
        {
          title: "First job",
          eventDate: "2010-06-01",
          precision: "month",
          category: "career",
          notesMd: "Junior role.",
          createdAt: "2026-08-11T12:00:00.000Z",
          updatedAt: "2026-08-11T12:00:00.000Z",
        },
      ],
      readings: [
        ...base.readings,
        {
          id: 9,
          astroSnapshotId: 15,
          numeroSnapshotId: 15,
          bodyMd: "A life story.",
          generator: "life_story",
          modelName: "claude-opus-5",
          contentVersion: "1",
          createdAt: "2026-08-13T10:00:00.000Z",
        },
      ],
    };
    const parsed = profileExportSchema.parse(data);
    expect(parsed.lifeEvents).toHaveLength(2);
    expect(parsed.lifeEvents[1].precision).toBe("month");
    expect(parsed.lifeEvents[1].notesMd).toBe("Junior role.");
    expect(parsed.readings.some((r) => r.generator === "life_story")).toBe(
      true,
    );
  });

  it("defaults lifeEvents for pre-feature exports", () => {
    expect(profileExportSchema.parse(validExport()).lifeEvents).toEqual([]);
  });

  it("rejects an unknown category or precision", () => {
    const bad = (patch: object) =>
      profileExportSchema.safeParse({
        ...validExport(),
        lifeEvents: [{ ...lifeEvent, ...patch }],
      }).success;
    expect(bad({ category: "misc" })).toBe(false);
    expect(bad({ precision: "week" })).toBe(false);
  });
});

describe("profileExportSchema — journal metadata round-trip", () => {
  // Regression: the schema used to accept only entryDate/bodyMd/createdAt/
  // updatedAt, so every import silently destroyed the mood, tags and pinned
  // sky that exportProfile emits — and with them the data lib/journalInsights
  // runs on.
  const sky = {
    computedAt: "2026-03-01T12:00:00.000Z",
    natalVersion: 2,
    engine: { name: "astronomy-engine", version: "2.1.19" },
    placements: [],
    crossAspects: [],
  };

  function withJournal(entry: Record<string, unknown>) {
    return { ...validExport(), journalEntries: [entry] };
  }

  const fullEntry = {
    id: 9,
    entryDate: "2026-03-01",
    bodyMd: "A note.",
    mood: "high",
    tagsJson: ["work", "travel"],
    skyJson: sky,
    createdAt: "2026-03-01T18:00:00.000Z",
    updatedAt: "2026-03-01T18:00:00.000Z",
  };

  it("carries mood, tags and the pinned sky through the schema", () => {
    const parsed = profileExportSchema.safeParse(withJournal(fullEntry));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const [e] = parsed.data.journalEntries;
    expect(e.mood).toBe("high");
    expect(e.tagsJson).toEqual(["work", "travel"]);
    expect(e.skyJson).toEqual(sky);
  });

  it("still accepts pre-feature entries that carry none of them", () => {
    const parsed = profileExportSchema.safeParse(
      withJournal({
        entryDate: "2026-03-01",
        bodyMd: "A note.",
        createdAt: "2026-03-01T18:00:00.000Z",
        updatedAt: "2026-03-01T18:00:00.000Z",
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.journalEntries[0].mood ?? null).toBeNull();
  });

  it("rejects a mood outside the enum", () => {
    const parsed = profileExportSchema.safeParse(
      withJournal({ ...fullEntry, mood: "elated" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("carries profile tags, and tolerates an export written before them", () => {
    const base = validExport();
    const tagged = {
      ...base,
      profile: { ...base.profile, tagsJson: ["family"] },
    };
    const withTags = profileExportSchema.safeParse(tagged);
    expect(withTags.success).toBe(true);
    if (withTags.success) {
      expect(withTags.data.profile.tagsJson).toEqual(["family"]);
    }
    // The fixture itself has no tagsJson key at all.
    const without = profileExportSchema.safeParse(validExport());
    expect(without.success).toBe(true);
  });
});

describe("remapRelationshipRows", () => {
  const base = {
    kind: "partner" as const,
    label: null,
    note: null,
    createdAt: "2026-03-01T12:00:00.000Z",
  };

  it("remaps both endpoints onto the new profile ids", () => {
    const map = new Map([
      [7, 101],
      [9, 102],
    ]);
    const rows = remapRelationshipRows([{ ...base, aId: 7, bId: 9 }], map);
    expect(rows).toHaveLength(1);
    expect(rows[0].aId).toBe(101);
    expect(rows[0].bId).toBe(102);
  });

  it("re-establishes aId < bId when new ids invert the old order", () => {
    // 7 -> 200 and 9 -> 100: the remap flips the pair's ordering.
    const map = new Map([
      [7, 200],
      [9, 100],
    ]);
    const [row] = remapRelationshipRows([{ ...base, aId: 7, bId: 9 }], map);
    expect(row.aId).toBe(100);
    expect(row.bId).toBe(200);
  });

  it("drops a pairing whose partner was not in the bundle", () => {
    const map = new Map([[7, 101]]);
    expect(remapRelationshipRows([{ ...base, aId: 7, bId: 9 }], map)).toEqual(
      [],
    );
  });

  it("drops a pair that would collapse onto one profile", () => {
    const map = new Map([
      [7, 101],
      [9, 101],
    ]);
    expect(remapRelationshipRows([{ ...base, aId: 7, bId: 9 }], map)).toEqual(
      [],
    );
  });

  it("carries the kind, label and note through", () => {
    const map = new Map([
      [1, 10],
      [2, 20],
    ]);
    const [row] = remapRelationshipRows(
      [{ ...base, aId: 1, bId: 2, kind: "family", label: "my parents", note: "n" }],
      map,
    );
    expect(row.kind).toBe("family");
    expect(row.label).toBe("my parents");
    expect(row.note).toBe("n");
  });
});

describe("profileBundleSchema", () => {
  function bundle(extra: Record<string, unknown> = {}) {
    return {
      exportVersion: 1,
      bundle: true,
      profiles: [validExport()],
      ...extra,
    };
  }

  it("defaults relationships for a pre-relationship bundle", () => {
    const parsed = profileBundleSchema.safeParse(bundle());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.relationships).toEqual([]);
  });

  it("accepts relationships and keeps the exported profile id", () => {
    const parsed = profileBundleSchema.safeParse(
      bundle({
        relationships: [
          {
            aId: 12,
            bId: 13,
            kind: "friend",
            label: null,
            note: null,
            createdAt: "2026-03-01T12:00:00.000Z",
          },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.relationships[0].aId).toBe(12);
    // validExport()'s profile id, needed for the remap.
    expect(parsed.data.profiles[0].profile.id).toBe(12);
  });

  it("rejects an unknown relationship kind", () => {
    const parsed = profileBundleSchema.safeParse(
      bundle({
        relationships: [
          {
            aId: 1,
            bId: 2,
            kind: "nemesis",
            createdAt: "2026-03-01T12:00:00.000Z",
          },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
  });
});
