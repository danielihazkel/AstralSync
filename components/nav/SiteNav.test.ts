import { describe, expect, it } from "vitest";
import { NAV_LINKS, isCurrentSection } from "./SiteNav";

describe("isCurrentSection", () => {
  it("gives Profiles the home page and every profile page", () => {
    expect(isCurrentSection("/", "/")).toBe(true);
    expect(isCurrentSection("/", "/profiles/3/relocation")).toBe(true);
    expect(isCurrentSection("/", "/journal")).toBe(false);
  });

  it("matches a section and its sub-pages, not a lookalike prefix", () => {
    expect(isCurrentSection("/synastry", "/synastry/group")).toBe(true);
    expect(isCurrentSection("/chart", "/chart")).toBe(true);
    expect(isCurrentSection("/calendar", "/calendarx")).toBe(false);
  });

  it("marks exactly one link on any page", () => {
    for (const path of ["/", "/profiles/2", "/calendar/2026-10-18", "/settings", "/chart"]) {
      expect(NAV_LINKS.filter((l) => isCurrentSection(l.href, path))).toHaveLength(1);
    }
  });
});
