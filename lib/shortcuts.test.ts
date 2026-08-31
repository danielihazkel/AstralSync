import { describe, expect, it } from "vitest";
import {
  GO_TARGETS,
  filterCommands,
  paletteCommands,
  resolveShortcut,
  tabHref,
  type KeyStroke,
} from "./shortcuts";
import { TABS } from "@/components/profile/tabParam";

function key(k: string, over: Partial<KeyStroke> = {}): KeyStroke {
  return { key: k, ctrl: false, meta: false, alt: false, editable: false, ...over };
}

const ctx = (over: Partial<{ pendingG: boolean; path: string }> = {}) => ({
  pendingG: false,
  path: "/",
  ...over,
});

describe("resolveShortcut", () => {
  it("opens the palette on Ctrl+K and Cmd+K, even while typing", () => {
    expect(resolveShortcut(key("k", { ctrl: true }), ctx())).toEqual({ type: "palette" });
    expect(resolveShortcut(key("K", { meta: true, editable: true }), ctx())).toEqual({
      type: "palette",
    });
  });

  it("ignores bare letters while typing or with modifiers", () => {
    expect(resolveShortcut(key("g", { editable: true }), ctx())).toBeNull();
    expect(resolveShortcut(key("/", { alt: true }), ctx())).toBeNull();
    expect(resolveShortcut(key("?", { ctrl: true }), ctx())).toBeNull();
  });

  it("maps the basics", () => {
    expect(resolveShortcut(key("Escape"), ctx())).toEqual({ type: "close" });
    expect(resolveShortcut(key("?"), ctx())).toEqual({ type: "help" });
    expect(resolveShortcut(key("/"), ctx())).toEqual({ type: "search" });
    expect(resolveShortcut(key("g"), ctx())).toEqual({ type: "pending-g" });
    expect(resolveShortcut(key("["), ctx())).toEqual({ type: "month", delta: -1 });
    expect(resolveShortcut(key("]"), ctx())).toEqual({ type: "month", delta: 1 });
  });

  it("completes g-chords to every target", () => {
    for (const [k, target] of Object.entries(GO_TARGETS)) {
      expect(resolveShortcut(key(k), ctx({ pendingG: true }))).toEqual({
        type: "go",
        href: target.href,
      });
    }
  });

  it("restarts the chord when g follows a pending g", () => {
    expect(resolveShortcut(key("g"), ctx({ pendingG: true }))).toEqual({
      type: "pending-g",
    });
  });

  it("maps digits to tabs only on a profile page", () => {
    expect(resolveShortcut(key("1"), ctx({ path: "/profiles/12" }))).toEqual({
      type: "tab",
      index: 0,
    });
    expect(resolveShortcut(key("9"), ctx({ path: "/profiles/12" }))).toEqual({
      type: "tab",
      index: 8,
    });
    expect(resolveShortcut(key("5"), ctx({ path: "/journal" }))).toBeNull();
    expect(resolveShortcut(key("5"), ctx({ path: "/profiles/12/edit" }))).toBeNull();
  });
});

describe("tabHref", () => {
  it("builds the tab query for a digit", () => {
    expect(tabHref("/profiles/7", 0)).toBe("/profiles/7?tab=chart");
    expect(tabHref("/profiles/7", TABS.length - 1)).toBe("/profiles/7?tab=details");
  });
});

describe("paletteCommands / filterCommands", () => {
  const profiles = [
    { id: 1, displayName: "Dana" },
    { id: 2, displayName: "Noa" },
  ];

  it("lists pages and profiles everywhere", () => {
    const items = paletteCommands("/journal", profiles);
    expect(items.some((i) => i.group === "Pages" && i.href === "/settings")).toBe(true);
    expect(items.some((i) => i.group === "Profiles" && i.href === "/profiles/2")).toBe(true);
    expect(items.some((i) => i.group === "Tabs")).toBe(false);
  });

  it("adds the profile tabs on a profile page", () => {
    const items = paletteCommands("/profiles/7", profiles);
    const tabs = items.filter((i) => i.group === "Tabs");
    expect(tabs).toHaveLength(TABS.length);
    expect(tabs[0].href).toBe("/profiles/7?tab=chart");
  });

  it("filters case-insensitively and passes empty queries through", () => {
    const items = paletteCommands("/", profiles);
    expect(filterCommands(items, "")).toEqual(items);
    expect(filterCommands(items, "dAn").map((i) => i.label)).toEqual(["Dana"]);
  });
});
