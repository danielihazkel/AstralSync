import { describe, expect, it } from "vitest";
import { profileInputSchema } from "@/lib/validation";
import type { ProfileData } from "@/lib/view-types";
import { profileToInput } from "./profileToInput";

const base: ProfileData = {
  id: 1,
  displayName: "Test Person",
  fullBirthName: "Test Full Name",
  nameScript: "latin",
  birthDate: "1990-03-04",
  birthTime: "14:30",
  timeCertainty: "exact",
  birthCity: {
    geonameId: 2988507,
    name: "Paris",
    countryCode: "FR",
    admin1: "Île-de-France",
  },
  birthLat: 48.85,
  birthLng: 2.35,
  tzIana: "Europe/Paris",
  utcOffsetMinutes: 60,
  offsetOverridden: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("profileToInput", () => {
  it("round-trips through profileInputSchema", () => {
    const parsed = profileInputSchema.safeParse(
      profileToInput(base, "whole_sign"),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.houseSystem).toBe("whole_sign");
      expect(parsed.data.birthCityGeonameId).toBe(2988507);
    }
  });

  it("omits the offset unless it was a manual override", () => {
    expect(profileToInput(base, "placidus").utcOffsetMinutes).toBeUndefined();

    const overridden = profileToInput(
      { ...base, offsetOverridden: true, utcOffsetMinutes: 90 },
      "placidus",
    );
    expect(overridden.utcOffsetMinutes).toBe(90);
    expect(profileInputSchema.safeParse(overridden).success).toBe(true);
  });

  it("handles solar-chart profiles (no time, no name, no city)", () => {
    const solar = profileToInput(
      {
        ...base,
        birthTime: null,
        timeCertainty: "unknown",
        fullBirthName: null,
        birthCity: null,
      },
      "placidus",
    );
    const parsed = profileInputSchema.safeParse(solar);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.birthTime).toBeNull();
      expect(parsed.data.birthCityGeonameId).toBeNull();
    }
  });
});
