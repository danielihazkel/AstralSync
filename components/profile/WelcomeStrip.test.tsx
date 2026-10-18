import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => "/profiles/7",
  useRouter: () => ({ replace: () => {} }),
}));

const { default: WelcomeStrip } = await import("./WelcomeStrip");

describe("WelcomeStrip", () => {
  it("points a new chart at the Reading, Transits and Forecast tabs", () => {
    query = "welcome=1";
    const html = renderToStaticMarkup(<WelcomeStrip profileId={7} />);
    expect(html).toContain("Your chart is ready");
    for (const tab of ["reading", "transits", "forecast"]) {
      expect(html).toContain(`href="/profiles/7?tab=${tab}"`);
    }
  });

  it("stays away without the one-time parameter", () => {
    query = "tab=chart";
    expect(renderToStaticMarkup(<WelcomeStrip profileId={7} />)).toBe("");
  });
});
