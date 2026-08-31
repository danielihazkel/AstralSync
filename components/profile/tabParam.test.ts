import { describe, expect, it } from "vitest";
import { TABS, paramFromTab, tabFromParam } from "./tabParam";

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
