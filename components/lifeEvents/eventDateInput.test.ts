import { describe, expect, it } from "vitest";
import { dateFromInputs, inputsFromEvent } from "./eventDateInput";

const inputs = (v: Partial<{ day: string; month: string; year: string }>) => ({
  day: "",
  month: "",
  year: "",
  ...v,
});

describe("dateFromInputs", () => {
  it("passes a day input through", () => {
    expect(dateFromInputs("day", inputs({ day: "2014-03-12" }))).toBe(
      "2014-03-12",
    );
  });

  it("canonicalizes month input to day 01", () => {
    expect(dateFromInputs("month", inputs({ month: "2014-03" }))).toBe(
      "2014-03-01",
    );
  });

  it("canonicalizes year input to January 01", () => {
    expect(dateFromInputs("year", inputs({ year: "2014" }))).toBe("2014-01-01");
  });

  it("returns null while the relevant input is empty or malformed", () => {
    expect(dateFromInputs("day", inputs({}))).toBeNull();
    expect(dateFromInputs("day", inputs({ day: "2014-3-2" }))).toBeNull();
    expect(dateFromInputs("month", inputs({ month: "2014" }))).toBeNull();
    expect(dateFromInputs("year", inputs({ year: "20" }))).toBeNull();
  });

  it("rejects dates outside the ephemeris comfort zone", () => {
    expect(dateFromInputs("day", inputs({ day: "1650-01-01" }))).toBeNull();
    expect(dateFromInputs("year", inputs({ year: "2300" }))).toBeNull();
    expect(dateFromInputs("month", inputs({ month: "1699-12" }))).toBeNull();
  });

  it("ignores the other precisions' stale inputs", () => {
    expect(
      dateFromInputs("year", inputs({ day: "2014-03-12", year: "1999" })),
    ).toBe("1999-01-01");
  });
});

describe("inputsFromEvent", () => {
  it("fills only the active precision's input (plus the year)", () => {
    expect(inputsFromEvent("2014-03-12", "day")).toEqual({
      day: "2014-03-12",
      month: "",
      year: "2014",
    });
    expect(inputsFromEvent("2014-03-01", "month")).toEqual({
      day: "",
      month: "2014-03",
      year: "2014",
    });
    expect(inputsFromEvent("2014-01-01", "year")).toEqual({
      day: "",
      month: "",
      year: "2014",
    });
  });
});
