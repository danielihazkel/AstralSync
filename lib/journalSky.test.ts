import { buildChart } from "@astralsync/astro-core";
import { describe, expect, it } from "vitest";
import { entrySkyFromTransits } from "./journal";
import { computeTransits } from "./transits";
import { journalCreateSchema, journalUpdateSchema } from "./validation";
import type { WheelChart } from "./view-types";

const natal: WheelChart = {
  ...buildChart({
    utc: new Date(Date.UTC(1990, 2, 4, 10, 30, 0)),
    latitude: 32.109,
    longitude: 34.855,
  }),
  tzWarnings: [],
};

describe("entrySkyFromTransits", () => {
  it("keeps exactly the slice the Journal tab displays", () => {
    const at = new Date("2026-08-01T09:00:00Z");
    const t = computeTransits(natal, 3, at);
    const sky = entrySkyFromTransits(t);
    expect(sky).toEqual({
      computedAt: at.toISOString(),
      natalVersion: 3,
      engine: t.engine,
      placements: t.placements,
      // The live view's read-time extras never reach storage.
      crossAspects: t.crossAspects.map(({ applying: _a, ...c }) => c),
    });
    expect(t.crossAspects.length).toBeGreaterThan(0);
    for (const c of sky.crossAspects) {
      expect("applying" in c).toBe(false);
    }
    expect("angleAspects" in sky).toBe(false);
    // Round-trips through JSON (it is stored in a Json column).
    expect(JSON.parse(JSON.stringify(sky))).toEqual(sky);
  });
});

describe("journal schemas' `at` field", () => {
  it("accepts an offset instant on the entry's date", () => {
    const r = journalCreateSchema.safeParse({
      entryDate: "2026-08-01",
      bodyMd: "note",
      at: "2026-08-01T12:00:00+03:00",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an instant on a different wall-clock date", () => {
    const r = journalCreateSchema.safeParse({
      entryDate: "2026-08-01",
      bodyMd: "note",
      at: "2026-08-02T12:00:00+03:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a datetime without offset information", () => {
    const r = journalCreateSchema.safeParse({
      entryDate: "2026-08-01",
      bodyMd: "note",
      at: "2026-08-01T12:00:00",
    });
    expect(r.success).toBe(false);
  });

  it("stays optional on both create and update", () => {
    expect(
      journalCreateSchema.safeParse({
        entryDate: "2026-08-01",
        bodyMd: "note",
      }).success,
    ).toBe(true);
    expect(
      journalUpdateSchema.safeParse({ bodyMd: "edited" }).success,
    ).toBe(true);
  });

  it("checks at against entryDate on update too", () => {
    expect(
      journalUpdateSchema.safeParse({
        entryDate: "2026-08-05",
        at: "2026-08-05T12:00:00-04:00",
      }).success,
    ).toBe(true);
    expect(
      journalUpdateSchema.safeParse({
        entryDate: "2026-08-05",
        at: "2026-08-06T12:00:00-04:00",
      }).success,
    ).toBe(false);
  });
});

describe("journal schemas' mood and tags", () => {
  const base = { entryDate: "2026-08-01", bodyMd: "note" };

  it("accepts a valid mood and rejects an unknown one", () => {
    expect(
      journalCreateSchema.safeParse({ ...base, mood: "very_high" }).success,
    ).toBe(true);
    expect(
      journalCreateSchema.safeParse({ ...base, mood: "ecstatic" }).success,
    ).toBe(false);
  });

  it("normalizes tags through the schema", () => {
    const r = journalCreateSchema.safeParse({
      ...base,
      tags: [" Work ", "DREAMS", "work"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tags).toEqual(["work", "dreams"]);
  });

  it("rejects more than 10 distinct tags", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(journalCreateSchema.safeParse({ ...base, tags }).success).toBe(
      false,
    );
  });

  it("rejects an over-long tag rather than truncating", () => {
    expect(
      journalCreateSchema.safeParse({ ...base, tags: ["x".repeat(25)] })
        .success,
    ).toBe(false);
  });

  it("counts a mood-only or tags-only update as an update", () => {
    expect(journalUpdateSchema.safeParse({ mood: "low" }).success).toBe(true);
    expect(journalUpdateSchema.safeParse({ mood: null }).success).toBe(true);
    expect(journalUpdateSchema.safeParse({ tags: [] }).success).toBe(true);
    expect(journalUpdateSchema.safeParse({}).success).toBe(false);
  });
});
