import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NumerologyCycles from "./NumerologyCycles";

const entry = (title: string) => ({ title, bodyMd: `${title} body.` });

// Every number the cycles could need, so the test does not depend on today.
const prose = {
  personalYear: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33].map((n) => [n, entry(`Personal Year ${n}`)]),
  ),
  pinnacle: Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33].map((n) => [n, entry(`Pinnacle ${n}`)]),
  ),
  challenge: Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, entry(`Challenge ${n}`)]),
  ),
};

describe("NumerologyCycles", () => {
  const html = renderToStaticMarkup(
    <NumerologyCycles birthDate="1990-03-21" prose={prose} />,
  );

  it("shows the personal year, month and day, and nine years ahead", () => {
    expect(html).toContain("Personal year ");
    expect(html).toContain("Personal month");
    expect(html).toContain("Personal day");
    const strip = html.slice(html.indexOf("Personal years ahead"));
    expect(strip.slice(0, strip.indexOf("</ol>")).split("<li").length - 1).toBe(9);
  });

  it("lists four pinnacles with exactly one marked current", () => {
    // 1990-03-21 → pinnacles 6, 4, 1, 4; challenges 0, 2, 2, 2.
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect(body.split("<tr").length - 1).toBe(4);
    expect(body.split('aria-current="true"').length - 1).toBe(1);
    expect(body).toContain("1990–2019");
  });

  it("explains the current pinnacle and its challenge", () => {
    expect(html).toMatch(/Now: Pinnacle \d+, chapter \d of 4/);
    expect(html).toMatch(/Alongside it: Challenge \d/);
  });
});
