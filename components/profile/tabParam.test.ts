import { describe, expect, it } from "vitest";
import { TABS, paramFromTab, tabFromParam } from "./tabParam";

describe("tabParam", () => {
  it("round-trips every tab", () => {
    for (const tab of TABS) {
      expect(tabFromParam(paramFromTab(tab))).toBe(tab);
    }
  });

  it("is case-insensitive", () => {
    expect(tabFromParam("MAZAL")).toBe("Mazal");
    expect(tabFromParam("Transits")).toBe("Transits");
  });

  it("falls back to Chart for null, garbage, and empty values", () => {
    expect(tabFromParam(null)).toBe("Chart");
    expect(tabFromParam("")).toBe("Chart");
    expect(tabFromParam("nonsense")).toBe("Chart");
  });
});
