import { buildMazalChart } from "@astralsync/hebrew-core";
import { gematriaExpression, hebrewDateGematria } from "@astralsync/numero-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveHebrewReading } from "@/lib/hebrewReading";
import type { HebrewView, StoredMazal } from "@/lib/view-types";
import MazalPanel from "./MazalPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

const mazal = buildMazalChart({
  civilDate: { year: 2000, month: 1, day: 1 },
  utc: new Date(Date.UTC(2000, 0, 1, 23, 30, 0)), // after sunset in New York
  latitude: 40.7128,
  longitude: -74.006,
  tzId: "America/New_York",
}) as StoredMazal;
const gematria = {
  dateGematria: hebrewDateGematria({
    day: mazal.hebrewDate.effective.day,
    year: mazal.hebrewDate.effective.year,
  }),
  katanName: gematriaExpression("דוד כהן", "katan"),
};
const hebrew = {
  snapshotId: 1,
  version: 1,
  hebrewDate: "",
  monthKey: "tevet",
  dayPlanet: "sun",
  hourPlanet: "moon",
  dateGematria: 6,
  mazal,
  gematria,
  engine: "hebcal",
  engineVersion: "6",
  contentVersion: "1",
  createdAt: new Date(),
  llmReading: null,
} as unknown as HebrewView;

const birthday = { civil: { year: 2027, month: 1, day: 9 }, hebrew: "כ״ג טבת", age: 27 };

function render(extra: Partial<Parameters<typeof MazalPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <MazalPanel
      hebrew={hebrew}
      reading={resolveHebrewReading(mazal, gematria, "1")}
      hebrewBirthday={birthday}
      hebrewBirthdays={[birthday]}
      displayName="Dana"
      profileId={7}
      version={1}
      llmEnabled={false}
      {...extra}
    />,
  );
}

describe("MazalPanel", () => {
  it("renders the summary card and the Hebrew reading right to left", () => {
    const html = render();
    expect(html).toContain("Gedi — Tevet");
    expect(html).toMatch(/lang="he" dir="rtl"/);
  });

  it("names the next Hebrew birthday and offers its calendar export", () => {
    const html = render();
    expect(html).toContain("כ״ג טבת");
    expect(html).toContain("turning 27");
    expect(html).toContain("Export the next 1 (.ics)");
  });

  it("drops the export when there is nothing to export", () => {
    expect(render({ hebrewBirthdays: [] })).not.toContain("(.ics)");
  });

  it("says when a historical version has no Mazal snapshot", () => {
    const html = render({ hebrew: null, reading: null, hebrewBirthday: null });
    expect(html).not.toContain("Gedi");
  });
});
