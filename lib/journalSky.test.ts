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
      crossAspects: t.crossAspects,
    });
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
