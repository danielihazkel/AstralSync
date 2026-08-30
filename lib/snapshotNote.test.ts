import { describe, expect, it } from "vitest";
import {
  MAX_NOTE_LENGTH,
  describeSnapshotChange,
  type SnapshotNoteInput,
} from "./snapshotNote";

const base: SnapshotNoteInput = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  timeCertainty: "exact",
  birthLat: 52.52,
  birthLng: 13.4,
  placeLabel: "Berlin, DE",
  tzIana: "Europe/Berlin",
  overrideOffsetMinutes: null,
  fullBirthName: "Ada King Lovelace",
  hebrewBirthName: null,
  houseSystem: "placidus",
};

describe("describeSnapshotChange", () => {
  it("is null when nothing compute-relevant differs", () => {
    expect(describeSnapshotChange(base, { ...base })).toBeNull();
  });

  it("names a house-system flip", () => {
    expect(
      describeSnapshotChange(base, { ...base, houseSystem: "whole_sign" }),
    ).toBe("House system: Placidus → Whole Sign");
  });

  it("joins several clauses in field order", () => {
    const note = describeSnapshotChange(base, {
      ...base,
      birthTime: "14:45",
      timeCertainty: "approx",
      houseSystem: "equal",
    });
    expect(note).toBe(
      "Birth time: 14:30 → 14:45 · Time certainty: exact → approximate · House system: Placidus → Equal House",
    );
  });

  it("describes an unknown-time edit and a manual offset", () => {
    expect(
      describeSnapshotChange(base, {
        ...base,
        birthTime: null,
        timeCertainty: "unknown",
        overrideOffsetMinutes: -330,
      }),
    ).toBe(
      "Birth time: 14:30 → unknown · Time certainty: exact → unknown · UTC offset: automatic → manual UTC−05:30",
    );
  });

  it("falls back to coordinates when a place has no label", () => {
    expect(
      describeSnapshotChange(base, {
        ...base,
        birthLat: 31.77,
        birthLng: 35.21,
        placeLabel: null,
        tzIana: "Asia/Jerusalem",
      }),
    ).toBe(
      "Birthplace: Berlin, DE → 31.77°, 35.21° · Time zone: Europe/Berlin → Asia/Jerusalem",
    );
  });

  it("reports name changes without echoing the names", () => {
    expect(
      describeSnapshotChange(base, {
        ...base,
        fullBirthName: null,
        hebrewBirthName: "דניאל",
      }),
    ).toBe("Birth name removed · Hebrew name added");
    expect(
      describeSnapshotChange(base, { ...base, fullBirthName: "Ada Byron" }),
    ).toBe("Birth name changed");
  });

  it("clips to the column width", () => {
    const long = "x".repeat(500);
    const note = describeSnapshotChange(base, {
      ...base,
      placeLabel: long,
      birthLat: 0,
    })!;
    expect(note.length).toBe(MAX_NOTE_LENGTH);
    expect(note.endsWith("…")).toBe(true);
  });
});
