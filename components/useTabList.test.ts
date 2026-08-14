import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./useTabList";

describe("nextTabIndex", () => {
  it("steps right and left", () => {
    expect(nextTabIndex("ArrowRight", 0, 9)).toBe(1);
    expect(nextTabIndex("ArrowRight", 3, 9)).toBe(4);
    expect(nextTabIndex("ArrowLeft", 4, 9)).toBe(3);
    expect(nextTabIndex("ArrowLeft", 1, 9)).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(nextTabIndex("ArrowRight", 8, 9)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 9)).toBe(8);
  });

  it("jumps with Home and End", () => {
    expect(nextTabIndex("Home", 5, 9)).toBe(0);
    expect(nextTabIndex("End", 5, 9)).toBe(8);
    expect(nextTabIndex("Home", 0, 9)).toBe(0);
    expect(nextTabIndex("End", 8, 9)).toBe(8);
  });

  it("ignores non-navigation keys", () => {
    for (const key of ["a", "Enter", " ", "ArrowDown", "ArrowUp", "Tab", "PageDown"]) {
      expect(nextTabIndex(key, 2, 9)).toBeNull();
    }
  });

  it("self-wraps a single-tab list", () => {
    expect(nextTabIndex("ArrowRight", 0, 1)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 1)).toBe(0);
    expect(nextTabIndex("End", 0, 1)).toBe(0);
  });

  it("returns null for an empty list", () => {
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
