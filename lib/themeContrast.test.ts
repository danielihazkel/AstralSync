import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG AA for the screen themes: every token used as text must reach 4.5:1
 * against each ground it sits on. Read from app/globals.css itself, so a
 * palette tweak that slips below AA fails here rather than in a browser
 * audit nobody runs.
 */

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2];
  return tokens;
}

function luminance(hex: string): number {
  const [r, g, b] = (hex.slice(1).match(/../g) ?? []).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUNDS = ["bg", "surface", "surface-raised"];
const INKS = ["text", "text-muted", "heading", "accent", "accent-bright", "danger", "warn", "ok"];

describe("theme contrast (WCAG AA)", () => {
  const dark = block(":root");
  const light = { ...dark, ...block(':root[data-theme="light"]') };

  for (const [name, theme] of [
    ["dark", dark],
    ["light", light],
  ] as const) {
    it(`every ${name}-theme ink reaches 4.5:1 on every ground`, () => {
      const failures: string[] = [];
      for (const ink of INKS) {
        for (const ground of GROUNDS) {
          const r = contrast(theme[ink], theme[ground]);
          if (r < 4.5) failures.push(`${ink} on ${ground}: ${r.toFixed(2)}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("reads the tokens it means to (the parser is not vacuous)", () => {
    expect(dark.text).toMatch(/^#/);
    expect(block(':root[data-theme="light"]')["accent-bright"]).toMatch(/^#/);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
