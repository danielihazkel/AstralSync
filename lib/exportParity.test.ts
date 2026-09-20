import { describe, expect, it } from "vitest";
import {
  journalEntrySchema,
  lifeEventSchema,
  profileSchema,
} from "./importProfile";
import {
  exportJournalEntry,
  exportLifeEvent,
  exportProfileColumns,
} from "./snapshots";

/**
 * Export <-> import field parity.
 *
 * Three separate bugs shipped in this seam: the journal export lost its Trash
 * filter, the journal import silently dropped mood/tags/skyJson, and the
 * profile import silently dropped tagsJson. Each was a key that one side
 * emitted and the other never read, and each survived because the round-trip
 * was only ever tested one side at a time.
 *
 * This asserts the invariant directly: every key an export mapper emits is a
 * key the importer's zod schema reads, unless it is deliberately dropped.
 *
 * Known limit: it compares the two sides of the seam, so a new Prisma column
 * that is never exported at all is invisible here. Adding a column to a model
 * still means deciding, by hand, whether it belongs in the export.
 */

/**
 * Keys the export carries that the importer deliberately does not write.
 * `id` is read by profileSchema (a bundle needs it to remap relationship
 * endpoints) but never written — rows are always recreated under fresh ids.
 */
const DELIBERATE_DROPS = new Set(["id"]);

function parityOf(
  emitted: Record<string, unknown>,
  schema: { shape: Record<string, unknown> },
) {
  const known = new Set(Object.keys(schema.shape));
  return Object.keys(emitted).filter(
    (k) => !known.has(k) && !DELIBERATE_DROPS.has(k),
  );
}

const DATE = new Date("2026-03-01T12:00:00.000Z");

describe("export/import field parity", () => {
  it("every exported profile column is read by the importer", () => {
    const emitted = exportProfileColumns({
      id: 1,
      displayName: "A",
      fullBirthName: null,
      hebrewBirthName: null,
      nameScript: "latin",
      birthDate: DATE,
      birthTime: "12:00",
      timeCertainty: "exact",
      birthCityGeonameId: null,
      birthLat: 0,
      birthLng: 0,
      tzIana: "UTC",
      utcOffsetMinutes: 0,
      offsetOverridden: false,
      tagsJson: ["family"],
      createdAt: DATE,
    });
    expect(parityOf(emitted, profileSchema)).toEqual([]);
  });

  it("every exported journal field is read by the importer", () => {
    const emitted = exportJournalEntry({
      id: 1,
      entryDate: DATE,
      bodyMd: "note",
      mood: "high",
      tagsJson: ["work"],
      skyJson: { computedAt: DATE.toISOString() },
      createdAt: DATE,
      updatedAt: DATE,
    });
    expect(parityOf(emitted, journalEntrySchema)).toEqual([]);
  });

  it("every exported life-event field is read by the importer", () => {
    const emitted = exportLifeEvent({
      id: 1,
      title: "Moved",
      eventDate: DATE,
      precision: "day",
      category: "relocation",
      notesMd: null,
      skyJson: { computedAt: DATE.toISOString() },
      createdAt: DATE,
      updatedAt: DATE,
    });
    expect(parityOf(emitted, lifeEventSchema)).toEqual([]);
  });

  it("the guard actually fails when a key goes unread", () => {
    const emitted = { displayName: "A", somethingNew: 1 };
    expect(parityOf(emitted, profileSchema)).toEqual(["somethingNew"]);
  });

  it("no export mapper leaks soft-delete or device state", () => {
    const leaky = ["deletedAt", "profileId", "isPrimary", "lastViewedAt"];
    const emitted = [
      Object.keys(
        exportProfileColumns({
          id: 1,
          displayName: "A",
          fullBirthName: null,
          hebrewBirthName: null,
          nameScript: "latin",
          birthDate: DATE,
          birthTime: null,
          timeCertainty: "unknown",
          birthCityGeonameId: null,
          birthLat: 0,
          birthLng: 0,
          tzIana: "UTC",
          utcOffsetMinutes: 0,
          offsetOverridden: false,
          tagsJson: null,
          createdAt: DATE,
        }),
      ),
      Object.keys(
        exportJournalEntry({
          id: 1,
          entryDate: DATE,
          bodyMd: "n",
          mood: null,
          tagsJson: null,
          skyJson: null,
          createdAt: DATE,
          updatedAt: DATE,
        }),
      ),
      Object.keys(
        exportLifeEvent({
          id: 1,
          title: "t",
          eventDate: DATE,
          precision: "year",
          category: "other",
          notesMd: null,
          skyJson: null,
          createdAt: DATE,
          updatedAt: DATE,
        }),
      ),
    ].flat();
    expect(emitted.filter((k) => leaky.includes(k))).toEqual([]);
  });
});
