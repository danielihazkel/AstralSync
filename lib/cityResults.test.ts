import { describe, expect, it, vi } from "vitest";
import { cityRank, rankCities, toCityResult, type CityRow } from "./cityResults";

const city = (
  name: string,
  population: number,
  asciiName = name,
): { name: string; asciiName: string; population: number } => ({
  name,
  asciiName,
  population,
});

describe("cityRank", () => {
  it("ranks prefix over word boundary over substring", () => {
    expect(cityRank(city("Yorkton", 1), "york")).toBe(0);
    expect(cityRank(city("New York", 1), "york")).toBe(1);
    expect(cityRank(city("Storkyorke", 1), "york")).toBe(2);
  });

  it("treats hyphens, apostrophes, and periods as word breaks", () => {
    expect(cityRank(city("Stratford-upon-Avon", 1), "avon")).toBe(1);
    expect(cityRank(city("L'Aquila", 1), "aquila")).toBe(1);
    expect(cityRank(city("St. Louis", 1), "louis")).toBe(1);
  });

  it("matches case-insensitively on either name column", () => {
    expect(cityRank(city("München", 1, "Munchen"), "munch")).toBe(0);
    expect(cityRank(city("NEW YORK", 1), "new")).toBe(0);
  });

  it("returns the no-match rank when neither column contains the query", () => {
    expect(cityRank(city("Boston", 1), "york")).toBe(3);
  });
});

describe("rankCities", () => {
  it("puts a small prefix match above a huge substring match", () => {
    const ranked = rankCities(
      [city("New York", 8_000_000), city("Yorkton", 16_000)],
      "york",
      12,
    );
    expect(ranked.map((c) => c.name)).toEqual(["Yorkton", "New York"]);
  });

  it("breaks rank ties by population and applies the limit", () => {
    const ranked = rankCities(
      [city("York", 200_000), city("Yorkville", 5_000), city("Yorkton", 16_000)],
      "york",
      2,
    );
    expect(ranked.map((c) => c.name)).toEqual(["York", "Yorkton"]);
  });
});

describe("toCityResult", () => {
  const row: CityRow = {
    geonameId: 7,
    name: "Atlantis",
    asciiName: "Atlantis",
    countryCode: "XX",
    admin1: null,
    lat: 0,
    lng: -30,
    population: 1,
  };

  it("maps a row and resolves its timezone", () => {
    const result = toCityResult(row, () => "Etc/GMT+2");
    expect(result).toEqual({
      geonameId: 7,
      name: "Atlantis",
      countryCode: "XX",
      admin1: null,
      lat: 0,
      lng: -30,
      tzIana: "Etc/GMT+2",
    });
  });

  it("drops a row whose coordinates resolve to no timezone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = toCityResult(row, () => {
      throw new Error("no zone");
    });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
