import { describe, expect, it } from "vitest";
import { TABS, TAB_GROUPS, groupOf, paramFromTab, tabFromParam } from "./tabParam";

describe("tabParam", () => {
  it("round-trips every tab", () => {
    for (const tab of TABS) {
      expect(tabFromParam(paramFromTab(tab))).toBe(tab);
    }
  });

  it("slugs multi-word tabs", () => {
    expect(paramFromTab("Life events")).toBe("life-events");
    expect(tabFromParam("life-events")).toBe("Life events");
  });

  it("is case-insensitive and space-tolerant", () => {
    expect(tabFromParam("MAZAL")).toBe("Mazal");
    expect(tabFromParam("Transits")).toBe("Transits");
    expect(tabFromParam("LIFE-EVENTS")).toBe("Life events");
    expect(tabFromParam("life events")).toBe("Life events");
  });

  it("falls back to Chart for null, garbage, and empty values", () => {
    expect(tabFromParam(null)).toBe("Chart");
    expect(tabFromParam("")).toBe("Chart");
    expect(tabFromParam("nonsense")).toBe("Chart");
  });
});

describe("TAB_GROUPS", () => {
  it("places every tab in exactly one section", () => {
    const grouped = TAB_GROUPS.flatMap((g) => g.tabs);
    expect([...grouped].sort()).toEqual([...TABS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("finds a tab's section", () => {
    expect(groupOf("Cycles").label).toBe("Timing");
    expect(groupOf("Details").label).toBe("Natal");
  });
});
