import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  resolveTheme,
  sanitizeThemePreference,
} from "./themeSettings";

describe("sanitizeThemePreference", () => {
  it("passes the three valid values through", () => {
    expect(sanitizeThemePreference("light")).toBe("light");
    expect(sanitizeThemePreference("dark")).toBe("dark");
    expect(sanitizeThemePreference("system")).toBe("system");
  });

  it("falls back to the default on anything else", () => {
    expect(sanitizeThemePreference(null)).toBe(DEFAULT_THEME);
    expect(sanitizeThemePreference(undefined)).toBe(DEFAULT_THEME);
    expect(sanitizeThemePreference("LIGHT")).toBe(DEFAULT_THEME);
    expect(sanitizeThemePreference("auto")).toBe(DEFAULT_THEME);
    expect(sanitizeThemePreference(42)).toBe(DEFAULT_THEME);
  });
});

describe("resolveTheme", () => {
  it("explicit preferences ignore the media query", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("system follows prefers-color-scheme", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });
});
