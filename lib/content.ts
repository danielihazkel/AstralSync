import fs from "node:fs";
import path from "node:path";
import type { Planet } from "@astralsync/astro-core";
import type { StoredChart } from "./view-types";
import { CONTENT_VERSION } from "./versions";
import { elementDominance, type ElementDominance } from "./dominance";
import { synthesizeReading } from "./synthesis";

/**
 * Loader for the interpretation content library (PRD §5, ARCHITECTURE §7).
 * Server-only (reads `content/` from disk); the UI receives plain
 * `ResolvedReading` objects. Entries are Markdown files with a minimal flat
 * frontmatter — see content/README.md for the authoring guide.
 *
 * Note for a future standalone build (`output: "standalone"`, Phase 1g+):
 * `content/` is read at runtime from the project root and would need to be
 * added to `outputFileTracingIncludes` in next.config.ts.
 */

export const CONTENT_CATEGORIES = [
  "planet_in_sign",
  "planet_in_house",
  "aspect",
  "ascendant_sign",
  "element_dominance",
  "modality_dominance",
  "life_path",
  "destiny",
  "soul_urge",
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export interface ContentEntry {
  /** Canonical id, e.g. "planet_in_sign/sun/aries" — always matches the path. */
  key: string;
  category: ContentCategory;
  title: string;
  /** Short clause consumed by template synthesis; required for
   *  element_dominance and life_path entries, optional elsewhere. */
  essence: string | null;
  bodyMd: string;
}

export interface ContentIndex {
  /** CONTENT_VERSION at load time. */
  version: string;
  entries: Map<string, ContentEntry>;
}

/**
 * Derive the canonical key from a root-relative file path: directories map
 * verbatim, and hyphens in the filename become key segments —
 * "planet_in_sign/sun-aries.md" → "planet_in_sign/sun/aries".
 */
export function keyFromPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/\.md$/, "");
  const slash = normalized.lastIndexOf("/");
  const dir = normalized.slice(0, slash + 1);
  const file = normalized.slice(slash + 1);
  return dir + file.replace(/-/g, "/");
}

/**
 * Parse an entry file: "---\nname: value\n…\n---\nbody". Flat string values
 * only — no nesting, quoting, or arrays. Throws (with the file path) on any
 * malformed input; the content lint test keeps the shipped tree parseable.
 */
export function parseEntryFile(raw: string, relPath: string): ContentEntry {
  const fail = (why: string): never => {
    throw new Error(`Malformed content entry ${relPath}: ${why}`);
  };

  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") fail("must start with a --- frontmatter fence");
  const end = lines.indexOf("---", 1);
  if (end === -1) fail("unterminated frontmatter");

  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) fail(`frontmatter line without a colon: "${line}"`);
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const key = fields.get("key") ?? fail("missing key");
  const title = fields.get("title") ?? fail("missing title");
  const category = key.split("/")[0] as ContentCategory;
  if (!CONTENT_CATEGORIES.includes(category)) {
    fail(`unknown category "${category}"`);
  }
  const bodyMd = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  if (bodyMd === "") fail("empty body");

  return { key, category, title, essence: fields.get("essence") ?? null, bodyMd };
}

const DEFAULT_ROOT = path.join(process.cwd(), "content", "en");

/** Process-lifetime cache per root — content is in-repo and immutable at
 *  runtime (restart the server to pick up edits). */
const indexCache = new Map<string, ContentIndex>();

function walkMarkdownFiles(root: string, dir = ""): string[] {
  const out: string[] = [];
  const abs = path.join(root, dir);
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dir === "" ? d.name : `${dir}/${d.name}`;
    if (d.isDirectory()) out.push(...walkMarkdownFiles(root, rel));
    else if (d.name.endsWith(".md")) out.push(rel);
  }
  return out;
}

export function loadContentIndex(root: string = DEFAULT_ROOT): ContentIndex {
  const cached = indexCache.get(root);
  if (cached) return cached;

  const entries = new Map<string, ContentEntry>();
  for (const rel of walkMarkdownFiles(root)) {
    const entry = parseEntryFile(fs.readFileSync(path.join(root, rel), "utf8"), rel);
    const expected = keyFromPath(rel);
    if (entry.key !== expected) {
      throw new Error(
        `Content entry ${rel} declares key "${entry.key}" but its path implies "${expected}"`,
      );
    }
    entries.set(entry.key, entry);
  }

  const index: ContentIndex = { version: CONTENT_VERSION, entries };
  indexCache.set(root, index);
  return index;
}

