import { describe, expect, it } from "vitest";
import {
  filterTimeline,
  timelineTags,
  type TimelineEntryData,
} from "./journalTimeline";

function entry(
  id: number,
  overrides: Partial<TimelineEntryData> = {},
): TimelineEntryData {
  return {
    id,
    profileId: 1,
    displayName: "Alice",
    entryDate: "2026-08-01",
    bodyMd: "A quiet day.",
    mood: null,
    tags: [],
    ...overrides,
  };
}

const ENTRIES: TimelineEntryData[] = [
  entry(1, { bodyMd: "Saturn return feelings today", tags: ["work"] }),
  entry(2, {
    profileId: 2,
    displayName: "Ben",
    bodyMd: "Started the garden",
    mood: "high",
    tags: ["home", "growth"],
  }),
  entry(3, { bodyMd: "Long walk, clear head", mood: "very_high" }),
];

describe("filterTimeline", () => {
  it("returns everything for an empty filter, preserving order", () => {
    expect(filterTimeline(ENTRIES, {})).toEqual(ENTRIES);
    expect(filterTimeline(ENTRIES, { q: "", mood: "", tag: "", profileId: "" })).toEqual(
      ENTRIES,
    );
  });

  it("matches free text case-insensitively against body and tags", () => {
    expect(filterTimeline(ENTRIES, { q: "SATURN" }).map((e) => e.id)).toEqual([1]);
    // "growth" appears only as a tag on entry 2.
    expect(filterTimeline(ENTRIES, { q: "growth" }).map((e) => e.id)).toEqual([2]);
    expect(filterTimeline(ENTRIES, { q: "nothing like this" })).toEqual([]);
  });

  it("filters by mood, tag, and profile", () => {
    expect(filterTimeline(ENTRIES, { mood: "high" }).map((e) => e.id)).toEqual([2]);
    expect(filterTimeline(ENTRIES, { tag: "work" }).map((e) => e.id)).toEqual([1]);
    expect(filterTimeline(ENTRIES, { profileId: 2 }).map((e) => e.id)).toEqual([2]);
  });

  it("combines filters conjunctively", () => {
    expect(
      filterTimeline(ENTRIES, { q: "garden", profileId: 2, mood: "high" }).map(
        (e) => e.id,
      ),
    ).toEqual([2]);
    expect(
      filterTimeline(ENTRIES, { q: "garden", profileId: 1 }),
    ).toEqual([]);
  });
});

describe("timelineTags", () => {
  it("collects distinct tags in first-seen order", () => {
    expect(timelineTags(ENTRIES)).toEqual(["work", "home", "growth"]);
    expect(timelineTags([entry(9)])).toEqual([]);
  });
});
