import { describe, expect, it } from "vitest";
import { synthesizeReading } from "./synthesis";
import { ELEMENTS } from "./dominance";

const water = {
  name: "water" as const,
  title: "Water Dominant",
  essence: "a feeling-first read on every room you enter",
};
const seven = {
  value: 7,
  isMaster: false,
  title: "Life Path 7",
  essence: "a researcher's need to understand before joining in",
};

describe("synthesizeReading", () => {
  it("weaves both essences into two paragraphs", () => {
    const md = synthesizeReading({ element: water, lifePath: seven });
    const paragraphs = md.split("\n\n");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain(water.essence);
    expect(paragraphs[1]).toContain("**Life Path 7**");
    expect(paragraphs[1]).toContain(seven.essence);
  });

  it("is deterministic", () => {
    expect(synthesizeReading({ element: water, lifePath: seven })).toBe(
      synthesizeReading({ element: water, lifePath: seven }),
    );
  });

  it("uses distinct connective copy per element", () => {
    const outputs = ELEMENTS.map((name) =>
      synthesizeReading({
        element: { name, title: "T", essence: "an essence" },
        lifePath: seven,
      }),
    );
    expect(new Set(outputs).size).toBe(ELEMENTS.length);
  });

  it("adds the master-number sentence for 11/22/33", () => {
    const md = synthesizeReading({
      element: water,
      lifePath: { value: 22, isMaster: true, title: "Life Path 22", essence: "e" },
    });
    expect(md).toContain("22 is a master number");
  });

  it("falls back to an element-only paragraph without a life path", () => {
    const md = synthesizeReading({ element: water, lifePath: null });
    expect(md).toContain(water.essence);
    expect(md).not.toContain("**");
    expect(md.split("\n\n")).toHaveLength(1);
  });
});
