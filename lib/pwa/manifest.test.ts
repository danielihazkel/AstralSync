import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest, THEME_COLOR } from "./manifest";

const root = path.resolve(__dirname, "..", "..");

describe("buildManifest", () => {
  const manifest = buildManifest();

  it("meets installability requirements", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
    expect(manifest.name).toBe("AstralSync");

    const sizes = manifest.icons?.map((i) => i.sizes) ?? [];
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    const maskable = manifest.icons?.filter((i) => i.purpose === "maskable");
    expect(maskable?.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
  });

  it("references icon files that exist (run `npm run icons:generate` if this fails)", () => {
    for (const icon of manifest.icons ?? []) {
      const file = path.join(root, "public", icon.src!.replace(/^\//, ""));
      expect(existsSync(file), `missing ${icon.src}`).toBe(true);
    }
    expect(existsSync(path.join(root, "app", "apple-icon.png"))).toBe(true);
  });

  it("uses the app background token as theme color", () => {
    const css = readFileSync(path.join(root, "app", "globals.css"), "utf8");
    const bg = css.match(/--bg:\s*(#[0-9a-fA-F]+);/)?.[1];
    expect(THEME_COLOR).toBe(bg);
    expect(manifest.theme_color).toBe(THEME_COLOR);
    expect(manifest.background_color).toBe(THEME_COLOR);
  });
});
