import { describe, expect, it } from "vitest";
import { renderEventLords } from "./promptData";
import type { EventLords } from "./eventLords";

const base: EventLords = {
  profection: { age: 21, house: 10, sign: "sagittarius", lord: "jupiter" },
  firdaria: { major: "saturn", sub: "mercury" },
  releasing: {
    fortuneSign: "aquarius",
    fortuneLord: "saturn",
    fortunePeak: true,
    fortuneLoosedBond: false,
    spiritSign: "leo",
  },
};

describe("renderEventLords", () => {
  it("fits the whole time-lord state on one line", () => {
    const line = renderEventLords(base);
    // One line: a hundred events at five lines each would swamp the prompt.
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("10th-house profection year");
    expect(line).toContain("lord Jupiter");
    expect(line).toContain("firdaria Saturn/Mercury");
    expect(line).toContain("releasing from Fortune in Aquarius");
    expect(line).toContain("peak");
  });

  it("names a loosing of the bond", () => {
    expect(
      renderEventLords({
        ...base,
        releasing: { ...base.releasing!, fortunePeak: false, fortuneLoosedBond: true },
      }),
    ).toContain("loosing of the bond");
  });

  it("omits the sub-lord during a node firdaria period", () => {
    const line = renderEventLords({
      ...base,
      firdaria: { major: "north_node", sub: null },
    });
    expect(line).toContain("firdaria North Node");
    expect(line).not.toContain("_");
  });

  it("renders nothing at all when there are no lords", () => {
    // Solar charts have no Ascendant, so none of these techniques apply —
    // and the prompt must not carry an empty "Timing:" line.
    expect(renderEventLords(null)).toBe("");
    expect(renderEventLords(undefined)).toBe("");
  });
});