export function getEntry(index: ContentIndex, key: string): ContentEntry | null {
  return index.entries.get(key) ?? null;
}

export type ReadingSlot =
  | "sun"
  | "moon"
  | "ascendant"
  | "element"
  | "life_path"
  | "synthesis";

export interface ReadingSection {
  slot: ReadingSlot;
  /** Canonical entry key, or null for the composed synthesis section. */
  key: string | null;
  title: string;
  bodyMd: string;
  /** Human-readable provenance, e.g. "Sun in Leo — 17°04′". */
  source: string;
}

export interface NumeroReadingInput {
  lifePath: number;
  isMaster: boolean;
}

export interface ResolvedReading {
  /** Library version this reading was rendered with. */
  contentVersion: string;
  /** Library version the snapshot was computed under. */
  snapshotContentVersion: string;
  /** True when the two differ — the UI shows a provenance note. */
  stale: boolean;
  dominance: ElementDominance;
  sections: ReadingSection[];
  /** Keys referenced but not authored — sections silently omitted. */
  missingKeys: string[];
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

/** Mirrors components/format.ts formatDegreeInSign (lib stays UI-free). */
function degreeLabel(deg: number): string {
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  return `${d}°${String(m).padStart(2, "0")}′`;
}

/**
 * Resolve a snapshot pair to its reading: Big Three entries, element
 * dominance, Life Path, and the template synthesis. Missing entries are
 * collected in `missingKeys`, never thrown — the taxonomy is larger than
 * the authored library and degrades gracefully.
 */
export function resolveReading(
  chart: StoredChart,
  numero: NumeroReadingInput | null,
  snapshotContentVersion: string,
  index: ContentIndex = loadContentIndex(),
): ResolvedReading {
  const dominance = elementDominance(chart.placements);
  const sections: ReadingSection[] = [];
  const missingKeys: string[] = [];

  const take = (key: string, slot: ReadingSlot, source: string): ContentEntry | null => {
    const entry = getEntry(index, key);
    if (!entry) {
      missingKeys.push(key);
      return null;
    }
    sections.push({ slot, key, title: entry.title, bodyMd: entry.bodyMd, source });
    return entry;
  };

  const luminarySource = (planet: Planet): string => {
    const p = chart.placements.find((pl) => pl.planet === planet);
    const base = `${cap(planet)} in ${cap(p ? p.sign : "")}`;
    // Solar charts suppress degree precision (positions are noon estimates).
    return p && !chart.isSolarChart
      ? `${base} — ${degreeLabel(p.degreeInSign)}`
      : base;
  };

  take(`planet_in_sign/sun/${chart.bigThree.sun}`, "sun", luminarySource("sun"));
  take(`planet_in_sign/moon/${chart.bigThree.moon}`, "moon", luminarySource("moon"));

  if (chart.bigThree.ascendant !== null) {
    take(
      `ascendant_sign/${chart.bigThree.ascendant}`,
      "ascendant",
      `Rising in ${cap(chart.bigThree.ascendant)}`,
    );
  }

  const elementEntry = take(
    `element_dominance/${dominance.dominant}`,
    "element",
    `${dominance.counts[dominance.dominant]} of ${chart.placements.length} planets in ${dominance.dominant} signs`,
  );

  const lifePathEntry = numero
    ? take(
        `life_path/${numero.lifePath}`,
        "life_path",
        `Life Path ${numero.lifePath}${numero.isMaster ? " — master number" : ""}`,
      )
    : null;

  if (elementEntry) {
    sections.push({
      slot: "synthesis",
      key: null,
      title: "Putting it together",
      bodyMd: synthesizeReading({
        element: {
          name: dominance.dominant,
          title: elementEntry.title,
          essence: elementEntry.essence ?? "",
        },
        lifePath:
          numero && lifePathEntry
            ? {
                value: numero.lifePath,
                isMaster: numero.isMaster,
                title: lifePathEntry.title,
                essence: lifePathEntry.essence ?? "",
              }
            : null,
      }),
      source: "Dominant element × Life Path",
    });
  }

  return {
    contentVersion: index.version,
    snapshotContentVersion,
    stale: snapshotContentVersion !== index.version,
    dominance,
    sections,
    missingKeys,
  };
}
