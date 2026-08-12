import { describe, expect, it } from "vitest";
import { toNumeroReadingInput } from "./view-types";

function derivation(overrides: Record<string, unknown> = {}) {
  return {
    lifePath: { value: 7, isMaster: false },
    destiny: null,
    soulUrge: null,
    ...overrides,
  };
}

describe("toNumeroReadingInput", () => {
  it("maps a both-names profile with master flags intact", () => {
    const input = toNumeroReadingInput({
      lifePath: 7,
      isMasterLifePath: false,
      derivation: derivation({
        destiny: { value: 22, isMaster: true },
        soulUrge: { value: 5, isMaster: false },
      }),
    });
    expect(input).toEqual({
      lifePath: 7,
      isMaster: false,
      destiny: { value: 22, isMaster: true },
      soulUrge: { value: 5, isMaster: false },
    });
  });

  it("maps a Hebrew-only profile (gematria destiny, no soul urge)", () => {
    const input = toNumeroReadingInput({
      lifePath: 11,
      isMasterLifePath: true,
      derivation: derivation({ destiny: { value: 3, isMaster: false } }),
    });
    expect(input.isMaster).toBe(true);
    expect(input.destiny).toEqual({ value: 3, isMaster: false });
    expect(input.soulUrge).toBeNull();
  });

  it("maps a no-name profile to null name numbers", () => {
    const input = toNumeroReadingInput({
      lifePath: 3,
      isMasterLifePath: false,
      derivation: derivation(),
    });
    expect(input.destiny).toBeNull();
    expect(input.soulUrge).toBeNull();
  });
});
