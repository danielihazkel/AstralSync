import { describe, expect, it } from "vitest";
import {
  filterProfiles,
  sortProfiles,
  type ProfileListItem,
} from "./profileListSort";

function item(overrides: Partial<ProfileListItem> & { id: number }): ProfileListItem {
  return {
    displayName: `Profile ${overrides.id}`,
    birthDate: "2000-01-01",
    timeCertainty: "exact",
    sunSign: null,
    isSolarChart: false,
    latestVersion: 1,
    isPrimary: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sortProfiles — primary first", () => {
  it("pins the primary profile to the top under every sort", () => {
    const list = [
      item({ id: 1, displayName: "Zed", birthDate: "1990-01-01" }),
      item({ id: 2, displayName: "Amy", birthDate: "2001-01-01", isPrimary: true }),
      item({ id: 3, displayName: "Bob", birthDate: "1980-01-01" }),
    ];
    for (const sort of ["created", "name", "birth_date"] as const) {
      expect(sortProfiles(list, sort)[0].id).toBe(2);
    }
    expect(sortProfiles(list, "birth_date").map((p) => p.id)).toEqual([2, 3, 1]);
  });
});

const profiles: ProfileListItem[] = [
  item({ id: 1, displayName: "Dana", birthDate: "1990-05-01", createdAt: "2026-01-01T00:00:00.000Z" }),
  item({ id: 2, displayName: "amir", birthDate: "1985-11-20", createdAt: "2026-03-01T00:00:00.000Z" }),
  item({ id: 3, displayName: "Noa", birthDate: "2001-02-14", createdAt: "2026-02-01T00:00:00.000Z" }),
];

describe("filterProfiles", () => {
  it("returns everything for an empty or whitespace query", () => {
    expect(filterProfiles(profiles, "")).toEqual(profiles);
    expect(filterProfiles(profiles, "   ")).toEqual(profiles);
  });

  it("matches case-insensitive substrings of the display name", () => {
    expect(filterProfiles(profiles, "AM").map((p) => p.id)).toEqual([2]);
    expect(filterProfiles(profiles, "na").map((p) => p.id)).toEqual([1]);
    expect(filterProfiles(profiles, "oa").map((p) => p.id)).toEqual([3]);
  });

  it("returns an empty list on no match", () => {
    expect(filterProfiles(profiles, "zzz")).toEqual([]);
  });
});

describe("sortProfiles", () => {
  it("sorts by created, oldest first (the server default)", () => {
    expect(sortProfiles(profiles, "created").map((p) => p.id)).toEqual([1, 3, 2]);
  });

  it("sorts by name case-insensitively", () => {
    expect(sortProfiles(profiles, "name").map((p) => p.id)).toEqual([2, 1, 3]);
  });

  it("sorts by birth date, earliest first", () => {
    expect(sortProfiles(profiles, "birth_date").map((p) => p.id)).toEqual([2, 1, 3]);
  });

  it("tie-breaks by id and does not mutate the input", () => {
    const tied = [
      item({ id: 5, displayName: "Same" }),
      item({ id: 4, displayName: "same" }),
    ];
    expect(sortProfiles(tied, "name").map((p) => p.id)).toEqual([4, 5]);
    expect(tied.map((p) => p.id)).toEqual([5, 4]);
  });
});
