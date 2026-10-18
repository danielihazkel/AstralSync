import { buildChart } from "@astralsync/astro-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedReading } from "@/lib/content";
import type { AstroView, ProfileData, WheelChart } from "@/lib/view-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/profiles/1",
}));

const { default: DetailsPanel } = await import("./DetailsPanel");

const profile: ProfileData = {
  id: 1,
  displayName: "Test Person",
  fullBirthName: "Test Full Name",
  hebrewBirthName: null,
  birthDate: "1990-03-04",
  birthTime: "14:30",
  timeCertainty: "exact",
  birthCity: { geonameId: 2988507, name: "Paris", countryCode: "FR", admin1: "Île-de-France" },
  birthLat: 48.85,
  birthLng: 2.35,
  tzIana: "Europe/Paris",
  utcOffsetMinutes: 60,
  offsetOverridden: false,
  tags: [],
  isPrimary: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
} as ProfileData;

function render(timeCertainty: "exact" | "unknown") {
  const chart: WheelChart = {
    ...buildChart({
      utc: new Date(Date.UTC(1990, 2, 4, 13, 30)),
      latitude: 48.85,
      longitude: 2.35,
      timeCertainty,
    }),
    tzWarnings: [],
  };
  return renderToStaticMarkup(
    <DetailsPanel
      profile={profile}
      astro={{ version: 1, engine: "astronomy-engine", engineVersion: "2.1.19" } as AstroView}
      chart={chart}
      versions={[]}
      isLatest
      reading={{ sections: [], missingKeys: [] } as unknown as ResolvedReading}
    />,
  );
}

describe("DetailsPanel", () => {
  it("states the Moon's phase and mansion at birth", () => {
    const html = render("exact");
    expect(html).toContain("Moon at birth");
    expect(html).toMatch(/(New|Full) Moon|Crescent|Gibbous|Quarter/);
    expect(html).toMatch(/mansion \d+/);
    expect(html).not.toContain("birth time is unknown");
  });

  it("marks them approximate on a solar chart", () => {
    expect(render("unknown")).toContain("approximate: the birth time is unknown");
  });

  it("links the profile's relocation and birth-time pages", () => {
    const html = render("exact");
    expect(html).toContain('href="/profiles/1/relocation"');
    expect(html).toContain('href="/profiles/1/birth-time"');
  });
});
