import { describe, expect, it } from "vitest";
import { lineProseKey } from "./relocation";
import { resolveRelocationProse } from "./relocationProse";

describe("lineProseKey", () => {
  it("reads MC/ASC lines as conjunctions and IC/DSC lines as oppositions", () => {
    expect(lineProseKey("venus", "mc")).toBe("angle_aspect/venus/mc/conjunction");
    expect(lineProseKey("venus", "ic")).toBe("angle_aspect/venus/mc/opposition");
    expect(lineProseKey("mars", "asc")).toBe("angle_aspect/mars/ascendant/conjunction");
    expect(lineProseKey("mars", "dsc")).toBe("angle_aspect/mars/ascendant/opposition");
  });
});

describe("resolveRelocationProse", () => {
  it("finds an authored entry for every line and every angle sign", () => {
    const prose = resolveRelocationProse();
    expect(Object.keys(prose.lines)).toHaveLength(40);
    expect(prose.lines["venus-ic"].bodyMd).toMatch(/IC/);
    expect(Object.keys(prose.ascendant)).toHaveLength(12);
    expect(Object.keys(prose.mc)).toHaveLength(12);
  });
});
