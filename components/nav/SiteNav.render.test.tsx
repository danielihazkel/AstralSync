import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

const { default: SiteNav } = await import("./SiteNav");

describe("SiteNav", () => {
  it("marks the current section and starts with the phone menu closed", () => {
    path = "/synastry/group";
    const html = renderToStaticMarkup(<SiteNav />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page" href="\/synastry"/);
    expect(html).toMatch(/aria-expanded="false"[^>]*>Menu</);
    expect(html).not.toContain("data-open");
  });

  it("calls the moment page Sky now", () => {
    path = "/chart";
    const html = renderToStaticMarkup(<SiteNav />);
    expect(html).toMatch(/aria-current="page" href="\/chart">Sky now</);
  });
});
