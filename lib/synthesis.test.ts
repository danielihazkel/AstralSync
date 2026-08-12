import { describe, expect, it } from "vitest";
import { synthesizeReading } from "./synthesis";
import { ELEMENTS, MODALITIES } from "./dominance";

const water = {
  name: "water" as const,
  title: "Water Dominant",
  essence: "a feeling-first read on every room you enter",
};
const cardinal = {
  name: "cardinal" as const,
  title: "Cardinal Dominant",
  essence: "an instinct to open new ground",
};
const seven = {
  value: 7,
  isMaster: false,
  title: "Life Path 7",
  essence: "a researcher's need to understand before joining in",
};

describe("synthesizeReading", () => {
  it("weaves both essences into two paragraphs", () => {
    const md = synthesizeReading({ element: water, modality: null, lifePath: seven });
    const paragraphs = md.split("\n\n");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain(water.essence);
    expect(paragraphs[1]).toContain("**Life Path 7**");
    expect(paragraphs[1]).toContain(seven.essence);
  });

  it("weaves the modality essence into the opening paragraph", () => {
    const md = synthesizeReading({
      element: water,
      modality: cardinal,
      lifePath: seven,
    });
    const paragraphs = md.split("\n\n");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain(water.essence);
    expect(paragraphs[0]).toContain(cardinal.essence);
    expect(paragraphs[1]).toContain(seven.essence);
  });

  it("matches the two-way output shape when the modality is unauthored", () => {
    const withNull = synthesizeReading({
      element: water,
      modality: null,
      lifePath: seven,
    });
    expect(withNull).not.toContain(cardinal.essence);
    expect(
      synthesizeReading({ element: water, modality: cardinal, lifePath: seven }),
    ).not.toBe(withNull);
  });

  it("is deterministic", () => {
    expect(
      synthesizeReading({ element: water, modality: cardinal, lifePath: seven }),
    ).toBe(synthesizeReading({ element: water, modality: cardinal, lifePath: seven }));
  });

  it("uses distinct connective copy per element", () => {
    const outputs = ELEMENTS.map((name) =>
      synthesizeReading({
        element: { name, title: "T", essence: "an essence" },
        modality: null,
        lifePath: seven,
      }),
    );
    expect(new Set(outputs).size).toBe(ELEMENTS.length);
  });

  it("uses distinct connective copy per modality", () => {
    const outputs = MODALITIES.map((name) =>
      synthesizeReading({
        element: water,
        modality: { name, title: "T", essence: "an essence" },
        lifePath: seven,
      }),
    );
    expect(new Set(outputs).size).toBe(MODALITIES.length);
  });

  it("adds the master-number sentence for 11/22/33", () => {
    const md = synthesizeReading({
      element: water,
      modality: null,
      lifePath: { value: 22, isMaster: true, title: "Life Path 22", essence: "e" },
    });
    expect(md).toContain("22 is a master number");
  });

  it("falls back to an element-only paragraph without a life path", () => {
    const md = synthesizeReading({ element: water, modality: null, lifePath: null });
    expect(md).toContain(water.essence);
    expect(md).not.toContain("**");
    expect(md.split("\n\n")).toHaveLength(1);
  });

  it("keeps the modality weave in the no-life-path fallback", () => {
    const md = synthesizeReading({
      element: water,
      modality: cardinal,
      lifePath: null,
    });
    expect(md).toContain(cardinal.essence);
    expect(md.split("\n\n")).toHaveLength(1);
  });
});
