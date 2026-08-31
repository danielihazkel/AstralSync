/**
 * Keyboard shortcuts — the pure half. GlobalShortcuts (the layout-mounted
 * client island) feeds every keydown through `resolveShortcut` and acts on
 * the returned action; keeping the mapping here makes the whole scheme
 * testable in node without a DOM. The command palette's item list is pure
 * too (`paletteCommands` + `filterCommands`).
 */

import { TABS, paramFromTab } from "@/components/profile/tabParam";

/** Dispatched on window by the `[` / `]` shortcuts; the month-paged views
 *  (Sky Calendar, Ephemeris, the Transits Calendar view) listen and shift
 *  their own month state — their state is component-local, so an event is
 *  the only global handle. */
export const MONTH_SHIFT_EVENT = "astralsync:month-shift";

export type ShortcutAction =
  | { type: "palette" }
  | { type: "help" }
  | { type: "search" }
  | { type: "close" }
  | { type: "pending-g" }
  | { type: "go"; href: string }
  /** 0-based index into the profile TABS; only on /profiles/[id]. */
  | { type: "tab"; index: number }
  | { type: "month"; delta: -1 | 1 };

/** `g <key>` navigation targets. */
export const GO_TARGETS: Record<string, { href: string; label: string }> = {
  h: { href: "/", label: "Home (profiles)" },
  y: { href: "/synastry", label: "Synastry" },
  j: { href: "/journal", label: "Journal" },
  c: { href: "/calendar", label: "Sky Calendar" },
  e: { href: "/ephemeris", label: "Ephemeris" },
  n: { href: "/onboarding", label: "New profile" },
  s: { href: "/settings", label: "Settings" },
};

export interface KeyStroke {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** True when the event target is an input, textarea, select or
   *  contenteditable — typing must never trigger bare-letter shortcuts. */
  editable: boolean;
}

const PROFILE_PATH_RE = /^\/profiles\/(\d+)$/;

/** One keydown → one action (or null). `pendingG` is true when the previous
 *  stroke was a bare "g" and its window is still open. */
export function resolveShortcut(
  k: KeyStroke,
  ctx: { pendingG: boolean; path: string },
): ShortcutAction | null {
  // The palette chord works everywhere, even mid-typing.
  if ((k.ctrl || k.meta) && !k.alt && k.key.toLowerCase() === "k") {
    return { type: "palette" };
  }
  if (k.key === "Escape") return { type: "close" };
  // Anything else stays inert while typing or with a modifier held.
  if (k.editable || k.ctrl || k.meta || k.alt) return null;

  if (ctx.pendingG) {
    const target = GO_TARGETS[k.key.toLowerCase()];
    if (target) return { type: "go", href: target.href };
    // fall through: an unknown second key cancels the chord silently, but
    // the first key of a new chord still counts below.
  }
  if (k.key === "g") return { type: "pending-g" };
  if (k.key === "?") return { type: "help" };
  if (k.key === "/") return { type: "search" };
  if (k.key === "[") return { type: "month", delta: -1 };
  if (k.key === "]") return { type: "month", delta: 1 };
  if (/^[1-9]$/.test(k.key) && PROFILE_PATH_RE.test(ctx.path)) {
    const index = Number(k.key) - 1;
    if (index < TABS.length) return { type: "tab", index };
  }
  return null;
}

/** The profile tab a digit shortcut lands on, as a query value. */
export function tabHref(path: string, index: number): string {
  return `${path}?tab=${paramFromTab(TABS[index])}`;
}

/** Rows for the `?` help overlay. */
export const SHORTCUT_HELP: Array<{ keys: string; description: string }> = [
  { keys: "Ctrl+K", description: "Command palette" },
  { keys: "?", description: "This overlay" },
  { keys: "/", description: "Focus the search field on the page" },
  ...Object.entries(GO_TARGETS).map(([key, t]) => ({
    keys: `g ${key}`,
    description: `Go to ${t.label}`,
  })),
  { keys: "1–9", description: "Profile tabs (on a profile page)" },
  { keys: "[ / ]", description: "Previous / next month (calendar pages)" },
  { keys: "Esc", description: "Close palette or overlay" },
];

// --- command palette ---------------------------------------------------------

export interface PaletteCommand {
  label: string;
  href: string;
  group: "Pages" | "Tabs" | "Profiles";
}

/** The palette's full item list for the current location. Profile tabs
 *  appear only on a profile page (they link into the same profile). */
export function paletteCommands(
  path: string,
  profiles: Array<{ id: number; displayName: string }>,
): PaletteCommand[] {
  const pages: PaletteCommand[] = Object.values(GO_TARGETS).map((t) => ({
    label: t.label,
    href: t.href,
    group: "Pages",
  }));
  const m = PROFILE_PATH_RE.exec(path);
  const tabs: PaletteCommand[] = m
    ? TABS.map((t) => ({
        label: `${t} tab`,
        href: `/profiles/${m[1]}?tab=${paramFromTab(t)}`,
        group: "Tabs",
      }))
    : [];
  const rows: PaletteCommand[] = profiles.map((p) => ({
    label: p.displayName,
    href: `/profiles/${p.id}`,
    group: "Profiles",
  }));
  return [...pages, ...tabs, ...rows];
}

/** Case-insensitive substring filter; an empty query returns everything. */
export function filterCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (q === "") return commands;
  return commands.filter((c) => c.label.toLowerCase().includes(q));
}
