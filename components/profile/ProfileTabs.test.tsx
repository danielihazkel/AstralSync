import { buildChart } from "@astralsync/astro-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedReading } from "@/lib/content";
import type { AstroView, NumeroView, ProfileData, WheelChart } from "@/lib/view-types";

let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/profiles/7",
}));

const { default: ProfileTabs } = await import("./ProfileTabs");

const chart: WheelChart = {
  ...buildChart({ utc: new Date(Date.UTC(1990, 2, 4, 13, 30)), latitude: 48.85, longitude: 2.35 }),
  tzWarnings: [],
};
const profile = { id: 7, displayName: "Dana" } as ProfileData;

function render(q: string) {
  query = q;
  return renderToStaticMarkup(
    <ProfileTabs
      profile={profile}
      astro={{ version: 1 } as AstroView}
      numero={{} as NumeroView}
      numeroProse={{} as never}
      chart={chart}
      versions={[]}
      isLatest
      reading={{ sections: [], missingKeys: [] } as unknown as ResolvedReading}
      hebrew={null}
      hebrewReading={null}
      hebrewBirthday={null}
      llmEnabled={false}
    />,
  );
}

describe("ProfileTabs", () => {
  it("shows four sections, and only the open section's tabs", () => {
    const html = render("tab=cycles");
    for (const section of ["Natal", "Names &amp; Mazal", "Timing", "Personal"]) {
      expect(html).toContain(`>${section}</button>`);
    }
    expect(html).toMatch(/aria-current="true"[^>]*>Timing</);
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(tabs).toEqual(["Transits", "Cycles", "Forecast"]);
    expect(html).toMatch(/aria-selected="true"[^>]*>Cycles</);
  });

  it("opens on the Natal section's Chart tab by default", () => {
    const html = render("");
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(tabs).toEqual(["Chart", "Reading", "Details"]);
    expect(html).toMatch(/aria-selected="true"[^>]*>Chart</);
  });

  it("keeps old bookmarks working: a tab outside the first section still opens", () => {
    const html = render("tab=life-events");
    expect(html).toMatch(/aria-current="true"[^>]*>Personal</);
    expect(html).toMatch(/aria-selected="true"[^>]*>Life events</);
  });
});
